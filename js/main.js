/**
 * Bari Plux - User Dropdown JavaScript
 * Only handles user dropdown functionality
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    
    // Get the login button and dropdown
    const loginBtn = document.getElementById('loginBtnHeader');
    const dropdown = document.getElementById('userDropdown');
    
    // Add click handler directly to the login button
    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const container = document.querySelector('.user-menu-container');
        
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // Logout button handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Logout from Bari Plux?')) {
                localStorage.removeItem('bariplux_user');
                localStorage.removeItem('bariplux_user_new');
                localStorage.removeItem('bariplux_login_token');
                location.reload();
            }
        });
    }
    
    // Login Page button handler
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    if (goToLoginBtn) {
        goToLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'login.html';
        });
    }
    
    // Account Info button handler
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const user = JSON.parse(localStorage.getItem('bariplux_user') || '{}');
            alert('Account Info:\nName: ' + (user.name || 'N/A') + '\nEmail: ' + (user.email || 'N/A'));
        });
    }
    
    // Check for app sync periodically
    setInterval(() => {
        const appUser = localStorage.getItem('bariplux_user_new');
        if (appUser) {
            localStorage.setItem('bariplux_user', appUser);
            localStorage.removeItem('bariplux_user_new');
        }
    }, 5000);
    
    console.log('Bari Plux User Dropdown initialized');
});
