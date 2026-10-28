const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const ROUNDS = Number(process.env.ROUNDS) || 10;
const PAUSE_MS = Number(process.env.PAUSE_MS) || 2000;
const CLOSE_MS = Number(process.env.CLOSE_MS) || 5000; // time left for the others after the first correct answer
const POINTS = [10, 7, 5]; // 1st, 2nd, 3rd; everyone after gets LATE_POINTS
const LATE_POINTS = 3;
const WORDS = [
  // sem acento
  'abacaxi', 'teclado', 'janela', 'computador', 'girassol', 'borboleta', 'montanha', 'chocolate',
  'elefante', 'bicicleta', 'guarda-chuva', 'travesseiro', 'cachoeira', 'dinossauro', 'futebol',
  'tartaruga', 'esqueleto', 'astronauta', 'biblioteca', 'pipoca', 'sorvete', 'labirinto', 'foguete',
  'internet', 'programa', 'velocidade', 'campeonato', 'espelho', 'galinha', 'mochila', 'piscina',
  'xadrez', 'zebra', 'escola', 'caderno', 'professor', 'mercado', 'cidade', 'floresta', 'girafa',
  'cavalo', 'macaco', 'tomate', 'banana', 'laranja', 'morango', 'cenoura', 'brigadeiro', 'quadro',
  'aventura', 'amizade', 'planeta', 'universo', 'tesoura', 'apontador', 'estojo', 'recreio',
  'merenda', 'uniforme', 'formiga', 'coruja', 'baleia', 'pinguim', 'canguru', 'tigre',
  'leopardo', 'chuveiro', 'geladeira', 'bandeira', 'capoeira', 'samba', 'carnaval', 'pandeiro',
  // com acento
  'paralelepípedo', 'helicóptero', 'relâmpago', 'trovão', 'caminhão', 'abóbora', 'jacaré', 'avião',
  'pão', 'mamãe', 'irmão', 'coração', 'canção', 'educação', 'atenção', 'informação', 'eleição',
  'feijão', 'limão', 'melão', 'mamão', 'violão', 'balão', 'leão', 'gavião', 'tubarão', 'botão',
  'café', 'sofá', 'maracujá', 'picolé', 'chapéu', 'céu', 'pé', 'boné', 'jacarandá', 'tatu-bola',
  'música', 'matemática', 'geografia', 'história', 'ciências', 'português', 'inglês', 'física',
  'química', 'gramática', 'lâmpada', 'pássaro', 'árvore', 'água', 'óculos', 'ônibus', 'fósforo',
  'xícara', 'príncipe', 'médico', 'técnico', 'público', 'número', 'último', 'próximo', 'rápido',
  'difícil', 'fácil', 'útil', 'possível', 'incrível', 'automóvel', 'túnel', 'açúcar', 'açaí',
  'pêssego', 'você', 'avô', 'avó', 'robô', 'metrô', 'três', 'mês', 'vulcão', 'fogão',
  'criança', 'caçador', 'abraço', 'palhaço', 'cabeça', 'bagunça', 'praça', 'onça', 'maçã', 'sabiá',
  'paçoca', 'pescoço', 'almoço', 'calçada', 'louça', 'açougue', 'lápis', 'régua', 'borracha',
  'mágico', 'pólen', 'herói', 'anéis', 'papéis', 'chapéus', 'heróis', 'país', 'saúde', 'baú',
  'juíza', 'egoísta', 'ninguém', 'também', 'parabéns', 'armazém', 'refém', 'trânsito', 'sábado',
  'segunda-feira', 'guarda-roupa', 'beija-flor', 'arco-íris', 'bem-te-vi', 'cachorro-quente',
  'jabuticaba', 'tapioca', 'mandioca', 'caju', 'domingo', 'dicionário', 'calendário', 'aniversário',
].map((w) => w.normalize('NFC'));
const normalize = (s) => String(s).trim().toLowerCase().normalize('NFC');
const rooms = {
  azul: { name: 'Sala Azul' },
  verde: { name: 'Sala Verde' },
  roxa: { name: 'Sala Roxa' },
};
for (const room of Object.values(rooms)) Object.assign(room, { players: new Map(), running: false, round: 0, word: null, answered: new Set() });

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
  broadcast(room, { type: 'state', players: ranking(room), running: room.running, round: room.round, rounds: ROUNDS, maxScore: ROUNDS * POINTS[0] });
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
  room.answered = new Set();
  broadcast(room, { type: 'word', word: room.word, round: room.round, rounds: ROUNDS });
  sendState(room);
}

function closeRound(room) {
  if (!room.word) return;
  clearTimeout(room.timer);
  broadcast(room, { type: 'roundEnd', word: room.word });
  room.word = null;
  setTimeout(() => nextRound(room), PAUSE_MS);
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
    } else if (msg.type === 'guess' && player && room.word && !room.answered.has(ws) && normalize(msg.word) === room.word) {
      room.answered.add(ws);
      const place = room.answered.size;
      const points = POINTS[place - 1] || LATE_POINTS;
      player.score += points;
      for (const other of room.players.keys()) {
        send(other, { type: 'scored', name: player.name, place, points, closeIn: CLOSE_MS, you: other === ws });
      }
      sendState(room);
      if ([...room.players.keys()].every((p) => room.answered.has(p))) closeRound(room);
      else if (place === 1) room.timer = setTimeout(() => closeRound(room), CLOSE_MS);
    }
  });

  ws.on('close', () => leave(ws));
});

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
module.exports.WORDS = WORDS;
