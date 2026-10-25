// Applies the saved or system color theme before the first paint, to avoid a flash.
(function () {
  var theme = "system";
  try {
    theme = localStorage.getItem("compose-doctor:theme") || "system";
  } catch (e) {
    // Storage can be unavailable (private mode, blocked site data).
  }
  var dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
