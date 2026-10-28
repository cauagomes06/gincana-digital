// Serves the files in public/ and hands every WebSocket to game.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const game = require('./game');

const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
};

// read once at startup; looking paths up in this map also rules out "../" tricks
const files = {};
const publicDir = path.join(__dirname, 'public');
for (const name of fs.readdirSync(publicDir)) files[`/${name}`] = fs.readFileSync(path.join(publicDir, name));

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = url === '/' ? '/index.html' : url;
  if (!files[file]) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(files[file]);
});

const wss = new WebSocketServer({ server, maxPayload: 1024 });
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  game.connect(ws);
  ws.on('message', (raw) => game.message(ws, raw));
  ws.on('close', () => game.disconnect(ws));
  // without a listener, a bad frame (e.g. over maxPayload) throws and takes the whole server down; ws closes the socket itself
  ws.on('error', () => {});
});

// a laptop that sleeps or loses Wi-Fi never says goodbye, and a "not ready" ghost would block its room:
// ping everyone and drop whoever didn't answer the previous ping (browsers answer on their own)
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 30000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
