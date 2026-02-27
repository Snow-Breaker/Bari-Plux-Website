/**
 * Bari Plux - User Dropdown JavaScript
 * Only handles user dropdown functionality
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    
    // ===== USER DROPDOWN FUNCTIONALITY =====
    
    // Toggle User Dropdown
    window.toggleUserDropdown = function() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    };
    
    // Initialize user dropdown buttons if they exist
    const logoutBtn = document.getElementById('logoutBtn');
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('bariplux_user');
                localStorage.removeItem('bariplux_user_new');
                window.location.href = 'login.html';
            }
        });
    }
    
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const user = JSON.parse(localStorage.getItem('bariplux_user') || '{}');
            alert('Account Info:\nName: ' + (user.name || 'N/A') + '\nEmail: ' + (user.email || 'N/A'));
        });
    }
    
    if (goToLoginBtn) {
        goToLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'login.html';
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('userDropdown');
        const container = document.querySelector('.user-menu-container');
        
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // Login Status Check
    const storedUser = localStorage.getItem('bariplux_user');
    const loginBtn = document.getElementById('loginBtnHeader');
    
    if (loginBtn) {
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                loginBtn.classList.add('logged-in');
                loginBtn.innerHTML = '<i class="fas fa-user-circle"></i><span>' + user.name + '</span>';
                loginBtn.title = 'Click for options';
                
                // Update dropdown user info
                const userName = document.getElementById('userName');
                const userEmail = document.getElementById('userEmail');
                if (userName) userName.textContent = user.name || 'User';
                if (userEmail) userEmail.textContent = user.email || '';
                
            } catch(e) {
                localStorage.removeItem('bariplux_user');
            }
        }
    }
    
    // ===== END USER DROPDOWN =====

    // Check for app sync periodically
    setInterval(() => {
        const appUser = localStorage.getItem('bariplux_user_new');
        if (appUser) {
            localStorage.setItem('bariplux_user', appUser);
            localStorage.removeItem('bariplux_user_new');
            const user = JSON.parse(appUser);
            const loginBtn = document.getElementById('loginBtnHeader');
            if (loginBtn) {
                loginBtn.classList.add('logged-in');
                loginBtn.innerHTML = '<i class="fas fa-user-circle"></i><span>' + user.name + '</span>';
            }
        }
    }, 5000);
    
    console.log('Bari Plux User Dropdown initialized');
});
