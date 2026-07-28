
if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
    window.innerWidth <= 768 &&
    !window.location.href.includes('mobile')) {
    window.location.href = 'mobile';
}
