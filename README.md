# 🌾 Satellite Crop Health Monitoring

**Smart agriculture platform combining satellite imagery analysis, AI disease detection, and precision farming tools.**

A comprehensive web-based crop monitoring system that helps farmers make data-driven decisions through real-time health analytics, disease identification, weather integration, and personalized recommendations.

## 🚀 Live Demo


**Live Frontend:** https://crop-health.onrender.com
**Live Backend API:** https://crop-health-api.onrender.com

**(Update the backend link above if your deployed API URL is different.)**

**Demo credentials:**
- Username: `demo`
- Password: `demo123`

## 📋 Description

This full-stack precision agriculture application empowers farmers with:

- **🛰️ Satellite Health Analysis** - NDVI-based crop vigor assessment using simulated satellite data
- **🔬 AI Disease Detection** - Upload crop images for instant disease identification with confidence scoring
- **🌤️ Real-Time Weather** - Current conditions and forecasts via Open-Meteo API integration
- **📍 Location-Based Insights** - Google Maps integration for field-specific weather and recommendations
- **📚 Crop Knowledge Base** - Comprehensive database with seasonal filters and growth requirements
- **🔧 Maintenance Guides** - Step-by-step care instructions for each crop lifecycle stage
- **🌱 Soil Health Analysis** - pH testing and improvement recommendations
- **📊 Historical Tracking** - View trends in crop health and disease patterns over time
- **👤 User Profiles** - Personalized farm management and alert preferences

Built with modern web technologies for a responsive, intuitive farmer experience.

## Features

- Crop health checks using NDVI (simulated satellite data)
- Disease detection from uploaded images with confidence and treatment tips
- Weather and forecast lookups (Open-Meteo API)
- Location-based weather via Google Maps
- Crop database with season filters
- Maintenance guides and soil health analysis
- User authentication, profiles, and history tracking

## Feature Roadmap (All Planned Features)

- Real NDVI satellite integration (Sentinel/Landsat based)
- Field boundary upload support (GeoJSON/KML)
- Pest and disease risk forecasting
- Irrigation advisory engine
- Fertilizer recommendation module (soil and crop specific)
- Yield prediction analytics
- Multi-language interface (regional language support)
- Mobile-first PWA with offline support
- SMS and WhatsApp smart alerting
- Image quality validation before disease detection
- Farm expense and profit tracking
- Admin analytics and system monitoring dashboard
- Drone imagery integration
- IoT sensor integration (soil moisture, temperature, humidity)
- Farmer community benchmarking and trend sharing
- Voice assistant support in local languages

## Tech Stack

- Backend: Flask, Flask-SQLAlchemy, Flask-Session
- Frontend: HTML, CSS, vanilla JavaScript
- Data: SQLite for local storage

## Getting Started

1. Create and activate a virtual environment.
2. Install dependencies.
3. Start the server.

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run the App

```bash
python run.py
```

The app runs at:

```
http://localhost:5000
```

Demo login:

- Username: demo
- Password: demo123

## Environment Variables

Optional SMTP settings for email alerts:

- `SMTP_SERVER`
- `SMTP_PORT`
- `SENDER_EMAIL`
- `SENDER_PASSWORD`

If not configured, email alerts are skipped and the app continues normally.

## Key API Endpoints

- `GET /health` - Service health check
- `POST /register` - Create a user
- `POST /login` - Login
- `POST /logout` - Logout
- `GET /session` - Session check
- `GET/PUT /profile` - Profile details
- `POST /ndvi` - Crop health check
- `GET /weather` - Weather data
- `GET /weather-forecast` - Forecast data
- `POST /disease-detect` - Disease detection
- `GET /history` - User history
- `GET /crop-database` - Crop data
- `POST /crop-recommendations` - Recommendations
- `GET /maintenance-guide/<crop>` - Maintenance guide
- `POST /soil-health` - Soil analysis

## Project Structure

```
backend/
	app.py
	ai_model.py
	alerts.py
	satellite_data.py
	weather_data.py
frontend/
	static/
		style.css
		script.js
		templates/
			index.html
run.py
requirements.txt
```

## Notes

- NDVI and disease detection are simulated for demo purposes.
- Weather uses Open-Meteo (no API key required).
- Weather map supports Google Maps when `GOOGLE_MAPS_API_KEY` is set, and falls back to OpenStreetMap if unavailable.

## Troubleshooting

- Blank page: make sure `index.html` is in `frontend/static/templates` and the server is running.
- Weather map not loading: set `GOOGLE_MAPS_API_KEY` (with Places API + billing + referrer allowed) or use built-in OpenStreetMap fallback.
- Missing data: confirm the backend is running on port 5000.

## Deploy (Render - Free)

This project includes `render.yaml` for one-click deployment.

1. Push the repo to GitHub.
2. In Render, create a new Web Service and connect your GitHub repo.
3. Render will detect `render.yaml` and configure build/start commands.
4. Once deployed, open the public Render URL to access the app.

Notes:

- The SQLite database resets on each deploy.
- Email alerts are disabled unless you add SMTP env vars in Render.

### Required Render Env Vars (Optional)

- `SMTP_SERVER`
- `SMTP_PORT`
- `SENDER_EMAIL`
- `SENDER_PASSWORD`
