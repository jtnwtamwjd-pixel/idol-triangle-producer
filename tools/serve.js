// 依存なしの簡易サーバー:node tools/serve.js → http://localhost:8123
// (index.html を直接ダブルクリックしても動くが、サーバー経由が確実)
const http = require('http');
const fs = require('fs');
const path = require('path');
const rootDir = path.join(__dirname, '..');
const port = +process.env.PORT || 8123;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/plain' };
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(rootDir, p === '/' ? 'index.html' : p);
  if (!file.startsWith(rootDir)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
