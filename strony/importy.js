import { formatDate } from "../komponenty/format.js";

var el = document.getElementById("data-pliku");
if (el) {
  el.textContent = formatDate("2026-09-24");
}

page.onLeave(function () {
  window.__korzemOstatnieWyjscie = "Importy: skrypt z pliku dostał onLeave.";
});
