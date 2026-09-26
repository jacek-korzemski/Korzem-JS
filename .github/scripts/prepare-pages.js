var fs = require("fs");
var path = require("path");

var repo = process.env.GITHUB_REPOSITORY || "";
var owner = process.env.GITHUB_REPOSITORY_OWNER || repo.split("/")[0] || "";
var name = repo.split("/")[1] || "";
var userSite = name.toLowerCase() === (owner + ".github.io").toLowerCase();
var base = !name || userSite ? "" : "/" + name;

var root = path.resolve(__dirname, "../..");
var out = path.join(root, "site");

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  mkdir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  mkdir(to);
  fs.readdirSync(from, { withFileTypes: true }).forEach(function (ent) {
    var src = path.join(from, ent.name);
    var dest = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(src, dest);
    else copyFile(src, dest);
  });
}

function rewriteChunk(text, prefix) {
  if (!prefix) return text;
  var inner = prefix.replace(/^\//, "") + "/";
  return text.replace(/(["'])\/(?!\/)/g, function (match, quote, offset, full) {
    var rest = full.slice(offset + match.length);
    if (rest.indexOf(inner) === 0) return match;
    return quote + prefix + "/";
  });
}

function rewriteHtml(html, prefix) {
  if (!prefix) return html;
  return html.split(/(<pre\b[^>]*>[\s\S]*?<\/pre>)/i).map(function (part, i) {
    return i % 2 === 1 ? part : rewriteChunk(part, prefix);
  }).join("");
}

function writeHtml(from, to) {
  var html = fs.readFileSync(from, "utf8");
  fs.writeFileSync(to, rewriteHtml(html, base));
}

fs.rmSync(out, { recursive: true, force: true });
mkdir(out);

fs.readdirSync(root).forEach(function (entry) {
  if (!/\.html$/.test(entry) && entry !== "styl.css" && entry !== "korzem.js") {
    return;
  }
  var dest = path.join(out, entry);
  if (/\.html$/.test(entry)) {
    writeHtml(path.join(root, entry), dest);
  } else {
    copyFile(path.join(root, entry), dest);
  }
});

var plDir = path.join(root, "pl");
if (fs.existsSync(plDir)) {
  mkdir(path.join(out, "pl"));
  fs.readdirSync(plDir).forEach(function (entry) {
    if (!/\.html$/.test(entry)) return;
    writeHtml(path.join(plDir, entry), path.join(out, "pl", entry));
  });
}

["komponenty", "strony", "dane"].forEach(function (dir) {
  copyDir(path.join(root, dir), path.join(out, dir));
});

["robots.txt", "sitemap.xml"].forEach(function (file) {
  var from = path.join(root, file);
  if (fs.existsSync(from)) {
    copyFile(from, path.join(out, file));
  }
});

fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Pages base: " + (base || "/"));
