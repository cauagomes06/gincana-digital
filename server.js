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
const rooms = {
  azul: { name: 'Sala Azul' },
  verde: { name: 'Sala Verde' },
  roxa: { name: 'Sala Roxa' },
};
for (const room of Object.values(rooms)) Object.assign(room, { players: new Map(), running: false, round: 0, word: null });

const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

const wss = new WebSocketServer({ server, maxPayload: 1024 });

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => { for (const ws of room.players.keys()) send(ws, msg); };
const ranking = (room) => [...room.players.values()].sort((a, b) => b.score - a.score);
const roomList = () => Object.entries(rooms).map(([id, r]) => ({ id, name: r.name, count: r.players.size, running: r.running }));
const sendRooms = () => { for (const ws of wss.clients) send(ws, { type: 'rooms', rooms: roomList(), max: MAX_PLAYERS }); };
const sendState = (room) => {
  broadcast(room, { type: 'state', players: ranking(room), running: room.running, round: room.round, rounds: ROUNDS });
  sendRooms();
};

function nextRound(room) {
  if (room.round >= ROUNDS || room.players.size === 0) {
    room.running = false;
    room.word = null;
    broadcast(room, { type: 'end', ranking: ranking(room) });
    return sendState(room);
  }
  room.round++;
  room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
  broadcast(room, { type: 'word', word: room.word, round: room.round, rounds: ROUNDS });
  sendState(room);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws);
  ws.room = null;
  sendState(room);
}

wss.on('connection', (ws) => {
  send(ws, { type: 'rooms', rooms: roomList(), max: MAX_PLAYERS });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    const player = room && room.players.get(ws);

    if (msg.type === 'join' && !room) {
      const target = Object.hasOwn(rooms, msg.room) && rooms[msg.room];
      if (!target) return;
      if (target.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: `${target.name} está cheia. Escolha outra sala.` });
      const name = String(msg.name || '').trim().slice(0, 20) || 'Aluno';
      target.players.set(ws, { name, score: 0 });
      ws.room = target;
      send(ws, { type: 'joined', room: msg.room, name: target.name });
      sendState(target);
      if (target.running && target.word) send(ws, { type: 'word', word: target.word, round: target.round, rounds: ROUNDS });
    } else if (msg.type === 'leave') {
      leave(ws);
    } else if (msg.type === 'start' && player && !room.running) {
      for (const p of room.players.values()) p.score = 0;
      Object.assign(room, { running: true, round: 0, word: null });
      nextRound(room);
    } else if (msg.type === 'guess' && player && room.word && String(msg.word).trim().toLowerCase() === room.word) {
      // first correct guess wins; clearing word blocks later guesses for this round
      room.word = null;
      player.score++;
      broadcast(room, { type: 'winner', name: player.name });
      sendState(room);
      setTimeout(() => nextRound(room), PAUSE_MS);
    }
  });

  ws.on('close', () => leave(ws));
});

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
