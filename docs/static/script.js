// API Configuration
// Use deployed Streamlit backend for production
const API_BASE_URL = 'https://satelite-crop-health-izfc5jvxvglaftex9sxnme.streamlit.app';

// If you want to support local development, you can add:
// const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://satelite-crop-health-izfc5jvxvglaftex9sxnme.streamlit.app';

// Global State
let currentUser = null;
let allNotifications = [];
let weatherMap = null;
let weatherMapMarker = null;
let leafletMap = null;
let leafletMarker = null;
let googleMapsLoadPromise = null;
const GOOGLE_MAPS_API_KEY = (document.querySelector('meta[name="google-maps-api-key"]')?.content || '').trim();

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
    window.addEventListener('resize', refreshWeatherMapViewport);
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
    updateUserDisplayLabels();
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
    // ...existing code...
}