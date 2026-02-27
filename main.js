/**
 * Bari Plux - Consolidated JavaScript
 * Common functions for all pages
 */

// Mobile device detection and redirect
(function() {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
        window.innerWidth <= 768 &&
        !window.location.href.includes('mobile') &&
        !window.location.href.includes('mobile.html')) {
        window.location.href = 'mobile.html';
    }
})();

// Security: Disable right-click and keyboard shortcuts
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (e.key === 'F12' || (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c'))) {
        e.preventDefault();
    }
});
document.ondragstart = function() { return false; };

// Theme Toggle
function setupThemeToggle() {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

// Scroll Top Button
function setupScrollTop() {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    });
    
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Ripple Effect
function setupRippleEffect() {
    const cards = document.querySelectorAll('.download-card, .pubg-card, .video-card, .plux-article, .platform-card, .news-item, .update-card, .tool-card, .version-card, .contact-item-horizontal');
    
    cards.forEach(card => {
        card.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.cssText = `
                position: absolute;
                background: rgba(255,255,255,0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
            
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// Particles.js Initialization
function initParticles() {
    const particlesContainer = document.getElementById('particles-js');
    if (!particlesContainer || typeof particlesJS === 'undefined') return;
    
    particlesJS('particles-js', {
        particles: {
            number: { value: 60, density: { enable: true, value_area: 800 } },
            color: { value: ['#6C63FF', '#00BFA6'] },
            shape: { type: 'circle' },
            opacity: { value: 0.5, random: true },
            size: { value: 3, random: true },
            move: { enable: true, speed: 2, direction: 'none', random: true, out_mode: 'out' }
        },
        interactivity: {
            events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' } },
            modes: { grab: { distance: 140, links: { opacity: 0.5 } }, push: { quantity: 4 } }
        }
    });
}

// Search Functionality
function setupSearch() {
    const searchInput = document.querySelector('.search-input');
    const searchContainer = document.querySelector('.search-container');
    
    if (!searchInput || !searchContainer) return;
    
    const searchResults = document.createElement('div');
    searchResults.className = 'search-results-dropdown';
    searchContainer.appendChild(searchResults);
    
    const searchData = [
        { title: 'PUBG Mobile', desc: 'Download latest version', url: 'pubgdown.html' },
        { title: 'GameLoop', desc: 'Android emulator for PC', url: 'gameloopdown.html' },
        { title: 'Windows X-Lite', desc: 'Optimized Windows', url: 'windowsxlitedown.html' },
        { title: 'Optimization Tools', desc: 'Performance tools', url: 'optimizationtools.html' },
        { title: 'Maps Guide', desc: 'All PUBG maps', url: 'mapspubg.html' },
        { title: 'Weapon Stats', desc: 'Tier list & stats', url: 'weaponorg.html' },
        { title: 'Events', desc: 'Latest events', url: 'pubgevents.html' },
        { title: 'News', desc: 'Latest news', url: 'news.html' },
        { title: 'Updates', desc: 'Version history', url: 'updates.html' }
    ];
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }
        
        const results = searchData.filter(item => 
            item.title.toLowerCase().includes(query) || 
            item.desc.toLowerCase().includes(query)
        );
        
        if (results.length > 0) {
            searchResults.innerHTML = results.map(item => `
                <div class="search-result-item" onclick="window.location.href='${item.url}'">
                    <div class="search-result-title">${item.title}</div>
                    <div class="search-result-desc">${item.desc}</div>
                </div>
            `).join('');
            searchResults.classList.add('show');
        } else {
            searchResults.classList.remove('show');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
}

// Video Modal Functions
function openVideo(videoId) {
    const modal = document.getElementById('video-modal');
    const player = document.getElementById('video-player');
    if (!modal || !player) return;
    
    player.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVideo() {
    const modal = document.getElementById('video-modal');
    const player = document.getElementById('video-player');
    if (!modal || !player) return;
    
    modal.classList.remove('active');
    player.innerHTML = '';
    document.body.style.overflow = '';
}

// Chat Bot Initialization
function initializeChatBot() {
    const chatWidget = document.querySelector('.ai-chat-widget.professional');
    const chatToggle = document.querySelector('.ai-chat-minimized');
    const chatClose = document.querySelector('.chat-btn.close');
    const chatMinimize = document.querySelector('.chat-btn.minimize');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const charCount = document.querySelector('.char-count');
    
    if (!chatWidget) return;
    
    const aiResponses = {
        greeting: { message: "👋 Hello! I'm Bari Plux AI Assistant!\n\nI can help you with:\n\n🎮 PUBG Optimization\n⚡ GameLoop Setup\n🖥️ Windows Tuning\n📥 Downloads & Tools\n\nWhat would you like to know?", quickReplies: ['FPS optimization', 'GameLoop setup', 'Windows tuning'] },
        optimization: { message: "🎯 **PUBG Optimization Tips:**\n\n1. Enable VT in BIOS\n2. Allocate 4GB+ RAM to emulator\n3. Use high performance power plan\n4. Close background apps\n5. Update graphics drivers", quickReplies: ['VT guide', 'More tips', 'Back to main'] },
        gameloop: { message: "🎮 **GameLoop Best Settings:**\n\n• CPU: 2-4 cores\n• RAM: 4GB+ (8GB recommended)\n• Graphics: DirectX\n• Engine: 3D\n\n**Chinese version** performs better!", quickReplies: ['Download', 'VT help', 'Settings guide'] },
        fps: { message: "🚀 **Boost Your FPS:**\n\n1. Enable VT (Virtualization)\n2. Allocate more RAM (4GB+)\n3. Set CPU cores to 4\n4. Use balanced power plan\n5. Update GPU drivers", quickReplies: ['VT guide', 'More help', 'Back to main'] },
        windows: { message: "🖥️ **Windows Optimization:**\n\n1. Disable unnecessary startup items\n2. Update Windows & drivers\n3. Disable visual effects\n4. Use high performance power plan\n5. Clear temp files regularly", quickReplies: ['Power plan', 'Drivers', 'Back to main'] },
        downloads: { message: "📥 **Available Downloads:**\n\n• PUBG Mobile\n• GameLoop Emulator\n• Windows X-Lite\n• Optimization Tools\n\nVisit our Downloads section!", quickReplies: ['PUBG Mobile', 'GameLoop', 'Tools'] },
        vt: { message: "🔧 **Enable VT:**\n\n1. Restart PC, enter BIOS (Del/F2)\n2. Find 'Intel VT-x' or 'AMD-V'\n3. Enable and save\n4. Restart\n\n**Important:** Gives 30-50% better performance!", quickReplies: ['GameLoop download', 'More help', 'Back to main'] },
        lag: { message: "🐌 **Fix Lag:**\n\n1. Enable VT in BIOS\n2. Allocate more RAM (4GB+)\n3. Close background apps\n4. Use high performance power plan\n5. Switch to Chinese version", quickReplies: ['VT guide', 'More tips', 'Back to main'] },
        crash: { message: "💥 **Fix Crashes:**\n\n1. Run as Administrator\n2. Update graphics drivers\n3. Enable VT\n4. Clear shader cache\n\n**Clean Reinstall:** Uninstall, delete TxGameAssistant folders, reinstall", quickReplies: ['Download GameLoop', 'VT guide', 'Driver updates'] },
        network: { message: "🌐 **Network Tips:**\n\n• Use wired connection\n• Change DNS: 1.1.1.1 or 8.8.8.8\n• Close bandwidth apps\n• Select nearest server in GameLoop", quickReplies: ['DNS setup', 'VPN tips', 'Back to main'] },
        graphics: { message: "🎨 **Best Graphics:**\n\n• Graphics: Smooth\n• FPS: 90/120\n• Style: Movie\n• Shadows: Off\n• Anti-aliasing: Off", quickReplies: ['FPS guide', 'More settings', 'Back to main'] }
    };
    
    let useRealAI = false;
    
    function getAIResponse(userMessage) {
        const msg = userMessage.toLowerCase();
        
        if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('salam') || msg.includes('درود') || msg === 'start') {
            return aiResponses.greeting;
        }
        
        const keywords = {
            'optimiz': 'optimization', 'performance': 'optimization', 'بهینه': 'optimization',
            'gameloop': 'gameloop', 'emulator': 'gameloop', 'امولاتور': 'gameloop',
            'fps': 'fps', 'فریم': 'fps', 'frame': 'fps',
            'windows': 'windows', 'ویندوز': 'windows', 'system': 'windows',
            'دانلود': 'downloads', 'download': 'downloads', 'tool': 'downloads',
            'vt': 'vt', 'virtual': 'vt',
            'lag': 'lag', 'کند': 'lag', 'لگ': 'lag',
            'crash': 'crash', 'کرش': 'crash', 'بسته': 'crash',
            'network': 'network', 'ping': 'network', 'اینترنت': 'network',
            'graphics': 'graphics', 'گرافیک': 'graphics', 'تنظیمات': 'graphics'
        };
        
        for (const [keyword, responseKey] of Object.entries(keywords)) {
            if (msg.includes(keyword) && aiResponses[responseKey]) {
                return aiResponses[responseKey];
            }
        }
        
        return { message: "🤖 Thanks for your question! I can help with:\n\n🎮 PUBG FPS & Graphics\n⚡ GameLoop Setup\n🖥️ Windows Tuning\n📥 Downloads & Tools\n\nWhat would you like to know?", quickReplies: ['FPS optimization', 'GameLoop setup', 'Windows tuning'] };
    }
    
    if (chatToggle && chatWidget) {
        chatToggle.addEventListener('click', () => {
            chatWidget.classList.toggle('active');
        });
    }
    
    if (chatClose) {
        chatClose.addEventListener('click', () => chatWidget.classList.remove('active'));
    }
    
    if (chatMinimize) {
        chatMinimize.addEventListener('click', () => chatWidget.classList.remove('active'));
    }
    
    const collapsibleSections = document.querySelectorAll('.collapsible-section');
    collapsibleSections.forEach(section => {
        const header = section.querySelector('.collapsible-header');
        if (header) {
            header.addEventListener('click', () => {
                section.classList.toggle('active');
            });
        }
    });
    
    const actionBtns = document.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const messages = {
                'optimization': 'How to optimize PUBG?',
                'gameloop': 'Best GameLoop settings?',
                'downloads': 'What to download?',
                'settings': 'Best graphics settings?',
                'fps': 'How to increase FPS?',
                'windows': 'Windows optimization tips?',
                'troubleshoot': 'Fix lag and crashes?',
                'system': 'System requirements?'
            };
            const msg = messages[action] || 'Help me';
            if (chatInput) chatInput.value = msg;
            sendMessage();
        });
    });
    
    const suggestionBtns = document.querySelectorAll('.suggestion-btn');
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (chatInput) chatInput.value = btn.dataset.question;
            sendMessage();
        });
    });
    
    if (chatInput && charCount) {
        chatInput.addEventListener('input', () => {
            charCount.textContent = `${chatInput.value.length}/500`;
        });
    }
    
    function sendMessage() {
        const message = chatInput ? chatInput.value.trim() : '';
        if (!message) return;
        
        addUserMessage(message);
        if (chatInput) chatInput.value = '';
        
        showTypingIndicator();
        
        setTimeout(() => {
            hideTypingIndicator();
            const response = getAIResponse(message);
            addAIMessage(response.message);
        }, 800 + Math.random() * 400);
    }
    
    if (chatSend) {
        chatSend.addEventListener('click', sendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    function showTypingIndicator() {
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'temp-typing';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        messagesDiv.appendChild(typingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function hideTypingIndicator() {
        const typing = document.getElementById('temp-typing');
        if (typing) typing.remove();
    }
    
    window.addUserMessage = function(text) {
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236C63FF'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E" alt="User">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="sender-name">You</span>
                    <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="message-text">
                    <p>${text}</p>
                </div>
            </div>
        `;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
    
    window.addAIMessage = function(text) {
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai-message';
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300BFA6'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'/%3E%3C/svg%3E" alt="AI">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="sender-name">Bari Plux AI</span>
                    <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="message-text">
                    <p>${text}</p>
                </div>
            </div>
        `;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
}

// FAQ Accordion
function initializeFAQ() {
    document.querySelectorAll('.faq-item').forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                document.querySelectorAll('.faq-item').forEach(other => {
                    if (other !== item) other.classList.remove('active');
                });
                item.classList.toggle('active');
            });
        }
    });
}

// Working Hours Manager
class WorkingHoursManager {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupModal();
        this.startTimeUpdate();
    }
    
    setupModal() {
        const timezoneHelpBtn = document.getElementById('timezone-help');
        const modal = document.getElementById('timezone-modal');
        const modalClose = document.querySelector('.modal-close');
        
        if (timezoneHelpBtn && modal) {
            timezoneHelpBtn.addEventListener('click', () => this.openModal());
            if (modalClose) {
                modalClose.addEventListener('click', () => this.closeModal());
            }
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('active')) {
                    this.closeModal();
                }
            });
        }
    }
    
    openModal() {
        const modal = document.getElementById('timezone-modal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeModal() {
        const modal = document.getElementById('timezone-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    updateTime() {
        const timeEl = document.getElementById('current-utc-time');
        const statusEl = document.getElementById('support-status');
        
        if (!timeEl || !statusEl) return;
        
        const now = new Date();
        const timeString = now.toUTCString().split(' ')[4];
        timeEl.textContent = timeString;
        
        const hours = now.getUTCHours();
        if (hours >= 16 && hours < 20) {
            statusEl.textContent = 'Available Now';
            statusEl.className = 'status-value available';
        } else {
            statusEl.textContent = 'Unavailable';
            statusEl.className = 'status-value unavailable';
        }
    }
    
    startTimeUpdate() {
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    }
}

// Login Status Check
function checkLoginStatus() {
    const storedUser = localStorage.getItem('bariplux_user');
    const loginBtn = document.getElementById('loginBtnHeader');
    const dropdown = document.getElementById('userDropdown');
    
    if (!loginBtn) return;
    
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            loginBtn.classList.add('logged-in');
            loginBtn.innerHTML = '<i class="fas fa-user-circle"></i><span>' + user.name + '</span>';
            loginBtn.title = 'Click for options';
            loginBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                toggleUserDropdown();
            };
            
            // Update dropdown user info
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');
            if (userName) userName.textContent = user.name || 'User';
            if (userEmail) userEmail.textContent = user.email || '';
            
            // Show dropdown buttons when logged in
            const viewProfileBtn = document.getElementById('viewProfileBtn');
            const goToLoginBtn = document.getElementById('goToLoginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            
            if (viewProfileBtn) viewProfileBtn.style.display = 'flex';
            if (goToLoginBtn) goToLoginBtn.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'flex';
            
        } catch(e) {
            localStorage.removeItem('bariplux_user');
        }
    } else {
        loginBtn.classList.remove('logged-in');
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Login</span>';
        loginBtn.title = 'Login';
        loginBtn.onclick = function(e) {
            e.preventDefault();
            window.location.href = 'login.html';
        };
    }
}

// Toggle User Dropdown
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('userDropdown');
    const container = document.querySelector('.user-menu-container');
    
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// Initialize dropdown button events
function initializeUserDropdownButtons() {
    const logoutBtn = document.getElementById('logoutBtn');
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('bariplux_user');
                localStorage.removeItem('bariplux_user_new');
                window.location.href = 'login.html';
            }
        });
    }
    
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', function() {
            alert('Account Info: View your profile details here!');
        });
    }
    
    if (goToLoginBtn) {
        goToLoginBtn.addEventListener('click', function() {
            window.location.href = 'login.html';
        });
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('bariplux_user');
        localStorage.removeItem('bariplux_user_new');
        window.location.href = 'login.html';
    }
}

// Scroll Progress Bar
function setupScrollProgress() {
    const progressBar = document.querySelector('.scroll-progress');
    if (!progressBar) return;
    
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / docHeight) * 100;
        progressBar.style.width = scrollPercent + '%';
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupScrollTop();
    setupScrollProgress();
    setupRippleEffect();
    initParticles();
    setupSearch();
    initializeChatBot();
    initializeFAQ();
    initializeUserDropdownButtons();
    
    if (document.getElementById('timezone-help') || document.getElementById('timezone-modal')) {
        new WorkingHoursManager();
    }
    
    checkLoginStatus();
    
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Active navigation link on scroll
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-link');
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.pageYOffset >= sectionTop - 150) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
    
    // Header scroll effect
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }
    
    // Close video modal on outside click
    document.addEventListener('click', (e) => {
        const videoModal = document.getElementById('video-modal');
        if (e.target === videoModal) closeVideo();
    });
    
    // Close video modal with Escape key
    document.addEventListener('keydown', (e) => {
        const videoModal = document.getElementById('video-modal');
        if (e.key === 'Escape' && videoModal && videoModal.classList.contains('active')) {
            closeVideo();
        }
    });
    
    // Check for app sync periodically
    setInterval(() => {
        const appUser = localStorage.getItem('bariplux_user_new');
        if (appUser) {
            localStorage.setItem('bariplux_user', appUser);
            localStorage.removeItem('bariplux_user_new');
            checkLoginStatus();
        }
    }, 5000);
    
    console.log('Bari Plux JavaScript initialized');
});
