// Simple authentication system for tools directory
// Username: admin, Password: admin

const AUTH_CONFIG = {
  username: 'admin',
  password: 'admin',
  sessionKey: 'tools_authenticated'
};

// Check if user is authenticated
function isAuthenticated() {
  return sessionStorage.getItem(AUTH_CONFIG.sessionKey) === 'true';
}

// Authenticate user
function authenticate(username, password) {
  if (username === AUTH_CONFIG.username && password === AUTH_CONFIG.password) {
    sessionStorage.setItem(AUTH_CONFIG.sessionKey, 'true');
    return true;
  }
  return false;
}

// Logout user
function logout() {
  sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
  window.location.href = '/tools/login.html';
}

// Protect page - redirect to login if not authenticated
function protectPage() {
  if (!isAuthenticated()) {
    window.location.href = '/tools/login.html';
  }
}

// Redirect to index if already authenticated (for login page)
function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = '/tools/index.html';
  }
}
