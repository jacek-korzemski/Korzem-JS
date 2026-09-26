export function defineListaPostow(api) {
  api.define("lista-postow", {
    attributes: ["data"],
    render({ data }) {
      if (!Array.isArray(data)) {
        if (this._widzialListe) return;
        return '<p class="czekaj">Ładowanie…</p>';
      }
      this._widzialListe = true;
      if (data.length === 0) {
        return '<p class="czekaj">Pusto.</p>';
      }
      return api.html`
        <ul class="posty">
          ${data.map(function (p) {
            return (
              "<li><strong>" +
              api.escape(p.tytul) +
              "</strong> <time>" +
              api.escape(p.data) +
              "</time><p>" +
              api.escape(p.tresc) +
              "</p></li>"
            );
          })}
        </ul>
      `;
    }
  });
}

defineListaPostow(window.Korzem);
