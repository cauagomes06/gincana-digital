const $ = (id) => document.getElementById(id);
const ROOM_COLORS = { azul: 'var(--azul)', verde: 'var(--verde)', roxa: 'var(--roxa)' };
let ws, myKey, word = '', lastGood = true, clockTimer, myReady = false, replaced = false;
let mode = 'digitacao', targetTimer;
const MODE_NAMES = { digitacao: 'Corrida das Letras', caca: 'Caça às Letras' };
const MODE_HELP = {
  digitacao: 'Digite a palavra que aparece. Cada palavra certa vale 1 ponto. Esc pula a palavra (−1 ponto).',
  caca: 'Clique nas letras antes que elas sumam. Cada letra vale 1 ponto, e elas ficam menores e mais rápidas.',
};
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
      $('clock').textContent = `⏱ ${clockText(Math.ceil(durationMs / 1000))}`;
      return;
    }
    const left = Math.max(0, Math.ceil((endAt - now) / 1000));
    $('clock').textContent = `⏱ ${clockText(left)}`;
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
  thud: () => sfx([48], 0, 0.08, 'triangle', 0.7),
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
    if (session.room) send({ type: 'join', name: session.name, room: session.room, id: session.id });
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
  send({ type: 'join', name, room, id: session.id });
}
function clearArena() {
  clearTimeout(targetTimer);
  $('arena').replaceChildren();
  $('arena').classList.add('hidden');
}
function showLobby() {
  session.room = null;
  saveSession();
  stopMusic();
  stopClock();
  clearArena();
  word = '';
  $('clock').textContent = '';
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
const skip = () => { if (word) send({ type: 'skip' }); };
$('skipBtn').onclick = () => { skip(); $('guess').focus(); };
for (const b of document.querySelectorAll('.mode')) b.onclick = () => send({ type: 'mode', mode: b.dataset.mode });
// a click on the empty paper is a miss: no penalty, just a sound so students notice
$('arena').onclick = (e) => { if (e.target === $('arena')) SFX.thud(); };
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
      const prova = document.createElement('small'); prova.textContent = `Prova: ${MODE_NAMES[r.mode]}`;
    const count = document.createElement('small'); count.textContent = `${r.count} de ${msg.max} alunos`;
      const status = document.createElement('small');
      status.textContent = r.running ? '🔒 Partida em andamento' : r.count >= msg.max ? 'Sala cheia' : 'Esperando alunos';
      b.append(name, prova, count, status);
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
    $('clock').textContent = '';
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
        li.innerHTML = '<span class="name"><span class="label"></span><span class="ok" aria-label="pronto"></span></span><span class="road"><span class="car"></span></span><span class="score"></span>';
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
  $('modeHelp').textContent = MODE_HELP[mode];
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
      SFX.thud();
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
    $('clock').textContent = 'Tempo esgotado!';
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
