(function () {
  var h = location.hostname;
  var ok =
    h === "bariplux.com" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".bariplux.com") ||
    h.endsWith(".firebaseapp.com") ||
    h.endsWith(".web.app");
  if (!ok) {
    document.documentElement.innerHTML = "";
    window.stop();
    location.replace("about:blank");
  }
})();
