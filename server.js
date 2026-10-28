const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const DURATION_MS = Number(process.env.DURATION_MS) || 60000; // match length
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS ?? 3000); // "3, 2, 1" before the first word
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
for (const room of Object.values(rooms)) Object.assign(room, { players: new Map(), running: false, sequence: [], startsAt: 0 });

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
  broadcast(room, { type: 'state', players: ranking(room), running: room.running });
  sendRooms();
};

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// everyone in the room gets the same words in the same order, each at their own pace
const wordFor = (room, player) => room.sequence[player.index % room.sequence.length];

function endGame(room) {
  room.running = false;
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, { type: 'end', ranking: ranking(room) });
  sendState(room);
}

// starts once every player in the room pressed "pronto"
function startIfAllReady(room) {
  const players = [...room.players.values()];
  if (room.running || !players.length || !players.every((p) => p.ready)) return sendState(room);
  for (const p of players) Object.assign(p, { score: 0, index: 0 });
  Object.assign(room, { running: true, sequence: shuffle(WORDS), startsAt: Date.now() + COUNTDOWN_MS });
  broadcast(room, { type: 'start', countdown: COUNTDOWN_MS, duration: DURATION_MS });
  sendState(room);
  setTimeout(() => {
    for (const [ws, p] of room.players) send(ws, { type: 'word', word: wordFor(room, p) });
    setTimeout(() => endGame(room), DURATION_MS);
  }, COUNTDOWN_MS);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws);
  ws.room = null;
  startIfAllReady(room);
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
      if (target.running) return send(ws, { type: 'error', message: `${target.name} já está jogando. Espere a partida acabar ou escolha outra sala.` });
      const name = String(msg.name || '').trim().slice(0, 20) || 'Aluno';
      target.players.set(ws, { name, score: 0, ready: false, index: 0 });
      ws.room = target;
      send(ws, { type: 'joined', room: msg.room, name: target.name });
      sendState(target);
    } else if (msg.type === 'leave') {
      leave(ws);
    } else if (msg.type === 'ready' && player && !room.running) {
      player.ready = msg.ready === true;
      startIfAllReady(room);
    } else if (msg.type === 'guess' && player && room.running && Date.now() >= room.startsAt && normalize(msg.word) === wordFor(room, player)) {
      player.score++;
      player.index++;
      send(ws, { type: 'word', word: wordFor(room, player) });
      sendState(room);
    }
  });

  ws.on('close', () => leave(ws));
});

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
module.exports.WORDS = WORDS;
