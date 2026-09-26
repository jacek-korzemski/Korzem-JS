export function defineKarta(api) {
  api.define("karta", {
    attributes: ["tytul", "autor"],
    render({ props, innerHTML }) {
      var slot = (innerHTML || "").trim();
      return api.html`
        <article class="karta">
          <p class="karta-autor">${api.escape(props.autor)}</p>
          <h2>${api.escape(props.tytul)}</h2>
          <div class="karta-tresc">${slot}</div>
        </article>
      `;
    }
  });
}

defineKarta(window.Korzem);
