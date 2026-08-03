// login1.html early guard: brand hop from apex/GitHub Pages to the canonical
// login host before Firebase SDK loads. Externalized from an inline <script>
// (was CSP script-src 'unsafe-inline') - logic unchanged from the prior inline
// version. Loaded synchronously, right after assets/js/domain-lock.js.
(function () {
  try {
    var h = location.hostname;
    var q = new URLSearchParams(location.search);
    // Brand hop: GitHub Pages / apex → canonical login host root
    if (q.get('desktop') === '1' && (h === 'bariplux.com' || (h.endsWith('.bariplux.com') && h !== 'login.bariplux.com'))) {
      var dest = 'https://login.bariplux.com/' + (location.search || '?desktop=1');
      if (!dest.includes('v=')) dest += (dest.includes('?') ? '&' : '?') + 'v=20260729';
      location.replace(dest);
      return;
    }
    // Clear leftover flags from older popup / bounce-to-home experiments
    try {
      sessionStorage.removeItem('github_web_goto_home');
      localStorage.removeItem('bariplux_github_oauth_result');
    } catch (eClear) {}
  } catch (e) {}
})();
