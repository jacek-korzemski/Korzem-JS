// ============================================================================
// korzem.js — mała biblioteka do nawigacji, komponentów i danych
//
// W <head> z defer (init na DOMContentLoaded) albo przed </body>:
//   <script src="korzem.js" defer></script>
//
// Skrypty stronowe (inline albo src, także z import/export):
//   <script type="text/korzem">
//       const posty = await Korzem.data("posty", "/api/posty");
//       page.onLeave(() => console.log("pa"));
//   </script>
//   <script type="text/korzem" src="/komponenty/index.js"></script>
//
// Komponenty:
//   <k-moj-komponent atrybut="wartość" data={klucz}>innerHTML</k-moj-komponent>
//
// ============================================================================

(function (window, document) {
  "use strict";

  // ========================================================================
  // 1. REACTIVE STORE
  // ========================================================================

  class KorzemStore {
      constructor() {
          this._data = {};
          this._listeners = new Map();
      }

      set(key, value) {
          var old = this._data[key];
          this._data[key] = value;
          if (old !== value) {
              this._notify(key, value, old);
          }
          return value;
      }

      get(key) {
          return this._data[key];
      }

      has(key) {
          return key in this._data;
      }

      delete(key) {
          if (key in this._data) {
              var old = this._data[key];
              delete this._data[key];
              this._notify(key, undefined, old);
          }
      }

      async fetch(key, url, options) {
          var res = await fetch(url, options);
          var contentType = res.headers.get("content-type") || "";
          var data;
          if (contentType.includes("application/json")) {
              data = await res.json();
          } else {
              data = await res.text();
          }
          this.set(key, data);
          return data;
      }

      subscribe(key, callback) {
          if (!this._listeners.has(key)) {
              this._listeners.set(key, new Set());
          }
          this._listeners.get(key).add(callback);

          // Natychmiast wywołaj jeśli dane już istnieją
          if (key in this._data) {
              callback(this._data[key], undefined);
          }

          // Zwróć funkcję unsubscribe
          return function () {
              var set = this._listeners.get(key);
              if (set) set.delete(callback);
          }.bind(this);
      }

      _notify(key, newVal, oldVal) {
          var set = this._listeners.get(key);
          if (!set) return;
          set.forEach(function (cb) {
              try {
                  cb(newVal, oldVal);
              } catch (e) {
                  console.error('[Korzem] Store listener error for "' + key + '":', e);
              }
          });
      }
  }

  // ========================================================================
  // 2. DOM DIFF
  // ========================================================================

  var DomDiff = {

      patch: function (oldParent, newParent) {
          var changed = [];
          this._diffChildren(oldParent, newParent, changed);
          return changed;
      },

      _diffChildren: function (oldParent, newParent, changed) {
          var oldNodes = Array.from(oldParent.childNodes);
          var newNodes = Array.from(newParent.childNodes);
          var max = Math.max(oldNodes.length, newNodes.length);

          for (var i = 0; i < max; i++) {
              var oldNode = oldNodes[i];
              var newNode = newNodes[i];

              // Nowy węzeł nie istnieje — usunąć stary
              if (!newNode) {
                  if (oldNode) {
                      changed.push({
                          type: "remove",
                          node: oldNode,
                          parent: oldParent
                      });
                  }
                  continue;
              }

              // Stary nie istnieje — dodać nowy
              if (!oldNode) {
                  var imported = document.importNode(newNode, true);
                  oldParent.appendChild(imported);
                  changed.push({
                      type: "add",
                      node: imported,
                      parent: oldParent
                  });
                  continue;
              }

              // Różne typy węzłów — zamiana
              if (oldNode.nodeType !== newNode.nodeType) {
                  var imported = document.importNode(newNode, true);
                  oldParent.replaceChild(imported, oldNode);
                  changed.push({
                      type: "replace",
                      node: imported,
                      oldNode: oldNode,
                      parent: oldParent
                  });
                  continue;
              }

              // Węzły tekstowe
              if (oldNode.nodeType === Node.TEXT_NODE) {
                  if (oldNode.textContent !== newNode.textContent) {
                      oldNode.textContent = newNode.textContent;
                      changed.push({
                          type: "text",
                          node: oldNode,
                          parent: oldParent
                      });
                  }
                  continue;
              }

              // Węzły komentarzy
              if (oldNode.nodeType === Node.COMMENT_NODE) {
                  if (oldNode.textContent !== newNode.textContent) {
                      oldNode.textContent = newNode.textContent;
                  }
                  continue;
              }

              // Element nodes
              if (oldNode.nodeType === Node.ELEMENT_NODE) {

                  // Ignoruj <script> — zarządzane osobno
                  if (oldNode.tagName === "SCRIPT") {
                      continue;
                  }

                  // Różne tagi — zamiana całkowita
                  if (oldNode.tagName !== newNode.tagName) {
                      var imported = document.importNode(newNode, true);
                      oldParent.replaceChild(imported, oldNode);
                      changed.push({
                          type: "replace",
                          node: imported,
                          oldNode: oldNode,
                          parent: oldParent
                      });
                      continue;
                  }

                  // Te same tagi — porównaj atrybuty
                  var attrNames = this._diffAttributes(oldNode, newNode);
                  if (attrNames) {
                      changed.push({
                          type: "attributes",
                          node: oldNode,
                          parent: oldParent,
                          names: attrNames
                      });
                  }

                  // Elementy z k- prefiksem — porównaj outerHTML, jeśli różne to zamiana
                  if (oldNode.tagName.startsWith("K-")) {
                      if (oldNode.outerHTML !== newNode.outerHTML) {
                          var imported = document.importNode(newNode, true);
                          oldParent.replaceChild(imported, oldNode);
                          changed.push({
                              type: "replace",
                              node: imported,
                              oldNode: oldNode,
                              parent: oldParent
                          });
                      }
                  } else {
                      // Zwykłe elementy — rekursja
                      this._diffChildren(oldNode, newNode, changed);
                  }
              }
          }

          // Usunięcie nadmiarowych starych węzłów
          while (oldParent.childNodes.length > newNodes.length) {
              var extra = oldParent.lastChild;
              if (extra) {
                  changed.push({
                      type: "remove",
                      node: extra,
                      parent: oldParent
                  });
                  oldParent.removeChild(extra);
              }
          }
      },

      _diffAttributes: function (oldEl, newEl) {
          var changed = false;
          var names = [];

          // Usunąć atrybuty których nie ma w nowym
          var oldAttrs = Array.from(oldEl.attributes);
          for (var i = 0; i < oldAttrs.length; i++) {
              if (!newEl.hasAttribute(oldAttrs[i].name)) {
                  oldEl.removeAttribute(oldAttrs[i].name);
                  changed = true;
                  names.push(oldAttrs[i].name);
              }
          }

          // Ustawić / nadpisać atrybuty z nowego
          var newAttrs = Array.from(newEl.attributes);
          for (var j = 0; j < newAttrs.length; j++) {
              if (oldEl.getAttribute(newAttrs[j].name) !== newAttrs[j].value) {
                  oldEl.setAttribute(newAttrs[j].name, newAttrs[j].value);
                  changed = true;
                  if (names.indexOf(newAttrs[j].name) === -1) {
                      names.push(newAttrs[j].name);
                  }
              }
          }

          return changed ? names : null;
      },

      _phrasing: {
          A: 1, ABBR: 1, B: 1, CITE: 1, CODE: 1, EM: 1, I: 1,
          KBD: 1, MARK: 1, SAMP: 1, SMALL: 1, SPAN: 1, STRONG: 1,
          SUB: 1, SUP: 1, TIME: 1, VAR: 1
      },

      // Odczyt bez zapisu — te same indeksy dzieci co patch.
      preview: function (oldParent, newParent) {
          var found = [];
          var leaving = [];
          this._previewChildren(oldParent, newParent, found, leaving);
          var boxes = this._collapseToParents(found);
          var fade = boxes.slice();
          for (var i = 0; i < leaving.length; i++) {
              if (!this._inside(leaving[i], fade)) fade.push(leaving[i]);
          }
          return { boxes: boxes, fade: fade };
      },

      _previewChildren: function (oldParent, newParent, found, leaving) {
          var oldNodes = Array.from(oldParent.childNodes);
          var newNodes = Array.from(newParent.childNodes);
          var max = Math.max(oldNodes.length, newNodes.length);

          for (var i = 0; i < max; i++) {
              var oldNode = oldNodes[i];
              var newNode = newNodes[i];

              if (!newNode) {
                  this._markLeaving(oldNode, found, leaving);
                  continue;
              }
              if (!oldNode) continue;

              if (oldNode.nodeType !== newNode.nodeType) {
                  this._markLeaving(oldNode, found, leaving);
                  continue;
              }

              if (oldNode.nodeType === Node.TEXT_NODE) {
                  if (oldNode.textContent.trim() !== newNode.textContent.trim()) {
                      var box = this._nearestBox(oldNode.parentElement);
                      if (box) found.push(box);
                  }
                  continue;
              }

              if (oldNode.nodeType !== Node.ELEMENT_NODE) continue;
              if (oldNode.tagName === "SCRIPT") continue;

              if (oldNode.tagName !== newNode.tagName) {
                  this._markLeaving(oldNode, found, leaving);
                  continue;
              }

              if (oldNode.tagName.startsWith("K-")) {
                  if (oldNode.outerHTML !== newNode.outerHTML) {
                      this._markLeaving(oldNode, found, leaving);
                  }
                  continue;
              }

              this._previewChildren(oldNode, newNode, found, leaving);
          }
      },

      _markLeaving: function (node, found, leaving) {
          if (!node) return;
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== "SCRIPT") {
              leaving.push(node);
              return;
          }
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              var box = this._nearestBox(node.parentElement);
              if (box) found.push(box);
          }
      },

      _nearestBox: function (el) {
          if (!el || (el.closest && el.closest("header, #sesja"))) return null;
          while (el && el.nodeType === Node.ELEMENT_NODE) {
              if (
                  el.id === "sesja" ||
                  el.tagName === "HEADER" ||
                  el.tagName === "BODY" ||
                  el.tagName === "HTML"
              ) {
                  return null;
              }
              if (!this._phrasing[el.tagName]) return el;
              el = el.parentElement;
          }
          return null;
      },

      _collapseToParents: function (nodes) {
          var unique = [];
          for (var i = 0; i < nodes.length; i++) {
              if (unique.indexOf(nodes[i]) === -1) unique.push(nodes[i]);
          }
          var kept = [];
          for (var j = 0; j < unique.length; j++) {
              if (!this._inside(unique[j], unique)) kept.push(unique[j]);
          }
          return kept;
      },

      _inside: function (node, list) {
          for (var i = 0; i < list.length; i++) {
              if (list[i] !== node && list[i].contains(node)) return true;
          }
          return false;
      }
  };

  // ========================================================================
  // 3. ANIMATIONS
  // ========================================================================

  var KorzemAnimations = {

      duration: 300,

      _generation: 0,

      syncDuration: function () {
          document.documentElement.style.setProperty(
              "--korzem-duration",
              this.duration + "ms"
          );
      },

      _reducedMotion: function () {
          return (
              window.matchMedia &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches
          );
      },

      fadeOut: function (nodes) {
          this._generation++;
          var live = this._elements(nodes);
          if (this._reducedMotion() || live.length === 0) {
              return Promise.resolve();
          }
          var dur = this.duration;
          for (var i = 0; i < live.length; i++) {
              live[i].style.transition = "opacity " + dur + "ms ease";
          }
          live[0].offsetHeight;
          for (var j = 0; j < live.length; j++) {
              live[j].style.opacity = "0";
          }
          return this._wait(dur);
      },

      fadeIn: function (nodes) {
          var gen = this._generation;
          var live = this._elements(nodes);
          if (live.length === 0) return;
          if (this._reducedMotion()) {
              this._clearOpacity(live);
              return;
          }
          var dur = this.duration;
          var self = this;
          // Diff zdejmuje atrybut style, więc opacity 0 z zaniku już nie ma.
          // Najpierw twardo zero bez przejścia, a cel „1” dopiero w następnej
          // klatce — inaczej przeglądarka nie wznawia animacji od zera.
          for (var i = 0; i < live.length; i++) {
              live[i].style.transition = "none";
              live[i].style.opacity = "0";
          }
          live[0].offsetHeight;
          requestAnimationFrame(function () {
              if (self._generation !== gen) return;
              var still = self._elements(live);
              if (!still.length) return;
              for (var j = 0; j < still.length; j++) {
                  still[j].style.transition = "opacity " + dur + "ms ease";
                  still[j].style.opacity = "1";
              }
              setTimeout(function () {
                  if (self._generation !== gen) return;
                  self._clearOpacity(still);
              }, dur + 50);
          });
      },

      animateChanges: function (changes, fadingBoxes) {
          var boxes = fadingBoxes || [];
          for (var i = 0; i < changes.length; i++) {
              var change = changes[i];
              if (change.type !== "add" && change.type !== "replace") continue;
              if (this._insideBox(change.node, boxes)) continue;
              this._animateIn(change.node);
          }
      },

      _insideBox: function (node, boxes) {
          if (!node) return false;
          for (var i = 0; i < boxes.length; i++) {
              if (boxes[i] === node || (boxes[i].contains && boxes[i].contains(node))) {
                  return true;
              }
          }
          return false;
      },

      _elements: function (nodes) {
          var live = [];
          for (var i = 0; i < nodes.length; i++) {
              var node = nodes[i];
              if (
                  node &&
                  node.nodeType === Node.ELEMENT_NODE &&
                  node.isConnected &&
                  live.indexOf(node) === -1
              ) {
                  live.push(node);
              }
          }
          return live;
      },

      _clearOpacity: function (nodes) {
          for (var i = 0; i < nodes.length; i++) {
              if (!nodes[i].isConnected) continue;
              nodes[i].style.removeProperty("opacity");
              nodes[i].style.removeProperty("transition");
          }
      },

      _animateIn: function (node) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (this._reducedMotion()) return;
          var gen = this._generation;
          var self = this;
          var dur = this.duration;
          node.style.opacity = "0";
          node.style.transform = "translateY(10px)";
          node.style.transition =
              "opacity " + dur + "ms ease, transform " + dur + "ms ease";
          node.offsetHeight;
          node.style.opacity = "1";
          node.style.transform = "translateY(0)";
          setTimeout(function () {
              if (self._generation !== gen || !node.isConnected) return;
              node.style.removeProperty("opacity");
              node.style.removeProperty("transform");
              node.style.removeProperty("transition");
          }, dur + 50);
      },

      _wait: function (ms) {
          return new Promise(function (resolve) {
              setTimeout(resolve, ms);
          });
      }
  };

  // ========================================================================
  // 4. PAGE CONTEXT — cykl życia skryptów stronowych
  // ========================================================================

  class KorzemPageContext {
      constructor(path) {
          this.path = path;
          this._intervals = [];
          this._timeouts = [];
          this._listeners = [];
          this._onLeaveCallbacks = [];
          this._abortController = new AbortController();
          this._storeUnsubscribers = [];
          this._transientKeys = null;
          this._active = true;
      }

      // --- Zarządzane timery ---

      interval(fn, ms) {
          if (!this._active) return null;
          var id = setInterval(fn, ms);
          this._intervals.push(id);
          return id;
      }

      timeout(fn, ms) {
          if (!this._active) return null;
          var self = this;
          var id = setTimeout(function () {
              self._timeouts = self._timeouts.filter(function (t) {
                  return t !== id;
              });
              if (self._active) fn();
          }, ms);
          this._timeouts.push(id);
          return id;
      }

      clearInterval(id) {
          clearInterval(id);
          this._intervals = this._intervals.filter(function (i) {
              return i !== id;
          });
      }

      clearTimeout(id) {
          clearTimeout(id);
          this._timeouts = this._timeouts.filter(function (t) {
              return t !== id;
          });
      }

      // --- Zarządzane event listenery ---

      on(target, event, handler, options) {
          if (!this._active) return;
          var opts = Object.assign({}, options || {}, {
              signal: this._abortController.signal
          });
          target.addEventListener(event, handler, opts);
          this._listeners.push({
              target: target,
              event: event,
              handler: handler
          });
      }

      // --- Zarządzane subskrypcje store ---

      subscribe(key, callback) {
          if (!this._active) return;
          var unsub = window.Korzem.store.subscribe(key, callback);
          this._storeUnsubscribers.push(unsub);
          return unsub;
      }

      // --- Zarządzany fetch (z abort przy nawigacji) ---

      async fetch(url, options) {
          if (!this._active) {
              throw new DOMException("Page context destroyed", "AbortError");
          }
          var opts = Object.assign({}, options || {}, {
              signal: this._abortController.signal
          });
          return fetch(url, opts);
      }

      // --- Cleanup callback ---

      onLeave(fn) {
          this._onLeaveCallbacks.push(fn);
      }

      // --- Oznacz klucz store jako tymczasowy ---

      transient(key) {
          if (!this._transientKeys) this._transientKeys = new Set();
          this._transientKeys.add(key);
      }

      // --- Destroy ---

      destroy() {
          this._active = false;

          // 1. Abort wszystkie fetch-e w locie
          this._abortController.abort();

          // 2. Interwały
          for (var i = 0; i < this._intervals.length; i++) {
              clearInterval(this._intervals[i]);
          }
          this._intervals = [];

          // 3. Timeouty
          for (var i = 0; i < this._timeouts.length; i++) {
              clearTimeout(this._timeouts[i]);
          }
          this._timeouts = [];

          // 4. Event listenery — AbortController je usunął,
          //    czyścimy tylko referencje
          this._listeners = [];

          // 5. Store subskrypcje
          for (var i = 0; i < this._storeUnsubscribers.length; i++) {
              this._storeUnsubscribers[i]();
          }
          this._storeUnsubscribers = [];

          // 6. onLeave callbacki
          for (var i = 0; i < this._onLeaveCallbacks.length; i++) {
              try {
                  this._onLeaveCallbacks[i]();
              } catch (e) {
                  console.error("[Korzem] onLeave error:", e);
              }
          }
          this._onLeaveCallbacks = [];

          // 7. Tymczasowe klucze store
          if (this._transientKeys) {
              this._transientKeys.forEach(function (key) {
                  window.Korzem.store.delete(key);
              });
              this._transientKeys = null;
          }
      }
  }

  // ========================================================================
  // 5. SCRIPT MANAGER — <script type="text/korzem">
  // ========================================================================

  class KorzemScriptManager {
      constructor() {
          this._activeContexts = [];
      }

      async executeScripts(container, path) {
          var scripts = container.querySelectorAll(
              'script[type="text/korzem"]:not([data-korzem-executed])'
          );
          if (scripts.length === 0) return;

          for (var i = 0; i < scripts.length; i++) {
              var scriptEl = scripts[i];
              scriptEl.setAttribute("data-korzem-executed", "1");

              var src = scriptEl.getAttribute("src");
              var code;

              if (src) {
                  try {
                      code = await this._loadExternal(src);
                  } catch (err) {
                      console.error(
                          '[Korzem] Failed to load script "' + src + '":',
                          err
                      );
                      continue;
                  }
              } else {
                  code = scriptEl.textContent;
              }

              if (!code || !code.trim()) continue;

              await this._runCode(code, path, src || "(inline)", src);
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

      async _runCode(code, path, sourceLabel, src) {
          var context = new KorzemPageContext(path);
          this._activeContexts.push(context);

          var baseUrl = src
              ? new URL(src, window.location.href).href
              : window.location.href;

          try {
              if (this._hasModuleSyntax(code)) {
                  await this._runAsModule(code, context, sourceLabel, baseUrl);
              } else {
                  await this._runAsFunction(code, context, sourceLabel);
              }
          } catch (err) {
              if (err.name === "AbortError") return;
              console.error(
                  '[Korzem] Script error in "' + sourceLabel + '":',
                  err
              );
          }
      }

      async _runAsFunction(code, context, sourceLabel) {
          var asyncFn = new Function(
              "page",
              "Korzem",
              "store",
              "return (async () => {\n" +
                  code +
                  "\n//# sourceURL=" +
                  sourceLabel +
                  "\n})();"
          );
          return asyncFn(context, window.Korzem, window.Korzem.store).catch(
              function (err) {
                  if (err.name === "AbortError") return;
                  console.error(
                      '[Korzem] Script runtime error in "' + sourceLabel + '":',
                      err
                  );
              }
          );
      }

      async _runAsModule(code, context, sourceLabel, baseUrl) {
          var ctxId =
              "korzem_ctx_" +
              Date.now() +
              "_" +
              Math.floor(Math.random() * 100000);

          window[ctxId] = {
              page: context,
              Korzem: window.Korzem,
              store: window.Korzem.store
          };

          var wrappedCode =
              "const { page, Korzem, store } = window['" +
              ctxId +
              "'];\n" +
              "delete window['" +
              ctxId +
              "'];\n" +
              this._rewriteSpecifiers(code, baseUrl) +
              "\n//# sourceURL=" +
              sourceLabel +
              "\n";

          var blob = new Blob([wrappedCode], { type: "text/javascript" });
          var blobUrl = URL.createObjectURL(blob);

          try {
              await import(blobUrl);
          } finally {
              setTimeout(function () {
                  URL.revokeObjectURL(blobUrl);
              }, 1000);
              if (window[ctxId]) delete window[ctxId];
          }
      }

      _hasModuleSyntax(code) {
          var stripped = this._stripForDetection(code);
          if (/(^|[;\n])\s*export\b/.test(stripped)) return true;
          var re = /(^|[;\n])\s*import\b\s*(\(|['"{*]|[A-Za-z_$])/g;
          var match;
          while ((match = re.exec(stripped))) {
              if (match[2] !== "(") return true;
          }
          return false;
      }

      _stripForDetection(code) {
          var out = "";
          var i = 0;
          while (i < code.length) {
              var end = this._skipNoise(code, i);
              var c = code.charAt(i);
              if (end > i && c === "/") {
                  i = end;
                  continue;
              }
              if (end > i) {
                  out += c + " " + code.charAt(end - 1);
                  i = end;
                  continue;
              }
              out += c;
              i++;
          }
          return out;
      }

      _rewriteSpecifiers(code, baseUrl) {
          var out = "";
          var i = 0;
          var n = code.length;
          while (i < n) {
              var end = this._skipNoise(code, i);
              if (end > i) {
                  out += code.slice(i, end);
                  i = end;
                  continue;
              }
              var rewritten = this._tryRewriteImport(code, i, baseUrl);
              if (rewritten) {
                  out += rewritten.text;
                  i = rewritten.end;
                  continue;
              }
              out += code.charAt(i);
              i++;
          }
          return out;
      }

      _tryRewriteImport(code, i, baseUrl) {
          function absolute(spec) {
              if (
                  spec.indexOf("./") === 0 ||
                  spec.indexOf("../") === 0 ||
                  spec.charAt(0) === "/"
              ) {
                  try {
                      return new URL(spec, baseUrl).href;
                  } catch (e) {
                      return spec;
                  }
              }
              return spec;
          }

          function quoted(str) {
              return str.quote + absolute(str.value) + str.quote;
          }

          if (this._isKeyword(code, i, "from")) {
              var j = i + 4;
              while (j < code.length && /\s/.test(code.charAt(j))) j++;
              var fromStr = this._readString(code, j);
              if (!fromStr) return null;
              return {
                  text: code.slice(i, j) + quoted(fromStr),
                  end: fromStr.end
              };
          }

          if (this._isKeyword(code, i, "import")) {
              var k = i + 6;
              while (k < code.length && /\s/.test(code.charAt(k))) k++;
              if (code.charAt(k) === "(") {
                  var q = k + 1;
                  while (q < code.length && /\s/.test(code.charAt(q))) q++;
                  var callStr = this._readString(code, q);
                  if (!callStr) return null;
                  var p = callStr.end;
                  while (p < code.length && /\s/.test(code.charAt(p))) p++;
                  if (code.charAt(p) === ")") p++;
                  return {
                      text: "import(" + quoted(callStr) + ")",
                      end: p
                  };
              }
              var bare = this._readString(code, k);
              if (!bare) return null;
              return {
                  text: code.slice(i, k) + quoted(bare),
                  end: bare.end
              };
          }

          return null;
      }

      _isKeyword(code, i, word) {
          if (code.substr(i, word.length) !== word) return false;
          var before = i > 0 ? code.charAt(i - 1) : "";
          var after = code.charAt(i + word.length);
          if (before && /[A-Za-z0-9_$]/.test(before)) return false;
          if (after && /[A-Za-z0-9_$]/.test(after)) return false;
          return true;
      }

      _readString(code, i) {
          var q = code.charAt(i);
          if (q !== "'" && q !== '"') return null;
          var j = i + 1;
          while (j < code.length) {
              if (code.charAt(j) === "\\") {
                  j += 2;
                  continue;
              }
              if (code.charAt(j) === q) {
                  return {
                      quote: q,
                      value: code.slice(i + 1, j),
                      end: j + 1
                  };
              }
              j++;
          }
          return null;
      }

      _skipNoise(code, i) {
          var c = code.charAt(i);
          var c2 = code.charAt(i + 1);
          if (c === "/" && c2 === "/") {
              var nl = code.indexOf("\n", i);
              return nl === -1 ? code.length : nl;
          }
          if (c === "/" && c2 === "*") {
              var end = code.indexOf("*/", i + 2);
              return end === -1 ? code.length : end + 2;
          }
          if (c === "'" || c === '"' || c === "`") {
              return this._endOfString(code, i);
          }
          return i;
      }

      _endOfString(code, i) {
          var q = code.charAt(i);
          var j = i + 1;
          var n = code.length;
          while (j < n) {
              var c = code.charAt(j);
              if (c === "\\") {
                  j += 2;
                  continue;
              }
              if (q === "`" && c === "$" && code.charAt(j + 1) === "{") {
                  j = this._endOfTemplateExpr(code, j + 2);
                  continue;
              }
              if (c === q) return j + 1;
              j++;
          }
          return n;
      }

      _endOfTemplateExpr(code, j) {
          var depth = 1;
          var n = code.length;
          while (j < n && depth > 0) {
              var skipped = this._skipNoise(code, j);
              if (skipped > j) {
                  j = skipped;
                  continue;
              }
              var c = code.charAt(j);
              if (c === "{") depth++;
              else if (c === "}") depth--;
              j++;
          }
          return j;
      }

      destroyAll() {
          for (var i = 0; i < this._activeContexts.length; i++) {
              try {
                  this._activeContexts[i].destroy();
              } catch (e) {
                  console.error("[Korzem] Context destroy error:", e);
              }
          }
          this._activeContexts = [];
      }
  }

  // ========================================================================
  // 6. ROUTER — Client-side navigation
  // ========================================================================

  class KorzemRouter {
      constructor(korzem) {
          this.korzem = korzem;
          this._navigating = false;
          this._cache = new Map();
          this._inflight = new Map();
          this._init();
      }

      _init() {
          var self = this;

          document.addEventListener("click", function (e) {
              if (e.defaultPrevented) return;
              if (e.button !== 0) return;
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              var link = e.target.closest("a[href]");
              if (!self._isAppLink(link)) return;
              e.preventDefault();
              self.navigate(link.getAttribute("href"));
          });

          // Prefetch: pointerenter nie bąbelkuje, więc pointerover + relatedTarget.
          document.addEventListener("pointerover", function (e) {
              var link = e.target.closest && e.target.closest("a[href]");
              if (!link) return;
              if (e.relatedTarget && link.contains(e.relatedTarget)) return;
              self._prefetchLink(link);
          });

          document.addEventListener("focusin", function (e) {
              var link = e.target.closest && e.target.closest("a[href]");
              self._prefetchLink(link);
          });

          window.addEventListener("popstate", function () {
              self._loadPage(
                  window.location.pathname + window.location.search,
                  false
              );
          });
      }

      _isAppLink(link) {
          if (!link) return false;
          var href = link.getAttribute("href");
          if (!href) return false;
          if (href.charAt(0) === "#") return false;
          if (href.indexOf("mailto:") === 0) return false;
          if (href.indexOf("tel:") === 0) return false;
          if (href.indexOf("javascript:") === 0) return false;
          if (link.target === "_blank") return false;
          if (link.hasAttribute("data-korzem-ignore")) return false;
          if (link.hasAttribute("download")) return false;
          try {
              var url = new URL(href, window.location.href);
              if (url.origin !== window.location.origin) return false;
          } catch (err) {
              return false;
          }
          return true;
      }

      _linkPath(link) {
          var url = new URL(link.getAttribute("href"), window.location.href);
          return url.pathname + url.search;
      }

      _prefetchLink(link) {
          if (!this._isAppLink(link)) return;
          var path = this._linkPath(link);
          if (path === window.location.pathname + window.location.search) return;
          this._fetchPage(path);
      }

      // Bloki treści znane bez nowego HTML — belka i #sesja zostają.
      // data-korzem-fade zanika cały box, nawet gdy diff zostawia ten sam węzeł.
      _immediateFadeNodes() {
          var nodes = [];
          var main = document.querySelector("main");
          if (main) {
              var children = main.children;
              for (var i = 0; i < children.length; i++) {
                  if (children[i].tagName === "SCRIPT") continue;
                  nodes.push(children[i]);
              }
          }
          var marked = document.querySelectorAll("[data-korzem-fade]");
          for (var j = 0; j < marked.length; j++) {
              var el = marked[j];
              if (el.closest && el.closest("header, #sesja")) continue;
              if (this._covered(el, nodes)) continue;
              nodes.push(el);
          }
          return nodes;
      }

      _covered(node, list) {
          for (var i = 0; i < list.length; i++) {
              if (
                  list[i] === node ||
                  (list[i].contains && list[i].contains(node))
              ) {
                  return true;
              }
          }
          return false;
      }

      _yield() {
          var scheduler = window.scheduler;
          if (scheduler && typeof scheduler.yield === "function") {
              return scheduler.yield();
          }
          return new Promise(function (resolve) {
              requestAnimationFrame(function () {
                  setTimeout(resolve, 0);
              });
          });
      }

      async navigate(url, push) {
          if (push === undefined) push = true;
          if (this._navigating) return;

          var resolved = new URL(url, window.location.href);
          var path = resolved.pathname + resolved.search;

          // Nie nawiguj do tej samej strony
          if (path === window.location.pathname + window.location.search) {
              return;
          }

          await this._loadPage(path, push);
      }

      async _loadPage(path, push) {
          if (this._navigating) return;
          this._navigating = true;

          try {
              document.dispatchEvent(
                  new CustomEvent("korzem:navigate:start", {
                      detail: { path: path }
                  })
              );

              // Zanik treści w tej samej turze co klik, zanim wróci sieć.
              var early = this._immediateFadeNodes();
              var fadeEarly = early.length
                  ? KorzemAnimations.fadeOut(early)
                  : Promise.resolve();

              this.korzem.scripts.destroyAll();

              var html = await this._fetchPage(path);
              if (!html) {
                  KorzemAnimations._clearOpacity(early);
                  window.location.href = path;
                  return;
              }

              await this._yield();

              var parser = new DOMParser();
              var newDoc = parser.parseFromString(html, "text/html");

              // Title
              var newTitle = newDoc.querySelector("title");
              if (newTitle) {
                  document.title = newTitle.textContent;
              }

              // Meta tagi
              this._diffHead(newDoc);

              // Wyciągnij <script type="text/korzem"> PRZED diffem (z src)
              var newKScripts = newDoc.querySelectorAll(
                  'script[type="text/korzem"]'
              );
              var scriptPayloads = [];
              newKScripts.forEach(function (s) {
                  scriptPayloads.push({
                      src: s.getAttribute("src"),
                      code: s.textContent
                  });
                  s.parentNode.removeChild(s);
              });

              // Wyciągnij zwykłe <script> z body nowego DOC (nie diffujemy ich)
              var newRegularScripts = newDoc.body.querySelectorAll(
                  'script:not([type="text/korzem"])'
              );
              newRegularScripts.forEach(function (s) {
                  s.parentNode.removeChild(s);
              });

              // Stare skrypty korzem nie wchodzą w diff (SCRIPT jest pomijany),
              // więc trzeba je usunąć, inaczej odpaliłyby się razem z nowymi.
              var liveScripts = document.querySelectorAll(
                  'script[type="text/korzem"]'
              );
              liveScripts.forEach(function (s) {
                  s.parentNode.removeChild(s);
              });

              await this._yield();

              var preview = DomDiff.preview(document.body, newDoc.body);
              var extra = [];
              for (var n = 0; n < preview.fade.length; n++) {
                  var node = preview.fade[n];
                  if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
                  if (this._covered(node, early)) continue;
                  if (node.closest && node.closest("header, #sesja")) continue;
                  extra.push(node);
              }
              var fadeExtra = extra.length
                  ? KorzemAnimations.fadeOut(extra)
                  : Promise.resolve();

              await this._yield();
              await Promise.all([fadeEarly, fadeExtra]);

              var changes = DomDiff.patch(document.body, newDoc.body);

              if (push) {
                  window.history.pushState({}, "", path);
              }

              // Skok scrolla, póki treść jest jeszcze przezroczysta.
              window.scrollTo(0, 0);

              var returning = early.concat(extra);
              KorzemAnimations.fadeIn(returning);
              KorzemAnimations.animateChanges(
                  changes,
                  preview.boxes.concat(early)
              );

              // Wstrzyknij <script type="text/korzem"> z nowej strony
              for (var i = 0; i < scriptPayloads.length; i++) {
                  var payload = scriptPayloads[i];
                  var el = document.createElement("script");
                  el.type = "text/korzem";
                  if (payload.src) {
                      el.setAttribute("src", payload.src);
                  } else {
                      el.textContent = payload.code;
                  }
                  document.body.appendChild(el);
              }

              // Re-upgrade komponentów
              this.korzem._upgradeComponents(document.body);

              await this.korzem.scripts.executeScripts(document, path);

              document.dispatchEvent(
                  new CustomEvent("korzem:navigate:end", {
                      detail: { path: path, changes: changes }
                  })
              );
          } catch (err) {
              console.error("[Korzem] Navigation error:", err);
              window.location.href = path;
          } finally {
              this._navigating = false;
          }
      }

      async _fetchPage(path) {
          if (this._cache.has(path)) {
              return this._cache.get(path);
          }
          if (this._inflight.has(path)) {
              return this._inflight.get(path);
          }

          var self = this;
          var job = this._requestPage(path);
          this._inflight.set(path, job);
          job.then(
              function () {
                  self._inflight.delete(path);
              },
              function () {
                  self._inflight.delete(path);
              }
          );
          return job;
      }

      async _requestPage(path) {
          var res = await fetch(path, {
              headers: {
                  "X-Korzem": "1",
                  Accept: "text/html"
              }
          });

          if (!res.ok) return null;

          var contentType = res.headers.get("content-type") || "";
          if (contentType.indexOf("text/html") === -1) return null;

          var html = await res.text();

          if (this._cache.size > 50) {
              var firstKey = this._cache.keys().next().value;
              this._cache.delete(firstKey);
          }
          this._cache.set(path, html);

          return html;
      }

      _diffHead(newDoc) {
          var oldMetas = document.head.querySelectorAll(
              "meta[name], meta[property]"
          );
          var newMetas = newDoc.head.querySelectorAll(
              "meta[name], meta[property]"
          );

          var newMetaMap = new Map();
          newMetas.forEach(function (m) {
              var key =
                  m.getAttribute("name") || m.getAttribute("property");
              newMetaMap.set(key, m.getAttribute("content"));
          });

          oldMetas.forEach(function (m) {
              var key =
                  m.getAttribute("name") || m.getAttribute("property");
              if (newMetaMap.has(key)) {
                  m.setAttribute("content", newMetaMap.get(key));
                  newMetaMap.delete(key);
              }
          });

          // Dodaj nowe meta
          newMetaMap.forEach(function (content, key) {
              var meta = document.createElement("meta");
              if (key.startsWith("og:") || key.startsWith("twitter:")) {
                  meta.setAttribute("property", key);
              } else {
                  meta.setAttribute("name", key);
              }
              meta.setAttribute("content", content);
              document.head.appendChild(meta);
          });
      }

      clearCache() {
          this._cache.clear();
      }
  }

  // ========================================================================
  // 7. WEB COMPONENTS — system komponentów <k-*>
  // ========================================================================

  var componentRegistry = new Map();

  class KorzemComponent extends HTMLElement {
      constructor() {
          super();
          this._unsubscribers = [];
          this._mounted = false;
          this._shadow = null;
          this._originalInnerHTML = null;
          this._definition = null;
          this._props = {};
          this._dataKey = null;
      }

      connectedCallback() {
          var self = this;

          if (!window.Korzem || !window.Korzem._ready) {
              requestAnimationFrame(function () {
                  self.connectedCallback();
              });
              return;
          }

          var definition = componentRegistry.get(
              this.tagName.toLowerCase()
          );
          if (definition) {
              this._definition = definition;
          }

          // Zachowaj oryginalny innerHTML (slot)
          if (this._originalInnerHTML === null) {
              this._originalInnerHTML = this.innerHTML;
          }

          this._props = this._collectProps();
          this._bindData();

          this._mounted = true;
          this.render();

          if (this._definition && this._definition.connected) {
              this._definition.connected.call(this);
          }
      }

      disconnectedCallback() {
          for (var i = 0; i < this._unsubscribers.length; i++) {
              this._unsubscribers[i]();
          }
          this._unsubscribers = [];
          this._mounted = false;

          if (this._definition && this._definition.disconnected) {
              this._definition.disconnected.call(this);
          }
      }

      attributeChangedCallback(name, oldVal, newVal) {
          if (!this._mounted) return;
          this._props = this._collectProps();
          this._bindData();
          this.render();

          if (this._definition && this._definition.attributeChanged) {
              this._definition.attributeChanged.call(
                  this,
                  name,
                  oldVal,
                  newVal
              );
          }
      }

      static get observedAttributes() {
          return [];
      }

      _collectProps() {
          var props = {};
          var attrs = Array.from(this.attributes);
          for (var i = 0; i < attrs.length; i++) {
              var name = this._camelCase(attrs[i].name);
              props[name] = this._parseAttrValue(attrs[i].value);
          }
          return props;
      }

      _camelCase(str) {
          return str.replace(/-([a-z])/g, function (_, c) {
              return c.toUpperCase();
          });
      }

      _parseAttrValue(val) {
          if (val === "true") return true;
          if (val === "false") return false;
          if (val === "null") return null;
          if (val !== "" && !isNaN(val) && val.trim() !== "") {
              return Number(val);
          }
          if (
              (val.startsWith("{") && val.endsWith("}")) ||
              (val.startsWith("[") && val.endsWith("]"))
          ) {
              // Sprawdź czy to referencja do store: data="{klucz}"
              // Jeśli zawiera tylko jedną wartość bez cudzysłowów to klucz store
              var inner = val.slice(1, -1).trim();
              if (
                  val.startsWith("{") &&
                  val.endsWith("}") &&
                  !inner.includes('"') &&
                  !inner.includes("'") &&
                  !inner.includes(":")
              ) {
                  // To jest referencja store, nie JSON
                  return val;
              }
              try {
                  return JSON.parse(val);
              } catch (e) {
                  // nie JSON
              }
          }
          return val;
      }

      _bindData() {
          // Odłącz stare subskrypcje
          for (var i = 0; i < this._unsubscribers.length; i++) {
              this._unsubscribers[i]();
          }
          this._unsubscribers = [];

          // Szukaj atrybutu "data" z referencją store: data="{klucz}"
          var dataAttr = this.getAttribute("data");
          if (!dataAttr) return;

          // Sprawdź format {klucz}
          var match = dataAttr.match(/^\{(.+)\}$/);
          if (!match) return;

          var key = match[1].trim();
          if (!key) return;

          this._dataKey = key;

          var self = this;
          var unsub = window.Korzem.store.subscribe(key, function (newVal) {
              self._props.data = newVal;
              if (self._mounted) {
                  self.render();
              }
          });

          this._unsubscribers.push(unsub);

          // Pobierz aktualne dane
          var current = window.Korzem.store.get(key);
          if (current !== undefined) {
              this._props.data = current;
          }
      }

      render() {
          if (!this._definition || !this._definition.render) return;

          var html = this._definition.render.call(this, {
              props: this._props,
              data: this._props.data,
              innerHTML: this._originalInnerHTML,
              store: window.Korzem.store,
              el: this
          });

          if (html === undefined || html === null) return;

          if (this._definition.shadow) {
              if (!this._shadow) {
                  this._shadow = this.attachShadow({ mode: "open" });
              }
              var styleTag = this._definition.style
                  ? "<style>" + this._definition.style + "</style>"
                  : "";
              this._shadow.innerHTML = styleTag + html;
          } else {
              this.innerHTML = html;
          }
      }

      refresh() {
          this._props = this._collectProps();
          this._bindData();
          if (this._mounted) {
              this.render();
          }
      }
  }

  // ========================================================================
  // 8. GŁÓWNA KLASA KORZEM
  // ========================================================================

  class Korzem {
      constructor() {
          this.store = new KorzemStore();
          this.animations = KorzemAnimations;
          this.diff = DomDiff;
          this.scripts = new KorzemScriptManager();
          this._ready = false;
          this._componentDefs = componentRegistry;
      }

      // --- Inicjalizacja ---

      init(options) {
          options = options || {};

          if (options.animationDuration) {
              KorzemAnimations.duration = options.animationDuration;
          }
          KorzemAnimations.syncDuration();

          this.router = new KorzemRouter(this);
          this._ready = true;

          this._upgradeComponents(document.body);

          // Wykonaj <script type="text/korzem"> na pierwszej stronie
          var currentPath =
              window.location.pathname + window.location.search;
          this.scripts.executeScripts(document, currentPath);

          return this;
      }

      // --- Definiowanie komponentów ---

      define(tagName, definition) {
          tagName = tagName.toLowerCase();
          if (!tagName.startsWith("k-")) {
              tagName = "k-" + tagName;
          }

          if (!tagName.includes("-")) {
              throw new Error(
                  '[Korzem] Invalid component name: "' +
                      tagName +
                      '". Must contain a hyphen.'
              );
          }

          componentRegistry.set(tagName, definition);

          var attrs = definition.attributes || [];

          // Utwórz klasę z observedAttributes
          var ComponentClass = class extends KorzemComponent {
              static get observedAttributes() {
                  return attrs;
              }
          };

          if (!customElements.get(tagName)) {
              customElements.define(tagName, ComponentClass);
          }

          return this;
      }

      // --- Skróty do store ---

      async data(key, urlOrValue, fetchOptions) {
          if (
              typeof urlOrValue === "string" &&
              (urlOrValue.startsWith("/") ||
                  urlOrValue.startsWith("http"))
          ) {
              return await this.store.fetch(key, urlOrValue, fetchOptions);
          }
          this.store.set(key, urlOrValue);
          return urlOrValue;
      }

      // --- Upgrade komponentów ---

      _upgradeComponents(container) {
          var elements = container.querySelectorAll("*");
          for (var i = 0; i < elements.length; i++) {
              var el = elements[i];
              if (
                  el.tagName &&
                  el.tagName.startsWith("K-") &&
                  typeof el.refresh === "function"
              ) {
                  el.refresh();
              }
          }
      }

      // --- Nawigacja programowa ---

      navigate(url) {
          if (this.router) {
              return this.router.navigate(url);
          }
      }

      // --- Prefetch ---

      prefetch(url) {
          if (this.router) {
              this.router._fetchPage(url);
          }
      }

      // --- Tagged template helper ---

      html(strings) {
          var values = Array.prototype.slice.call(arguments, 1);
          var result = "";
          for (var i = 0; i < strings.length; i++) {
              result += strings[i];
              if (i < values.length) {
                  var val = values[i];
                  if (Array.isArray(val)) {
                      result += val.join("");
                  } else if (val === null || val === undefined) {
                      result += "";
                  } else {
                      result += String(val);
                  }
              }
          }
          return result;
      }

      // --- Escape HTML ---

      escape(str) {
          if (str === null || str === undefined) return "";
          var div = document.createElement("div");
          div.textContent = String(str);
          return div.innerHTML;
      }
  }

  // ========================================================================
  // 9. BOOTSTRAP
  // ========================================================================

  var korzem = new Korzem();
  window.Korzem = korzem;

  // Auto-init
  if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
          korzem.init();
      });
  } else {
      // Skrypt ładowany przed </body> — DOM gotowy
      // Micro-delay: inne skrypty mogą zarejestrować komponenty
      requestAnimationFrame(function () {
          if (!korzem._ready) {
              korzem.init();
          }
      });
  }

})(window, document);