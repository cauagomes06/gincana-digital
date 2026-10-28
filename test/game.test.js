// Ready-up, own pace, skip penalty, reconnect keeps score, duplicate names, room isolation, crash safety.
process.env.PORT = 3999; process.env.DURATION_MS = 800; process.env.COUNTDOWN_MS = 20; process.env.HEARTBEAT_MS = 100;
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
  assert.match((await get('/favicon.svg')).headers.get('content-type'), /image\/svg\+xml/);
  assert.strictEqual((await get('/../server.js')).status, 404);
});

const connect = (name, room, id = name) => new Promise((resolve) => {
  const ws = new WebSocket('ws://localhost:3999');
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name, room, id })); resolve(ws); });
});
// fails instead of hanging the whole run when an expected message never comes
const waitFor = (ws, type) => new Promise((resolve, reject) => {
  const giveUp = Date.now() + 5000;
  const check = () => {
    const i = ws.msgs.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(ws.msgs.splice(0, i + 1).pop());
    if (Date.now() > giveUp) return reject(new Error(`no "${type}" message within 5 s`));
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
  sendTo(lia, { type: 'ready', ready: true });
  sendTo(lia, { type: 'mode', mode: 'caca' }); // only the owner (first in, Leo) picks the prova
  await wait(50);
  let state = leo.msgs.filter((m) => m.type === 'state').pop();
  assert.strictEqual(state.mode, 'digitacao');
  assert.strictEqual(state.owner, state.players.find((p) => p.name === 'Leo').key);
  sendTo(leo, { type: 'mode', mode: 'caca' }); // changing the prova clears everyone's "pronto"
  await wait(50);
  state = leo.msgs.filter((m) => m.type === 'state').pop();
  assert.ok(state.mode === 'caca' && state.players.every((p) => !p.ready));
  sendTo(leo, { type: 'mode', mode: 'nao-existe' }); // ignored
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

test('Leva o Lápis: todo percurso tem saída e pontos seguros de verdade', () => {
  const { makeCourse, segDist, PENCIL_R } = require('../game');
  // same motion formulas as public/app.js
  const eraserAt = (o, t) => { const f = (1 - Math.cos(2 * Math.PI * t / o.period)) / 2; return { x: o.x1 + (o.x2 - o.x1) * f, y: o.y1 + (o.y2 - o.y1) * f }; };
  const hits = (o, p, t) => {
    if (o.type === 'blob') return Math.hypot(p.x - o.x, p.y - o.y) < o.r + PENCIL_R;
    if (o.type === 'eraser') {
      const c = eraserAt(o, t);
      const dx = Math.max(Math.abs(p.x - c.x) - o.w / 2, 0), dy = Math.max(Math.abs(p.y - c.y) - o.h / 2, 0);
      return dx * dx + dy * dy < PENCIL_R * PENCIL_R;
    }
    const a = o.phase + o.speed * t / 1000, half = o.len / 2;
    const end = (s) => ({ x: o.cx + s * half * Math.cos(a), y: o.cy + s * half * Math.sin(a) });
    return segDist(p, end(-1), end(1)) < PENCIL_R + 4;
  };
  for (let round = 0; round < 20; round++) {
    for (let level = 0; level < 60; level++) {
      const c = makeCourse(level);
      const blobs = c.obstacles.filter((o) => o.type === 'blob');
      // the guide line never touches a static blot, so the course can always be finished
      for (let k = 1; k < c.guide.length; k++) {
        for (let s = 0; s <= 1; s += 0.02) {
          const p = { x: c.guide[k - 1].x + (c.guide[k].x - c.guide[k - 1].x) * s, y: c.guide[k - 1].y + (c.guide[k].y - c.guide[k - 1].y) * s };
          assert.ok(!blobs.some((o) => hits(o, p, 0)), `level ${level}: guide blocked`);
        }
      }
      // start, checkpoint and finish are never hit by anything, at any moment
      for (let t = 0; t < 6000; t += 50) {
        for (const safe of [c.start, c.checkpoint, c.finish].filter(Boolean)) {
          assert.ok(!c.obstacles.some((o) => hits(o, safe, t)), `level ${level}: safe spot hit at ${t}ms`);
        }
      }
    }
  }
  assert.ok(makeCourse(8).obstacles.length > makeCourse(0).obstacles.length, 'later courses are harder');
});

test('Leva o Lápis: chegada rápida demais é recusada, pular custa 1 ponto', async () => {
  const ze = await connect('Zé', 'azul', 'ze');
  await wait(50);
  sendTo(ze, { type: 'mode', mode: 'lapis' });
  sendTo(ze, { type: 'ready', ready: true });
  const c0 = await waitFor(ze, 'course');
  assert.strictEqual(c0.index, 0);
  sendTo(ze, { type: 'done', index: 0 }); // no hand drags that fast
  await wait(c0.minMs + 20);
  sendTo(ze, { type: 'done', index: 0 });
  assert.strictEqual((await waitFor(ze, 'course')).index, 1);
  sendTo(ze, { type: 'skip' });
  const skipped = await waitFor(ze, 'course');
  assert.ok(skipped.skipped && skipped.index === 2);
  const { ranking } = await waitFor(ze, 'end');
  assert.deepStrictEqual(ranking.map((p) => [p.name, p.score]), [['Zé', 0]]); // +1 course, -1 skip
  sendTo(ze, { type: 'mode', mode: 'digitacao' });
  await wait(50);
  sendTo(ze, { type: 'leave' });
  await wait(50);
  ze.close();
});

test('Monta Palavra: sílabas bem formadas e peças certas', () => {
  const SYL = require('../syllables');
  const { makePuzzle } = require('../game');
  assert.ok(SYL.length >= 50, 'syllable list too short');
  assert.strictEqual(new Set(SYL).size, SYL.length, 'duplicate words');
  for (const w of SYL) {
    assert.match(w, /^[a-zà-ú]+(-[a-zà-ú]+)+$/, `bad format: ${w}`);
    const p = makePuzzle(w);
    assert.strictEqual(p.word, w.replace(/-/g, ''));
    assert.strictEqual(p.tiles.length, p.parts.length + 2, `${w}: two extra syllables`);
    for (const part of p.parts) assert.ok(p.tiles.includes(part), `${w}: missing ${part}`);
    assert.ok(p.tiles.filter((t) => !p.parts.includes(t)).length === 2, `${w}: extras must not be from the word`);
  }
});

test('Estoura Balões e Monta Palavra: regras no servidor', async () => {
  const bel = await connect('Bel', 'verde', 'bel');
  await wait(50);
  sendTo(bel, { type: 'mode', mode: 'baloes' });
  sendTo(bel, { type: 'ready', ready: true });
  const b0 = await waitFor(bel, 'balloon');
  assert.deepStrictEqual([b0.index, b0.kind], [0, 'click']); // the first three teach each click
  sendTo(bel, { type: 'skip' }); // no skipping balloons
  await wait(170);
  sendTo(bel, { type: 'hit', index: 0 });
  const b1 = await waitFor(bel, 'balloon');
  assert.deepStrictEqual([b1.index, b1.kind], [1, 'double']);
  sendTo(bel, { type: 'miss', index: 1 });
  assert.strictEqual((await waitFor(bel, 'balloon')).kind, 'right');
  let { ranking } = await waitFor(bel, 'end');
  assert.strictEqual(ranking[0].score, 1);

  sendTo(bel, { type: 'mode', mode: 'monta' });
  sendTo(bel, { type: 'ready', ready: true });
  const p0 = await waitFor(bel, 'puzzle');
  assert.strictEqual(p0.minMs, 400 * p0.parts.length);
  sendTo(bel, { type: 'done', index: 0 }); // too fast to have dragged anything: ignored
  sendTo(bel, { type: 'skip' });
  const p1 = await waitFor(bel, 'puzzle');
  assert.ok(p1.skipped && p1.index === 1);
  ({ ranking } = await waitFor(bel, 'end'));
  assert.strictEqual(ranking[0].score, -1); // the early "done" did not count, the skip cost 1
  sendTo(bel, { type: 'mode', mode: 'digitacao' });
  await wait(50);
  sendTo(bel, { type: 'leave' });
  await wait(50);
  bel.close();
});

test('quem entra numa sala vazia escolhe a prova', async () => {
  const ana = await connect('Ana', 'roxa', 'pick1');
  await wait(50);
  ana.send(JSON.stringify({ type: 'leave' }));
  await wait(50);
  ana.send(JSON.stringify({ type: 'join', name: 'Ana', room: 'roxa', id: 'pick1', mode: 'caca' }));
  const bia = await connect('Bia', 'roxa', 'pick2'); // joins with no prova: keeps the room's
  bia.send(JSON.stringify({ type: 'noop' }));
  await wait(50);
  assert.strictEqual(bia.msgs.filter((m) => m.type === 'state').pop().mode, 'caca');
  for (const ws of [ana, bia]) ws.send(JSON.stringify({ type: 'mode', mode: 'digitacao' }));
  await wait(50);
  for (const ws of [ana, bia]) { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
  await wait(50);
});

test('conexão morta sai da sala e destrava o início', async () => {
  const ok = await connect('Ok', 'azul', 'alive');
  // a laptop that went to sleep: connected, but never answers the server's ping
  const ghost = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3999', { autoPong: false });
    ws.on('error', () => {});
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name: 'Ghost', room: 'azul', id: 'ghost' })); resolve(ws); });
  });
  await wait(50);
  sendTo(ok, { type: 'ready', ready: true });
  await wait(50);
  assert.ok(!ok.msgs.some((m) => m.type === 'start'), 'Ghost is in the room and not ready yet');
  await waitFor(ok, 'start'); // two heartbeats later the ghost is dropped and the room starts
  assert.strictEqual(ghost.readyState, WebSocket.CLOSED);
  sendTo(ok, { type: 'leave' });
  await wait(50);
  ok.close();
});

test('mensagens em excesso são ignoradas', async () => {
  const spam = await connect('Spam', 'verde', 'spam');
  const watcher = await connect('Vê', 'verde', 'watch');
  await wait(1100); // start a fresh one-second window
  watcher.msgs.length = 0;
  for (let i = 0; i < 200; i++) sendTo(spam, { type: 'ready', ready: i % 2 === 0 });
  await wait(300);
  const states = watcher.msgs.filter((m) => m.type === 'state').length;
  assert.ok(states <= 31, `room got ${states} updates from one spammer`);
  for (const ws of [spam, watcher]) { sendTo(ws, { type: 'leave' }); ws.close(); }
  await wait(50);
});

test('jogar sozinho: sala particular, fora da lista, apagada no fim', async () => {
  const { soloRooms } = require('../game');
  const lu = await connect('Lu', 'solo', 'lu');
  const rui = await connect('Rui', 'solo', 'rui');
  await wait(50);
  // a separate room each, with the prova picked on the home screen
  lu.send(JSON.stringify({ type: 'leave' }));
  await wait(50);
  lu.send(JSON.stringify({ type: 'join', name: 'Lu', room: 'solo', id: 'lu', mode: 'caca' }));
  await wait(50);
  const state = lu.msgs.filter((m) => m.type === 'state').pop();
  assert.deepStrictEqual(state.players.map((p) => p.name), ['Lu']);
  assert.strictEqual(state.mode, 'caca');
  const { rooms } = lu.msgs.filter((m) => m.type === 'rooms').pop();
  assert.deepStrictEqual(rooms.map((r) => r.id), ['azul', 'verde', 'roxa']); // not in the lobby
  assert.strictEqual(rooms.reduce((n, r) => n + r.count, 0), 0, 'solo players take no seat in the rooms');

  sendTo(lu, { type: 'ready', ready: true }); // alone, "pronto" starts at once
  await waitFor(lu, 'target');
  lu.terminate(); // drops mid-game and comes back: same private room, same match
  await wait(50);
  const back = await connect('Lu', 'solo', 'lu');
  await waitFor(back, 'target');
  await waitFor(back, 'end');
  for (const ws of [back, rui]) sendTo(ws, { type: 'leave' });
  await wait(50);
  assert.strictEqual(soloRooms.size, 0, 'empty private rooms are removed');
  for (const ws of [back, rui]) ws.close();
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
