// Local dev: serves the game and runs a throwaway MQTT broker so phones-in-a-browser
// can play without the public relays. node test/serve.js  ->  http://localhost:8080/?broker=ws://localhost:9001
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8080, () => console.log('game on http://localhost:8080'));

const aedes = require('aedes')();
const ws = require('websocket-stream');
const broker = http.createServer();
ws.createServer({ server: broker }, aedes.handle);
broker.listen(9001, () => console.log('broker on ws://localhost:9001'));
