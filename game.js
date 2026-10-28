// Game rules: rooms, ready-up, timed matches, scoring. Knows nothing about HTTP; server.js feeds it sockets.
const WORDS = require('./words');

const MAX_PLAYERS = 30;
const DURATION_MS = Number(process.env.DURATION_MS) || 120000; // match length
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS ?? 3000); // "3, 2, 1" before the first word
const MIN_REACTION_MS = 150; // a "hit" faster than this after the target appeared comes from a script, not a hand

// Caça às Letras: targets get smaller and vanish faster the further a student goes
const LETTERS = 'ABCDEFGHIJLMNOPQRSTUVXZ';
const makeTargets = () => Array.from({ length: 300 }, (_, i) => ({
  x: 0.06 + Math.random() * 0.88, // position as a fraction of the play area
  y: 0.08 + Math.random() * 0.84,
  letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
  size: Math.max(40, 96 - i * 2), // px
  life: Math.max(800, 2200 - i * 40), // ms on screen
}));
// each mode builds the list every player in the room goes through, in the same order
const MODES = {
  digitacao: () => shuffle(WORDS),
  caca: makeTargets,
};

const normalize = (s) => String(s).trim().toLowerCase().normalize('NFC');
const rooms = {
  azul: { name: 'Sala Azul' },
  verde: { name: 'Sala Verde' },
  roxa: { name: 'Sala Roxa' },
};
// players are keyed by a secret id the browser keeps, so a dropped connection can rejoin with its score
for (const room of Object.values(rooms)) Object.assign(room, { players: new Map(), mode: 'digitacao', running: false, sequence: [], startsAt: 0, endsAt: 0 });
let nextKey = 1; // public player key, safe to show to everyone (the id is not)
const clients = new Set(); // every open socket, in a room or still in the lobby

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => { for (const p of room.players.values()) send(p.ws, msg); };
const ranking = (room) => [...room.players.values()]
  .sort((a, b) => b.score - a.score)
  .map((p) => ({ key: p.key, name: p.name, score: p.score, ready: p.ready, online: !!p.ws }));
const roomList = () => Object.entries(rooms).map(([id, r]) => ({ id, name: r.name, mode: r.mode, count: r.players.size, running: r.running }));
const roomsMsg = () => ({ type: 'rooms', rooms: roomList(), max: MAX_PLAYERS, duration: DURATION_MS });
// only on join/leave/start/end: the lobby doesn't care about scores
const sendRooms = () => { for (const ws of clients) send(ws, roomsMsg()); };
const sendState = (room) => broadcast(room, { type: 'state', players: ranking(room), running: room.running, mode: room.mode });

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// everyone in the room gets the same items in the same order, each at their own pace
const current = (room, player) => room.sequence[player.index % room.sequence.length];
function sendChallenge(room, player, extra) {
  player.shownAt = Date.now();
  const item = current(room, player);
  if (room.mode === 'caca') send(player.ws, { type: 'target', index: player.index, ...item });
  else send(player.ws, { type: 'word', word: item, ...extra });
}

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
  Object.assign(room, { running: true, sequence: MODES[room.mode](), startsAt, endsAt: startsAt + DURATION_MS });
  broadcast(room, { type: 'start', countdown: COUNTDOWN_MS, duration: DURATION_MS });
  sendState(room);
  sendRooms();
  room.timer = setTimeout(() => {
    for (const p of room.players.values()) sendChallenge(room, p);
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
    if (now >= target.startsAt) sendChallenge(target, player);
  }
  sendState(target);
  sendRooms();
}

function connect(ws) {
  clients.add(ws);
  send(ws, roomsMsg());
}

function message(ws, raw) {
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
  } else if (msg.type === 'mode' && player && !room.running && Object.hasOwn(MODES, msg.mode)) {
    room.mode = msg.mode;
    for (const p of room.players.values()) p.ready = false; // everyone agrees again on the new prova
    sendState(room);
    sendRooms();
  } else if (!playing) {
    // everything below only counts during a match
  } else if (room.mode === 'digitacao') {
    if (msg.type === 'guess' && normalize(msg.word) === current(room, player)) {
      player.score++;
      player.index++;
      sendChallenge(room, player);
      sendState(room);
    } else if (msg.type === 'skip' && Date.now() - player.lastSkip > 300) {
      // skipping costs a point; the throttle stops a held key from flooding the room
      player.lastSkip = Date.now();
      player.score--;
      player.index++;
      sendChallenge(room, player, { skipped: true });
      sendState(room);
    }
  } else if (room.mode === 'caca' && msg.index === player.index) {
    const age = Date.now() - player.shownAt;
    if (msg.type === 'hit' && age >= MIN_REACTION_MS && age <= current(room, player).life + 500) {
      player.score++;
      player.index++;
      sendChallenge(room, player);
      sendState(room);
    } else if (msg.type === 'miss') { // the letter vanished: next one, no point
      player.index++;
      sendChallenge(room, player);
    }
  }
}

function disconnect(ws) {
  clients.delete(ws);
  leave(ws, false);
}

module.exports = { connect, message, disconnect, WORDS };
