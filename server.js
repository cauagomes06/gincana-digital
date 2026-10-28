const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const DURATION_MS = Number(process.env.DURATION_MS) || 120000; // match length
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
// players are keyed by a secret id the browser keeps, so a dropped connection can rejoin with its score
for (const room of Object.values(rooms)) Object.assign(room, { players: new Map(), running: false, sequence: [], startsAt: 0, endsAt: 0 });
let nextKey = 1; // public player key, safe to show to everyone (the id is not)

const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

const wss = new WebSocketServer({ server, maxPayload: 1024 });

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => { for (const p of room.players.values()) send(p.ws, msg); };
const ranking = (room) => [...room.players.values()]
  .sort((a, b) => b.score - a.score)
  .map((p) => ({ key: p.key, name: p.name, score: p.score, ready: p.ready, online: !!p.ws }));
const roomList = () => Object.entries(rooms).map(([id, r]) => ({ id, name: r.name, count: r.players.size, running: r.running }));
const roomsMsg = () => ({ type: 'rooms', rooms: roomList(), max: MAX_PLAYERS, duration: DURATION_MS });
// only on join/leave/start/end: the lobby doesn't care about scores
const sendRooms = () => { for (const ws of wss.clients) send(ws, roomsMsg()); };
const sendState = (room) => broadcast(room, { type: 'state', players: ranking(room), running: room.running });

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
  clearTimeout(room.timer); // the game may end early; its pending timer must not end the next one
  room.running = false;
  const final = ranking(room); // before cleanup: a student who dropped still keeps their place
  for (const [id, p] of room.players) {
    if (p.ws) p.ready = false;
    else room.players.delete(id); // dropped and never came back
  }
  broadcast(room, { type: 'end', ranking: final });
  sendState(room);
  sendRooms();
}

// starts once every player in the room pressed "pronto"
function startIfAllReady(room) {
  const players = [...room.players.values()];
  if (room.running || !players.length || !players.every((p) => p.ready)) return sendState(room);
  for (const p of players) Object.assign(p, { score: 0, index: 0 });
  const startsAt = Date.now() + COUNTDOWN_MS;
  Object.assign(room, { running: true, sequence: shuffle(WORDS), startsAt, endsAt: startsAt + DURATION_MS });
  broadcast(room, { type: 'start', countdown: COUNTDOWN_MS, duration: DURATION_MS });
  sendState(room);
  sendRooms();
  room.timer = setTimeout(() => {
    for (const p of room.players.values()) send(p.ws, { type: 'word', word: wordFor(room, p) });
    room.timer = setTimeout(() => endGame(room), DURATION_MS);
  }, COUNTDOWN_MS);
}

// quit = pressed "Trocar de sala"; otherwise the connection dropped
function leave(ws, quit) {
  const { room, player } = ws;
  if (!room) return;
  ws.room = ws.player = null;
  if (room.running && !quit) player.ws = null; // keep the score so they can come back
  else room.players.delete(player.id);
  if (room.running && !room.players.size) return endGame(room); // everyone quit: unlock the room now
  sendRooms();
  startIfAllReady(room);
}

function join(ws, msg) {
  const target = Object.hasOwn(rooms, msg.room) && rooms[msg.room];
  const id = String(msg.id || '').slice(0, 40);
  if (!target || !id) return;
  let player = target.players.get(id);
  if (player) {
    // same browser coming back: take over the old connection, keep score and position
    if (player.ws) {
      send(player.ws, { type: 'replaced' }); // tells a duplicated tab to stop reconnecting
      player.ws.room = player.ws.player = null;
      player.ws.close();
    }
  } else {
    if (target.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: `${target.name} está cheia. Escolha outra sala.` });
    if (target.running) return send(ws, { type: 'error', message: `${target.name} já está jogando. Espere a partida acabar ou escolha outra sala.` });
    const base = String(msg.name || '').trim().slice(0, 20) || 'Aluno';
    const taken = new Set([...target.players.values()].map((p) => p.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    player = { id, key: nextKey++, name, score: 0, ready: false, index: 0, lastSkip: 0 };
    target.players.set(id, player);
  }
  player.ws = ws;
  ws.room = target;
  ws.player = player;
  send(ws, { type: 'joined', room: msg.room, name: target.name, key: player.key });
  if (target.running) {
    const now = Date.now();
    send(ws, { type: 'start', countdown: Math.max(0, target.startsAt - now), duration: target.endsAt - Math.max(now, target.startsAt) });
    if (now >= target.startsAt) send(ws, { type: 'word', word: wordFor(target, player) });
  }
  sendState(target);
  sendRooms();
}

wss.on('connection', (ws) => {
  send(ws, roomsMsg());

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return; // e.g. "null" sent from the console used to crash the server
    const { room, player } = ws;
    const playing = player && room.running && Date.now() >= room.startsAt;

    if (msg.type === 'join' && !room) {
      join(ws, msg);
    } else if (msg.type === 'leave') {
      leave(ws, true);
    } else if (msg.type === 'ready' && player && !room.running) {
      player.ready = msg.ready === true;
      startIfAllReady(room);
    } else if (msg.type === 'guess' && playing && normalize(msg.word) === wordFor(room, player)) {
      player.score++;
      player.index++;
      send(ws, { type: 'word', word: wordFor(room, player) });
      sendState(room);
    } else if (msg.type === 'skip' && playing && Date.now() - player.lastSkip > 300) {
      // skipping costs a point; the throttle stops a held key from flooding the room
      player.lastSkip = Date.now();
      player.score--;
      player.index++;
      send(ws, { type: 'word', word: wordFor(room, player), skipped: true });
      sendState(room);
    }
  });

  ws.on('close', () => leave(ws, false));
  // without a listener, a bad frame (e.g. over maxPayload) throws and takes the whole server down; ws closes the socket itself
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Jogo rodando em http://localhost:${PORT}`));
module.exports = server;
module.exports.WORDS = WORDS;
