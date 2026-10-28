// Self-check: two players, first correct guess scores, game ends with a ranking.
process.env.PORT = 3999; process.env.ROUNDS = 2; process.env.PAUSE_MS = 10;
const assert = require('assert');
const WebSocket = require('ws');
const server = require('./server');

const connect = (name) => new Promise((resolve) => {
  const ws = new WebSocket('ws://localhost:3999');
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name })); resolve(ws); });
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
  const ana = await connect('Ana'), bia = await connect('Bia');
  ana.send(JSON.stringify({ type: 'start' }));
  for (let r = 0; r < 2; r++) {
    const { word } = await waitFor(bia, 'word');
    bia.send(JSON.stringify({ type: 'guess', word: 'errado' }));
    bia.send(JSON.stringify({ type: 'guess', word }));
    ana.send(JSON.stringify({ type: 'guess', word })); // late, must not score
    await waitFor(bia, 'winner');
  }
  const { ranking } = await waitFor(ana, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score]), [['Bia', 2], ['Ana', 0]]);
  console.log('OK');
  ana.close(); bia.close(); server.close(); process.exit(0);
})();
