var http = require("http");
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname);
var port = 4173;

var types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".ico": "image/x-icon"
};

var server = http.createServer(function (req, res) {
    var url;
    try {
        url = new URL(req.url, "http://127.0.0.1");
    } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Zły adres");
        return;
    }

    var pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Zły adres");
        return;
    }

    if (pathname.endsWith("/")) pathname += "index.html";

    var rel = pathname.replace(/^[/\\]+/, "");
    var file = path.resolve(root, rel);
    var relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Zakazane");
        return;
    }

    fs.readFile(file, function (err, data) {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Nie ma takiego pliku");
            return;
        }
        var ext = path.extname(file).toLowerCase();
        res.writeHead(200, {
            "Content-Type": types[ext] || "application/octet-stream",
            "Cache-Control": "no-cache"
        });
        res.end(data);
    });
});

server.listen(port, function () {
    console.log("korzem: http://127.0.0.1:" + port);
});
