/**
 * Bari Plux homepage — extracted from index.html (Phase 1 structural only).
 */
    // Scroll Progress Bar
    const scrollProgress = document.getElementById('scrollProgress');
    if (scrollProgress) {
        window.addEventListener('scroll', () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = (scrollTop / docHeight) * 100;
            scrollProgress.style.width = scrollPercent + '%';
        }, { passive: true });
    }

    // Login chrome is owned by site-shell.js (single click handler).

    // Header Scroll Effect
    const header = document.getElementById('bp-header') || document.querySelector('.bp-chrome');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }, { passive: true });
    }

    // Theme Toggle - Fixed Version
    function setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        const storedTheme = localStorage.getItem('theme');
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        const currentTheme = storedTheme || systemTheme || 'dark';

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            var metaTheme = document.querySelector('meta[name="theme-color"]');
            if (metaTheme) {
                metaTheme.setAttribute('content', theme === 'light' ? '#eef0f6' : '#030305');
            }
        }

        applyTheme(currentTheme);

        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
    }

    // Scroll to top
    function setupScrollTop(){
        const btn = document.getElementById('scroll-top');
        if (!btn) return;
        
        window.addEventListener('scroll', ()=>{
            if (window.pageYOffset > 350) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });
        
        btn.addEventListener('click', ()=> {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Video Player Functions
    function openVideo(videoId, title) {
        const modal = document.getElementById('video-modal');
        const videoPlayer = document.getElementById('video-player');
        const titleEl = document.getElementById('video-modal-title');
        if (!modal || !videoPlayer || !videoId) return;

        if (titleEl && title) titleEl.textContent = title;

        const id = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
        videoPlayer.innerHTML =
            '<iframe title="YouTube video" width="100%" height="100%" ' +
            'src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1" ' +
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';

        modal.hidden = false;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeVideo() {
        const modal = document.getElementById('video-modal');
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) videoPlayer.innerHTML = '';
        if (modal) {
            modal.classList.remove('active');
            modal.hidden = true;
        }
        document.body.style.overflow = '';
    }

    function setupVideoLibrary() {
        document.querySelectorAll('.video-card[data-video]').forEach(function (card) {
            function play() {
                openVideo(card.getAttribute('data-video'), (card.querySelector('.video-title') || {}).textContent || 'Watch Video');
            }
            card.addEventListener('click', play);
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    play();
                }
            });
        });

        document.querySelectorAll('.video-filter').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.video-filter').forEach(function (b) { b.classList.remove('is-active'); });
                btn.classList.add('is-active');
                var filter = btn.getAttribute('data-filter') || 'all';
                document.querySelectorAll('.video-card[data-tags]').forEach(function (card) {
                    var tags = card.getAttribute('data-tags') || '';
                    var show = filter === 'all' || tags.indexOf(filter) !== -1;
                    card.hidden = !show;
                    card.style.display = show ? '' : 'none';
                });
            });
        });

        var modal = document.getElementById('video-modal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeVideo();
            });
        }
        var closeBtn = document.getElementById('video-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeVideo);
    }

    // Ripple effect
    function setupRippleEffect() {
        document.querySelectorAll('.download-card, .pubg-card').forEach(card => {
            card.addEventListener('click', e => {
                const r = card.querySelector('.ripple');
                if (!r) return;
                
                r.classList.remove('active');
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                r.style.left = x + 'px';
                r.style.top = y + 'px';
                
                requestAnimationFrame(() => r.classList.add('active'));
                setTimeout(() => r.classList.remove('active'), 900);
            });
        });
    }

    // Particles.js removed (dead code)

    // اضافه کردن این تابع در بخش اسکریپت
function sanitizeInput(input) {
    if (!input) return '';
    
    // حذف تگ‌های خطرناک
    const sanitized = input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    
    // محدودیت طول
    return sanitized.substring(0, 500);
}
 
    // اعتبارسنجی لینک‌های دانلود
function validateDownloadLink(url, filename) {
    const allowedFiles = [
        'pubgdown', 'gameloopdown', 'windowsxlitedown',
        'optimization-tools', 'pubgevents'
    ];
    
    // بررسی فایل‌های مجاز
    const isAllowedFile = allowedFiles.some(file => url.includes(file));
    
    if (!isAllowedFile) {
        console.warn('Blocked download attempt:', url);
        return false;
    }
    
    // بررسی دامنه
    if (!url.startsWith(window.location.origin) && !url.startsWith('/')) {
        console.warn('External download blocked:', url);
        return false;
    }
    
    return true;
}

// اضافه کردن به دکمه‌های دانلود
document.querySelectorAll('a[href*="down"], a[download]').forEach(link => {
    link.addEventListener('click', function(e) {
        if (!validateDownloadLink(this.href, this.download)) {
            e.preventDefault();
            addAIMessage("This download link has been checked for your security. If you have any problems, please contact support.");
        }
    });
});

    // اضافه کردن این تابع در بخش اسکریپت
function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}
 
    // Rules Modal
function setupRulesModal() {
    const rulesModal = document.querySelector('.rules-modal');
    const closeRules = document.querySelector('.close-rules');
    const rulesAcceptBtn = document.querySelector('.rules-accept-btn');
    const contactTelegramBtn = document.getElementById('contact-telegram');
    const telegramContactBtn = document.getElementById('telegram-contact');
    const contactMeBtn = document.getElementById('contact-me-btn');
    const telegramContactItem = document.getElementById('telegram-contact-item'); // اضافه شد

    if (!rulesModal || !closeRules || !rulesAcceptBtn) {
        console.log('Rules modal elements not found');
        return;
    }

    console.log('✓ Rules modal initialized');

    // Show rules modal
    function showRulesModal() {
        rulesModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Event listeners برای تمام دکمه‌های ارتباط
    if (contactTelegramBtn) {
        contactTelegramBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showRulesModal();
        });
    }
    
    if (telegramContactBtn) {
        telegramContactBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showRulesModal();
        });
    }

    // Event listener برای دکمه Contact Me
    if (contactMeBtn) {
        contactMeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showRulesModal();
        });
    }

    // Event listener برای آیتم Telegram در بخش Contact
    if (telegramContactItem) {
        telegramContactItem.style.cursor = 'pointer'; // تغییر کرسر به pointer
        telegramContactItem.addEventListener('click', function(e) {
            e.preventDefault();
            showRulesModal();
        });
    }

    // بقیه کدها بدون تغییر...
    // Close rules modal
    closeRules.addEventListener('click', () => {
        closeModal();
    });

    // Close modal when clicking outside
    rulesModal.addEventListener('click', (e) => {
        if (e.target === rulesModal) {
            closeModal();
        }
    });

    // Close with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && rulesModal.classList.contains('active')) {
            closeModal();
        }
    });

    // Accept rules and redirect to Telegram
    rulesAcceptBtn.addEventListener('click', () => {
        acceptRules();
    });

    function closeModal() {
        rulesModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function acceptRules() {
        localStorage.setItem('rulesAccepted', 'true');
        
        // افکت موفقیت
        rulesAcceptBtn.innerHTML = '<i class="fas fa-check"></i> Redirecting to Telegram...';
        rulesAcceptBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
        
        setTimeout(() => {
            closeModal();
            // باز کردن تلگرام
            window.open('https://t.me/BariPluxYT', '_blank');
            
            // بازنشانی دکمه
            setTimeout(() => {
                rulesAcceptBtn.innerHTML = '<i class="fas fa-check-circle"></i> I Accept the Rules';
                rulesAcceptBtn.style.background = '';
            }, 1000);
        }, 1000);
    }

    // اگر کاربر قبلاً قوانین رو قبول کرده، همه لینک‌ها مستقیماً به تلگرام برن
    if (localStorage.getItem('rulesAccepted')) {
        // دکمه Contact Me
        if (contactMeBtn) {
            contactMeBtn.href = 'https://t.me/BariPluxYT';
            contactMeBtn.target = '_blank';
            contactMeBtn.removeAttribute('id');
        }
        
        // آیتم Telegram در Contact
        if (telegramContactItem) {
            telegramContactItem.style.cursor = 'pointer';
            telegramContactItem.addEventListener('click', function(e) {
                e.preventDefault();
                window.open('https://t.me/BariPluxYT', '_blank');
            });
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setupRulesModal();
});

// Enhanced Quiz Functionality with Glass Effects
document.addEventListener('DOMContentLoaded', function() {
    const quizState = {
        currentQuestion: 1,
        totalQuestions: 8,
        score: 0,
        answers: []
    };

    // Initialize quiz
    function initQuiz() {
        updateProgress();
        showQuestion(1);
        setupEventListeners();
        addGlassEffects();
    }

    function addGlassEffects() {
        // Add shimmer effect to progress bar
        const progressFill = document.getElementById('quiz-progress');
        progressFill.style.background = `linear-gradient(90deg, var(--accent), var(--accent-2))`;
    }

    function setupEventListeners() {
        // Option selection with enhanced feedback
        document.querySelectorAll('.quiz-option').forEach(option => {
            option.addEventListener('click', function() {
                const question = this.closest('.quiz-question');
                const questionId = parseInt(question.id.split('-')[1]);
                
                // Remove selection from all options in this question
                question.querySelectorAll('.quiz-option').forEach(opt => {
                    opt.classList.remove('selected');
                    opt.style.transform = 'translateY(0)';
                });
                
                // Add selection to clicked option
                this.classList.add('selected');
                this.style.transform = 'translateY(-3px)';
                
                // Store answer
                quizState.answers[questionId] = parseInt(this.dataset.value);
                
                // Add selection animation
                this.style.animation = 'pulse 0.3s ease';
                setTimeout(() => {
                    this.style.animation = '';
                }, 300);
                
                // Enable next button
                document.getElementById('next-question').disabled = false;
                
                // If last question, show results button
                if (quizState.currentQuestion === quizState.totalQuestions) {
                    document.getElementById('show-results').style.display = 'inline-flex';
                    document.getElementById('next-question').style.display = 'none';
                }
            });
        });

        // Enhanced navigation
        document.getElementById('next-question').addEventListener('click', nextQuestion);
        document.getElementById('prev-question').addEventListener('click', prevQuestion);
        document.getElementById('show-results').addEventListener('click', showResults);
        document.getElementById('retake-quiz').addEventListener('click', retakeQuiz);
    }

    function nextQuestion() {
        if (quizState.currentQuestion < quizState.totalQuestions) {
            quizState.currentQuestion++;
            showQuestion(quizState.currentQuestion);
            updateProgress();
            
            // Add page transition effect
            document.getElementById('quiz-content').style.animation = 'fadeInUp 0.6s ease';
            setTimeout(() => {
                document.getElementById('quiz-content').style.animation = '';
            }, 600);
        }
    }

    function prevQuestion() {
        if (quizState.currentQuestion > 1) {
            quizState.currentQuestion--;
            showQuestion(quizState.currentQuestion);
            updateProgress();
        }
    }

    function showQuestion(questionNumber) {
        // Hide all questions
        document.querySelectorAll('.quiz-question').forEach(q => {
            q.classList.remove('active');
        });
        
        // Show current question
        const currentQuestion = document.getElementById(`question-${questionNumber}`);
        currentQuestion.classList.add('active');
        
        // Update navigation buttons
        document.getElementById('prev-question').disabled = questionNumber === 1;
        
        // Check if current question has answer
        const hasAnswer = currentQuestion.querySelector('.quiz-option.selected');
        document.getElementById('next-question').disabled = !hasAnswer;
        
        // Show/hide results button
        if (questionNumber === quizState.totalQuestions && hasAnswer) {
            document.getElementById('show-results').style.display = 'inline-flex';
            document.getElementById('next-question').style.display = 'none';
        } else {
            document.getElementById('show-results').style.display = 'none';
            document.getElementById('next-question').style.display = 'inline-flex';
        }
    }

    function updateProgress() {
        const progress = (quizState.currentQuestion / quizState.totalQuestions) * 100;
        const progressFill = document.getElementById('quiz-progress');
        
        // Smooth progress animation
        progressFill.style.transition = 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        progressFill.style.width = `${progress}%`;
        
        document.getElementById('current-question').textContent = quizState.currentQuestion;
    }

    function calculateScore() {
        let totalScore = 0;
        let maxPossibleScore = 0;
        
        for (let i = 1; i <= quizState.totalQuestions; i++) {
            if (quizState.answers[i] !== undefined) {
                totalScore += quizState.answers[i];
                maxPossibleScore += 3; // Each question has max 3 points
            }
        }
        
        return {
            score: totalScore,
            percentage: Math.round((totalScore / maxPossibleScore) * 100),
            maxPossible: maxPossibleScore
        };
    }

    function showResults() {
        const results = calculateScore();
        const recommendationList = document.getElementById('recommendation-list');
        
        // Update results display with animations
        const resultPercentage = document.getElementById('result-percentage');
        const resultLevel = document.getElementById('result-level');
        const resultDescription = document.getElementById('result-description');
        
        // Animate percentage counter
        animateValue(resultPercentage, 0, results.percentage, 1500);
        
        // Update level and description
        setTimeout(() => {
            resultLevel.textContent = getLevel(results.percentage);
            resultDescription.textContent = getDescription(results.percentage);
        }, 800);
        
        // Update icon based on score
        const resultIcon = document.getElementById('result-icon');
        resultIcon.innerHTML = getIcon(results.percentage);
        resultIcon.style.animation = 'bounceIn 1s ease';
        
        // Generate recommendations
        recommendationList.innerHTML = generateRecommendations(results.percentage, quizState.answers);
        
        // Add animations to recommendation items
        setTimeout(() => {
            document.querySelectorAll('.recommendation-item').forEach((item, index) => {
                item.style.animation = `fadeInUp 0.6s ease ${index * 0.1}s both`;
            });
        }, 500);
        
        // Hide questions and show results
        document.querySelectorAll('.quiz-question').forEach(q => {
            q.style.display = 'none';
        });
        document.getElementById('quiz-results').classList.add('active');
        
        // Hide navigation
        document.querySelector('.quiz-navigation').style.display = 'none';
        
        // Scroll to results
        setTimeout(() => {
            document.getElementById('quiz-results').scrollIntoView({ 
                behavior: 'smooth',
                block: 'center'
            });
        }, 300);
    }

    function animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            element.textContent = value + '%';
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function getLevel(percentage) {
        if (percentage >= 80) return 'Expert Level 🏆';
        if (percentage >= 60) return 'Advanced ⭐';
        if (percentage >= 40) return 'Intermediate ✅';
        if (percentage >= 20) return 'Beginner 🔧';
        return 'Needs Major Optimization ⚠️';
    }

    function getDescription(percentage) {
        if (percentage >= 80) return 'Your system is exceptionally well-optimized for PUBG Mobile! You should be getting outstanding performance with high FPS and buttery-smooth gameplay. Keep up the maintenance!';
        if (percentage >= 60) return 'Great optimization! Your system handles PUBG Mobile very well. With a few targeted optimizations, you can push your performance to expert levels.';
        if (percentage >= 40) return 'Good foundation! Your system has decent optimization but there are significant improvements we can make to enhance your PUBG Mobile experience dramatically.';
        if (percentage >= 20) return 'Your system needs optimization work. The recommendations below will help transform your gameplay from frustrating to fantastic.';
        return 'Your system requires major optimization. Don\'t worry - follow our recommendations and you\'ll see a massive improvement in performance and gameplay smoothness.';
    }

    function getIcon(percentage) {
        if (percentage >= 80) return '<i class="fas fa-trophy"></i>';
        if (percentage >= 60) return '<i class="fas fa-star"></i>';
        if (percentage >= 40) return '<i class="fas fa-check-circle"></i>';
        if (percentage >= 20) return '<i class="fas fa-tools"></i>';
        return '<i class="fas fa-exclamation-triangle"></i>';
    }

    function generateRecommendations(percentage, answers) {
        let recommendations = '';
        
        // CPU recommendations
        if (answers[1] <= 1) {
            recommendations += `
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-microchip"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>CPU Optimization Package</strong>
                        <span>Advanced CPU tuning for low-end systems to maximize PUBG performance</span>
                    </div>
                </div>
            `;
        }
        
        // GPU recommendations
        if (answers[2] <= 1) {
            recommendations += `
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-gamepad"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>GPU Optimization Suite</strong>
                        <span>Custom graphics settings and driver optimizations for your specific GPU</span>
                    </div>
                </div>
            `;
        }
        
        // RAM recommendations
        if (answers[3] <= 1) {
            recommendations += `
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-memory"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>Memory Optimization Tools</strong>
                        <span>RAM management and optimization utilities for better gaming performance</span>
                    </div>
                </div>
            `;
        }
        
        // GameLoop version
        if (answers[8] <= 1) {
            recommendations += `
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-download"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>Optimized GameLoop</strong>
                        <span>Latest performance-tuned GameLoop version with pre-configured settings</span>
                    </div>
                </div>
            `;
        }
        
        // General optimizations based on score
        if (percentage < 60) {
            recommendations += `
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-desktop"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>Windows Optimization Pack</strong>
                        <span>Complete Windows optimization toolkit for maximum gaming performance</span>
                    </div>
                </div>
                <div class="recommendation-item">
                    <div class="recommendation-icon">
                        <i class="fas fa-tachometer-alt"></i>
                    </div>
                    <div class="recommendation-text">
                        <strong>Performance Toolkit</strong>
                        <span>Essential optimization tools and utilities collection</span>
                    </div>
                </div>
            `;
        }
        
        // Always include maintenance tools
        recommendations += `
            <div class="recommendation-item">
                <div class="recommendation-icon">
                    <i class="fas fa-cogs"></i>
                </div>
                <div class="recommendation-text">
                    <strong>System Maintenance Kit</strong>
                    <span>Keep your system optimized and running smoothly with regular maintenance</span>
                </div>
            </div>
        `;
        
        return recommendations;
    }

    function retakeQuiz() {
        // Reset quiz state
        quizState.currentQuestion = 1;
        quizState.score = 0;
        quizState.answers = [];
        
        // Reset UI with animations
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.remove('selected');
            opt.style.transform = 'translateY(0)';
        });
        
        document.getElementById('quiz-results').classList.remove('active');
        document.querySelector('.quiz-navigation').style.display = 'flex';
        document.getElementById('show-results').style.display = 'none';
        document.getElementById('next-question').style.display = 'inline-flex';
        document.getElementById('next-question').disabled = true;
        
        // Show all questions again
        document.querySelectorAll('.quiz-question').forEach(q => {
            q.style.display = 'block';
        });
        
        showQuestion(1);
        updateProgress();
        
        // Scroll to top of quiz with smooth animation
        setTimeout(() => {
            document.getElementById('optimization-quiz').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }, 300);
    }

    // Start the quiz
    initQuiz();
});

    // Header search — sections + live text highlight on page
    var dropdown, searchBox;
    function setupSearch() {
        searchBox = document.getElementById('header-search-input');
        dropdown = document.getElementById('search-results-dropdown');
        var container = document.getElementById('collapsible-search');
        if (!searchBox || !dropdown || !container) return;

        var catalog = [
            { title: 'Home / Profile', type: 'Page', id: 'home', keys: 'home bari plux about profile' },
            { title: 'Downloads', type: 'Section', id: 'downloads', keys: 'download gameloop tools fps' },
            { title: 'Videos', type: 'Section', id: 'videos', keys: 'video youtube tutorial fix guide' },
            { title: 'Optimization Quiz', type: 'Section', id: 'optimization-quiz', keys: 'quiz optimize test' },
            { title: 'PUBG Content', type: 'Section', id: 'pubg', keys: 'pubg content mobile' },
            { title: 'Bari Plux Tool', type: 'Section', id: 'bari-plux-tool', keys: 'tool desktop app download gameloop fps' },
            { title: 'Live now', type: 'Section', id: 'live', keys: 'events support season hours availability timezone' },
            { title: 'PUBG Events', type: 'Section', id: 'pubg-events', keys: 'events season reward' },
            { title: 'Plux Times', type: 'Section', id: 'plux-times', keys: 'plux times news' },
            { title: 'Blog', type: 'Section', id: 'blog', keys: 'blog posts article weapon map' },
            { title: 'Community & FAQ', type: 'Section', id: 'feedback', keys: 'faq feedback community support' },
            { title: 'Support Hours', type: 'Section', id: 'support', keys: 'support hours availability timezone' },
            { title: 'Contact', type: 'Section', id: 'contact', keys: 'contact email telegram' }
        ];

        var highlightRoots = [
            '.video-title', '.blog-title', '.blog-excerpt', '.download-card h3', '.download-card p',
            '.section-title', '.section-subtitle', '.faq-question span', '.feedback-text',
            '.hero-lead', '.profile-story p', '.pubg-card h3', '.plux-article h3'
        ];

        var wh = document.querySelector('#support');
        if (wh && !wh.id) wh.id = 'support';
        var pe = document.querySelector('#pubg-events');
        if (pe && !pe.id) pe.id = 'pubg-events';

        function hideDropdown() {
            dropdown.hidden = true;
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
        }
        function showDropdown() {
            dropdown.hidden = false;
            dropdown.style.display = 'block';
        }

        function clearHighlights() {
            document.querySelectorAll('mark.search-highlight').forEach(function (mark) {
                var parent = mark.parentNode;
                if (!parent) return;
                parent.replaceChild(document.createTextNode(mark.textContent), mark);
                parent.normalize();
            });
            document.querySelectorAll('.search-hit').forEach(function (el) {
                el.classList.remove('search-hit');
            });
        }

        function escapeRegExp(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function applyHighlights(term) {
            clearHighlights();
            if (!term || term.length < 2) return;
            var re = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
            highlightRoots.forEach(function (sel) {
                document.querySelectorAll(sel).forEach(function (el) {
                    if (el.closest('.bp-chrome, .ai-chat-widget, .search-results-dropdown')) return;
                    var text = el.textContent || '';
                    if (!re.test(text)) return;
                    re.lastIndex = 0;
                    el.classList.add('search-hit');
                    el.innerHTML = text.replace(re, '<mark class="search-highlight">$1</mark>');
                });
            });
        }

        function collectContentMatches(term) {
            var extra = [];
            document.querySelectorAll('.video-card, .blog-card, .download-card, .pubg-card, .plux-article').forEach(function (card) {
                var text = (card.innerText || '').toLowerCase();
                if (text.indexOf(term) === -1) return;
                var titleEl = card.querySelector('h3, h4, .video-title, .blog-title, .download-title');
                var section = card.closest('section');
                extra.push({
                    title: titleEl ? titleEl.textContent.trim().slice(0, 48) : 'Match',
                    type: 'Content',
                    id: section && section.id ? section.id : 'home'
                });
            });
            return extra;
        }

        container.addEventListener('click', function (e) {
            if (e.target.closest('.search-results-dropdown')) return;
            container.classList.add('active');
            setTimeout(function () { searchBox.focus(); }, 60);
        });

        searchBox.addEventListener('input', function () {
            var term = this.value.toLowerCase().trim();
            applyHighlights(term);

            if (term.length < 2) {
                hideDropdown();
                return;
            }

            var matches = catalog.filter(function (item) {
                return item.title.toLowerCase().indexOf(term) !== -1 || item.keys.indexOf(term) !== -1;
            });
            matches = matches.concat(collectContentMatches(term));
            var seen = {};
            matches = matches.filter(function (m) {
                var k = m.title + m.id;
                if (seen[k]) return false;
                seen[k] = true;
                return true;
            }).slice(0, 8);

            dropdown.innerHTML = '';
            if (!matches.length) {
                dropdown.innerHTML = '<div class="search-empty">No matches — try “download”, “fps”, “faq”</div>';
                showDropdown();
                return;
            }

            matches.forEach(function (item) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'search-result-item';
                btn.innerHTML = '<span class="search-result-icon"><i class="fas fa-arrow-right"></i></span><span class="search-result-content"><span class="search-result-title"></span><span class="search-result-type"></span></span>';
                btn.querySelector('.search-result-title').textContent = item.title;
                btn.querySelector('.search-result-type').textContent = item.type;
                btn.addEventListener('click', function () {
                    var target = document.getElementById(item.id);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    searchBox.value = '';
                    // keep highlights briefly then clear
                    setTimeout(clearHighlights, 2800);
                    hideDropdown();
                    container.classList.remove('active');
                });
                dropdown.appendChild(btn);
            });
            showDropdown();
        });

        searchBox.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                hideDropdown();
                clearHighlights();
                container.classList.remove('active');
                searchBox.blur();
            }
        });

        document.addEventListener('click', function (e) {
            if (!container.contains(e.target)) {
                hideDropdown();
                container.classList.remove('active');
            }
        });
    }

    function scrollToSection(sectionId) {
        const dropdown = document.getElementById('search-results-dropdown');
        const searchInput = document.getElementById('header-search-input');
        const searchContainer = document.getElementById('collapsible-search');
        
        if (searchInput) searchInput.value = '';
        if (dropdown) dropdown.innerHTML = '';
        if (searchContainer) searchContainer.classList.remove('active');
        
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function filterContent(searchTerm) {
        const allItems = document.querySelectorAll('.download-card, .video-card, .pubg-card, .plux-article');
        let resultCount = 0;

        if (searchTerm !== '') {
            document.querySelectorAll('.section').forEach(section => {
                if (!section.classList.contains('hero')) {
                    section.style.display = 'none';
                }
            });

            allItems.forEach(item => {
                const title = item.querySelector('.download-title, .video-title, .pubg-title, .plux-article-title');
                const desc = item.querySelector('.download-description, .video-info p, .pubg-card p, .plux-article-excerpt');
                
                const titleText = title ? title.textContent.toLowerCase() : '';
                const descText = desc ? desc.textContent.toLowerCase() : '';
                
                if (titleText.includes(searchTerm) || descText.includes(searchTerm)) {
                    const parentSection = item.closest('.section');
                    if (parentSection) parentSection.style.display = 'block';
                    item.style.display = 'block';
                    resultCount++;
                } else {
                    item.style.display = 'none';
                }
            });
        } else {
            document.querySelectorAll('.section').forEach(section => {
                section.style.display = 'block';
            });
            allItems.forEach(item => item.style.display = '');
        }
    }

    function highlightText(element, searchTerm) {
        if (!element || !searchTerm) return;
        const originalText = element.getAttribute('data-original-text') || element.textContent;
        element.setAttribute('data-original-text', originalText);
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        element.innerHTML = originalText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    function resetSearchHighlights() {
        document.querySelectorAll('[data-original-text]').forEach(element => {
            element.innerHTML = element.getAttribute('data-original-text');
        });
    }

    // Professional AI Chat Bot - Simplified Stable Version
function initializeChatBot() {
    const chatToggle = document.getElementById('chat-toggle');
    const chatWidget = document.getElementById('ai-chat-widget');
    const chatClose = document.getElementById('chat-close');
    const chatMinimize = document.getElementById('chat-minimize');
    const chatSend = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');
    const charCount = document.querySelector('.char-count');
    
    // Scoped Bari Plux knowledge — only answer on-topic questions
    const aiResponses = {
        greeting: {
            message: "Hello — I’m the Bari Plux assistant. I can help with PUBG Mobile on GameLoop/MuMu, Bari Plux Tool, FPS/graphics, Windows tuning, DNS, downloads, and Pro. Ask a specific question about those topics.",
            quickReplies: ['Bari Plux Tool', 'FPS boost', 'GameLoop setup', 'Pro unlock']
        },
        tool: {
            message: "**Bari Plux Tool** is the Windows suite for PUBG Mobile on GameLoop & MuMu (graphics/FPS, custom view, match prep, ADB, DNS).\n\n• Product page: /tool\n• Installer: download section on that page only\n• Terms: /tool-terms\n• Pro ($2 / 60 days): /Pro — same email as app login",
            quickReplies: ['Pro unlock', 'FPS boost', 'Downloads']
        },
        optimization: {
            message: "**Performance checklist**\n1. Smooth graphics + 90/120 FPS in-game / via Tool\n2. Close Chrome/Discord overlays when testing\n3. High performance power plan\n4. Prefer a clean GameLoop install + VT enabled\n5. Use Bari Plux Tool match-prep / cleaners instead of random .bat packs",
            quickReplies: ['Bari Plux Tool', 'VT guide', 'GameLoop setup']
        },
        gameloop: {
            message: "**GameLoop**\n• Download page: /gameloopdown\n• Allocate enough RAM/CPU cores for your PC\n• Enable virtualization (VT-x / AMD-V)\n• After crashes: run as admin, clear shader cache, check graphics drivers\n• Pair with Bari Plux Tool for FPS/keymapping — don’t mix unverified injectors",
            quickReplies: ['VT guide', 'Crash fix', 'Bari Plux Tool']
        },
        fps: {
            message: "**FPS**\n• In Tool: Active.sav domain patch for 90/120 where supported\n• Smooth style, shadows/AA off if you need frames\n• Graphic packs 4.5: /optimizationtools (Balanced/HD/HDR/Ultra HDR ± enhanced lobby)\n• Cap expectations: CPU/GPU and emulator limits still apply",
            quickReplies: ['Graphic packs', 'Bari Plux Tool', 'Lag fix']
        },
        windows: {
            message: "**Windows tuning**\n• High performance power plan\n• Keep GPU drivers current\n• Avoid aggressive “optimizer” junkware\n• X-Lite ISO page: /windowsxlitedown (advanced users only — backup first)\n• Tool’s reversible tunes are safer than random registry spam",
            quickReplies: ['Bari Plux Tool', 'Downloads']
        },
        downloads: {
            message: "**Official downloads**\n• Bari Plux Tool → /tool\n• Optimization apps & graphic packs → /optimizationtools\n• PUBG Mobile → /pubgdown\n• GameLoop → /gameloopdown\nAvoid third-party mirrors of the Tool installer.",
            quickReplies: ['Bari Plux Tool', 'Graphic packs', 'GameLoop setup']
        },
        graphics: {
            message: "**Graphics packs (season 4.5)** on /optimizationtools:\n• Balanced / HD / HDR / Ultra HDR\n• Each has Standard lobby vs Enhanced lobby builds\nApply one pack at a time; back up Active.sav / configs first.",
            quickReplies: ['FPS boost', 'Bari Plux Tool']
        },
        vt: {
            message: "**Enable VT**\n1. Restart → BIOS/UEFI (Del/F2/F10 — vendor specific)\n2. Enable Intel VT-x / AMD-V / SVM\n3. Save & exit\nNeeded for stable emulator performance. If the option is missing, update BIOS or check OEM docs.",
            quickReplies: ['GameLoop setup', 'Lag fix']
        },
        lag: {
            message: "**Lag / stutter**\n• Enable VT, raise emulator RAM\n• Wired network or stable Wi-Fi; try DNS 1.1.1.1 / 8.8.8.8 via Tool DNS tools\n• Close capture overlays\n• Don’t stack multiple FPS “magics”",
            quickReplies: ['DNS', 'FPS boost', 'Network']
        },
        crash: {
            message: "**Crashes**\n• Update GPU drivers; run emulator as Administrator\n• Clear GameLoop shader/temp caches (Tool cleaners help)\n• Reinstall GameLoop only after backing up configs\n• Report persistent Tool bugs from inside the app (signed-in)",
            quickReplies: ['GameLoop setup', 'Bari Plux Tool']
        },
        network: {
            message: "**Network**\n• Prefer ethernet\n• Tool DNS benchmark → apply best IPv4/IPv6, or reset DHCP if broken\n• Closest server / lower background uploads\nVPN only if you understand routing cost to ping",
            quickReplies: ['Lag fix', 'Bari Plux Tool']
        },
        pro: {
            message: "**Bari Plux Pro**\n• $2 / 60 days via Stripe (PayPal or card) on /Pro\n• Checkout email must match Tool login email\n• Renewing extends another 60 days\n• Details & liability: /tool-terms",
            quickReplies: ['Bari Plux Tool', 'Downloads']
        },
        support: {
            message: "**Support**\n• Live window on homepage → Support pane (daily 4:00–8:00 PM UTC)\n• Telegram: https://t.me/BariPlux\n• I only answer Bari Plux / PUBG emulator optimization topics here",
            quickReplies: ['Bari Plux Tool', 'Pro unlock']
        },
        off_topic: {
            message: "I only answer Bari Plux topics: Tool, Pro, PUBG Mobile emulator optimization, GameLoop/MuMu, graphics/FPS packs, Windows tuning related to gaming, and official downloads. Try rephrasing within those areas.",
            quickReplies: ['Bari Plux Tool', 'FPS boost', 'Downloads', 'Support hours']
        }
    };

    let useRealAI = false;

    function getAIResponse(userMessage) {
        const msg = (userMessage || '').toLowerCase().trim();
        if (!msg) return aiResponses.greeting;

        if (/^(hi|hello|hey|salam|درود|start)\b/.test(msg) || msg === 'help') {
            return aiResponses.greeting;
        }

        const rules = [
            { re: /pro\b|stripe|payment|\$2|unlock/, key: 'pro' },
            { re: /tool-terms|disclaimer|terms of|license/, key: 'pro' },
            { re: /bari plux tool|\btool\b|adb|file manager|active\.sav/, key: 'tool' },
            { re: /graphic pack|balanced|ultra\s*hdr|\bhdr\b|\bhd\b lobby|4\.5/, key: 'graphics' },
            { re: /gameloop|emulator|امولاتور|mumu/, key: 'gameloop' },
            { re: /\bfps\b|frame|فریم|90|120/, key: 'fps' },
            { re: /\bvt\b|virtuali|bios|amd-v|vt-x/, key: 'vt' },
            { re: /crash|کرش|bsod|close itself/, key: 'crash' },
            { re: /lag|stutter|کند|لگ/, key: 'lag' },
            { re: /dns|ping|network|اینترنت|wifi|ethernet/, key: 'network' },
            { re: /windows|ویندوز|power plan|driver|xlite/, key: 'windows' },
            { re: /download|دانلود|pubgdown|installer/, key: 'downloads' },
            { re: /optim|performance|بهینه/, key: 'optimization' },
            { re: /support|telegram|utc|hours|کمک/, key: 'support' }
        ];

        for (var i = 0; i < rules.length; i++) {
            if (rules[i].re.test(msg) && aiResponses[rules[i].key]) {
                return aiResponses[rules[i].key];
            }
        }

        // If message has no gaming/tool signal, refuse politely
        if (!/(pubg|gameloop|mumu|fps|tool|bari|plux|emulator|windows|dns|graphic|download|pro)/i.test(msg)) {
            return aiResponses.off_topic;
        }

        return {
            message: "I can help, but I need a clearer Bari Plux topic. Try: Tool install, Pro email match, GameLoop VT, FPS 90/120, graphic packs 4.5, or DNS.",
            quickReplies: ['Bari Plux Tool', 'Pro unlock', 'FPS boost', 'Graphic packs']
        };
    }

    const chatMinimized = document.getElementById('ai-chat-minimized');
    const minimizedExpand = document.getElementById('minimized-expand');
    const minimizedClose = document.getElementById('minimized-close');
    const notificationBadge = document.getElementById('notification-badge');

    function hideBadge() {
        if (!notificationBadge) return;
        notificationBadge.hidden = true;
        notificationBadge.textContent = '0';
        notificationBadge.classList.add('is-empty');
    }
    hideBadge();

    function openChat() {
        if (chatWidget) chatWidget.classList.add('active');
        if (chatMinimized) chatMinimized.classList.remove('active');
        hideBadge();
    }
    function closeChat() {
        if (chatWidget) chatWidget.classList.remove('active');
        if (chatMinimized) chatMinimized.classList.remove('active');
    }
    function minimizeChat() {
        if (chatWidget) chatWidget.classList.remove('active');
        if (chatMinimized) chatMinimized.classList.add('active');
    }

    // Simple chat toggle
    if (chatToggle) {
        chatToggle.addEventListener('click', () => {
            if (chatWidget && chatWidget.classList.contains('active')) {
                closeChat();
            } else {
                openChat();
            }
        });
    }
    
    if (chatClose) {
        chatClose.addEventListener('click', () => closeChat());
    }
    
    if (chatMinimize) {
        chatMinimize.addEventListener('click', () => minimizeChat());
    }

    if (minimizedExpand) {
        minimizedExpand.addEventListener('click', (e) => {
            e.stopPropagation();
            openChat();
        });
    }
    if (minimizedClose) {
        minimizedClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeChat();
        });
    }
    if (chatMinimized) {
        const header = chatMinimized.querySelector('.minimized-header');
        if (header) {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.minimized-btn')) return;
                openChat();
            });
        }
    }
    
    // Simple collapsible toggle
    const collapsibleSections = document.querySelectorAll('.collapsible-section');
    collapsibleSections.forEach(section => {
        const header = section.querySelector('.collapsible-header');
        if (header) {
            header.addEventListener('click', () => {
                section.classList.toggle('active');
            });
        }
    });
    
    // Quick action buttons
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
    
    // Suggestion buttons
    const suggestionBtns = document.querySelectorAll('.suggestion-btn');
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (chatInput) chatInput.value = btn.dataset.question;
            sendMessage();
        });
    });
    
    // Character count
    if (chatInput && charCount) {
        chatInput.addEventListener('input', () => {
            charCount.textContent = `${chatInput.value.length}/500`;
        });
    }
    
    // Send message
    function sendMessage() {
        const message = chatInput ? chatInput.value.trim() : '';
        if (!message) return;
        
        // Add user message
        addUserMessage(message);
        if (chatInput) chatInput.value = '';
        
        // Show typing
        showTypingIndicator();
        
        // Get response after short delay
        setTimeout(() => {
            hideTypingIndicator();
            const response = getAIResponse(message);
            addAIMessage(response.message);
        }, 800 + Math.random() * 400);
    }
    
    // Send button click
    if (chatSend) {
        chatSend.addEventListener('click', sendMessage);
    }
    
    // Enter key
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Typing indicator functions
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
}

// Enhanced message functions with better formatting
function addUserMessage(text) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    const safe = String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML =
        '<div class="message-content">' +
        '<div class="message-header"><span class="sender-name">You</span>' +
        '<span class="message-time">' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</span></div>' +
        '<div class="message-text"><p>' + safe + '</p></div></div>';
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addAIMessage(text) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    const body = (typeof formatMessage === 'function') ? formatMessage(text) : String(text);
    messageDiv.innerHTML =
        '<div class="message-content">' +
        '<div class="message-header"><span class="sender-name">Bari Plux AI</span>' +
        '<span class="message-time">' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</span></div>' +
        '<div class="message-text">' + body + '</div></div>';
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Professional message formatting like ChatGPT
function formatMessage(text) {
    if (!text) return '';
    
    let formatted = text;
    
    // Escape HTML first for security
    formatted = formatted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Bold: **text** or __text__
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #00BFA6; font-weight: 700;">$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong style="color: #00BFA6; font-weight: 700;">$1</strong>');
    
    // Italic: *text* or _text_
    formatted = formatted.replace(/\*(.+?)\*/g, '<em style="color: #e8eef8;">$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em style="color: #e8eef8;">$1</em>');
    
    // Underline: ~~text~~
    formatted = formatted.replace(/~~(.+?)~~/g, '<u style="text-decoration: underline;">$1</u>');
    
    // Links: [text](url) — only http(s)/mailto; block javascript: and other schemes
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, rawUrl) {
        var href = String(rawUrl || '').trim();
        var safe = false;
        try {
            if (/^mailto:[^\s]+$/i.test(href)) {
                safe = true;
            } else {
                var u = new URL(href, location.origin);
                safe = u.protocol === 'http:' || u.protocol === 'https:';
                if (safe) href = u.href;
            }
        } catch (e) {
            safe = false;
        }
        if (!safe) {
            return label;
        }
        return '<a href="' + href.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" style="color: #6C63FF; text-decoration: underline; font-weight: 500;">' + label + ' <i class="fas fa-external-link-alt" style="font-size: 0.7em;"></i></a>';
    });
    
    // Inline code: `code`
    formatted = formatted.replace(/`(.+?)`/g, '<code style="background: rgba(108, 99, 255, 0.2); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #00BFA6;">$1</code>');
    
    // Code blocks: ```code```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid rgba(108, 99, 255, 0.2);"><code style="font-family: monospace; font-size: 0.85em; color: #00BFA6;">$1</code></pre>');
    
    // Headers: ### Header
    formatted = formatted.replace(/^### (.+)$/gm, '<h4 style="margin: 12px 0 8px 0; color: #00BFA6; font-size: 1em; font-weight: 700;">$1</h4>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h3 style="margin: 14px 0 10px 0; color: #00BFA6; font-size: 1.1em; font-weight: 700;">$1</h3>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h2 style="margin: 16px 0 12px 0; color: #00BFA6; font-size: 1.2em; font-weight: 700;">$1</h2>');
    
    // Numbered lists: 1. item
    formatted = formatted.replace(/^(\d+)\.\s+(.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px;"><span style="color: #8B5CF6; font-weight: 600;">$1.</span> $2</li>');
    
    // Bullet lists: • item or - item
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px;"><span style="color: #00BFA6;">•</span> $1</li>');
    
    // Wrap consecutive li elements in ul
    formatted = formatted.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>');
    
    // Line breaks
    formatted = formatted.replace(/\n\n/g, '</p><p style="margin: 8px 0;">');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Wrap in paragraph if not already wrapped
    if (!formatted.startsWith('<')) {
        formatted = '<p style="margin: 0; line-height: 1.6;">' + formatted + '</p>';
    }
    
    return formatted;
}

function scrollChatToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Security function
function sanitizeInput(input) {
    if (!input) return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML.substring(0, 500);
}
    
    // FAQ accordion functionality
    function initializeFAQ() {
        document.querySelectorAll('.faq-item').forEach(item => {
            item.querySelector('.faq-question').addEventListener('click', () => {
                document.querySelectorAll('.faq-item').forEach(other => {
                    if (other !== item) other.classList.remove('active');
                });
                item.classList.toggle('active');
            });
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
                modalClose.addEventListener('click', () => this.closeModal());
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
            document.getElementById('timezone-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        closeModal() {
            document.getElementById('timezone-modal').classList.remove('active');
            document.body.style.overflow = '';
        }
        
        updateTime() {
            const now = new Date();
            const timeString = now.toUTCString().split(' ')[4];
            document.getElementById('current-utc-time').textContent = timeString;
            
            const hours = now.getUTCHours();
            const status = document.getElementById('support-status');
            if (hours >= 16 && hours < 20) {
                status.textContent = 'Available Now';
                status.className = 'status-value available';
            } else {
                status.textContent = 'Unavailable';
                status.className = 'status-value unavailable';
            }
        }
        
        startTimeUpdate() {
            this.updateTime();
            setInterval(() => this.updateTime(), 1000);
        }
    }

    // Event Listeners
    document.addEventListener('click', function(e) {
        // Close video modal when clicking outside
        const videoModal = document.getElementById('video-modal');
        if (e.target === videoModal) closeVideo();
    });

    document.addEventListener('keydown', function(e) {
        // Close video modal with Escape key
        const videoModal = document.getElementById('video-modal');
        if (e.key === 'Escape' && videoModal.classList.contains('active')) {
            closeVideo();
        }
    });

    // Smooth scrolling for navigation
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
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

    // Active navigation link
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.bp-nav__link, .nav-link');
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (pageYOffset >= sectionTop - 150) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active', 'is-active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active', 'is-active');
            }
        });
    });

    // Initialize everything when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        setupThemeToggle();
        setupScrollTop();
        setupRippleEffect();
        setupSearch();
        setupVideoLibrary();
        initializeChatBot();
        initializeFAQ();
        new WorkingHoursManager();
        console.log('🎯 All features initialized successfully!');
    });

    // Keep homepage in sync if desktop app writes bariplux_user_new
    setInterval(() => {
        const appUser = localStorage.getItem('bariplux_user_new');
        if (appUser) {
            localStorage.setItem('bariplux_user', appUser);
            localStorage.removeItem('bariplux_user_new');
            if (window.BPShell && typeof window.BPShell.refreshLogin === 'function') {
                window.BPShell.refreshLogin();
            }
        }
    }, 5000);

// Export functions used by HTML attributes / external callers
window.openVideo = openVideo;
window.closeVideo = closeVideo;
if (typeof logout === 'function') window.logout = logout;
