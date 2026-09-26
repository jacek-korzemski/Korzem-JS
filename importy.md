Świetne pytanie — obie sztuczki są możliwe, ale wymagają drobnych zmian w bibliotece. Przeanalizujmy każdą opcję.

## Opcja A: `<script type="text/kaia" src="...">`

Ładowanie zewnętrznego pliku z kodem Kaia. Wymaga rozszerzenia `KaiaScriptManager`.

## Opcja B: `import` w `<script type="text/kaia">`

**Nie zadziała bezpośrednio** — `new Function()` nie obsługuje `import`. Tylko `<script type="module">` (native) obsługuje `import`, ale wtedy tracisz `page` w scope.

## Opcja C (BEST): dedykowana metoda `Kaia.module()` + dynamic `import()`

Native ES modules z pełnym scope Kaia — najczystsze rozwiązanie.

---

Zrobimy **wszystkie trzy** — bo się uzupełniają.

## Zaktualizowany `KaiaScriptManager`

Zastąp klasę w kaia.js:

```javascript
class KaiaScriptManager {
    constructor() {
        this._activeContexts = [];
        this._loadedSources = new Set(); // Cache załadowanych plików
    }

    async executeScripts(container, path) {
        var scripts = container.querySelectorAll(
            'script[type="text/kaia"]:not([data-kaia-executed])'
        );
        if (scripts.length === 0) return;

        // Wykonuj SEKWENCYJNIE żeby zachować kolejność (ważne dla src)
        for (var i = 0; i < scripts.length; i++) {
            var scriptEl = scripts[i];
            scriptEl.setAttribute("data-kaia-executed", "1");

            var src = scriptEl.getAttribute("src");
            var code;

            if (src) {
                // ★ Zewnętrzny plik
                try {
                    code = await this._loadExternal(src);
                } catch (err) {
                    console.error(
                        '[Kaia] Failed to load script "' + src + '":',
                        err
                    );
                    continue;
                }
            } else {
                // Inline
                code = scriptEl.textContent;
            }

            if (!code || !code.trim()) continue;

            await this._runCode(code, path, src || "(inline)");
        }
    }

    async _loadExternal(src) {
        var res = await fetch(src, {
            headers: { Accept: "text/javascript, application/javascript" }
        });
        if (!res.ok) {
            throw new Error("HTTP " + res.status);
        }
        return await res.text();
    }

    async _runCode(code, path, sourceLabel) {
        var context = new KaiaPageContext(path);
        this._activeContexts.push(context);

        try {
            // Sprawdź czy kod używa import — jeśli tak, użyj module loadera
            if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
                await this._runAsModule(code, context, sourceLabel);
            } else {
                await this._runAsFunction(code, context, sourceLabel);
            }
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error(
                '[Kaia] Script error in "' + sourceLabel + '":',
                err
            );
        }
    }

    // Wykonanie jako async function — dostęp do `page`, `Kaia`, `store`
    async _runAsFunction(code, context, sourceLabel) {
        var asyncFn = new Function(
            "page",
            "Kaia",
            "store",
            'return (async () => {\n' + code + '\n})();'
        );
        return asyncFn(context, window.Kaia, window.Kaia.store).catch(function (err) {
            if (err.name === "AbortError") return;
            console.error('[Kaia] Script runtime error in "' + sourceLabel + '":', err);
        });
    }

    // Wykonanie jako natywny ES module (z importami)
    // Trick: wstrzyknij zmienne przez window.__kaiaModuleCtx__
    async _runAsModule(code, context, sourceLabel) {
        // Unikalny ID dla tego kontekstu
        var ctxId = "kaia_ctx_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

        // Umieść kontekst w window żeby moduł mógł go pobrać
        window[ctxId] = {
            page: context,
            Kaia: window.Kaia,
            store: window.Kaia.store
        };

        // Prepend: pobierz zmienne z window
        var wrappedCode =
            "const { page, Kaia, store } = window['" + ctxId + "'];\n" +
            "delete window['" + ctxId + "'];\n" +
            code;

        // Utwórz blob URL dla modułu
        var blob = new Blob([wrappedCode], { type: "text/javascript" });
        var blobUrl = URL.createObjectURL(blob);

        try {
            // Dynamic import wykonuje kod jako ES module
            await import(blobUrl);
        } finally {
            // Cleanup blob URL po chwili (moduł może być cachowany)
            setTimeout(function () {
                URL.revokeObjectURL(blobUrl);
            }, 1000);

            // Cleanup contextu na wypadek błędu
            if (window[ctxId]) delete window[ctxId];
        }
    }

    destroyAll() {
        for (var i = 0; i < this._activeContexts.length; i++) {
            try {
                this._activeContexts[i].destroy();
            } catch (e) {
                console.error("[Kaia] Context destroy error:", e);
            }
        }
        this._activeContexts = [];
    }
}
```

**To wszystko.** Reszta biblioteki bez zmian.

---

## Użycie — 3 sposoby

### 1. Zewnętrzny plik (Opcja A)

```html
<!-- Załaduj z pliku, dostęp do `page`, `Kaia`, `store` -->
<script type="text/kaia" src="/js/home-page.js"></script>
```

**`/js/home-page.js`:**
```javascript
// Nie owija się w żadną funkcję — Kaia sam to zrobi
await Kaia.data("posts", "/api/posts");
page.transient("posts");

page.interval(async () => {
    await Kaia.data("posts", "/api/posts");
}, 30000);

page.onLeave(() => {
    console.log("Bye!");
});
```

### 2. Inline z importami (Opcja C — native ES module)

```html
<script type="text/kaia">
    import { formatDate } from '/js/utils.js';
    import Chart from 'https://cdn.example.com/chart.js';

    const posts = await Kaia.data("posts", "/api/posts");
    posts.forEach(p => {
        console.log(formatDate(p.date));
    });

    page.onLeave(() => Chart.destroy());
</script>
```

Kaia **automatycznie wykryje** `import` i użyje ES module loadera.

### 3. Zewnętrzny plik z importami

```html
<script type="text/kaia" src="/pages/dashboard.js"></script>
```

**`/pages/dashboard.js`:**
```javascript
import { renderChart } from '/js/charts.js';
import { formatCurrency } from '/js/utils.js';

const data = await Kaia.data("sales", "/api/sales");
renderChart(document.getElementById("chart"), data);

page.onLeave(() => {
    console.log("Dashboard zamknięty");
});
```

### 4. Definiowanie komponentów w osobnym pliku

```html
<!-- Ładuj RAZ na całą aplikację, np. w layoucie -->
<script type="text/kaia" src="/components/all.js"></script>
```

**`/components/all.js`:**
```javascript
Kaia.define("user-card", {
    attributes: ["data"],
    render({ data }) {
        if (!data) return `<p>Ładowanie...</p>`;
        return Kaia.html`
            <div class="user-card">
                <h3>${Kaia.escape(data.name)}</h3>
            </div>
        `;
    }
});

Kaia.define("post-list", {
    attributes: ["data"],
    render({ data }) {
        if (!data) return "";
        return Kaia.html`
            <ul>
                ${data.map(p => `<li>${Kaia.escape(p.title)}</li>`)}
            </ul>
        `;
    }
});

// ... więcej komponentów
```

### 5. Modularne komponenty (z importami)

**`/components/index.js`:**
```javascript
import { defineUserCard } from './user-card.js';
import { definePostList } from './post-list.js';
import { defineNavigation } from './navigation.js';

defineUserCard(Kaia);
definePostList(Kaia);
defineNavigation(Kaia);

console.log("Wszystkie komponenty zarejestrowane");
```

**`/components/user-card.js`:**
```javascript
export function defineUserCard(Kaia) {
    Kaia.define("user-card", {
        attributes: ["data"],
        render({ data }) {
            if (!data) return `<p>Ładowanie...</p>`;
            return Kaia.html`
                <div class="user-card">
                    <h3>${Kaia.escape(data.name)}</h3>
                    <p>${Kaia.escape(data.email)}</p>
                </div>
            `;
        }
    });
}
```

**W HTML:**
```html
<script type="text/kaia" src="/components/index.js"></script>
```

---

## Ważne uwagi

### Kolejność wykonania

Skrypty wykonują się **sekwencyjnie** — jeśli plik A rejestruje komponent którego używa plik B, wystarczy dać A pierwszy:

```html
<script type="text/kaia" src="/components/all.js"></script>  <!-- 1. -->
<script type="text/kaia">                                     <!-- 2. -->
    await Kaia.data("user", "/api/user");
</script>
```

### Cache przeglądarki

Zewnętrzne pliki `src="/foo.js"` są cachowane przez przeglądarkę **normalnie** — Kaia używa `fetch()`, więc respektuje HTTP cache. Chcesz cache-bust? Dodaj query:

```html
<script type="text/kaia" src="/components/all.js?v=123"></script>
```

### Nawigacja i cleanup

Skrypty ładowane z `src` też podlegają cyklowi życia strony — kod z pliku `/pages/dashboard.js` zostanie **cały zdestroy**owany przy opuszczeniu strony (interwały, listenery, fetch-e). Tak samo jak inline.

### Detekcja `import` — kiedy uważać

Regex `/^\s*import\s/m` wykryje:
```javascript
import x from 'y';         // ✅ wykryte
import { x } from 'y';     // ✅ wykryte
   import x from 'y';      // ✅ wykryte (whitespace)
```

Ale też fałszywie:
```javascript
// import x from 'y';      // ⚠️ w komentarzu — wykryte (fałszywy alarm)
```

Jeśli chcesz komentarz z `import` — użyj `/* */` zamiast `//`. W praktyce rzadko problem.

### Dynamic import zawsze działa

Nawet w trybie `_runAsFunction` możesz robić:
```javascript
<script type="text/kaia">
    // Bez `import` statement — Kaia użyje function loadera
    const module = await import('/js/heavy.js');
    module.init();
</script>
```

Bo `import()` (funkcja) to nie `import` (statement).

---

## Rekomendowana struktura projektu

```
/
├── kaia.js
├── /components/
│   ├── index.js        ← import wszystkich
│   ├── user-card.js
│   ├── post-list.js
│   └── navigation.js
├── /pages/
│   ├── home.js         ← logika strony /
│   ├── about.js        ← logika /o-mnie
│   └── dashboard.js
└── /layouts/
    └── base.html
```

**`base.html` (na każdej stronie):**
```html
<script src="/kaia.js"></script>
<script type="text/kaia" src="/components/index.js"></script>
```

**`/` (home):**
```html
<script type="text/kaia" src="/pages/home.js"></script>
```

**`/o-mnie`:**
```html
<script type="text/kaia" src="/pages/about.js"></script>
```

Czysto, modularnie, IDE koloruje wszystko poprawnie, cache HTTP działa.