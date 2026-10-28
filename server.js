const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const ROUNDS = Number(process.env.ROUNDS) || 10;
const PAUSE_MS = Number(process.env.PAUSE_MS) || 2000;
const WORDS = [
  'abacaxi', 'teclado', 'janela', 'computador', 'girassol', 'borboleta', 'montanha', 'chocolate',
  'elefante', 'bicicleta', 'guarda-chuva', 'paralelepipedo', 'travesseiro', 'helicoptero', 'cachoeira',
  'dinossauro', 'futebol', 'relampago', 'tartaruga', 'esqueleto', 'astronauta', 'biblioteca',
  'pipoca', 'sorvete', 'trovao', 'caminhao', 'labirinto', 'foguete', 'abobora', 'jacare',
  'internet', 'programa', 'velocidade', 'campeonato', 'espelho', 'galinha', 'mochila', 'piscina',
  'xadrez', 'zebra',
];

const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

const wss = new WebSocketServer({ server, maxPayload: 1024 });
const players = new Map(); // ws -> { name, score }
let game = { running: false, round: 0, word: null };

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg) => { for (const ws of players.keys()) send(ws, msg); };
const ranking = () => [...players.values()].sort((a, b) => b.score - a.score);
const sendState = () => broadcast({ type: 'state', players: ranking(), running: game.running, round: game.round, rounds: ROUNDS });

function nextRound() {
  if (game.round >= ROUNDS || players.size === 0) {
    game.running = false;
    broadcast({ type: 'end', ranking: ranking() });
    return sendState();
  }
  game.round++;
  game.word = WORDS[Math.floor(Math.random() * WORDS.length)];
  broadcast({ type: 'word', word: game.word, round: game.round, rounds: ROUNDS });
  sendState();
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: 'error', message: `Sala cheia (máximo ${MAX_PLAYERS} jogadores).` });
    return ws.close();
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const player = players.get(ws);

    if (msg.type === 'join' && !player) {
      const name = String(msg.name || '').trim().slice(0, 20) || 'Jogador';
      players.set(ws, { name, score: 0 });
      sendState();
      if (game.running && game.word) send(ws, { type: 'word', word: game.word, round: game.round, rounds: ROUNDS });
    } else if (msg.type === 'start' && player && !game.running) {
      for (const p of players.values()) p.score = 0;
      game = { running: true, round: 0, word: null };
      nextRound();
    } else if (msg.type === 'guess' && player && game.word && String(msg.word).trim().toLowerCase() === game.word) {
      // first correct guess wins; clearing word blocks later guesses for this round
      game.word = null;
      player.score++;
      broadcast({ type: 'winner', name: player.name });
      sendState();
      setTimeout(nextRound, PAUSE_MS);
    }
  });

  ws.on('close', () => { players.delete(ws); sendState(); });
});

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
