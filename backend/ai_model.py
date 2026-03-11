import numpy as np
from PIL import Image
import io
import base64
import random


class CropDiseasePredictor:
    """
    Simple crop disease prediction model.
    In production, this would use a trained CNN or similar model.
    """
    
    diseases = [
        'Healthy',
        'Powdery Mildew',
        'Leaf Spot',
        'Rust',
        'Blight',
        'Septoria'
    ]
    
    def __init__(self):
        self.model_loaded = True
    
    def preprocess_image(self, image_data):
        """
        Preprocess image for model prediction
        """
        try:
            if isinstance(image_data, str):
                # Handle base64 encoded image
                image_array = base64.b64decode(image_data.split(',')[1])
                image = Image.open(io.BytesIO(image_array))
            else:
                image = image_data
            
            # Resize to standard size
            image = image.resize((224, 224))
            image_array = np.array(image) / 255.0
            
            return image_array
        except Exception as e:
            return None
    
    def predict(self, image_data):
        """
        Predict crop disease from image using simple image statistics (demo only).
        Always returns a disease result for any valid image.
        """
        try:
            # Accept file-like, bytes, or PIL Image
            if hasattr(image_data, 'read'):
                image = Image.open(image_data).convert('RGB')
            elif isinstance(image_data, bytes):
                image = Image.open(io.BytesIO(image_data)).convert('RGB')
            elif isinstance(image_data, Image.Image):
                image = image_data.convert('RGB')
            else:
                # Try to decode base64 string
                if isinstance(image_data, str):
                    try:
                        image_array = base64.b64decode(image_data.split(',')[1])
                        image = Image.open(io.BytesIO(image_array)).convert('RGB')
                    except Exception:
                        return {
                            'disease': 'Unknown',
                            'confidence': 0.0,
                            'error': 'Could not process image',
                            'status': 'error'
                        }
                else:
                    return {
                        'disease': 'Unknown',
                        'confidence': 0.0,
                        'error': 'Unsupported image format',
                        'status': 'error'
                    }
            image = image.resize((224, 224))
            # Demo: randomize disease result for each image
            import hashlib
            image_bytes = image.tobytes()
            image_hash = hashlib.md5(image_bytes).hexdigest()
            idx = int(image_hash, 16) % len(self.diseases)
            disease = self.diseases[idx]
            confidence = round(random.uniform(0.6, 0.95), 2)
            recommendations = self.get_treatments(disease)
            return {
                'disease': disease,
                'confidence': confidence,
                'recommendations': recommendations,
                'status': 'success'
            }
        except Exception as e:
            return {
                'disease': 'Unknown',
                'confidence': 0.0,
                'error': str(e),
                'status': 'error'
            }
    
    @staticmethod
    def get_treatments(disease):
        """
        Get treatment recommendations for identified disease
        """
        treatments = {
            'Healthy': ['Continue regular maintenance', 'Monitor crop regularly'],
            'Powdery Mildew': ['Apply fungicide spray', 'Improve air circulation', 'Reduce humidity'],
            'Leaf Spot': ['Remove affected leaves', 'Apply copper fungicide', 'Ensure proper spacing'],
            'Rust': ['Use sulfur-based treatments', 'Improve air drainage', 'Remove infected leaves'],
            'Blight': ['Apply systemic fungicide immediately', 'Increase drainage', 'Isolate infected plants'],
            'Septoria': ['Remove infected foliage', 'Apply fungicide', 'Reduce leaf wetness'],
            'Unknown': ['Consult agricultural expert', 'Take multiple photos from different angles']
        }
        return treatments.get(disease, treatments['Unknown'])

# Initialize predictor
predictor = CropDiseasePredictor()

def predict_disease(image_data):
    """
    Public function to predict disease from image
    """
    return predictor.predict(image_data)

def train_disease(image_data, label=None):
    """
    Public function to train model with image and optional label
    """
    return predictor.train(image_data, label)

def get_health_score(ndvi_value):
    """
    Calculate overall crop health score from NDVI
    """
    if ndvi_value < 0.2:
        return {'score': 'Poor', 'color': 'red', 'action': 'Immediate intervention required'}
    elif ndvi_value < 0.4:
        return {'score': 'Fair', 'color': 'orange', 'action': 'Monitor and treat'}
    elif ndvi_value < 0.6:
        return {'score': 'Good', 'color': 'yellow', 'action': 'Continue monitoring'}
    else:
        return {'score': 'Excellent', 'color': 'green', 'action': 'Maintain current practices'}
