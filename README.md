# korzem.js

**Turn any website into a Single Page App** — one browser file, no build, no framework. Same-origin clicks fetch the next page’s full HTML, diff it against the live DOM, and patch only what changed. Crawlers still get complete documents.

Polish docs: [tutorial `/pl`](https://jacek-korzemski.github.io/Korzem-JS/pl/).

## Install

In `<head>` with `defer` (init waits for `DOMContentLoaded`) or before `</body>`:

```html
<script src="/korzem.js" defer></script>
```

Or from CDN (minified on every push to `main`):

```html
<script src="https://cdn.jsdelivr.net/gh/jacek-korzemski/Korzem-JS@cdn/korzem.min.js" defer></script>
```

Live tutorial (EN): [https://jacek-korzemski.github.io/Korzem-JS/](https://jacek-korzemski.github.io/Korzem-JS/) · PL: [https://jacek-korzemski.github.io/Korzem-JS/pl/](https://jacek-korzemski.github.io/Korzem-JS/pl/). Minified library: `https://jacek-korzemski.github.io/Korzem-JS/korzem.min.js`. Pages source: **GitHub Actions**.

On WordPress, enqueue the same script in the footer. Responses to `X-Korzem: 1` must be full HTML, not a template fragment.

## Navigation

Korzem intercepts same-origin `<a href>` clicks. It leaves alone `#`, `mailto:`, `tel:`, `download`, `target="_blank"`, Ctrl/Cmd clicks, and `data-korzem-ignore`.

After a click:

1. Blocks in `<main>` fade immediately. The bar stays. Hover or focus may prefetch (`Korzem.prefetch`).
2. `fetch` sends `X-Korzem: 1`. Non-`text/html` falls back to the browser.
3. Parser builds a second document. Title and meta update the head.
4. Diff walks children index-by-index: text, attributes, add, remove, tag replace.
5. The same blocks return with new content. Then `pushState` and page scripts.

`data-korzem-fade` fades a whole box even when the node stays and only the middle changes. Height updates while the box is hidden.

Menu `active` is not animated in JS — CSS does the underline (`::after` and `var(--korzem-duration)`, default 300 ms).

`prefers-reduced-motion: reduce` skips fades.

## Page scripts

A normal `<script>` will not run on soft navigation. Page-specific logic uses `type="text/korzem"`. It receives `page`, `Korzem`, and `store`. On leave, `page` clears timers, listeners, and fetches.

```html
<script type="text/korzem">
  const posts = await Korzem.data("posty", "/api/posty");
  page.onLeave(() => {});
</script>
```

A file with `src` works the same. If the code has `import` or `export`, Korzem runs it as a module. Paths `./`, `../`, and `/file` are rewritten to absolute URLs because the module runs from a blob.

## Components and data

Custom tags start with `k-`. Attributes and inner HTML go to `render`.

```html
<k-karta tytul="Notebook">Body</k-karta>
```

```js
Korzem.define("karta", {
  attributes: ["tytul"],
  render({ props, innerHTML }) {
    return "<article>" + props.tytul + innerHTML + "</article>";
  }
});
```

`Korzem.data("posty", url)` stores the value under `posty`. On a component, `data={posty}` passes that value into `render`. Writing to the store refreshes subscribed components.

## Preview

```bash
node server.js
```

Then [http://127.0.0.1:4173](http://127.0.0.1:4173) (EN) and [http://127.0.0.1:4173/pl/](http://127.0.0.1:4173/pl/) (PL).
