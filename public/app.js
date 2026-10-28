const $ = (id) => document.getElementById(id);
const ROOM_COLORS = { azul: 'var(--azul)', verde: 'var(--verde)', roxa: 'var(--roxa)' };
let ws, myKey, word = '', lastGood = true, clockTimer, myReady = false, replaced = false;
let mode = 'digitacao', targetTimer;
// one entry per prova: drives the home-screen cards, the in-room picker and the help text
const PROVAS = [
  { id: 'digitacao', name: 'Corrida das Letras', icon: 'keyboard', skip: 'Pular palavra (−1 ponto) · Esc',
    help: 'Digite a palavra que aparece. Cada palavra certa vale 1 ponto. Esc pula a palavra (−1 ponto).' },
  { id: 'caca', name: 'Caça às Letras', icon: 'cursor-click',
    help: 'Clique nas letras antes que elas sumam. Cada letra vale 1 ponto, e elas ficam menores e mais rápidas.' },
  { id: 'lapis', name: 'Leva o Lápis', icon: 'pencil-simple', skip: 'Pular percurso (−1 ponto)',
    help: 'Arraste o lápis até a bandeira sem encostar nos borrões, borrachas e réguas. Cada percurso vale 1 ponto.' },
  { id: 'baloes', name: 'Estoura Balões', icon: 'balloon',
    help: 'Estoure os balões antes que fujam: vermelho com 1 clique, amarelo com 2 cliques rápidos, verde com o botão direito.' },
  { id: 'monta', name: 'Monta Palavra', icon: 'puzzle-piece', skip: 'Pular palavra (−1 ponto)',
    help: 'Arraste as sílabas para os espaços e monte a palavra. Duas sílabas sobram! Cada palavra vale 1 ponto.' },
];
const BALLOON_LABELS = { click: '1 clique', double: '2 cliques', right: 'direito' };
const prova = (id) => PROVAS.find((p) => p.id === id) || PROVAS[0];
const iconSvg = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const lanes = new Map(); // player key -> <li>
// secret id survives reloads in this tab, so a dropped student rejoins the same match with their score
const session = (() => { try { return JSON.parse(sessionStorage.getItem('corrida')) || {}; } catch { return {}; } })();
session.id = session.id || Math.random().toString(36).slice(2) + Date.now().toString(36);
const saveSession = () => { try { sessionStorage.setItem('corrida', JSON.stringify(session)); } catch {} };
saveSession();
function setReady(ready) {
  myReady = ready;
  $('readyBtn').setAttribute('aria-pressed', ready);
  $('readyBtn').textContent = ready ? '✓ Pronto! (clique para cancelar)' : 'Estou pronto!';
}
function stopClock() {
  clearInterval(clockTimer);
  $('clock').classList.remove('hurry');
}
const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// "3, 2, 1" in the word area, then the match clock counting down
function runClock(countdownMs, durationMs) {
  const startAt = Date.now() + countdownMs, endAt = startAt + durationMs;
  let lastBeep;
  stopClock();
  const update = () => {
    const now = Date.now();
    if (now < startAt) {
      const n = Math.ceil((startAt - now) / 1000);
      if (n !== lastBeep) { lastBeep = n; $('word').textContent = n; SFX.tick(); }
      $('clockTime').textContent = clockText(Math.ceil(durationMs / 1000));
      return;
    }
    const left = Math.max(0, Math.ceil((endAt - now) / 1000));
    $('clockTime').textContent = clockText(left);
    $('clock').classList.toggle('hurry', left <= 10);
    if (left <= 5 && left > 0 && left !== lastBeep) { lastBeep = left; SFX.tick(); }
    if (!left) stopClock();
  };
  update();
  clockTimer = setInterval(update, 100);
}

// ---------- audio: chiptune loop + effects, all synthesized (no audio files) ----------
const prefs = { music: true, sfx: true };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('corrida-sound')) || {}); } catch {}
let ctx, musicBus, sfxBus, musicTimer, step = 0, nextAt = 0;
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

function initAudio() {
  if (ctx) return ctx.resume();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  musicBus = ctx.createGain(); musicBus.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(ctx.destination);
  applySound();
  if (document.body.dataset.room) startMusic();
}
// browsers only allow sound after a click or key press (matters after an automatic rejoin)
addEventListener('pointerdown', initAudio, { once: true });
addEventListener('keydown', initAudio, { once: true });
function tone(note, at, dur, type, bus, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = hz(note);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(bus);
  o.start(at); o.stop(at + dur + 0.05);
}
// C – Am – F – G, arpeggiated lead over a walking bass
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const STEP = 0.19;
function scheduleMusic() {
  while (nextAt < ctx.currentTime + 0.12) {
    const chord = CHORDS[Math.floor(step / 8) % 4], i = step % 8;
    tone(chord[ARP[i]] + 12, nextAt, 0.16, 'square', musicBus, 0.25);
    if (i % 2 === 0) tone(chord[0] - 12 + (i === 4 ? 7 : 0), nextAt, 0.32, 'triangle', musicBus, 0.7);
    step = (step + 1) % 32;
    nextAt += STEP;
  }
}
function startMusic() {
  if (!ctx || musicTimer) return;
  nextAt = ctx.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 30);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
function applySound() {
  if (ctx) { musicBus.gain.value = prefs.music ? 0.08 : 0; sfxBus.gain.value = prefs.sfx ? 0.25 : 0; }
  $('musicBtn').setAttribute('aria-pressed', prefs.music);
  $('sfxBtn').setAttribute('aria-pressed', prefs.sfx);
  try { localStorage.setItem('corrida-sound', JSON.stringify(prefs)); } catch {}
}
function sfx(notes, gap, dur, type = 'square', vol = 0.6) {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => tone(n, t + i * gap, dur, type, sfxBus, vol));
}
const SFX = {
  key: () => sfx([84], 0, 0.04, 'square', 0.25),
  wrong: () => sfx([45, 41], 0.07, 0.12, 'sawtooth', 0.5),
  word: () => sfx([72, 79], 0.08, 0.12),
  correct: () => sfx([72, 79, 84], 0.06, 0.16, 'triangle', 0.8),
  tick: () => sfx([90], 0, 0.05, 'square', 0.3),
  join: () => sfx([60, 67, 72], 0.07, 0.14, 'triangle', 0.8),
  // mid-range on purpose: cheap classroom speakers barely play anything below ~200 Hz
  missClick: () => sfx([64, 58], 0.06, 0.1, 'square', 0.6), // "bzz-bzz": clicked the paper, not the letter
  timeout: () => sfx([72, 67, 62, 55], 0.08, 0.14, 'sawtooth', 0.45), // falling "wom-wom": the letter got away
  crash: () => sfx([67, 61, 55], 0.05, 0.12, 'sawtooth', 0.55), // quick "brr": the pencil touched an obstacle
  pop: () => sfx([91, 79], 0.03, 0.07, 'square', 0.6), // balloon popped
  half: () => sfx([76], 0, 0.06, 'triangle', 0.7), // first of the two clicks a yellow balloon needs
  end: () => sfx([72, 72, 72, 76, 79, 76, 79, 84], 0.13, 0.22),
};
$('musicBtn').onclick = () => { prefs.music = !prefs.music; applySound(); };
$('sfxBtn').onclick = () => { prefs.sfx = !prefs.sfx; applySound(); };

// ---------- connection ----------
function connect() {
  const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  sock.onmessage = (e) => { if (sock === ws) handle(JSON.parse(e.data)); }; // ignore a stale socket
  sock.onopen = () => {
    $('lobbyMsg').textContent = '';
    if (session.room) send({ type: 'join', name: session.name, room: session.room, id: session.id, mode: session.mode });
  };
  sock.onclose = () => {
    if (sock !== ws) return;
    $('guess').disabled = true;
    if (replaced) {
      stopClock();
      $('info').textContent = 'O jogo foi aberto em outra aba. Continue jogando por lá.';
      return;
    }
    $('lobbyMsg').textContent = 'Conexão perdida. Tentando reconectar…';
    $('info').textContent = 'Conexão perdida. Tentando reconectar… Seus pontos estão guardados.';
    setTimeout(connect, 2000);
  };
}
const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

function joinRoom(room) {
  const name = $('name').value.trim();
  if (!name) { $('lobbyMsg').textContent = 'Digite seu nome antes de escolher a sala.'; return $('name').focus(); }
  Object.assign(session, { name, room });
  saveSession();
  initAudio();
  send({ type: 'join', name, room, id: session.id, mode: session.mode });
}
function clearArena() {
  clearTimeout(targetTimer);
  if (course) cancelAnimationFrame(course.frame);
  course = null;
  puzzle = null;
  $('arena').replaceChildren();
  $('arena').classList.add('hidden');
}

// ---------- Leva o Lápis ----------
// shapes and formulas must match makeCourse in game.js (the test checks the same ones)
const SVGNS = 'http://www.w3.org/2000/svg';
const BOARD_W = 600, BOARD_H = 380, PENCIL_R = 12;
let course = null; // the course on screen: data, svg elements, pencil position, drag state
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.append(el);
  return el;
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function eraserAt(o, t) {
  const f = (1 - Math.cos(2 * Math.PI * t / o.period)) / 2;
  return { x: o.x1 + (o.x2 - o.x1) * f, y: o.y1 + (o.y2 - o.y1) * f };
}
function rulerEnds(o, t) {
  const a = o.phase + o.speed * t / 1000, half = o.len / 2;
  return [-1, 1].map((s) => ({ x: o.cx + s * half * Math.cos(a), y: o.cy + s * half * Math.sin(a) }));
}
function touches(o, p, t) {
  if (o.type === 'blob') return Math.hypot(p.x - o.x, p.y - o.y) < o.r + PENCIL_R;
  if (o.type === 'eraser') {
    const c = eraserAt(o, t);
    const dx = Math.max(Math.abs(p.x - c.x) - o.w / 2, 0), dy = Math.max(Math.abs(p.y - c.y) - o.h / 2, 0);
    return dx * dx + dy * dy < PENCIL_R * PENCIL_R;
  }
  const [a, b] = rulerEnds(o, t);
  return segDist(p, a, b) < PENCIL_R + 4;
}
const elapsed = () => performance.now() - course.shownAt;
const hitsAnything = (p) => course.data.obstacles.some((o) => touches(o, p, elapsed()));

function startCourse(c) {
  if (course) cancelAnimationFrame(course.frame);
  const svg = svgEl('svg', { viewBox: `0 0 ${BOARD_W} ${BOARD_H}`, class: 'board' });
  svgEl('polyline', { points: c.guide.map((p) => `${p.x},${p.y}`).join(' '), class: 'guide' }, svg);
  svgEl('circle', { cx: c.start.x, cy: c.start.y, r: c.start.r, class: 'zone start' }, svg);
  if (c.checkpoint) svgEl('circle', { cx: c.checkpoint.x, cy: c.checkpoint.y, r: c.checkpoint.r, class: 'zone checkpoint' }, svg);
  svgEl('circle', { cx: c.finish.x, cy: c.finish.y, r: c.finish.r, class: 'zone finish' }, svg);
  svgEl('use', { href: '#i-flag-checkered', x: c.finish.x - 13, y: c.finish.y - 13, width: 26, height: 26, class: 'finish-flag' }, svg);
  const shapes = c.obstacles.map((o) => {
    if (o.type === 'blob') return svgEl('circle', { cx: o.x, cy: o.y, r: o.r, class: 'blob' }, svg);
    if (o.type === 'eraser') return svgEl('rect', { width: o.w, height: o.h, rx: 5, class: 'eraser' }, svg);
    return svgEl('line', { class: 'ruler' }, svg);
  });
  const pencil = svgEl('g', { class: 'pencil' }, svg);
  svgEl('circle', { r: PENCIL_R + 2 }, pencil);
  svgEl('use', { href: '#i-pencil-simple', x: -9, y: -9, width: 18, height: 18 }, pencil);

  course = { data: c, svg, shapes, pencil, pos: { ...c.start }, safe: { ...c.start }, dragging: false, done: false, shownAt: performance.now() };
  placePencil();
  pencil.addEventListener('pointerdown', (e) => {
    if (course.done) return;
    e.preventDefault();
    course.dragging = true;
    svg.setPointerCapture(e.pointerId);
    pencil.classList.add('held');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!course.dragging) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    movePencil({ x: Math.min(Math.max(p.x, PENCIL_R), BOARD_W - PENCIL_R), y: Math.min(Math.max(p.y, PENCIL_R), BOARD_H - PENCIL_R) });
  });
  const release = () => { course.dragging = false; pencil.classList.remove('held'); };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  $('arena').replaceChildren(svg);
  course.frame = requestAnimationFrame(animateCourse);
}
function placePencil() { course.pencil.setAttribute('transform', `translate(${course.pos.x} ${course.pos.y})`); }

// walk in small steps so a fast drag can't jump over a thin ruler
function movePencil(to) {
  const from = course.pos, steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
  for (let s = 1; s <= steps; s++) {
    const p = { x: from.x + (to.x - from.x) * s / steps, y: from.y + (to.y - from.y) * s / steps };
    if (hitsAnything(p)) return crash();
    course.pos = p;
    const cp = course.data.checkpoint;
    if (cp && course.safe !== cp && Math.hypot(p.x - cp.x, p.y - cp.y) < cp.r) {
      course.safe = cp;
      $('info').textContent = 'Ponto seguro! Se encostar, você volta para cá.';
      SFX.join();
    }
    const f = course.data.finish;
    if (Math.hypot(p.x - f.x, p.y - f.y) < f.r) { placePencil(); return finishCourse(); }
  }
  placePencil();
}
function crash() {
  course.dragging = false;
  course.pencil.classList.remove('held');
  course.pos = { x: course.safe.x, y: course.safe.y };
  placePencil();
  $('arena').classList.remove('hit');
  void $('arena').offsetWidth;
  $('arena').classList.add('hit');
  $('info').textContent = 'Encostou! Volte do ponto seguro.';
  SFX.crash();
}
function finishCourse() {
  course.done = true;
  course.dragging = false;
  $('info').textContent = 'Chegou! Próximo percurso…';
  SFX.correct();
  const { index, minMs } = course.data;
  // the server rejects arrivals faster than minMs; a very quick hand just waits a moment
  setTimeout(() => send({ type: 'done', index }), Math.max(0, minMs + 50 - elapsed()));
}
function animateCourse() {
  const t = elapsed();
  course.data.obstacles.forEach((o, i) => {
    const el = course.shapes[i];
    if (o.type === 'eraser') {
      const c = eraserAt(o, t);
      el.setAttribute('x', c.x - o.w / 2);
      el.setAttribute('y', c.y - o.h / 2);
    } else if (o.type === 'ruler') {
      const [a, b] = rulerEnds(o, t);
      el.setAttribute('x1', a.x); el.setAttribute('y1', a.y);
      el.setAttribute('x2', b.x); el.setAttribute('y2', b.y);
    }
  });
  if (!course.done && hitsAnything(course.pos)) crash(); // a moving obstacle ran into a resting pencil
  course.frame = requestAnimationFrame(animateCourse);
}
function showLobby() {
  session.room = null;
  saveSession();
  stopMusic();
  stopClock();
  clearArena();
  word = '';
  $('clockTime').textContent = '';
  lanes.clear();
  $('scores').replaceChildren();
  document.body.removeAttribute('data-room');
  $('game').classList.add('hidden');
  $('lobby').classList.remove('hidden');
}
$('leaveBtn').onclick = () => {
  send({ type: 'leave' });
  showLobby();
  $('lobbyMsg').textContent = '';
};
const skip = () => { if (word || (course && !course.done) || (puzzle && !puzzle.done)) send({ type: 'skip' }); };
$('skipBtn').onclick = () => { skip(); $('guess').focus(); };
// a click on the empty paper is a miss: no penalty, just a sound so students notice
const clickModes = ['caca', 'baloes'];
$('arena').onclick = (e) => { if (clickModes.includes(mode) && e.target === $('arena')) SFX.missClick(); };
$('arena').oncontextmenu = (e) => {
  if (mode !== 'baloes') return;
  e.preventDefault(); // the right button pops green balloons, so no browser menu here
  if (e.target === $('arena')) SFX.missClick();
};

// ---------- Estoura Balões ----------
function startBalloon(msg) {
  clearTimeout(targetTimer);
  const b = document.createElement('button');
  b.className = `balloon ${msg.kind}`;
  b.textContent = BALLOON_LABELS[msg.kind];
  b.setAttribute('aria-label', `Balão: ${BALLOON_LABELS[msg.kind]}`);
  b.style.cssText = `left: ${msg.x * 100}%; --size: ${msg.size}px; --life: ${msg.life}ms`;
  let popped = false;
  const pop = () => {
    popped = true;
    clearTimeout(targetTimer);
    b.classList.add('popped');
    b.disabled = true;
    send({ type: 'hit', index: msg.index });
    SFX.pop();
  };
  const wrong = () => {
    b.classList.remove('wrong');
    void b.offsetWidth;
    b.classList.add('wrong');
    SFX.missClick();
  };
  b.onclick = (e) => {
    if (popped) return;
    if (msg.kind === 'right') return wrong();
    // e.detail counts quick consecutive clicks; a slow second click starts over at 1
    if (msg.kind === 'double' && e.detail < 2) { b.classList.add('half'); return SFX.half(); }
    pop();
  };
  b.oncontextmenu = (e) => {
    e.preventDefault();
    if (popped) return;
    msg.kind === 'right' ? pop() : wrong();
  };
  $('arena').replaceChildren(b);
  targetTimer = setTimeout(() => {
    send({ type: 'miss', index: msg.index });
    SFX.timeout();
  }, msg.life);
}

// ---------- Monta Palavra ----------
let puzzle = null; // the word being built: data, slots, how many are filled
function startPuzzle(p) {
  const wrap = document.createElement('div');
  wrap.className = 'puzzle';
  const target = document.createElement('div');
  target.className = 'puzzle-word';
  target.textContent = p.word.toUpperCase();
  const slots = document.createElement('div');
  slots.className = 'slots';
  const slotEls = p.parts.map(() => {
    const s = document.createElement('div');
    s.className = 'slot';
    slots.append(s);
    return s;
  });
  wrap.append(target, slots);
  puzzle = { data: p, slotEls, filled: 0, done: false };

  p.tiles.forEach((text, i) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.textContent = text.toUpperCase();
    // spread the pieces over the lower half, in a loose grid
    tile.style.left = `${8 + (i % 4) * 23 + (i % 2) * 3}%`;
    tile.style.top = `${52 + Math.floor(i / 4) * 22}%`;
    tile.style.setProperty('--tilt', `${(i % 3 - 1) * 4}deg`);
    let start = null;
    tile.addEventListener('pointerdown', (e) => {
      if (puzzle.done) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      tile.setPointerCapture(e.pointerId);
      tile.classList.add('held');
    });
    tile.addEventListener('pointermove', (e) => {
      if (start) tile.style.translate = `${e.clientX - start.x}px ${e.clientY - start.y}px`;
    });
    const drop = (e) => {
      if (!start) return;
      start = null;
      tile.classList.remove('held');
      // which empty slot is under the pointer?
      const k = slotEls.findIndex((s) => {
        const r = s.getBoundingClientRect();
        return !s.textContent && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      tile.style.translate = '';
      if (k < 0) return;
      if (p.parts[k] !== text) {
        tile.classList.remove('wrong');
        void tile.offsetWidth;
        tile.classList.add('wrong');
        return SFX.missClick();
      }
      slotEls[k].textContent = text.toUpperCase();
      slotEls[k].classList.add('filled');
      tile.remove();
      SFX.key();
      if (++puzzle.filled === p.parts.length) finishPuzzle();
    };
    tile.addEventListener('pointerup', drop);
    tile.addEventListener('pointercancel', () => { start = null; tile.style.translate = ''; tile.classList.remove('held'); });
    wrap.append(tile);
  });
  puzzle.shownAt = performance.now();
  $('arena').replaceChildren(wrap);
}
function finishPuzzle() {
  puzzle.done = true;
  $('info').textContent = 'Palavra formada! Próxima…';
  SFX.correct();
  const { index, minMs } = puzzle.data;
  // the server rejects answers faster than minMs; a very quick hand just waits a moment
  setTimeout(() => send({ type: 'done', index }), Math.max(0, minMs + 50 - (performance.now() - puzzle.shownAt)));
}

// home screen cards (the choice travels with the student into an empty room) and the in-room picker
session.mode = session.mode || 'digitacao';
const markProva = () => { for (const c of document.querySelectorAll('.prova')) c.setAttribute('aria-pressed', c.dataset.mode === session.mode); };
for (const p of PROVAS) {
  const card = document.createElement('button');
  card.className = 'prova';
  card.dataset.mode = p.id;
  card.innerHTML = iconSvg(p.icon);
  const name = document.createElement('strong'); name.textContent = p.name;
  const help = document.createElement('small'); help.textContent = p.help;
  card.append(name, help);
  card.onclick = () => { session.mode = p.id; saveSession(); markProva(); };
  $('provas').append(card);

  const b = document.createElement('button');
  b.className = 'mode';
  b.dataset.mode = p.id;
  b.innerHTML = iconSvg(p.icon);
  b.append(` ${p.name}`);
  b.onclick = () => send({ type: 'mode', mode: p.id });
  $('modes').append(b);
}
markProva();
$('readyBtn').onclick = () => {
  setReady(!myReady);
  send({ type: 'ready', ready: myReady });
  SFX.key();
};

// ---------- typing ----------
function renderWord(typed = '') {
  const t = typed.toLowerCase().normalize('NFC');
  let ok = 0;
  while (ok < t.length && t[ok] === word[ok]) ok++;
  const done = document.createElement('span'); done.className = 'done'; done.textContent = word.slice(0, ok);
  const wrong = document.createElement('span'); wrong.className = 'wrong'; wrong.textContent = word.slice(ok, t.length);
  $('word').replaceChildren(done, wrong, word.slice(t.length));
  return ok === t.length;
}
$('guess').oninput = () => {
  const value = $('guess').value;
  const good = renderWord(value);
  if (good && value) SFX.key();
  if (!good && lastGood) { SFX.wrong(); $('guess').classList.remove('shake'); void $('guess').offsetWidth; $('guess').classList.add('shake'); }
  lastGood = good;
  if (value.trim().toLowerCase().normalize('NFC') === word) send({ type: 'guess', word: value });
};
// must not return false: an on* handler returning false cancels the keystroke
$('guess').onkeydown = (e) => {
  if (e.key === 'Enter') send({ type: 'guess', word: $('guess').value });
  if (e.key === 'Escape') skip();
};
$('guess').onpaste = (e) => e.preventDefault(); // no copy-paste cheating

// ---------- messages ----------
function handle(msg) {
  if (msg.type === 'rooms') {
    const s = msg.duration / 1000;
    $('duration').textContent = s % 60 ? `${s} segundos` : s === 60 ? '1 minuto' : `${s / 60} minutos`;
    $('rooms').replaceChildren(...msg.rooms.map((r) => {
      const b = document.createElement('button');
      b.className = 'room';
      b.style.setProperty('--c', ROOM_COLORS[r.id]);
      b.disabled = r.count >= msg.max || r.running;
      const name = document.createElement('strong'); name.textContent = r.name;
      const provaTag = document.createElement('small'); provaTag.textContent = `Prova: ${prova(r.mode).name}`;
    const count = document.createElement('small'); count.textContent = `${r.count} de ${msg.max} alunos`;
      const status = document.createElement('small');
      status.textContent = r.running ? '🔒 Partida em andamento' : r.count >= msg.max ? 'Sala cheia' : 'Esperando alunos';
      b.append(name, provaTag, count, status);
      b.onclick = () => joinRoom(r.id);
      return b;
    }));
  } else if (msg.type === 'replaced') {
    replaced = true;
  } else if (msg.type === 'joined') {
    myKey = msg.key;
    // after a server restart keys start over: drop old lanes and the old match clock
    stopClock();
    clearArena();
    lanes.clear();
    $('scores').replaceChildren();
    document.body.dataset.room = msg.room;
    $('roomName').textContent = msg.name;
    $('lobby').classList.add('hidden');
    $('game').classList.remove('hidden');
    word = '';
    $('word').textContent = '';
    $('clockTime').textContent = '';
    $('info').textContent = 'Clique em "Estou pronto!" quando estiver preparado.';
    $('skipBtn').classList.add('hidden');
    setReady(false);
    SFX.join();
    startMusic();
  } else if (msg.type === 'state') {
    const scale = Math.max(10, msg.players[0] ? msg.players[0].score : 0); // leader sets the scale
    const seen = new Set();
    msg.players.forEach((p, i) => {
      seen.add(p.key);
      let li = lanes.get(p.key);
      if (!li) {
        li = document.createElement('li');
        li.className = 'lane';
        li.innerHTML = '<span class="name"><span class="label"></span><span class="ok" aria-label="pronto"></span></span><span class="road"><span class="car"></span><svg class="flag" aria-hidden="true"><use href="#i-flag-checkered"/></svg></span><span class="score"></span>';
        li.querySelector('.label').textContent = p.name;
        li.querySelector('.car').textContent = [...p.name][0].toUpperCase(); // spread keeps emoji whole
        lanes.set(p.key, li);
        $('scores').append(li);
      }
      li.style.order = i;
      li.classList.toggle('me', p.key === myKey);
      li.classList.toggle('offline', !p.online);
      li.querySelector('.ok').textContent = !msg.running && p.ready ? ' ✓' : '';
      li.querySelector('.car').style.setProperty('--f', Math.max(0, p.score) / scale);
      li.querySelector('.score').textContent = p.score;
    });
    for (const [key, li] of lanes) if (!seen.has(key)) { li.remove(); lanes.delete(key); }
  mode = msg.mode;
  document.body.dataset.mode = mode;
  for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-pressed', b.dataset.mode === mode);
  $('modeHelp').textContent = prova(mode).help;
  $('skipBtn').textContent = prova(mode).skip || '';
  $('modes').classList.toggle('hidden', msg.running);
  const me = msg.players.find((p) => p.key === myKey);
  if (me && !msg.running) setReady(me.ready); // the server clears "pronto" when the prova changes
    $('readyBtn').parentElement.classList.toggle('hidden', msg.running);
    const readyCount = msg.players.filter((p) => p.ready).length;
    $('readyHint').textContent = `${readyCount} de ${msg.players.length} prontos. A partida começa quando todos estiverem prontos.`;
    $('round').textContent = `${msg.players.length} ${msg.players.length === 1 ? 'aluno' : 'alunos'} na sala`;
  } else if (msg.type === 'start') {
    word = '';
    $('info').textContent = 'Prepare-se!';
    $('guess').value = '';
    $('guess').disabled = true;
    $('skipBtn').classList.add('hidden');
    clearArena();
    runClock(msg.countdown, msg.duration);
  } else if (msg.type === 'course') {
    const first = $('arena').classList.contains('hidden');
    $('arena').classList.remove('hidden');
    $('word').textContent = '';
    $('info').textContent = msg.skipped ? 'Percurso pulado: −1 ponto.'
      : first ? 'Valendo! Arraste o lápis até a bandeira.' : `Percurso ${msg.index + 1}. Vai!`;
    $('skipBtn').classList.remove('hidden');
    msg.skipped ? SFX.wrong() : first && SFX.word();
    startCourse(msg);
  } else if (msg.type === 'balloon') {
    if ($('arena').classList.contains('hidden')) {
      $('arena').classList.remove('hidden');
      $('word').textContent = '';
      $('info').textContent = 'Valendo! Estoure os balões.';
      SFX.word();
    }
    startBalloon(msg);
  } else if (msg.type === 'puzzle') {
    const first = $('arena').classList.contains('hidden');
    $('arena').classList.remove('hidden');
    $('word').textContent = '';
    $('info').textContent = msg.skipped ? 'Palavra pulada: −1 ponto.' : first ? 'Valendo! Arraste as sílabas.' : 'Boa! Próxima palavra.';
    $('skipBtn').classList.remove('hidden');
    msg.skipped ? SFX.wrong() : first && SFX.word();
    startPuzzle(msg);
  } else if (msg.type === 'target') {
    if ($('arena').classList.contains('hidden')) {
      $('arena').classList.remove('hidden');
      $('word').textContent = '';
      $('info').textContent = 'Valendo! Clique nas letras.';
      SFX.word();
    }
    clearTimeout(targetTimer);
    const b = document.createElement('button');
    b.className = 'target';
    b.textContent = msg.letter;
    b.setAttribute('aria-label', `Letra ${msg.letter}`);
    b.style.cssText = `left: ${msg.x * 100}%; top: ${msg.y * 100}%; --size: ${msg.size}px; --life: ${msg.life}ms`;
    b.onclick = () => {
      clearTimeout(targetTimer);
      b.disabled = true; // until the server sends the next letter
      send({ type: 'hit', index: msg.index });
      SFX.correct();
    };
    $('arena').replaceChildren(b);
    targetTimer = setTimeout(() => {
      b.remove();
      send({ type: 'miss', index: msg.index });
      SFX.timeout();
    }, msg.life);
  } else if (msg.type === 'word') {
    const first = !word;
    word = msg.word;
    lastGood = true;
    renderWord();
    $('info').textContent = msg.skipped ? 'Palavra pulada: −1 ponto.' : first ? 'Valendo! Digite rápido.' : 'Boa! Próxima palavra.';
    $('guess').value = '';
    $('guess').classList.remove('shake');
    $('guess').disabled = false;
    $('guess').focus();
    $('skipBtn').classList.remove('hidden');
    msg.skipped ? SFX.wrong() : first ? SFX.word() : SFX.correct();
  } else if (msg.type === 'end') {
    stopClock();
    clearArena();
    $('clockTime').textContent = 'Tempo esgotado!';
    word = '';
    const placeOf = (p) => 1 + msg.ranking.filter((o) => o.score > p.score).length; // ties share a place
    const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;
    const podium = document.createElement('div');
    podium.className = 'podium';
    for (const i of [1, 0, 2]) { // 2nd, 1st, 3rd
      const p = msg.ranking[i];
      if (!p) continue;
      const step = document.createElement('div');
      step.className = `p${i + 1}`;
      const place = document.createElement('b'); place.textContent = `${placeOf(p)}º`;
      step.append(place, p.name, document.createElement('br'), pts(p.score));
      podium.append(step);
    }
    $('word').replaceChildren(podium);
    const me = msg.ranking.find((p) => p.key === myKey);
    $('info').textContent = (me ? `Você ficou em ${placeOf(me)}º lugar com ${pts(me.score)}. ` : '') + 'Clique em "Estou pronto!" para jogar de novo.';
    $('guess').value = '';
    $('guess').disabled = true;
    $('skipBtn').classList.add('hidden');
    setReady(false);
    SFX.end();
  } else if (msg.type === 'error') {
    if (!$('game').classList.contains('hidden')) showLobby(); // automatic rejoin was refused
    $('lobbyMsg').textContent = msg.message;
  }
}

$('name').value = session.name || '';
applySound();
connect();
