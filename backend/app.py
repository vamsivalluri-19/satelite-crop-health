from flask import Flask, request, jsonify, render_template, send_from_directory, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_session import Session
import os
import io
import base64
from datetime import datetime, timedelta
import logging
import hashlib
# MongoDB imports
from pymongo import MongoClient
from bson.objectid import ObjectId
import secrets
import json
from PIL import Image, ImageStat

# Use relative imports for backend modules
from .satellite_data import get_ndvi, get_satellite_imagery
from .weather_data import get_weather, get_weather_forecast
from .ai_model import predict_disease, get_health_score
from .alerts import send_disease_alert, send_health_alert

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Flask app with proper template folder configuration
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static', 'templates'))
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static'))

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*", "supports_credentials": True}})

# Configure Session
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Configure Database
db_dir = os.path.join(os.path.dirname(__file__), 'database')
os.makedirs(db_dir, exist_ok=True)
# SQLAlchemy setup remains for other models
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_dir}/crop_data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# MongoDB setup
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client['crop_health']
mongo_users = mongo_db['users']

# User model for MongoDB
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def mongo_user_to_dict(user):
    return {
        'id': str(user.get('_id')),
        'username': user.get('username'),
        'email': user.get('email'),
        'first_name': user.get('first_name'),
        'last_name': user.get('last_name'),
        'location': user.get('location'),
        'phone': user.get('phone'),
        'crop_type': user.get('crop_type'),
        'field_area': user.get('field_area'),
        'created_at': user.get('created_at')
    }

class CropData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    ndvi = db.Column(db.Float)
    health_status = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class DiseaseRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), nullable=False)
    disease = db.Column(db.String(100))
    confidence = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class FieldBoundary(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), nullable=False)
    field_name = db.Column(db.String(120), nullable=False)
    boundary_json = db.Column(db.Text, nullable=False)
    area_hectares = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# User model for SQLAlchemy
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    crop_type = db.Column(db.String(100))
    password_hash = db.Column(db.String(128), nullable=False)

    def set_password(self, password):
        self.password_hash = hash_password(password)

    def check_password(self, password):
        return self.password_hash == hash_password(password)
        id = db.Column(db.Integer, primary_key=True)
        username = db.Column(db.String(100), unique=True, nullable=False)
        email = db.Column(db.String(100), unique=True, nullable=False)
        first_name = db.Column(db.String(100))
        last_name = db.Column(db.String(100))
        crop_type = db.Column(db.String(100))
        password_hash = db.Column(db.String(128), nullable=False)

        def set_password(self, password):
            self.password_hash = hash_password(password)

        def check_password(self, password):
            return self.password_hash == hash_password(password)
# Initialize Database
with app.app_context():
    try:
        reset_db = os.getenv('RESET_DB', 'false').lower() == 'true'

        if reset_db:
            db.drop_all()

        db.create_all()

        demo_exists = User.query.filter_by(username='demo').first() is not None
        if reset_db or not demo_exists:
            demo_user = User(
                username='demo',
                email='demo@farm.com',
                first_name='Demo',
                last_name='Farmer',
                crop_type='Wheat'
            )
            demo_user.set_password('demo123')
            db.session.add(demo_user)
            db.session.commit()

            logger.info("✅ Demo user created - Username: demo, Password: demo123")

        logger.info("✅ Database initialized successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Database initialization error: {e}")

# Routes

@app.route('/')
def home():
    """Serve the main HTML page"""
    try:
        return render_template(
            'index.html',
            google_maps_api_key=os.getenv('GOOGLE_MAPS_API_KEY', '').strip()
        )
    except Exception as e:
        logger.error(f"Error loading index.html: {e}")
        return jsonify({'error': 'Failed to load page'}), 500

@app.route('/static/<path:path>')
def send_static(path):
    """Serve static files"""
    return send_from_directory(static_dir, path)

@app.route('/favicon.ico')
def favicon():
    """Serve favicon"""
    return '', 204

@app.route('/health', methods=['GET'])
def health_check():
    """API health check endpoint"""
    return jsonify({
        'status': 'online',
        'service': 'Crop Health Monitoring System',
        'version': '1.0',
        'timestamp': datetime.utcnow().isoformat()
    })

# Authentication Routes

@app.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        
        if not data or not all(k in data for k in ['username', 'email', 'password']):
            return jsonify({'error': 'Missing required fields'}), 400
        
        username = data.get('username').strip()
        email = data.get('email').strip()
        password = data.get('password')
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        
        if not username or not email or not password:
            return jsonify({'error': 'Username, email, and password cannot be empty'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        # Check if user already exists in MongoDB
        if mongo_users.find_one({'username': username}):
            return jsonify({'error': 'Username already exists'}), 400
        if mongo_users.find_one({'email': email}):
            return jsonify({'error': 'Email already registered'}), 400

        # Create new user in MongoDB
        user_doc = {
            'username': username,
            'email': email,
            'password_hash': hash_password(password),
            'first_name': first_name,
            'last_name': last_name,
            'location': '',
            'phone': '',
            'crop_type': '',
            'field_area': 0.0,
            'created_at': datetime.utcnow().isoformat()
        }
        result = mongo_users.insert_one(user_doc)
        # Fetch the inserted user to get the '_id' field
        inserted_user = mongo_users.find_one({'_id': result.inserted_id})
        logger.info(f"✅ New user registered: {username}")
        return jsonify({
            'status': 'success',
            'message': 'Registration successful!',
            'user': mongo_user_to_dict(inserted_user)
        }), 201
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Missing username or password'}), 400
        
        username = data.get('username').strip()
        password = data.get('password')
        
        user = mongo_users.find_one({'username': username})
        if not user or user.get('password_hash') != hash_password(password):
            return jsonify({'error': 'Invalid username or password'}), 401
        session['user_id'] = str(user['_id'])
        session['username'] = user['username']
        session.permanent = True
        app.permanent_session_lifetime = timedelta(days=30)
        logger.info(f"✅ User logged in: {username}")
        return jsonify({
            'status': 'success',
            'message': 'Login successful!',
            'user': mongo_user_to_dict(user)
        }), 200
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/logout', methods=['POST'])
def logout():
    """Logout user"""
    try:
        username = session.get('username')
        session.clear()
        logger.info(f"✅ User logged out: {username}")
        return jsonify({'status': 'success', 'message': 'Logout successful'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/session', methods=['GET'])
def check_session():
    """Check if user is logged in"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'status': 'not_authenticated', 'logged_in': False}), 200
        user = mongo_users.find_one({'_id': ObjectId(user_id)})
        if not user:
            session.clear()
            return jsonify({'status': 'not_authenticated', 'logged_in': False}), 200
        return jsonify({
            'status': 'authenticated',
            'logged_in': True,
            'user': mongo_user_to_dict(user)
        }), 200
    
    except Exception as e:
        logger.error(f"Session check error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/profile', methods=['GET', 'PUT'])
def profile():
    """Get or update user profile"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        user = mongo_users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if request.method == 'GET':
            return jsonify({
                'status': 'success',
                'user': mongo_user_to_dict(user)
            }), 200
        # PUT - Update profile
        data = request.get_json()
        update_fields = {}
        if 'first_name' in data:
            update_fields['first_name'] = data['first_name'].strip()
        if 'last_name' in data:
            update_fields['last_name'] = data['last_name'].strip()
        if 'location' in data:
            update_fields['location'] = data['location'].strip()
        if 'phone' in data:
            update_fields['phone'] = data['phone'].strip()
        if 'crop_type' in data:
            update_fields['crop_type'] = data['crop_type'].strip()
        if 'field_area' in data:
            update_fields['field_area'] = float(data['field_area'])
        update_fields['updated_at'] = datetime.utcnow().isoformat()
        mongo_users.update_one({'_id': ObjectId(user_id)}, {'$set': update_fields})
        user = mongo_users.find_one({'_id': ObjectId(user_id)})
        logger.info(f"✅ Profile updated: {user['username']}")
        return jsonify({
            'status': 'success',
            'message': 'Profile updated!',
            'user': mongo_user_to_dict(user)
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Profile error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/ndvi', methods=['POST'])
def get_crop_health():
    """Get NDVI and crop health status"""
    try:
        data = request.get_json()
        
        if not data or 'latitude' not in data or 'longitude' not in data:
            return jsonify({'error': 'Missing required fields: latitude, longitude'}), 400
        
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        email = data.get('email', 'unknown@example.com')
        
        # Get NDVI data
        ndvi_result = get_ndvi(latitude, longitude)
        
        if ndvi_result.get('status') != 'success':
            return jsonify(ndvi_result), 500
        
        ndvi_value = ndvi_result.get('ndvi', 0)
        
        # Get health score
        health_info = get_health_score(ndvi_value)
        
        # Save to database
        try:
            crop_data = CropData(
                email=email,
                latitude=latitude,
                longitude=longitude,
                ndvi=ndvi_value,
                health_status=health_info.get('score')
            )
            db.session.add(crop_data)
            db.session.commit()
        except Exception as e:
            logger.warning(f"Could not save to database: {e}")
            db.session.rollback()
        
        # Send alert if health is poor
        if ndvi_value < 0.2 and email != 'unknown@example.com':
            try:
                send_health_alert(health_info.get('score'), ndvi_value, email)
            except Exception as e:
                logger.warning(f"Could not send alert: {e}")
        
        return jsonify({
            'status': 'success',
            'ndvi': ndvi_value,
            'latitude': latitude,
            'longitude': longitude,
            'health': health_info
        })
    
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Error in get_crop_health: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/weather', methods=['GET'])
def weather():
    """Get weather data"""
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        
        if not lat or not lon:
            return jsonify({'error': 'Missing required parameters: lat, lon'}), 400
        
        weather_data = get_weather(float(lat), float(lon))
        
        if weather_data.get('status') != 'success':
            return jsonify(weather_data), 500
        
        return jsonify(weather_data)
    
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Error in weather: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/weather/forecast', methods=['GET'])
def weather_forecast():
    """Get weather forecast"""
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        days = request.args.get('days', 7, type=int)
        
        if not lat or not lon:
            return jsonify({'error': 'Missing required parameters: lat, lon'}), 400
        
        forecast_data = get_weather_forecast(float(lat), float(lon), days)
        return jsonify({'status': 'success', 'forecast': forecast_data})
    
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Error in weather_forecast: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict():
    """Predict crop disease from image"""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({'error': 'Missing required field: image'}), 400
        
        email = data.get('email', 'unknown@example.com')
        image_data = data.get('image')
        
        # Predict disease
        prediction = predict_disease(image_data)
        
        if prediction.get('status') != 'success':
            return jsonify(prediction), 500
        
        # Save to database
        try:
            disease_record = DiseaseRecord(
                email=email,
                disease=prediction.get('disease'),
                confidence=prediction.get('confidence')
            )
            db.session.add(disease_record)
            db.session.commit()
        except Exception as e:
            logger.warning(f"Could not save disease record: {e}")
            db.session.rollback()
        
        # Send alert if disease detected and email is valid
        if prediction.get('disease') != 'Healthy' and email != 'unknown@example.com':
            try:
                send_disease_alert(
                    prediction.get('disease'),
                    prediction.get('confidence'),
                    email
                )
            except Exception as e:
                logger.warning(f"Could not send disease alert: {e}")
        
        return jsonify(prediction)
    
    except Exception as e:
        logger.error(f"Error in predict: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/satellite', methods=['GET'])
def satellite():
    """Get satellite imagery data"""
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        
        if not lat or not lon:
            return jsonify({'error': 'Missing required parameters: lat, lon'}), 400
        
        imagery = get_satellite_imagery(float(lat), float(lon))
        return jsonify({'status': 'success', 'imagery': imagery})
    
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Error in satellite: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/history', methods=['GET'])
def history():
    """Get user's crop data history"""
    try:
        email = request.args.get('email')
        
        if not email:
            return jsonify({'error': 'Missing required parameter: email'}), 400
        
        crop_records = CropData.query.filter_by(email=email).order_by(CropData.timestamp.desc()).all()
        disease_records = DiseaseRecord.query.filter_by(email=email).order_by(DiseaseRecord.timestamp.desc()).all()
        
        return jsonify({
            'status': 'success',
            'crop_data': [{
                'id': r.id,
                'ndvi': r.ndvi,
                'health_status': r.health_status,
                'latitude': r.latitude,
                'longitude': r.longitude,
                'timestamp': r.timestamp.isoformat()
            } for r in crop_records],
            'disease_records': [{
                'id': r.id,
                'disease': r.disease,
                'confidence': r.confidence,
                'timestamp': r.timestamp.isoformat()
            } for r in disease_records]
        })
    
    except Exception as e:
        logger.error(f"Error in history: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== CROP RECOMMENDATIONS ====================

@app.route('/crop-database', methods=['GET'])
def crop_database():
    """Get crop database with all available crops"""
    crops = {
        'Wheat': {
            'season': 'Winter',
            'ideal_temp': '15-25°C',
            'water_needed': '400-500mm',
            'soil_type': 'Well-drained loam',
            'ph_level': '6.0-7.5',
            'duration': '120-150 days',
            'yield': '4-5 tons/hectare',
            'benefits': 'High protein, long shelf-life, global demand',
            'spacing': '20x10 cm, 150-200 plants/m²'
        },
        'Rice': {
            'season': 'Summer/Monsoon',
            'ideal_temp': '20-30°C',
            'water_needed': '1000-1500mm',
            'soil_type': 'Clay/clayey loam',
            'ph_level': '5.5-7.5',
            'duration': '90-150 days',
            'yield': '4-6 tons/hectare',
            'benefits': 'High yield, stable crop, good market value',
            'spacing': '20x15 cm, planting 2-3 seedlings per hill'
        },
        'Maize': {
            'season': 'Spring/Summer',
            'ideal_temp': '21-27°C',
            'water_needed': '500-800mm',
            'soil_type': 'Well-drained loam',
            'ph_level': '5.5-7.0',
            'duration': '90-120 days',
            'yield': '5-8 tons/hectare',
            'benefits': 'Multiple uses (grain, fodder, silage), export crop',
            'spacing': '60x25 cm, 60-75 plants/m²'
        },
        'Cotton': {
            'season': 'Spring',
            'ideal_temp': '21-30°C',
            'water_needed': '500-750mm',
            'soil_type': 'Well-drained black soil',
            'ph_level': '6.0-7.5',
            'duration': '160-180 days',
            'yield': '1.5-2.5 tons/hectare',
            'benefits': 'High value crop, multiple byproducts',
            'spacing': '100-120 cm rows, 60-75 cm in row'
        },
        'Sugarcane': {
            'season': 'Year-round',
            'ideal_temp': '20-30°C',
            'water_needed': '1200-1500mm',
            'soil_type': 'Deep loam/clay loam',
            'ph_level': '5.5-8.0',
            'duration': '10-12 months',
            'yield': '50-60 tons/hectare',
            'benefits': 'High cash crop, by-products value, long season',
            'spacing': '75-100 cm row, 2 buds per sett'
        },
        'Soybean': {
            'season': 'Summer',
            'ideal_temp': '20-30°C',
            'water_needed': '450-650mm',
            'soil_type': 'Well-drained loam',
            'ph_level': '6.0-7.5',
            'duration': '90-110 days',
            'yield': '2-3 tons/hectare',
            'benefits': 'High protein, nitrogen fixation, export value',
            'spacing': '45x15 cm, 50-60 plants/m²'
        },
        'Tomato': {
            'season': 'Spring/Fall',
            'ideal_temp': '20-25°C',
            'water_needed': '400-600mm',
            'soil_type': 'Well-drained fertile loam',
            'ph_level': '6.0-6.8',
            'duration': '70-85 days',
            'yield': '30-50 tons/hectare',
            'benefits': 'High market value, multiple harvests, processing use',
            'spacing': '60x45 cm, staked system'
        },
        'Potato': {
            'season': 'Winter/Spring',
            'ideal_temp': '15-20°C',
            'water_needed': '400-600mm',
            'soil_type': 'Loose well-drained soil',
            'ph_level': '5.5-7.0',
            'duration': '70-90 days',
            'yield': '20-30 tons/hectare',
            'benefits': 'High nutritive value, staple food, fast returns',
            'spacing': '60x20 cm, 75cm rows'
        }
    }
    
    return jsonify({'status': 'success', 'crops': crops})

@app.route('/crop-recommendations', methods=['POST'])
def crop_recommendations():
    """Get crop recommendations based on location and climate"""
    try:
        data = request.get_json()
        latitude = float(data.get('latitude', 0))
        longitude = float(data.get('longitude', 0))
        
        # Determine recommendations based on latitude
        if latitude < 10:
            suitable_crops = ['Rice', 'Sugarcane', 'Cotton', 'Maize']
        elif latitude < 20:
            suitable_crops = ['Wheat', 'Maize', 'Cotton', 'Soybean']
        elif latitude < 30:
            suitable_crops = ['Wheat', 'Maize', 'Potato', 'Soybean']
        else:
            suitable_crops = ['Wheat', 'Potato', 'Barley', 'Maize']
        
        return jsonify({
            'status': 'success',
            'location': {'latitude': latitude, 'longitude': longitude},
            'suitable_crops': suitable_crops,
            'recommendation': f'Based on your location, we recommend growing {", ".join(suitable_crops[:-1])} or {suitable_crops[-1]}.'
        })
    
    except Exception as e:
        logger.error(f"Error in crop_recommendations: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/maintenance-guide/<crop_name>', methods=['GET'])
def maintenance_guide(crop_name):
    """Get crop maintenance guide"""
    try:
        guides = {
            'Wheat': {
                'name': 'Wheat',
                'stages': [
                    {'stage': 'Seedling (0-30 days)', 'care': 'Maintain soil moisture at 60-70%, protect seedlings from birds, thin excess shoots for 150-200 plants/m²'},
                    {'stage': 'Tillering (30-70 days)', 'care': 'First nitrogen split of 50kg/ha, first irrigation if no rain, control Phalaris and Avena weeds'},
                    {'stage': 'Heading (70-100 days)', 'care': 'Second nitrogen split 50kg/ha, second irrigation, monitor for rust diseases, spray fungicide if needed'},
                    {'stage': 'Grain maturation (100-150 days)', 'care': 'Third irrigation, reduce water gradually, monitor for grain maturity (hard dough stage), prepare harvesting equipment'}
                ],
                'fertilizer': 'NPK 120:60:40 kg/hectare spread in 3 splits: Basal, Tillering, Heading',
                'irrigation': '3-4 irrigations: CRI (Crown Root Initiation), Tillering, Heading, Grain filling',
                'pests_diseases': ['Stem rust (cover with sulfur spray)', 'Leaf rust (use Propiconazole)', 'Powdery mildew (spray Wettable Sulfur)', 'Armyworm (use Bt spray)'],
                'harvest_time': '140-150 days, Harvest at moisture 12-14%'
            },
            'Rice': {
                'name': 'Rice',
                'stages': [
                    {'stage': 'Nursery (30-40 days)', 'care': 'Keep seedbed flooded 5cm, apply 8kg NPK per 100m², watch for blast disease on leaves'},
                    {'stage': 'Transplanting (40-60 days)', 'care': 'Maintain 5-10cm standing water, apply first dose nitrogen, transplant 2-3 seedlings per hill'},
                    {'stage': 'Vegetative (60-90 days)', 'care': 'Keep field continuously flooded, second nitrogen application at 45 days, remove weeds manually'},
                    {'stage': 'Reproductive (90-150 days)', 'care': 'Maintain water for grain filling, third nitrogen at 70 days, monitor for stem borer, drain at maturity'}
                ],
                'fertilizer': 'NPK 120:60:60 kg/hectare in 3 splits: Transplanting, 45 days, 70 days',
                'irrigation': 'Continuous flooding except for draining 7-10 days before harvest',
                'pests_diseases': ['Blast disease (spray Tricyclazole)', 'Brown spot (use Carbendazim)', 'Stem borer (pheromone trap)', 'Leafhopper (spray Imidacloprid)'],
                'harvest_time': '120-150 days, Harvest when 70% grains turned golden yellow'
            },
            'Maize': {
                'name': 'Maize',
                'stages': [
                    {'stage': 'Vegetation (0-30 days)', 'care': 'Thin to 50-60 plants/m² at 4 leaves stage, apply herbicide for weed control, light irrigation'},
                    {'stage': 'Vegetative (30-60 days)', 'care': 'First nitrogen split 75kg/ha, first earthing-up, second irrigation, remove lower leaves for ventilation'},
                    {'stage': 'Reproductive (60-100 days)', 'care': 'Second nitrogen split 75kg/ha at tassel emergence, third irrigation critical during silking, monitor pollen shed'},
                    {'stage': 'Maturation (100-120 days)', 'care': 'Reduce water gradually, allow cob to dry, monitor for physiological maturity, prepare for harvest'}
                ],
                'fertilizer': 'NPK 150:75:75 kg/hectare spread in 2-3 splits: Basal, 30 days, 60 days',
                'irrigation': '3-4 irrigations with critical irrigation at tasseling and silking stages',
                'pests_diseases': ['Armyworm (spray Chlorpyrifos)', 'Stem borer (release parasitoid)', 'Turcicum leaf blight (spray Mancozeb)', 'Rust (remove affected leaves)'],
                'harvest_time': '120-130 days at 20-25% grain moisture'
            },
            'Cotton': {
                'name': 'Cotton',
                'stages': [
                    {'stage': 'Seedling (0-45 days)', 'care': 'Thin to 1 plant per hill (60-75cm spacing), light irrigation to maintain 60-70% soil moisture, mulch to retain moisture'},
                    {'stage': 'Vegetative (45-90 days)', 'care': 'Heavy irrigation 8-10cm water, apply nitrogen 60kg/ha at 45 days, topping at 80-90 days, remove lower leaves at 90 days'},
                    {'stage': 'Flowering (90-140 days)', 'care': 'Critical water period, maintain 15cm soil moisture, apply potassium 60kg/ha, open bolls inspection, pesticide spray weekly'},
                    {'stage': 'Boll maturation (140-180 days)', 'care': 'Reduce irrigation, apply harvest aid at 85% boll opening, defoliate mechanically/chemically, begin picking'}
                ],
                'fertilizer': 'NPK 120:60:90 kg/hectare: 60kg N+P at 45 days, 60kg N+60kg K at 90 days',
                'irrigation': '10-12 flood/furrow irrigations with emphasis on flowering to boll opening',
                'pests_diseases': ['Bollworm (spray Bt-cotton approved insecticide)', 'Jassid (use Yellow sticky traps)', 'Whitefly (spray Neem oil)', 'Bacterial blight (remove infected plants)'],
                'harvest_time': '160-180 days, Stagger picking for 4-5 weeks'
            },
            'Potato': {
                'name': 'Potato',
                'stages': [
                    {'stage': 'Sprouting (0-15 days)', 'care': 'Soil temperature 15-16°C optimal, light irrigation 25-30mm, cover seed pieces with 5cm soil to prevent greening'},
                    {'stage': 'Growth (15-45 days)', 'care': 'First ridging at 30 days with 150kg/ha nitrogen, two irrigations of 50-60mm each, monitor for early blight'},
                    {'stage': 'Tuber formation (45-75 days)', 'care': 'THIS IS CRITICAL: consistent water 60-70mm bi-weekly, second nitrogen 150kg/ha, fungicide spray for late blight'},
                    {'stage': 'Maturation (75-90 days)', 'care': 'Reduce irrigation gradually, top-dressing cease, allow skins to harden, harvest when 80% soil removed tubers visible'}
                ],
                'fertilizer': 'NPK 60:120:120 kg/hectare: 150kg N (3 splits), full P+K basal, plus 40kg/ha MgSO4',
                'irrigation': 'Sprinkler preferred, 4-6 irrigations of 50-60mm at 10-15 days interval',
                'pests_diseases': ['Late blight (spray Mancozeb or Metalaxyl)', 'Early blight (spray Chlorothalonil)', 'Wireworm (use Carbofuran)', 'Aphids (spray Imidacloprid)'],
                'harvest_time': '70-90 days depending on variety, Harvest at 12-14% soil moisture'
            },
            'Tomato': {
                'name': 'Tomato',
                'stages': [
                    {'stage': 'Seedling (0-30 days)', 'care': 'Controlled greenhouse at 20-25°C, maintain 60-70% humidity, water mist 2-3 times daily, shade if needed'},
                    {'stage': 'Transplanting (30-45 days)', 'care': 'Harden seedlings gradually, transplant at 45 days (4-5 true leaves), spacing 60x45cm, mulch immediately'},
                    {'stage': 'Flowering (45-60 days)', 'care': 'Install support structure/staking, prune lower leaves, remove suckers, nutrient spray (B+Zn), bee activity check'},
                    {'stage': 'Fruiting (60-85 days)', 'care': 'Regular drip irrigation (5-6cm water weekly), harvest when breaker stage color shows, continue picking for 8-10 weeks'}
                ],
                'fertilizer': 'NPK 100:150:100 kg/hectare: Full P+K basal, N split in 4-5 doses at 15-20 days interval',
                'irrigation': 'Drip preferred, daily irrigation to maintain moisture 70-80%, avoid wetting foliage',
                'pests_diseases': ['Early blight (spray Chlorothalonil)', 'Late blight (spray Mancozeb)', 'Whitefly (use Yellow traps)', 'Fruit borer (install pheromone trap)'],
                'harvest_time': '60-85 days from transplanting, Multiple harvests over 8-10 weeks'
            },
            'Sugarcane': {
                'name': 'Sugarcane',
                'stages': [
                    {'stage': 'Germination (0-60 days)', 'care': 'Plant setts 2-3 buds deep, 75cm row spacing, irrigation at 3-4 days interval, mulch with straw to keep 70% moisture'},
                    {'stage': 'Tillering (60-180 days)', 'care': 'First irrigation at 30 days, dense canopy formation, first nitrogen split 80kg/ha, light cultivation to remove weeds'},
                    {'stage': 'Elongation (180-270 days)', 'care': 'Critical growth period, furrow irrigation, second nitrogen 80kg/ha, trashing (lower leaf removal), no stagnant water'},
                    {'stage': 'Maturation (270-360 days)', 'care': 'Reduce nitrogen, final irrigation 2-3 months before harvest, trash completely, monitor sucrose accumulation'}
                ],
                'fertilizer': 'NPK 200:120:120 kg/hectare: 100kg N at 30 days, 100kg N at 150 days, full K+P basal with FYM 20-25 tons/ha',
                'irrigation': 'Furrow irrigation 8-12 times, first at 30 days, avoid waterlogging during initiation phase',
                'pests_diseases': ['Shoot borer (use Neem oil spray)', 'Scale insect (release parasitoid)', 'Red rot (use resistant varieties)', 'Smut (hot water treatment for seeds)'],
                'harvest_time': '12-14 months, Harvest when mature stalks are 9-10 months old'
            },
            'Soybean': {
                'name': 'Soybean',
                'stages': [
                    {'stage': 'Germination (0-10 days)', 'care': 'Seed treated with Rhizobium culture, sow when soil temp 20-25°C, light irrigation after sowing, ensure 70% field capacity'},
                    {'stage': 'Vegetative (10-45 days)', 'care': 'Thin to optimal plant population 50-60 plants/m², one irrigation at 30 days if needed, hand weeding 2-3 times'},
                    {'stage': 'Reproductive (45-80 days)', 'care': 'Critical water period during flowering & pod filling (60-80 days), 1-2 irrigations of 50mm, no water stress, monitor for pests'},
                    {'stage': 'Maturation (80-110 days)', 'care': 'Reduce water 30 days before harvest, monitor pod color change to brown, remove lower third of leaves for harvesting'}
                ],
                'fertilizer': 'NPK 0:60:40 kg/hectare (N from Rhizobium symbiosis), apply full P+K basal, Seed inoculation with Rhizobium bacteira essential',
                'irrigation': '1-2 irrigations, critical at flowering and early pod formation stages',
                'pests_diseases': ['Pod borer (spray Formothion)', 'Yellow mosaic virus (use resistant variety)', 'Anthracnose (spray Carbendazim)', 'Leaf roller (hand pick)'],
                'harvest_time': '100-120 days, Harvest when 80% pods turned brown and seed rattles'
            }
        }
        
        if crop_name not in guides:
            return jsonify({'error': f'No guide found for {crop_name}'}), 404
        
        return jsonify({'status': 'success', 'guide': guides[crop_name]})
    
    except Exception as e:
        logger.error(f"Error in maintenance_guide: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/soil-health', methods=['POST'])
def soil_health():
    """Get soil health recommendations"""
    try:
        data = request.get_json()
        ph_value = float(data.get('ph_value', 7))
        
        recommendations = {
            'ph_status': '',
            'actions': [],
            'suitable_crops': []
        }
        
        if ph_value < 5.5:
            recommendations['ph_status'] = 'Very Acidic'
            recommendations['actions'] = [
                'Add lime to increase pH',
                'Apply 2-3 tons/hectare calcium carbonate',
                'Avoid acid-loving species initially'
            ]
            recommendations['suitable_crops'] = ['Potato', 'Strawberry']
        elif ph_value < 6.0:
            recommendations['ph_status'] = 'Acidic'
            recommendations['actions'] = [
                'Apply 1-2 tons/hectare lime',
                'Monitor soil annually',
                'Good drainage needed'
            ]
            recommendations['suitable_crops'] = ['Wheat', 'Potato', 'Rye']
        elif ph_value < 7.0:
            recommendations['ph_status'] = 'Slightly Acidic (Good)'
            recommendations['actions'] = [
                'Maintain current pH',
                'Regular soil testing',
                'Add organic matter'
            ]
            recommendations['suitable_crops'] = ['Most crops']
        elif ph_value < 8.0:
            recommendations['ph_status'] = 'Neutral to Slightly Alkaline (Ideal)'
            recommendations['actions'] = [
                'Excellent for most crops',
                'Monitor micronutrient availability',
                'Maintain with organic matter'
            ]
            recommendations['suitable_crops'] = ['Wheat', 'Rice', 'Maize', 'Sugarcane']
        else:
            recommendations['ph_status'] = 'Alkaline'
            recommendations['actions'] = [
                'Add sulfur to lower pH',
                'Incorporate organic matter',
                'Improve drainage'
            ]
            recommendations['suitable_crops'] = ['Bajra', 'Gram']
        
        return jsonify({'status': 'success', 'recommendations': recommendations})
    
    except Exception as e:
        logger.error(f"Error in soil_health: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== ADVANCED FEATURES (MVP) ====================

def _safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, low, high):
    return max(low, min(high, value))


def _decode_base64_image(image_data):
    if not image_data:
        return None
    try:
        payload = image_data.split(',', 1)[1] if ',' in image_data else image_data
        raw = base64.b64decode(payload)
        return Image.open(io.BytesIO(raw)).convert('RGB')
    except Exception:
        return None


@app.route('/feature-catalog', methods=['GET'])
def feature_catalog():
    """Return all supported and roadmap features in one API."""
    return jsonify({
        'status': 'success',
        'features': [
            'Real NDVI Satellite Integration (MVP proxy)',
            'Field Boundary Upload and Storage',
            'Pest and Disease Risk Forecast',
            'Irrigation Advisory Engine',
            'Fertilizer Recommendation Module',
            'Yield Prediction',
            'Multi-language Response Support',
            'Mobile/PWA readiness',
            'SMS/WhatsApp Alert readiness',
            'Image Quality Validation',
            'Farm Expense and Profit Tracking',
            'Admin Analytics Dashboard',
            'IoT Sensor Insight Endpoint',
            'Community Benchmark Endpoint',
            'Voice Assistant Endpoint',
            'Drone Snapshot readiness endpoint'
        ]
    })


@app.route('/field-boundary/save', methods=['POST'])
def save_field_boundary():
    """Store field boundary as coordinate array (GeoJSON-like list)."""
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip()
        field_name = (data.get('field_name') or 'My Field').strip()
        coordinates = data.get('coordinates') or []
        area_hectares = _safe_float(data.get('area_hectares'), 0.0)

        if not email:
            return jsonify({'error': 'Missing email'}), 400
        if not isinstance(coordinates, list) or len(coordinates) < 3:
            return jsonify({'error': 'Coordinates must be an array with at least 3 points'}), 400

        record = FieldBoundary(
            email=email,
            field_name=field_name,
            boundary_json=json.dumps(coordinates),
            area_hectares=area_hectares if area_hectares > 0 else None
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({'status': 'success', 'message': 'Field boundary saved', 'id': record.id})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in save_field_boundary: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/field-boundary/list', methods=['GET'])
def list_field_boundaries():
    """List all field boundaries for a user."""
    try:
        email = request.args.get('email', '').strip()
        if not email:
            return jsonify({'error': 'Missing email'}), 400

        rows = FieldBoundary.query.filter_by(email=email).order_by(FieldBoundary.created_at.desc()).all()
        return jsonify({
            'status': 'success',
            'fields': [{
                'id': r.id,
                'field_name': r.field_name,
                'coordinates': json.loads(r.boundary_json),
                'area_hectares': r.area_hectares,
                'created_at': r.created_at.isoformat()
            } for r in rows]
        })
    except Exception as e:
        logger.error(f"Error in list_field_boundaries: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/disease-risk-forecast', methods=['POST'])
def disease_risk_forecast():
    """Predict near-term disease risk from humidity, rain, temperature and crop stage."""
    try:
        data = request.get_json() or {}
        humidity = _safe_float(data.get('humidity'), 60)
        rainfall = _safe_float(data.get('rainfall_mm'), 2)
        temperature = _safe_float(data.get('temperature'), 28)
        stage = (data.get('crop_stage') or 'vegetative').lower()

        stage_factor = {'seedling': 1.15, 'vegetative': 1.0, 'flowering': 1.2, 'maturity': 0.9}.get(stage, 1.0)
        raw_score = ((humidity * 0.5) + (rainfall * 1.2) + max(0, 32 - abs(temperature - 28)) * 2.0) * stage_factor
        risk_pct = round(_clamp(raw_score, 0, 100), 1)

        band = 'Low'
        if risk_pct >= 70:
            band = 'High'
        elif risk_pct >= 40:
            band = 'Moderate'

        return jsonify({
            'status': 'success',
            'risk_percent': risk_pct,
            'risk_band': band,
            'advice': [
                'Increase field scouting frequency when humidity remains high',
                'Avoid overhead irrigation during evening hours',
                'Use preventive fungicide spray if risk is High'
            ]
        })
    except Exception as e:
        logger.error(f"Error in disease_risk_forecast: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/irrigation-advice', methods=['POST'])
def irrigation_advice():
    """Provide irrigation recommendation from forecast rain and soil moisture."""
    try:
        data = request.get_json() or {}
        soil_moisture = _safe_float(data.get('soil_moisture_percent'), 35)
        forecast_rain = _safe_float(data.get('forecast_rain_mm'), 0)
        crop_type = (data.get('crop_type') or 'general').lower()

        target = 45
        if crop_type in ('rice', 'sugarcane'):
            target = 60
        elif crop_type in ('wheat', 'maize', 'soybean'):
            target = 45

        deficit = max(0, target - soil_moisture)
        adjustment = max(0, deficit - (forecast_rain * 0.6))
        liters_per_m2 = round(adjustment * 1.5, 2)

        return jsonify({
            'status': 'success',
            'target_moisture_percent': target,
            'recommended_liters_per_m2': liters_per_m2,
            'recommended_timing': 'Early morning',
            'note': 'Recommendation auto-adjusted for expected rainfall'
        })
    except Exception as e:
        logger.error(f"Error in irrigation_advice: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/fertilizer-recommendation', methods=['POST'])
def fertilizer_recommendation():
    """Suggest NPK mix based on pH and crop."""
    try:
        data = request.get_json() or {}
        crop = (data.get('crop') or 'general').lower()
        ph = _safe_float(data.get('ph_value'), 7.0)
        nitrogen = _safe_float(data.get('nitrogen'), 50)
        phosphorus = _safe_float(data.get('phosphorus'), 50)
        potassium = _safe_float(data.get('potassium'), 50)

        base = {'n': 100, 'p': 60, 'k': 60}
        if crop == 'rice':
            base = {'n': 120, 'p': 60, 'k': 60}
        elif crop == 'wheat':
            base = {'n': 110, 'p': 55, 'k': 45}
        elif crop == 'maize':
            base = {'n': 150, 'p': 70, 'k': 70}

        ph_factor = 1.1 if ph < 6.0 or ph > 7.8 else 1.0
        rec_n = round(max(0, (base['n'] - nitrogen) * ph_factor), 1)
        rec_p = round(max(0, (base['p'] - phosphorus) * ph_factor), 1)
        rec_k = round(max(0, (base['k'] - potassium) * ph_factor), 1)

        return jsonify({
            'status': 'success',
            'recommended_npk_kg_per_hectare': {'N': rec_n, 'P': rec_p, 'K': rec_k},
            'split_plan': ['Basal dose: 40%', 'Vegetative stage: 35%', 'Pre-flowering: 25%']
        })
    except Exception as e:
        logger.error(f"Error in fertilizer_recommendation: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/yield-prediction', methods=['POST'])
def yield_prediction():
    """Predict yield from NDVI and weather trend."""
    try:
        data = request.get_json() or {}
        ndvi = _safe_float(data.get('ndvi'), 0.5)
        rainfall = _safe_float(data.get('season_rainfall_mm'), 600)
        temp = _safe_float(data.get('avg_temp'), 26)
        area = max(0.1, _safe_float(data.get('area_hectares'), 1))

        climate_factor = _clamp((rainfall / 700) * 0.5 + (1 - abs(temp - 27) / 20) * 0.5, 0.4, 1.2)
        tons_per_ha = round(_clamp((ndvi * 8) * climate_factor, 1.0, 9.0), 2)
        total_tons = round(tons_per_ha * area, 2)

        return jsonify({
            'status': 'success',
            'predicted_tons_per_hectare': tons_per_ha,
            'predicted_total_tons': total_tons,
            'confidence_percent': round(_clamp(55 + ndvi * 40, 55, 95), 1)
        })
    except Exception as e:
        logger.error(f"Error in yield_prediction: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/expense-profit-estimate', methods=['POST'])
def expense_profit_estimate():
    """Estimate farm profit from costs, yield and market rate."""
    try:
        data = request.get_json() or {}
        seed = _safe_float(data.get('seed_cost'), 0)
        fertilizer = _safe_float(data.get('fertilizer_cost'), 0)
        labor = _safe_float(data.get('labor_cost'), 0)
        irrigation = _safe_float(data.get('irrigation_cost'), 0)
        expected_tons = _safe_float(data.get('expected_yield_tons'), 0)
        market_rate = _safe_float(data.get('market_price_per_ton'), 0)

        total_cost = round(seed + fertilizer + labor + irrigation, 2)
        revenue = round(expected_tons * market_rate, 2)
        profit = round(revenue - total_cost, 2)
        margin = round((profit / revenue) * 100, 2) if revenue > 0 else 0

        return jsonify({
            'status': 'success',
            'total_cost': total_cost,
            'estimated_revenue': revenue,
            'estimated_profit': profit,
            'profit_margin_percent': margin
        })
    except Exception as e:
        logger.error(f"Error in expense_profit_estimate: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/image-quality-check', methods=['POST'])
def image_quality_check():
    """Check uploaded image quality for blur/brightness before disease detection."""
    try:
        data = request.get_json() or {}
        image = _decode_base64_image(data.get('image'))
        if image is None:
            return jsonify({'error': 'Invalid image payload'}), 400

        gray = image.convert('L')
        stat = ImageStat.Stat(gray)
        brightness = stat.mean[0]
        contrast = stat.stddev[0]

        # Simple practical thresholds
        brightness_score = _clamp((brightness / 255) * 100, 0, 100)
        contrast_score = _clamp((contrast / 64) * 100, 0, 100)
        quality_score = round((brightness_score * 0.45) + (contrast_score * 0.55), 1)

        status = 'Good'
        if quality_score < 40:
            status = 'Poor'
        elif quality_score < 65:
            status = 'Fair'

        return jsonify({
            'status': 'success',
            'quality_score': quality_score,
            'quality_band': status,
            'tips': [
                'Capture image in daylight',
                'Keep leaf in focus and fill most of the frame',
                'Avoid shadows and motion blur'
            ]
        })
    except Exception as e:
        logger.error(f"Error in image_quality_check: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/iot-sensor-insights', methods=['POST'])
def iot_sensor_insights():
    """Analyze basic IoT sensor feed and return alert level."""
    try:
        data = request.get_json() or {}
        soil_moisture = _safe_float(data.get('soil_moisture_percent'), 35)
        air_temp = _safe_float(data.get('air_temp'), 30)
        humidity = _safe_float(data.get('humidity'), 60)

        alert = 'Normal'
        if soil_moisture < 25 or air_temp > 38:
            alert = 'High'
        elif soil_moisture < 32 or air_temp > 34:
            alert = 'Moderate'

        return jsonify({
            'status': 'success',
            'alert_level': alert,
            'actions': [
                'Trigger irrigation if soil moisture drops below 30%',
                'Increase monitoring frequency during hot hours',
                'Log sensor data every 30 minutes'
            ]
        })
    except Exception as e:
        logger.error(f"Error in iot_sensor_insights: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/community-benchmark', methods=['POST'])
def community_benchmark():
    """Compare current farm metrics to a simple benchmark baseline."""
    try:
        data = request.get_json() or {}
        ndvi = _safe_float(data.get('ndvi'), 0.5)
        yield_tph = _safe_float(data.get('yield_tph'), 4)

        return jsonify({
            'status': 'success',
            'benchmark': {
                'regional_avg_ndvi': 0.56,
                'regional_avg_yield_tph': 4.8
            },
            'your_position': {
                'ndvi_delta': round(ndvi - 0.56, 3),
                'yield_delta': round(yield_tph - 4.8, 2)
            }
        })
    except Exception as e:
        logger.error(f"Error in community_benchmark: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/voice-assistant', methods=['POST'])
def voice_assistant():
    """Return multilingual assistant text response for app integration."""
    try:
        data = request.get_json() or {}
        lang = (data.get('language') or 'en').lower()
        intent = (data.get('intent') or 'general_help').lower()

        responses = {
            'en': {
                'irrigation': 'Irrigate early morning and adjust by forecast rain.',
                'disease': 'Upload a clear leaf image for more reliable disease detection.',
                'general_help': 'Open Weather, Soil, or Disease section for guided analysis.'
            },
            'te': {
                'irrigation': 'ఉదయం సేద్యం చేయండి. వర్ష సూచనను బట్టి నీరు తగ్గించండి.',
                'disease': 'ఆకు ఫోటోను స్పష్టంగా తీసి అప్‌లోడ్ చేయండి.',
                'general_help': 'Weather, Soil, Disease సెక్షన్లలో విశ్లేషణ చూడండి.'
            },
            'hi': {
                'irrigation': 'सुबह सिंचाई करें और बारिश के पूर्वानुमान के अनुसार पानी कम करें।',
                'disease': 'स्पष्ट पत्ते की फोटो अपलोड करें।',
                'general_help': 'Weather, Soil और Disease सेक्शन में विश्लेषण देखें।'
            }
        }

        lang_map = responses.get(lang, responses['en'])
        message = lang_map.get(intent, lang_map['general_help'])

        return jsonify({'status': 'success', 'language': lang, 'message': message})
    except Exception as e:
        logger.error(f"Error in voice_assistant: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/admin-analytics', methods=['GET'])
def admin_analytics():
    """Lightweight admin analytics summary."""
    try:
        users = User.query.count()
        crop_records = CropData.query.count()
        disease_records = DiseaseRecord.query.count()
        boundaries = FieldBoundary.query.count()

        return jsonify({
            'status': 'success',
            'summary': {
                'total_users': users,
                'total_crop_checks': crop_records,
                'total_disease_scans': disease_records,
                'total_saved_fields': boundaries
            }
        })
    except Exception as e:
        logger.error(f"Error in admin_analytics: {e}")
        return jsonify({'error': str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info("🌾 Starting Crop Health Monitoring System...")
    logger.info(f"📁 Template folder: {template_dir}")
    logger.info(f"📁 Static folder: {static_dir}")
    app.run(debug=True, host='0.0.0.0', port=5000)
