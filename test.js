// Self-check: ready-up, own pace, skip penalty, reconnect keeps score, duplicate names, room isolation.
process.env.PORT = 3999; process.env.DURATION_MS = 800; process.env.COUNTDOWN_MS = 20;
const assert = require('assert');
const WebSocket = require('ws');
const server = require('./server');
const { WORDS } = server;
assert.ok(WORDS.length >= 200, 'word list too short');
assert.strictEqual(new Set(WORDS).size, WORDS.length, 'duplicate words');
assert.ok(WORDS.every((w) => w === w.toLowerCase()), 'words must be lowercase');
assert.ok(WORDS.some((w) => /[áàâãéêíóôõúç]/.test(w)), 'need accented words');

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

(async () => {
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
  console.log('OK');
  for (const ws of [ana, bia, caio, late, twin]) ws.close();
  server.close(); process.exit(0);
})();
