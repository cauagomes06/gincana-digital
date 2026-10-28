// Self-check: two players in one room, first correct guess scores, other rooms stay isolated.
process.env.PORT = 3999; process.env.ROUNDS = 2; process.env.PAUSE_MS = 10;
const assert = require('assert');
const WebSocket = require('ws');
const server = require('./server');

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

(async () => {
  const ana = await connect('Ana', 'azul'), bia = await connect('Bia', 'azul'), caio = await connect('Caio', 'verde');
  ana.send(JSON.stringify({ type: 'start' }));
  for (let r = 0; r < 2; r++) {
    const { word } = await waitFor(bia, 'word');
    bia.send(JSON.stringify({ type: 'guess', word: 'errado' }));
    bia.send(JSON.stringify({ type: 'guess', word }));
    ana.send(JSON.stringify({ type: 'guess', word })); // late, must not score
    caio.send(JSON.stringify({ type: 'guess', word })); // other room, must not score
    await waitFor(bia, 'winner');
  }
  const { ranking } = await waitFor(ana, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score]), [['Bia', 2], ['Ana', 0]]);
  assert.ok(!caio.msgs.some((m) => m.type === 'word'), 'room verde must not receive azul words');
  const { rooms } = caio.msgs.filter((m) => m.type === 'rooms').pop();
  assert.deepStrictEqual(rooms.map((r) => r.count), [2, 1, 0]);
  console.log('OK');
  for (const ws of [ana, bia, caio]) ws.close();
  server.close(); process.exit(0);
})();
