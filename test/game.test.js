// Ready-up, own pace, skip penalty, reconnect keeps score, duplicate names, room isolation, crash safety.
process.env.PORT = 3999; process.env.DURATION_MS = 800; process.env.COUNTDOWN_MS = 20;
const { test } = require('node:test');
const assert = require('assert');
const WebSocket = require('ws');
const server = require('../server');
const WORDS = require('../words');

test('lista de palavras', () => {
  assert.ok(WORDS.length >= 200, 'word list too short');
  assert.strictEqual(new Set(WORDS).size, WORDS.length, 'duplicate words');
  assert.ok(WORDS.every((w) => w === w.toLowerCase()), 'words must be lowercase');
  assert.ok(WORDS.some((w) => /[áàâãéêíóôõúç]/.test(w)), 'need accented words');
});

test('serve as páginas e recusa caminhos desconhecidos', async () => {
  const get = (p) => fetch(`http://localhost:3999${p}`);
  assert.match((await get('/')).headers.get('content-type'), /text\/html/);
  assert.match((await get('/app.js')).headers.get('content-type'), /javascript/);
  assert.match((await get('/style.css')).headers.get('content-type'), /css/);
  assert.strictEqual((await get('/../server.js')).status, 404);
});

const connect = (name, room, id = name) => new Promise((resolve) => {
  const ws = new WebSocket('ws://localhost:3999');
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name, room, id })); resolve(ws); });
});
const waitFor = (ws, type) => new Promise((resolve) => {
  const check = () => {
    const i = ws.msgs.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(ws.msgs.splice(0, i + 1).pop());
    setTimeout(check, 5);
  };
  check();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sendTo = (ws, msg) => ws.send(JSON.stringify(msg));

test('Caça às Letras: clique valida tempo e ordem', async () => {
  const leo = await connect('Leo', 'verde', 'leo');
  const lia = await connect('Lia', 'verde', 'lia');
  await wait(50); // both joins processed before anyone is ready, or Leo would start alone
  sendTo(leo, { type: 'ready', ready: true });
  sendTo(lia, { type: 'mode', mode: 'caca' }); // changing the prova clears everyone's "pronto"
  await wait(50);
  assert.ok(leo.msgs.filter((m) => m.type === 'state').pop().players.every((p) => !p.ready));
  sendTo(lia, { type: 'mode', mode: 'nao-existe' }); // ignored
  for (const ws of [leo, lia]) sendTo(ws, { type: 'ready', ready: true });

  const t0 = await waitFor(leo, 'target');
  assert.strictEqual(t0.index, 0);
  assert.strictEqual((await waitFor(lia, 'target')).letter, t0.letter, 'same targets for everyone');
  sendTo(leo, { type: 'hit', index: 0 }); // too fast to be a human
  await wait(170);
  sendTo(leo, { type: 'hit', index: 5 }); // wrong target
  sendTo(leo, { type: 'hit', index: 0 });
  const t1 = await waitFor(leo, 'target');
  assert.strictEqual(t1.index, 1);
  assert.ok(t1.size <= t0.size && t1.life <= t0.life, 'targets get harder');
  sendTo(leo, { type: 'miss', index: 1 }); // vanished: next target, no point
  assert.strictEqual((await waitFor(leo, 'target')).index, 2);
  sendTo(leo, { type: 'guess', word: 'qualquer' }); // typing messages do nothing here

  const { ranking } = await waitFor(leo, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score]), [['Leo', 1], ['Lia', 0]]);
  sendTo(leo, { type: 'mode', mode: 'digitacao' }); // leave the room as the next test expects
  await wait(50);
  for (const ws of [leo, lia]) sendTo(ws, { type: 'leave' });
  await wait(50);
  for (const ws of [leo, lia]) ws.close();
});

test('partida completa com várias salas', async () => {
  // bad messages must not crash the server (a crash would kill this test process too)
  const rogue = await connect('Rogue', 'roxa');
  rogue.on('error', () => {});
  rogue.send('null');
  rogue.send(JSON.stringify({ type: 'guess', word: 'a'.repeat(2000) })); // over maxPayload: server drops this socket
  await wait(100);

  // a duplicated tab (same id) takes over; the old one is told to stop reconnecting
  const tabA = await connect('Fê', 'roxa', 'fe');
  const tabB = await connect('Fê', 'roxa', 'fe');
  await waitFor(tabA, 'replaced');

  // everyone quitting mid-game unlocks the room; the old game's timer must not end the next game early
  sendTo(tabB, { type: 'ready', ready: true });
  await waitFor(tabB, 'start');
  sendTo(tabB, { type: 'leave' });
  await wait(300);
  const roxa = () => tabB.msgs.filter((m) => m.type === 'rooms').pop().rooms[2];
  assert.strictEqual(roxa().running, false, 'room unlocks when everyone quits');
  sendTo(tabB, { type: 'join', name: 'Fê', room: 'roxa', id: 'fe' });
  sendTo(tabB, { type: 'ready', ready: true });
  await waitFor(tabB, 'start');
  await wait(650); // past the first game's would-be end, before the second one's
  assert.ok(!tabB.msgs.some((m) => m.type === 'end'), 'stale timer ended the new game');
  sendTo(tabB, { type: 'leave' });
  await wait(50);

  let ana = await connect('Ana', 'azul');
  const bia = await connect('Bia', 'azul'), caio = await connect('Caio', 'verde');

  const twin = await connect('Bia', 'azul', 'twin');
  await wait(50);
  const names = bia.msgs.filter((m) => m.type === 'state').pop().players.map((p) => p.name);
  assert.ok(names.includes('Bia 2'), 'duplicate name gets a number');
  sendTo(twin, { type: 'leave' });

  const eva = await connect('Eva', 'azul');
  sendTo(eva, { type: 'ready', ready: true });
  sendTo(ana, { type: 'ready', ready: true });
  await wait(50);
  assert.ok(!ana.msgs.some((m) => m.type === 'start'), 'must wait until everyone is ready');
  sendTo(bia, { type: 'ready', ready: true });
  await waitFor(ana, 'start');
  const late = await connect('Davi', 'azul');
  assert.match((await waitFor(late, 'error')).message, /já está jogando/);

  const anaFirst = (await waitFor(ana, 'word')).word;
  let { word } = await waitFor(bia, 'word');
  assert.strictEqual(word, anaFirst, 'same words for everyone');
  sendTo(bia, { type: 'guess', word: 'errado' });
  for (let i = 0; i < 3; i++) {
    sendTo(bia, { type: 'guess', word });
    sendTo(bia, { type: 'guess', word }); // repeat must not score twice
    word = (await waitFor(bia, 'word')).word;
  }
  sendTo(bia, { type: 'skip' });
  assert.ok((await waitFor(bia, 'word')).skipped);
  sendTo(bia, { type: 'skip' }); // within throttle window, ignored

  eva.terminate(); // drops and never returns
  ana.terminate(); // connection drops mid-game
  await wait(50);
  ana = await connect('Ana', 'azul'); // same id comes back
  await waitFor(ana, 'start');
  assert.strictEqual((await waitFor(ana, 'word')).word, anaFirst, 'resumes at the same word');
  sendTo(ana, { type: 'guess', word: anaFirst });
  sendTo(caio, { type: 'guess', word: anaFirst }); // other room, must not score

  const { ranking } = await waitFor(ana, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score, p.online]), [['Bia', 2, true], ['Ana', 1, true], ['Eva', 0, false]]);
  assert.ok(!caio.msgs.some((m) => m.type === 'word'), 'room verde must not receive azul words');
  const { rooms } = caio.msgs.filter((m) => m.type === 'rooms').pop();
  assert.deepStrictEqual(rooms.map((r) => [r.count, r.running]), [[2, false], [1, false], [0, false]]);
  for (const ws of [ana, bia, caio, late, twin, tabA, tabB]) ws.close();
  server.close();
});
