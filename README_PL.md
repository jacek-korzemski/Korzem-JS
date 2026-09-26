# korzem.js

**Zamień dowolną stronę w Single Page App** — jeden plik w przeglądarce, bez kompilacji i bez frameworka. Klik w link tej samej domeny pobiera pełny HTML kolejnej strony, porównuje go z drzewem na ekranie i podmienia tylko węzły, które się różnią. Roboty nadal dostają kompletne dokumenty.

[English README](README.md) · [tutorial `/pl`](https://jacek-korzemski.github.io/Korzem-JS/pl/)

## Wpięcie

W `<head>` z `defer` (init czeka na `DOMContentLoaded`) albo przed `</body>`:

```html
<script src="/korzem.js" defer></script>
```

Albo z CDN (minifikacja po każdym pushu na `main`):

```html
<script src="https://cdn.jsdelivr.net/gh/jacek-korzemski/Korzem-JS@cdn/korzem.min.js" defer></script>
```

Lekcje na żywo (EN): [https://jacek-korzemski.github.io/Korzem-JS/](https://jacek-korzemski.github.io/Korzem-JS/) · PL: [https://jacek-korzemski.github.io/Korzem-JS/pl/](https://jacek-korzemski.github.io/Korzem-JS/pl/). Minifikowana biblioteka: `https://jacek-korzemski.github.io/Korzem-JS/korzem.min.js`. Source w Settings → Pages: **GitHub Actions**.

Na WordPressie to samo przez `wp_enqueue_script` w stopce. Odpowiedź na żądanie z nagłówkiem `X-Korzem: 1` ma być pełnym HTML-em, nie kawałkiem szablonu.

## Nawigacja

Biblioteka przejmuje klik w `<a href>` tej samej domeny. Zostawia w spokoju `#`, `mailto:`, `tel:`, `download`, `target="_blank"`, kliki z Ctrl albo Cmd i linki z `data-korzem-ignore`.

Kolejność po kliknięciu:

1. Bloki w `<main>` od razu zanikają. Belka zostaje. Najechanie albo focus linku może pobrać HTML wcześniej (`Korzem.prefetch`).
2. `fetch` idzie z nagłówkiem `X-Korzem: 1`. Odpowiedź inna niż `text/html` oddaje nawigację przeglądarce.
3. Parser składa drugi dokument. Tytuł i meta wchodzą do głowy.
4. Diff idzie po dzieciach, indeks przy indeksie: tekst, atrybuty, dodanie, usunięcie, zamiana tagu.
5. Te same bloki wracają z nową treścią. Potem `pushState` i skrypty nowej strony.

`data-korzem-fade` na boxie zanika całą ramkę, nawet gdy diff zostawia ten sam węzeł i podmienia tylko środek. Wysokość zmienia się, gdy boxa nie widać.

Klasa `active` na linku w menu nie jest animowana skryptem. Podkreślenie robi CSS (`::after` i `var(--korzem-duration)`, domyślnie 300 ms).

`prefers-reduced-motion: reduce` pomija zanik.

## Skrypty strony

Zwykły `<script>` przy przejściu się nie wykona. Logika zależna od podstrony ma typ `text/korzem`. Dostaje `page`, `Korzem` i `store`. Przy wyjściu `page` gasi timery, listenery i fetche.

```html
<script type="text/korzem">
  const posty = await Korzem.data("posty", "/api/posty");
  page.onLeave(() => {});
</script>
```

Plik z `src` działa tak samo. Jeśli w kodzie jest `import` albo `export`, korzem puszcza go jako moduł. Ścieżki `./`, `../` i `/plik` są przepisywane na pełny adres, bo moduł leci z bloba.

## Komponenty i dane

Własny tag zaczyna się od `k-`. Atrybuty i HTML ze środka trafiają do `render`.

```html
<k-karta tytul="Notatnik">Treść</k-karta>
```

```js
Korzem.define("karta", {
  attributes: ["tytul"],
  render({ props, innerHTML }) {
    return "<article>" + props.tytul + innerHTML + "</article>";
  }
});
```

`Korzem.data("posty", url)` trzyma wartość w store pod kluczem `posty`. Na komponencie `data={posty}` podaje tę wartość do `render`. Zapis do store odświeża komponenty, które tego klucza słuchają.

## Podgląd

```bash
node server.js
```

Potem [http://127.0.0.1:4173](http://127.0.0.1:4173) (EN) i [http://127.0.0.1:4173/pl/](http://127.0.0.1:4173/pl/) (PL).
