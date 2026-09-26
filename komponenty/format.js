export function formatDate(iso) {
  var data = new Date(iso + "T12:00:00");
  return data.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function powitanie(skad) {
  return "Import zadziałał (" + skad + ").";
}
