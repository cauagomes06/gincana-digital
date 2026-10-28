// Self-check: everyone readies, each player types at their own pace, most words when time runs out wins.
process.env.PORT = 3999; process.env.DURATION_MS = 400; process.env.COUNTDOWN_MS = 20;
const assert = require('assert');
const WebSocket = require('ws');
const server = require('./server');
const { WORDS } = server;
assert.ok(WORDS.length >= 200, 'word list too short');
assert.strictEqual(new Set(WORDS).size, WORDS.length, 'duplicate words');
assert.ok(WORDS.every((w) => w === w.toLowerCase()), 'words must be lowercase');
assert.ok(WORDS.some((w) => /[áàâãéêíóôõúç]/.test(w)), 'need accented words');

const connect = (name, room) => new Promise((resolve) => {
  const ws = new WebSocket('ws://localhost:3999');
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name, room })); resolve(ws); });
});
const waitFor = (ws, type) => new Promise((resolve) => {
  const check = () => {
    const i = ws.msgs.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(ws.msgs.splice(0, i + 1).pop());
    setTimeout(check, 5);
  };
  check();
});
const guess = (ws, word) => ws.send(JSON.stringify({ type: 'guess', word }));

(async () => {
  const ana = await connect('Ana', 'azul'), bia = await connect('Bia', 'azul'), caio = await connect('Caio', 'verde');
  ana.send(JSON.stringify({ type: 'ready', ready: true }));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!ana.msgs.some((m) => m.type === 'start'), 'must wait until everyone is ready');
  bia.send(JSON.stringify({ type: 'ready', ready: true }));
  await waitFor(ana, 'start');
  const late = await connect('Davi', 'azul');
  assert.match((await waitFor(late, 'error')).message, /já está jogando/);

  const anaFirst = (await waitFor(ana, 'word')).word;
  let { word } = await waitFor(bia, 'word');
  assert.strictEqual(word, anaFirst, 'same words for everyone');
  guess(bia, 'errado');
  for (let i = 0; i < 3; i++) {
    guess(bia, word);
    guess(bia, word); // repeat must not score twice
    word = (await waitFor(bia, 'word')).word;
  }
  guess(ana, anaFirst);
  guess(caio, anaFirst); // other room, must not score

  const { ranking } = await waitFor(ana, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score]), [['Bia', 3], ['Ana', 1]]);
  assert.ok(!caio.msgs.some((m) => m.type === 'word'), 'room verde must not receive azul words');
  const { rooms } = caio.msgs.filter((m) => m.type === 'rooms').pop();
  assert.deepStrictEqual(rooms.map((r) => [r.count, r.running]), [[2, false], [1, false], [0, false]]);
  console.log('OK');
  for (const ws of [ana, bia, caio, late]) ws.close();
  server.close(); process.exit(0);
})();
