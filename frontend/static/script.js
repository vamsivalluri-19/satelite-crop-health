// API Configuration
// Use deployed backend API for production, fallback to localhost for local dev
const API_BASE_URL = (window.location.hostname === 'crop-health.onrender.com')
    ? 'https://crop-health-api.onrender.com' // <-- Replace with your actual backend API URL
    : (window.location.origin || 'http://localhost:5000');

// Global State
let currentUser = null;
let allNotifications = [];
let weatherMap = null;
let weatherMapMarker = null;

// Safe localStorage helpers to prevent tracking prevention errors
const safeLocalStorage = {
    setItem: (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // Silently handle tracking prevention - session storage is used via backend
        }
    },
    getItem: (key) => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            // Silently handle tracking prevention - session storage is used via backend
            return null;
        }
    },
    removeItem: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            // Silently handle tracking prevention - session storage is used via backend
        }
    }
};

// Initialize App
let isAppInitialized = false;
document.addEventListener('DOMContentLoaded', async function() {
    if (isAppInitialized) return;
    isAppInitialized = true;
    
    console.log('🌾 AgriTech App Loading...');
    await checkSession();
    setupEventListeners();
    setupLoginKeyHandlers();
    if (currentUser) {
        loadDashboardData();
    }
});

// ============ AUTHENTICATION ============

async function handleLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showToast('Please enter username and password', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('/login', 'POST', {
            username: username,
            password: password
        });
        
        if (response && response.status === 'success') {
            currentUser = response.user;
            safeLocalStorage.setItem('user', JSON.stringify(currentUser));
            showToast('✅ Login successful!', 'success');
            showApp();
            loadDashboardData();
        } else {
            showToast('❌ ' + (response.error || 'Login failed'), 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('❌ Login failed: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleRegister() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const firstName = document.getElementById('register-first-name').value;
    const lastName = document.getElementById('register-last-name').value;
    
    if (!username || !email || !password || !passwordConfirm) {
        showToast('Please fill all required fields', 'warning');
        return;
    }
    
    if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'warning');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('/register', 'POST', {
            username: username,
            email: email,
            password: password,
            first_name: firstName,
            last_name: lastName
        });
        
        if (response && response.status === 'success') {
            showToast('Account created successfully! Please login.', 'success');
            switchAuthForm();
            document.getElementById('login-username').value = username;
        } else {
            showToast('❌ ' + (response.error || 'Registration failed'), 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('❌ Registration failed: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function switchAuthForm() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (!loginForm || !registerForm) return;
    
    const isLoginVisible = loginForm.style.display !== 'none';
    loginForm.style.display = isLoginVisible ? 'none' : 'block';
    registerForm.style.display = isLoginVisible ? 'block' : 'none';
}

async function handleLogout() {
    showLoading(true);
    
    try {
        await apiCall('/logout', 'POST', {});
        currentUser = null;
        safeLocalStorage.removeItem('user');
        showToast('Logged out successfully', 'success');
        showLoginPage();
    } catch (error) {
        showToast('Logout failed', 'error');
    } finally {
        showLoading(false);
    }
}

// ============ UI HELPERS ============

function showApp() {
    const loginPage = document.getElementById('login-page');
    const app = document.getElementById('app');
    if (loginPage) loginPage.style.display = 'none';
    if (app) app.style.display = 'flex';
    showPage('dashboard');
}

function showLoginPage() {
    const loginPage = document.getElementById('login-page');
    const app = document.getElementById('app');
    if (loginPage) loginPage.style.display = 'block';
    if (app) app.style.display = 'none';
}

let currentPageId = null;

function showPage(pageId) {
    // Prevent multiple calls to the same page
    if (currentPageId === pageId) {
        console.log('📄 Page already showing:', pageId);
        return;
    }
    
    console.log('📄 Showing page:', pageId);
    currentPageId = pageId;
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        page.style.display = 'block';
        
        if (pageId === 'dashboard') {
            loadDashboardData();
        } else if (pageId === 'profile') {
            loadProfileData();
        } else if (pageId === 'history') {
            loadHistoryData();
        } else if (pageId === 'crop-database') {
            setTimeout(() => loadCropDatabase(), 100);
        } else if (pageId === 'weather-location') {
            setTimeout(() => initializeWeatherMap(), 500);
        } else if (pageId === 'recommendations') {
            initializeRecommendationsPage();
        } else if (pageId === 'maintenance') {
            initializeMaintenancePage();
        } else if (pageId === 'soil-health') {
            initializeSoilHealthPage();
        }
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const handler = item.getAttribute('onclick') || '';
        if (handler.includes(`'${pageId}'`)) {
            item.classList.add('active');
        }
    });
}

function toggleNotifications() {
    const panel = document.getElementById('notification-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

function showLoading(show = true) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function checkSession() {
    try {
        const response = await apiCall('/session', 'GET', null);
        
        if (response.logged_in) {
            currentUser = response.user;
            showApp();
        } else {
            showLoginPage();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        showLoginPage();
    }
}

// ============ DASHBOARD ============

async function loadDashboardData() {
    if (!currentUser) {
        console.warn('No user logged in');
        return;
    }
    
    // Update username in dashboard
    const usernameElement = document.getElementById('dashboard-username');
    if (usernameElement) {
        usernameElement.textContent = currentUser.first_name || currentUser.username || 'Farmer';
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall(`/history?email=${currentUser.email}`, 'GET');
        
        if (response.status === 'success') {
            updateDashboardStats(response.crop_data || [], response.disease_records || []);
            updateRecentActivity(response.crop_data || [], response.disease_records || []);
            
            // Get weather update for display
            const weatherStat = document.getElementById('stat-weather');
            if (weatherStat) {
                weatherStat.textContent = 'Updated';
            }
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        // Set default values on error
        document.getElementById('stat-fields').textContent = '0';
        document.getElementById('stat-alerts').textContent = '0';
        document.getElementById('stat-healthy').textContent = '0%';
        document.getElementById('stat-weather').textContent = '--';
    } finally {
        showLoading(false);
    }
}

function updateDashboardStats(cropData, diseaseRecords) {
    // Update stats
    document.getElementById('stat-fields').textContent = cropData.length;
    document.getElementById('stat-alerts').textContent = diseaseRecords.filter(d => d.disease !== 'Healthy').length;
    
    // Calculate healthy percentage
    const healthyCount = cropData.filter(d => {
        const ndvi = d.ndvi;
        return ndvi >= 0.6;
    }).length;
    const healthyPercent = cropData.length > 0 ? Math.round((healthyCount / cropData.length) * 100) : 0;
    document.getElementById('stat-healthy').textContent = healthyPercent + '%';
}

function updateRecentActivity(cropData, diseaseRecords) {
    const recentList = document.getElementById('recent-list');
    const allActivities = [];
    
    // Add crop data
    cropData.slice(0, 5).forEach(item => {
        allActivities.push({
            type: 'health',
            title: `Health check at ${item.latitude}, ${item.longitude}`,
            value: `NDVI: ${item.ndvi.toFixed(2)} (${item.health_status})`,
            date: new Date(item.timestamp)
        });
    });
    
    // Add disease records
    diseaseRecords.slice(0, 5).forEach(item => {
        allActivities.push({
            type: 'disease',
            title: `Disease detected: ${item.disease}`,
            value: `Confidence: ${(item.confidence * 100).toFixed(1)}%`,
            date: new Date(item.timestamp)
        });
    });
    
    // Sort by date
    allActivities.sort((a, b) => b.date - a.date);
    
    if (allActivities.length === 0) {
        recentList.innerHTML = '<p class="empty-state">No recent activity</p>';
        return;
    }
    
    recentList.innerHTML = allActivities.map(activity => `
        <div class="activity-item">
            <strong>${activity.title}</strong>
            <p>${activity.value}</p>
            <div class="timestamp">${formatDate(activity.date)}</div>
        </div>
    `).join('');
}

// ============ HEALTH CHECK ============

async function checkCropHealth() {
    const latitude = parseFloat(document.getElementById('health-latitude').value);
    const longitude = parseFloat(document.getElementById('health-longitude').value);
    const fieldName = document.getElementById('health-field-name').value;
    
    if (!latitude || !longitude || !fieldName) {
        showToast('Please fill all fields', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('/ndvi', 'POST', {
            latitude: latitude,
            longitude: longitude,
            email: currentUser.email
        });
        
        displayHealthResults(response);
    } catch (error) {
        showToast('Failed to check crop health', 'error');
    } finally {
        showLoading(false);
    }
}

function displayHealthResults(data) {
    const resultBox = document.getElementById('health-result');
    const resultDetails = document.getElementById('health-details');
    
    if (data.status === 'error' || !data.ndvi) {
        resultDetails.innerHTML = '<p class="error-text">Failed to retrieve health data. Please try again.</p>';
        resultBox.style.display = 'block';
        return;
    }
    
    const ndvi = data.ndvi || 0;
    const health = data.health || {};
    let healthScore = health.score || 'Unknown';
    let healthClass = healthScore.toLowerCase();
    const recommendations = [];
    
    // Generate recommendations
    if (ndvi < 0.2) {
        recommendations.push('Immediate intervention required');
        recommendations.push('Check for diseases or pest infestations');
        recommendations.push('Ensure adequate irrigation');
        recommendations.push('Consider consulting an agricultural expert');
    } else if (ndvi < 0.4) {
        recommendations.push('Monitor crop closely');
        recommendations.push('Apply targeted treatments');
        recommendations.push('Improve irrigation schedule');
        recommendations.push('Check soil nutrient levels');
    } else if (ndvi < 0.6) {
        recommendations.push('Continue regular monitoring');
        recommendations.push('Maintain current watering schedule');
        recommendations.push('Watch for seasonal changes');
        recommendations.push('Prepare for harvesting');
    } else {
        recommendations.push('Excellent crop development');
        recommendations.push('Maintain current practices');
        recommendations.push('Plan for optimal harvesting time');
        recommendations.push('Prepare for next season');
    }
    
    let html = `
        <div class="result-item">
            <strong>NDVI Value:</strong>
            <span class="value">${ndvi.toFixed(3)}</span>
        </div>
        <div class="health-score ${healthClass}">
            Health Status: ${healthScore}
        </div>
        <div class="result-item">
            <strong>Action Required:</strong>
            <span class="value">${health.action || 'Monitor regularly'}</span>
        </div>
        <div class="recommendations">
            <h4>📋 Recommendations:</h4>
            <ul>
                ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    `;
    
    resultDetails.innerHTML = html;
    resultBox.style.display = 'block';
    showToast(`Health analysis complete! Status: ${healthScore}`, 'success');
}

// ============ DISEASE DETECTION ============

function triggerUpload() {
    document.getElementById('disease-image-input').click();
}

document.getElementById('disease-image-input')?.addEventListener('change', function(e) {
    const preview = document.getElementById('disease-image-preview');
    const previewImg = document.getElementById('preview-img');
    const analyzeBtn = document.getElementById('analyze-btn');
    const file = e.target.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
            analyzeBtn.style.display = 'inline-flex';
        };
        reader.readAsDataURL(file);
    }
});

function clearImagePreview() {
    document.getElementById('disease-image-preview').style.display = 'none';
    document.getElementById('disease-image-input').value = '';
    document.getElementById('analyze-btn').style.display = 'none';
}

async function detectDisease() {
    const imageInput = document.getElementById('disease-image-input');
    
    if (!imageInput.files.length) {
        showToast('Please select an image', 'warning');
        return;
    }
    
    const file = imageInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        showLoading(true);
        
        try {
            const imageData = e.target.result;
            const response = await apiCall('/predict', 'POST', {
                email: currentUser.email,
                image: imageData
            });
            
            displayDiseaseResults(response);
        } catch (error) {
            showToast('Failed to detect disease', 'error');
        } finally {
            showLoading(false);
        }
    };
    
    reader.readAsDataURL(file);
}

function displayDiseaseResults(data) {
    const resultBox = document.getElementById('disease-result');
    const resultDetails = document.getElementById('disease-details');
    
    if (data.status === 'error' || !data.disease) {
        resultDetails.innerHTML = '<p class="error-text">Could not analyze image. Please try another image.</p>';
        resultBox.style.display = 'block';
        return;
    }
    
    const disease = data.disease || 'Unknown';
    const confidence = (data.confidence || 0);
    const recommendations = data.recommendations || [];
    
    let diseaseColor = '#27ae60';
    if (disease === 'Healthy') {
        diseaseColor = '#27ae60';
    } else if (disease === 'Unknown') {
        diseaseColor = '#95a5a6';
    } else {
        diseaseColor = '#e74c3c';
    }
    
    let html = `
        <div class="result-item" style="border-left-color: ${diseaseColor};">
            <strong>Detected Disease:</strong>
            <span class="value" style="color: ${diseaseColor};">${disease}</span>
        </div>
        <div class="result-item">
            <strong>Confidence Level:</strong>
            <span class="value">${(confidence * 100).toFixed(1)}%</span>
            <div style="background: #ecf0f1; border-radius: 4px; height: 20px; margin-top: 0.5rem;">
                <div style="background: ${diseaseColor}; height: 100%; width: ${confidence * 100}%; border-radius: 4px; transition: width 0.3s;"></div>
            </div>
        </div>
    `;
    
    if (recommendations && recommendations.length > 0) {
        html += `
            <div class="recommendations">
                <h4>🔧 Treatment & Prevention:</h4>
                <ul>
                    ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    resultDetails.innerHTML = html;
    resultBox.style.display = 'block';
    
    const message = disease === 'Healthy' 
        ? 'Great! Your crops appear healthy.' 
        : `Disease detected: ${disease} (${(confidence * 100).toFixed(1)}% confidence). Please take action.`;
    
    showToast(message, disease === 'Healthy' ? 'success' : 'warning');
}

// ============ WEATHER ============

async function getWeatherData() {
    const latitude = parseFloat(document.getElementById('weather-latitude').value);
    const longitude = parseFloat(document.getElementById('weather-longitude').value);
    
    if (!latitude || !longitude) {
        showToast('Please enter latitude and longitude', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall(`/weather?lat=${latitude}&lon=${longitude}`, 'GET');
        displayWeatherResults(response);
    } catch (error) {
        showToast('Failed to get weather data', 'error');
    } finally {
        showLoading(false);
    }
}

function displayWeatherResults(data) {
    const resultBox = document.getElementById('weather-result');
    const resultDetails = document.getElementById('weather-details');
    
    if (data.status === 'error' || !data.current) {
        resultDetails.innerHTML = '<p class="error-text">Failed to retrieve weather data. Please try again.</p>';
        resultBox.style.display = 'block';
        return;
    }
    
    const current = data.current || {};
    const daily = data.daily || {};
    
    let html = `
        <div class="weather-cards">
            <div class="weather-card">
                <h4>🌡️ Current Temperature</h4>
                <div class="value">${current.temperature?.toFixed(1) || 'N/A'}°C</div>
            </div>
            <div class="weather-card">
                <h4>💧 Humidity</h4>
                <div class="value">${current.humidity || 'N/A'}%</div>
            </div>
            <div class="weather-card">
                <h4>🌧️ Precipitation</h4>
                <div class="value">${current.precipitation?.toFixed(1) || 'N/A'} mm</div>
            </div>
            <div class="weather-card">
                <h4>📈 Max Temperature</h4>
                <div class="value">${daily.max_temp?.toFixed(1) || 'N/A'}°C</div>
            </div>
            <div class="weather-card">
                <h4>📉 Min Temperature</h4>
                <div class="value">${daily.min_temp?.toFixed(1) || 'N/A'}°C</div>
            </div>
            <div class="weather-card">
                <h4>🌧️ Daily Precipitation</h4>
                <div class="value">${daily.precipitation?.toFixed(1) || 'N/A'} mm</div>
            </div>
        </div>
    `;
    
    resultDetails.innerHTML = html;
    resultBox.style.display = 'block';
    showToast('Weather data retrieved successfully!', 'success');
}

// ============ HISTORY ============

async function loadHistoryData() {
    showLoading(true);
    
    try {
        const response = await apiCall(`/history?email=${currentUser.email}`, 'GET');
        
        if (response.status === 'success') {
            displayCropHistory(response.crop_data);
            displayDiseaseHistory(response.disease_records);
        }
    } catch (error) {
        showToast('Failed to load history', 'error');
    } finally {
        showLoading(false);
    }
}

function displayCropHistory(data) {
    const list = document.getElementById('crop-history-list');
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="empty-state">No crop health records yet</p>';
        return;
    }
    
    list.innerHTML = data.map(item => `
        <div class="history-item">
            <div class="history-item-header">
                <div class="history-item-title">Location: ${item.latitude}, ${item.longitude}</div>
                <div class="history-item-date">${formatDate(new Date(item.timestamp))}</div>
            </div>
            <div class="history-item-details">
                <div><strong>NDVI:</strong> ${item.ndvi.toFixed(3)}</div>
                <div><strong>Status:</strong> ${item.health_status}</div>
            </div>
        </div>
    `).join('');
}

function displayDiseaseHistory(data) {
    const list = document.getElementById('disease-history-list');
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="empty-state">No disease records yet</p>';
        return;
    }
    
    list.innerHTML = data.map(item => `
        <div class="history-item">
            <div class="history-item-header">
                <div class="history-item-title">${item.disease}</div>
                <div class="history-item-date">${formatDate(new Date(item.timestamp))}</div>
            </div>
            <div class="history-item-details">
                <div><strong>Confidence:</strong> ${(item.confidence * 100).toFixed(1)}%</div>
            </div>
        </div>
    `).join('');
}

function switchHistoryTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected tab
    if (tab === 'crop') {
        document.getElementById('crop-history').classList.add('active');
        document.getElementById('crop-history').style.display = 'block';
        document.querySelector('[onclick="switchHistoryTab(\'crop\')"]').classList.add('active');
    } else {
        document.getElementById('disease-history').classList.add('active');
        document.getElementById('disease-history').style.display = 'block';
        document.querySelector('[onclick="switchHistoryTab(\'disease\')"]').classList.add('active');
    }
}

// ============ PROFILE ============

async function loadProfileData() {
    try {
        const response = await apiCall('/profile', 'GET');
        
        if (response.status === 'success') {
            const user = response.user;
            document.getElementById('profile-first-name').value = user.first_name || '';
            document.getElementById('profile-last-name').value = user.last_name || '';
            document.getElementById('profile-email').value = user.email || '';
            document.getElementById('profile-phone').value = user.phone || '';
            document.getElementById('profile-location').value = user.location || '';
            document.getElementById('profile-crop-type').value = user.crop_type || '';
            document.getElementById('profile-field-area').value = user.field_area || '';
        }
    } catch (error) {
        showToast('Failed to load profile', 'error');
    }
}

async function updateProfile() {
    const data = {
        first_name: document.getElementById('profile-first-name').value,
        last_name: document.getElementById('profile-last-name').value,
        phone: document.getElementById('profile-phone').value,
        location: document.getElementById('profile-location').value,
        crop_type: document.getElementById('profile-crop-type').value,
        field_area: document.getElementById('profile-field-area').value
    };
    
    showLoading(true);
    
    try {
        const response = await apiCall('/profile', 'PUT', data);
        
        if (response.status === 'success') {
            currentUser = response.user;
            safeLocalStorage.setItem('user', JSON.stringify(currentUser));
            showToast('Profile updated successfully!', 'success');
        }
    } catch (error) {
        showToast('Failed to update profile', 'error');
    } finally {
        showLoading(false);
    }
}

// ============ UTILITY FUNCTIONS ============

async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const responseData = await response.json();
        
        // Always return the response data, let the caller handle status codes
        return responseData;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

function formatDate(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

function setupEventListeners() {
    // Click outside dropdown to close
    document.addEventListener('click', function(event) {
        const userMenu = document.querySelector('.user-menu');
        const notificationPanel = document.getElementById('notification-panel');
        const userDropdown = document.getElementById('user-dropdown');
        
        // Only manipulate elements if they exist
        if (userDropdown) {
            if (!userMenu?.contains(event.target)) {
                userDropdown.classList.remove('active');
            }
        }
        
        if (notificationPanel) {
            if (!event.target.closest('.notification-btn') && !notificationPanel.contains(event.target)) {
                notificationPanel.classList.remove('open');
            }
        }
    });
}

function setupLoginKeyHandlers() {
    // Add Enter key support for login
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    
    if (loginUsername && loginPassword) {
        [loginUsername, loginPassword].forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                }
            });
        });
    }
    
    // Add Enter key support for registration
    const regInputs = [
        'register-username', 'register-email', 'register-password',
        'register-password-confirm', 'register-first-name', 'register-last-name'
    ];
    
    regInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRegister();
                }
            });
        }
    });
}

// ==================== NEW FEATURES ====================

// Store crop data globally for filtering
let allCropsData = {};
let filteredCrops = {};

// Load Crop Database
async function loadCropDatabase() {
    const container = document.getElementById('crop-db-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 1rem; color: #666;">Loading crop database...</p></div>';
    
    try {
        const response = await apiCall('/crop-database', 'GET');
        
        if (response && response.status === 'success' && response.crops) {
            allCropsData = response.crops;
            filteredCrops = response.crops;
            displayCropDatabase(filteredCrops);
        } else {
            container.innerHTML = '<div style="text-align: center; padding: 3rem; background: #fff3e0; border-radius: 10px;"><i class="fas fa-database" style="font-size: 3rem; color: #ff9800;"></i><h3 style="color: #f57c00; margin: 1rem 0;">No Data Available</h3><p style="color: #666;">Unable to load crop database. Please try again later.</p></div>';
        }
    } catch (error) {
        console.error('Error loading crop database:', error);
        container.innerHTML = '<div style="text-align: center; padding: 3rem; background: #ffebee; border-radius: 10px;"><i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c;"></i><h3 style="color: #c62828; margin: 1rem 0;">Error Loading Data</h3><p style="color: #666;">Failed to load crop database. Please check your connection and try again.</p><button class="btn btn-primary" style="margin-top: 1rem;" onclick="loadCropDatabase()"><i class="fas fa-sync"></i> Retry</button></div>';
    }
}

// Display Crop Database
function displayCropDatabase(crops) {
    const container = document.getElementById('crop-db-container');
    let html = '';
    
    if (Object.keys(crops).length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No crops found matching your filter</p>';
        return;
    }
    
    for (const [cropName, details] of Object.entries(crops)) {
        html += `
            <div class="crop-card">
                <h3>🌾 ${cropName}</h3>
                <div class="crop-info">
                    <div class="crop-info-item">
                        <span class="crop-info-label">Season:</span>
                        <span class="crop-info-value">${details.season}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Temperature:</span>
                        <span class="crop-info-value">${details.ideal_temp}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Water Needed:</span>
                        <span class="crop-info-value">${details.water_needed}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Soil Type:</span>
                        <span class="crop-info-value">${details.soil_type}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Soil pH:</span>
                        <span class="crop-info-value">${details.ph_level}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Duration:</span>
                        <span class="crop-info-value">${details.duration}</span>
                    </div>
                    <div class="crop-info-item">
                        <span class="crop-info-label">Expected Yield:</span>
                        <span class="crop-info-value">${details.yield}</span>
                    </div>
                    ${details.spacing ? `
                    <div class="crop-info-item">
                        <span class="crop-info-label">Spacing:</span>
                        <span class="crop-info-value">${details.spacing}</span>
                    </div>
                    ` : ''}
                    ${details.benefits ? `
                    <div class="crop-info-item">
                        <span class="crop-info-label">Benefits:</span>
                        <span class="crop-info-value">${details.benefits}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Filter Crops by Season
function filterCropsBySeason(season) {
    if (season === '') {
        filteredCrops = allCropsData;
    } else {
        filteredCrops = {};
        for (const [cropName, details] of Object.entries(allCropsData)) {
            if (details.season === season || details.season.includes(season)) {
                filteredCrops[cropName] = details;
            }
        }
    }
    displayCropDatabase(filteredCrops);
}

// Get Crop Recommendations
async function getCropRecommendations() {
    const latitude = document.getElementById('rec-latitude').value;
    const longitude = document.getElementById('rec-longitude').value;
    
    if (!latitude || !longitude) {
        showToast('⚠️ Please enter latitude and longitude', 'warning');
        return;
    }
    
    const resultDiv = document.getElementById('recommendations-result');
    resultDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 1rem; color: #666;">Analyzing location...</p></div>';
    
    try {
        const response = await apiCall('/crop-recommendations', 'POST', {
            latitude: latitude,
            longitude: longitude
        });
        
        if (response && response.status === 'success') {
            const resultDiv = document.getElementById('recommendations-result');
            const crops = response.suitable_crops;
            
            let html = `
                <div class="result-card">
                    <h3>✅ Recommended Crops for Your Location</h3>
                    <div style="background: #f0f7ff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <p style="margin: 0; color: #666;"><strong>📍 Coordinates:</strong> ${latitude}, ${longitude}</p>
                        <p style="margin: 0.5rem 0 0 0; color: #333;">${response.recommendation}</p>
                    </div>
                    <h4 style="color: var(--primary); margin-bottom: 1rem;">Best Crops for Your Region:</h4>
                    <div class="suitable-crops">
                        ${crops.map(crop => `
                            <span class="crop-badge">${crop}</span>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top: 2rem; background: #fff3e0; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ff9800;">
                        <h4 style="color: #ff9800; margin-top: 0;">💡 Next Steps:</h4>
                        <ul style="margin: 0; padding-left: 1.5rem; color: #333;">
                            <li>Check maintenance guides for selected crops</li>
                            <li>Test your soil pH and nutrient levels</li>
                            <li>Review weather patterns for your region</li>
                            <li>Plan irrigation schedule based on water needs</li>
                        </ul>
                    </div>
                </div>
            `;
            
            resultDiv.innerHTML = html;
        }
    } catch (error) {
        console.error('Error getting crop recommendations:', error);
        const resultDiv = document.getElementById('recommendations-result');
        resultDiv.innerHTML = '<div style="text-align: center; padding: 3rem; background: #ffebee; border-radius: 10px;"><i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c;"></i><h3 style="color: #c62828; margin: 1rem 0;">Error Loading Recommendations</h3><p style="color: #666;">Unable to get crop recommendations. Please check your connection.</p><button class="btn btn-primary" style="margin-top: 1rem;" onclick="getCropRecommendations()"><i class="fas fa-sync"></i> Retry</button></div>';
        showToast('❌ Error getting recommendations', 'error');
    }
}

// Get Maintenance Guide
async function getMaintenanceGuide() {
    const cropName = document.getElementById('crop-select').value;
    const resultDiv = document.getElementById('maintenance-result');
    
    if (!cropName) {
        resultDiv.innerHTML = '<div style="text-align: center; padding: 3rem; background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-radius: 10px;"><i class="fas fa-seedling" style="font-size: 3rem; color: #1976d2;"></i><h3 style="color: #1976d2; margin: 1rem 0;">Select a Crop</h3><p style="color: #666;">Choose a crop from the dropdown to view its complete maintenance guide</p></div>';
        return;
    }
    
    resultDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 1rem; color: #666;">Loading maintenance guide...</p></div>';
    
    try {
        const response = await apiCall(`/maintenance-guide/${cropName}`, 'GET');
        
        if (response.status === 'success') {
            const guide = response.guide;
            const resultDiv = document.getElementById('maintenance-result');
            
            let html = `
                <div class="result-card">
                    <h3 style="color: var(--primary); margin-bottom: 1.5rem;">🌾 ${guide.name} - Complete Maintenance Guide</h3>
                    
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                        <h4 style="color: white; margin-top: 0;">📋 Quick Facts</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                            <div><strong>Harvest Time:</strong> ${guide.harvest_time}</div>
                            <div><strong>Fertilizer:</strong> ${guide.fertilizer}</div>
                            <div colspan="2"><strong>Irrigation:</strong> ${guide.irrigation}</div>
                        </div>
                    </div>
                    
                    <h4 style="color: var(--secondary); margin: 2rem 0 1rem 0;">🌱 Growing Stages</h4>
            `;
            
            guide.stages.forEach((stage, index) => {
                html += `
                    <div class="stage-card">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="background: var(--primary); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                                ${index + 1}
                            </div>
                            <div>
                                <h4 style="margin: 0; color: var(--secondary);">${stage.stage}</h4>
                                <p style="margin: 0.5rem 0 0 0; color: #666;">${stage.care}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    <h4 style="color: var(--secondary); margin: 2rem 0 1rem 0;">🐛 Pests & Diseases</h4>
                    <div style="background: #fff3e0; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ff9800;">
                        <ul class="pest-list">
                            ${guide.pests_diseases.map(pest => `
                                <li style="padding: 0.5rem 0; padding-left: 1.5rem; position: relative;">
                                    <span style="position: absolute; left: 0; color: #ff9800;">⚠️</span>
                                    ${pest}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            `;
            
            resultDiv.innerHTML = html;
        }
    } catch (error) {
        console.error('Error getting maintenance guide:', error);
        const resultDiv = document.getElementById('maintenance-result');
        resultDiv.innerHTML = '<div style="text-align: center; padding: 3rem; background: #ffebee; border-radius: 10px;"><i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c;"></i><h3 style="color: #c62828; margin: 1rem 0;">Error Loading Guide</h3><p style="color: #666;">Unable to load maintenance guide. Please try again.</p><button class="btn btn-primary" style="margin-top: 1rem;" onclick="getMaintenanceGuide()"><i class="fas fa-sync"></i> Retry</button></div>';
        showToast('❌ Error loading maintenance guide', 'error');
    }
}

// Update pH Display
function updatePhDisplay() {
    const rangeValue = document.getElementById('ph-range').value;
    document.getElementById('ph-value').value = rangeValue;
}

// Update pH Range (when typing in input)
function updatePhRange() {
    const inputValue = document.getElementById('ph-value').value;
    document.getElementById('ph-range').value = inputValue;
}

// Analyze Soil Health
async function analyzeSoilHealth() {
    const phValue = document.getElementById('ph-value').value;
    
    if (!phValue || phValue < 0 || phValue > 14) {
        showToast('⚠️ Please enter a valid pH value (0-14)', 'warning');
        return;
    }
    
    const resultDiv = document.getElementById('soil-result');
    resultDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 1rem; color: #666;">Analyzing soil pH...</p></div>';
    
    try {
        const response = await apiCall('/soil-health', 'POST', {
            ph_value: phValue
        });
        
        if (response.status === 'success') {
            const recommendations = response.recommendations;
            const resultDiv = document.getElementById('soil-result');
            
            let statusColor = '#e74c3c';
            if (recommendations.ph_status.includes('Neutral') || recommendations.ph_status.includes('Ideal')) {
                statusColor = '#81c784';
            } else if (recommendations.ph_status.includes('Slightly')) {
                statusColor = '#ffc107';
            }
            
            let html = `
                <div class="result-card">
                    <h3>🧪 Soil Analysis Results</h3>
                    
                    <div style="background: linear-gradient(135deg, ${statusColor}, ${statusColor}dd); color: white; padding: 2rem; border-radius: 10px; margin-bottom: 2rem; text-align: center;">
                        <p style="font-size: 0.9rem; margin: 0; opacity: 0.9;">Soil pH Status</p>
                        <h2 style="color: white; font-size: 2.5rem; margin: 0.5rem 0;">${recommendations.ph_status}</h2>
                        <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">pH Value: <strong>${phValue}</strong></p>
                    </div>
                    
                    <h4 style="color: var(--secondary); margin: 1.5rem 0 1rem 0;">📋 Recommendations:</h4>
                    <div style="background: #f5f5f5; padding: 1.5rem; border-radius: 8px;">
                        <ul class="action-list">
                            ${recommendations.actions.map(action => `
                                <li style="padding: 0.75rem 0; padding-left: 1.5rem; position: relative; color: #333;">
                                    <span style="position: absolute; left: 0; color: var(--success);">✓</span>
                                    ${action}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    
                    <h4 style="color: var(--secondary); margin: 1.5rem 0 1rem 0;">🌾 Suitable Crops:</h4>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        ${recommendations.suitable_crops.map(crop => `
                            <span class="crop-badge">${crop}</span>
                        `).join('')}
                    </div>

                    <div style="margin-top: 2rem; background: linear-gradient(135deg, #e8f5e9, #c8e6c9); padding: 1.5rem; border-radius: 8px; border-left: 4px solid #81c784;">
                        <h4 style="color: #2e7d32; margin-top: 0;">💚 Soil Health Benefits</h4>
                        <ul style="margin: 0; padding-left: 1.5rem; color: #2e7d32;">
                            <li>Better water retention and drainage</li>
                            <li>Increased nutrient availability to crops</li>
                            <li>Improved microbial activity</li>
                            <li>Enhanced nutrient cycling</li>
                        </ul>
                    </div>
                </div>
            `;
            
            resultDiv.innerHTML = html;
        }
    } catch (error) {
        console.error('Error analyzing soil health:', error);
        const resultDiv = document.getElementById('soil-result');
        resultDiv.innerHTML = '<div style="text-align: center; padding: 3rem; background: #ffebee; border-radius: 10px;"><i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c;"></i><h3 style="color: #c62828; margin: 1rem 0;">Analysis Error</h3><p style="color: #666;">Unable to analyze soil health. Please check your connection.</p><button class="btn btn-primary" style="margin-top: 1rem;" onclick="analyzeSoilHealth()"><i class="fas fa-sync"></i> Retry</button></div>';
        showToast('❌ Error analyzing soil health', 'error');
    }
}

// ============ PAGE INITIALIZATION ============

function initializeRecommendationsPage() {
    console.log('🌾 Initializing Recommendations Page');
    // Reset result area to default state
    const resultDiv = document.getElementById('recommendations-result');
    if (resultDiv && !resultDiv.querySelector('.result-card')) {
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem; background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-radius: 10px;">
                <i class="fas fa-lightbulb" style="font-size: 3rem; color: #1976d2;"></i>
                <h3 style="color: #1976d2; margin: 1rem 0;">Get Smart Recommendations</h3>
                <p style="color: #666;">Enter your farm coordinates on the left to receive personalized crop recommendations based on your location and climate conditions.</p>
            </div>
        `;
    }
}

function initializeMaintenancePage() {
    console.log('🔧 Initializing Maintenance Page');
    // Reset crop selection
    const cropSelect = document.getElementById('crop-select');
    if (cropSelect) {
        cropSelect.value = '';
    }
    // Reset result area to default state
    const resultDiv = document.getElementById('maintenance-result');
    if (resultDiv && !resultDiv.querySelector('.result-card')) {
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem; background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-radius: 10px;">
                <i class="fas fa-seedling" style="font-size: 3rem; color: #1976d2;"></i>
                <h3 style="color: #1976d2; margin: 1rem 0;">Select a Crop</h3>
                <p style="color: #666;">Choose a crop from the dropdown menu on the left to view its complete maintenance guide with detailed care instructions, fertilizer schedules, and pest management tips.</p>
            </div>
        `;
    }
}

function initializeSoilHealthPage() {
    console.log('🌱 Initializing Soil Health Page');
    // Reset pH values
    const phRange = document.getElementById('ph-range');
    const phValue = document.getElementById('ph-value');
    if (phRange && phValue) {
        phRange.value = 7;
        phValue.value = 7;
    }
    // Reset result area to default state
    const resultDiv = document.getElementById('soil-result');
    if (resultDiv && !resultDiv.querySelector('.result-card')) {
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem; background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius: 10px;">
                <i class="fas fa-flask-vial" style="font-size: 3rem; color: #2e7d32;"></i>
                <h3 style="color: #2e7d32; margin: 1rem 0;">Analyze Your Soil</h3>
                <p style="color: #666;">Enter your soil pH value on the left to receive a comprehensive analysis with recommendations for soil improvement and suitable crops.</p>
            </div>
        `;
    }
}

// Get Weather by Location
async function getWeatherByLocation() {
    const latitude = document.getElementById('location-latitude').value;
    const longitude = document.getElementById('location-longitude').value;
    const locationName = document.getElementById('location-name').value;
    
    if (!latitude || !longitude) {
        showToast('Please enter latitude and longitude', 'warning');
        return;
    }
    
    try {
        const response = await apiCall(`/weather?lat=${latitude}&lon=${longitude}`, 'GET');
        
        if (response.status === 'success') {
            const weather = response;
            const resultDiv = document.getElementById('weather-location-result');
            
            let html = `
                <div class="result-card">
                    <h3>🌤️ Weather Information</h3>
                    ${locationName ? `<p><strong>Location:</strong> ${locationName}</p>` : ''}
                    <p><strong>Coordinates:</strong> ${latitude}, ${longitude}</p>
                    
                    <h4>Current Weather:</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="background: #e8f5e9; padding: 1rem; border-radius: 8px;">
                            <p style="color: #666; margin: 0;">Temperature</p>
                            <p style="color: var(--primary); font-size: 1.5rem; font-weight: bold; margin: 0;">${weather.current?.temperature || 'N/A'}°C</p>
                        </div>
                        <div style="background: #e3f2fd; padding: 1rem; border-radius: 8px;">
                            <p style="color: #666; margin: 0;">Humidity</p>
                            <p style="color: var(--secondary); font-size: 1.5rem; font-weight: bold; margin: 0;">${weather.current?.humidity || 'N/A'}%</p>
                        </div>
                        <div style="background: #f3e5f5; padding: 1rem; border-radius: 8px;">
                            <p style="color: #666; margin: 0;">Precipitation</p>
                            <p style="color: #9c27b0; font-size: 1.5rem; font-weight: bold; margin: 0;">${weather.current?.precipitation || 'N/A'}mm</p>
                        </div>
                    </div>
                    
                    <h4>Daily Forecast:</h4>
                    <div style="display: grid; gap: 0.5rem;">
                        <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                            <div>
                                <p style="color: #666; margin: 0; font-size: 0.9rem;">Max Temperature</p>
                                <p style="color: var(--primary); font-size: 1.2rem; font-weight: bold; margin: 0;">${weather.daily?.max_temp || 'N/A'}°C</p>
                            </div>
                            <div>
                                <p style="color: #666; margin: 0; font-size: 0.9rem;">Min Temperature</p>
                                <p style="color: var(--primary); font-size: 1.2rem; font-weight: bold; margin: 0;">${weather.daily?.min_temp || 'N/A'}°C</p>
                            </div>
                            <div>
                                <p style="color: #666; margin: 0; font-size: 0.9rem;">Precipitation</p>
                                <p style="color: var(--secondary); font-size: 1.2rem; font-weight: bold; margin: 0;">${weather.daily?.precipitation || 'N/A'}mm</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            resultDiv.innerHTML = html;
        }
    } catch (error) {
        console.error('Error getting weather by location:', error);
        showToast('❌ Error getting weather information', 'error');
    }
}

// ============ GOOGLE MAPS INTEGRATION ============

function initializeWeatherMap() {
    console.log('🗺️ Initializing Google Maps...');
    
    // Check if Google Maps API is loaded
    if (typeof google === 'undefined' || !google.maps) {
        console.warn('⚠️ Google Maps API not loaded');
        const mapElement = document.getElementById('weather-map');
        if (mapElement) {
            mapElement.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f5f5f5; border-radius: 8px; flex-direction: column; padding: 2rem; text-align: center;">
                    <i class="fas fa-map-marked-alt" style="font-size: 3rem; color: #999; margin-bottom: 1rem;"></i>
                    <h3 style="color: #666; margin: 0;">Map Currently Unavailable</h3>
                    <p style="color: #999; margin-top: 0.5rem;">Please use manual coordinates entry below</p>
                </div>
            `;
        }
        return;
    }
    
    try {
        // Default location (India center)
        const defaultLocation = { lat: 20.5937, lng: 78.9629 };
        
        const mapElement = document.getElementById('weather-map');
        if (!mapElement) {
            console.error('❌ Map element not found');
            return;
        }
        
        // Initialize map
        weatherMap = new google.maps.Map(mapElement, {
            center: defaultLocation,
            zoom: 5,
            mapTypeId: 'hybrid',
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true
        });
        
        console.log('✅ Map created successfully');
        
        // Add click listener to map
        weatherMap.addListener('click', function(event) {
            const lat = event.latLng.lat();
            const lng = event.latLng.lng();
            
            // Update marker
            if (weatherMapMarker) {
                weatherMapMarker.setPosition(event.latLng);
            } else {
                weatherMapMarker = new google.maps.Marker({
                    position: event.latLng,
                    map: weatherMap,
                    title: 'Selected Location',
                    animation: google.maps.Animation.DROP
                });
            }
            
            // Update form fields
            document.getElementById('location-latitude').value = lat.toFixed(4);
            document.getElementById('location-longitude').value = lng.toFixed(4);
            
            // Get location name from coordinates
            getLocationName(lat, lng);
            
            // Show toast
            showToast(`📍 Location selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success');
        });
        
        // Use Autocomplete instead of deprecated SearchBox
        const searchInput = document.getElementById('map-search-input');
        if (searchInput && google.maps.places) {
            try {
                const autocomplete = new google.maps.places.Autocomplete(searchInput, {
                    fields: ['geometry', 'name', 'formatted_address']
                });
                
                autocomplete.bindTo('bounds', weatherMap);
                
                autocomplete.addListener('place_changed', function() {
                    const place = autocomplete.getPlace();
                    
                    if (!place.geometry || !place.geometry.location) {
                        console.error('Place has no geometry');
                        showToast('⚠️ Location not found. Please try another search.', 'warning');
                        return;
                    }
                    
                    // Clear previous marker
                    if (weatherMapMarker) {
                        weatherMapMarker.setMap(null);
                    }
                    
                    // Create marker for selected place
                    weatherMapMarker = new google.maps.Marker({
                        position: place.geometry.location,
                        map: weatherMap,
                        title: place.name || 'Selected Location',
                        animation: google.maps.Animation.DROP
                    });
                    
                    // Update form fields
                    const lat = place.geometry.location.lat();
                    const lng = place.geometry.location.lng();
                    document.getElementById('location-latitude').value = lat.toFixed(4);
                    document.getElementById('location-longitude').value = lng.toFixed(4);
                    document.getElementById('location-name').value = place.name || place.formatted_address || '';
                    
                    // Center map on selected place
                    weatherMap.setCenter(place.geometry.location);
                    weatherMap.setZoom(12);
                    
                    showToast(`✅ Selected: ${place.name || 'Location'}`, 'success');
                });
                
                console.log('✅ Autocomplete initialized');
            } catch (autoErr) {
                console.warn('⚠️ Autocomplete initialization failed:', autoErr);
            }
        }
        
        console.log('✅ Google Maps initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing map:', error);
        const mapElement = document.getElementById('weather-map');
        if (mapElement) {
            mapElement.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #ffebee; border-radius: 8px; flex-direction: column; padding: 2rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                    <h3 style="color: #c62828; margin: 0;">Map Initialization Error</h3>
                    <p style="color: #666; margin-top: 0.5rem;">Please use manual coordinates entry below</p>
                </div>
            `;
        }
    }
}

// Get location name from coordinates using reverse geocoding
async function getLocationName(lat, lng) {
    if (typeof google === 'undefined' || !google.maps) return;
    
    const geocoder = new google.maps.Geocoder();
    const latlng = { lat: lat, lng: lng };
    
    geocoder.geocode({ location: latlng }, function(results, status) {
        if (status === 'OK' && results[0]) {
            document.getElementById('location-name').value = results[0].formatted_address;
        }
    });
}

// Set location from quick buttons
function setLocation(lat, lng, name) {
    document.getElementById('location-latitude').value = lat;
    document.getElementById('location-longitude').value = lng;
    document.getElementById('location-name').value = name;
    
    // Update map if initialized
    if (weatherMap) {
        const location = { lat: lat, lng: lng };
        weatherMap.setCenter(location);
        weatherMap.setZoom(10);
        
        // Update or create marker
        if (weatherMapMarker) {
            weatherMapMarker.setPosition(location);
        } else {
            weatherMapMarker = new google.maps.Marker({
                position: location,
                map: weatherMap,
                title: name
            });
        }
    }
    
    showToast(`Location set to ${name}`, 'success');
}

// Prevent form submission
document.addEventListener('submit', function(e) {
    if (e.target.closest('.auth-form') || e.target.closest('.form-section')) {
        e.preventDefault();
    }
});

// Test API connection
console.log('📡 API Endpoint:', API_BASE_URL);
    