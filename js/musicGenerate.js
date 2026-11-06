/*
 * Randomized Music Generator
 *
 * Balls bounce inside the canvas; every time one hits the keyboard at the
 * bottom, the key under it is played with audiosynth.js. Vertical barriers
 * (added automatically or by clicking) bounce the balls sideways.
 *
 * Physics units are "pixels per 60 fps frame" so the numbers in the settings
 * panel stay small and readable; the loop scales them by real elapsed time.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- Constants

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  var SCALES = {
    major:      { label: 'Majör',            steps: [0, 2, 4, 5, 7, 9, 11] },
    minor:      { label: 'Doğal minör',      steps: [0, 2, 3, 5, 7, 8, 10] },
    pentaMajor: { label: 'Pentatonik majör', steps: [0, 2, 4, 7, 9] },
    pentaMinor: { label: 'Pentatonik minör', steps: [0, 3, 5, 7, 10] },
    blues:      { label: 'Blues',            steps: [0, 3, 5, 6, 7, 10] },
    dorian:     { label: 'Dorian',           steps: [0, 2, 3, 5, 7, 9, 10] },
    chromatic:  { label: 'Kromatik',         steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
  };

  // Three ball sizes. `g` multiplies gravity when "size-dependent gravity" is on,
  // so each size bounces with its own period and the result is polyrhythmic.
  var SIZES = [{ r: 10, g: 2.0 }, { r: 17, g: 1.0 }, { r: 26, g: 0.5 }];

  var KEYBOARD_H = 64;
  var MIN_IMPACT = 0.6;          // slower floor contacts don't play a note
  var BARRIER_GRAB_PX = 8;
  var CANVAS_BG = '#0a0d13';
  var STORAGE_KEY = 'musicgen.settings.v1';

  var MODES = [['free', 'Serbest'], ['sequence', 'Sıradaki nota'], ['choreo', 'Koreografi']];

  var DEFAULTS = {
    mode: 'free',
    song: 'ode',
    tempo: 1,
    loop: true,
    customSong: 'C4 E4 G4 C5h | G4 E4 C4h | D4 F4 A4 D5h | B4h. -q | C5w',

    collisions: true,
    gravity: 0.35,
    sizeGravity: true,
    restitution: 1,
    maxSpeed: 14,
    simSpeed: 1,

    autoSpawn: true,
    maxBalls: 6,
    spawnInterval: 1,
    ballScale: 1,

    autoBarriers: true,
    maxBarriers: 3,
    barrierInterval: 5,

    muted: false,
    instrument: 'grand',
    volume: 0.7,
    reverb: 0.25,
    velocity: true,
    duration: 2,
    scale: 'major',
    root: 0,
    baseOctave: 2,
    octaves: 4,

    trails: false,
    labels: true,
    grid: true,

    clickMode: 'barrier'
  };

  // ------------------------------------------------------------ Formatting

  function fmtFixed(d) { return function (v) { return v.toFixed(d); }; }
  function fmtInt(v) { return String(Math.round(v)); }
  function fmtPct(v) { return Math.round(v * 100) + '%'; }
  function fmtTimes(v) { return trimZeros(v.toFixed(2)) + '×'; }
  function fmtSec(v) { return trimZeros(v.toFixed(2)) + ' sn'; }
  function trimZeros(s) { return s.replace(/\.?0+$/, ''); }

  // ------------------------------------------------------- Settings schema

  var SCHEMA = [
    { title: 'Mod ve melodi', items: [
      { key: 'mode', type: 'select', label: 'Mod', options: MODES, statusId: 'mode-status' },
      { key: 'song', type: 'select', label: 'Şarkı', groups: Songs.groups(), visible: songMode },
      { key: 'customSong', type: 'textarea', label: 'Kendi melodin', visible: function () { return songMode() && S.song === 'custom'; },
        hint: 'Nota+oktav, ardından süre: w=4, h=2, q=1 (varsayılan), e=½, s=¼ vuruş; "." noktalı, "-" sus, "#" diyez, "b" bemol. Örn: E4 D#4e C4h. -q' },
      { key: 'tempo', type: 'range', label: 'Tempo', min: 0.5, max: 1.5, step: 0.05, fmt: fmtTimes, visible: function () { return S.mode === 'choreo'; } },
      { key: 'loop', type: 'toggle', label: 'Şarkı bitince başa dön', visible: songMode },
      { type: 'buttons', buttons: [{ label: 'Şarkıyı baştan başlat', action: 'restartSong' }], visible: songMode }
    ] },
    { title: 'Fizik', items: [
      { key: 'collisions', type: 'toggle', label: 'Toplar birbirine çarpsın' },
      { key: 'gravity', type: 'range', label: 'Yerçekimi', min: 0, max: 1.5, step: 0.05, fmt: fmtFixed(2) },
      { key: 'sizeGravity', type: 'toggle', label: 'Küçük toplar daha hızlı düşsün', hint: 'Her boyut kendi ritminde zıplar.' },
      { key: 'restitution', type: 'range', label: 'Esneklik', min: 0.5, max: 1, step: 0.01, fmt: fmtPct, hint: '%100: zıplarken enerji kaybı yok.' },
      { key: 'maxSpeed', type: 'range', label: 'Azami hız', min: 4, max: 30, step: 1, fmt: fmtInt },
      { key: 'simSpeed', type: 'range', label: 'Simülasyon hızı', min: 0.25, max: 3, step: 0.25, fmt: fmtTimes }
    ] },
    { title: 'Toplar', items: [
      { key: 'autoSpawn', type: 'toggle', label: 'Otomatik top ekle' },
      { key: 'maxBalls', type: 'range', label: 'Azami top sayısı', min: 1, max: 30, step: 1, fmt: fmtInt },
      { key: 'spawnInterval', type: 'range', label: 'Ekleme aralığı', min: 0.2, max: 5, step: 0.1, fmt: fmtSec },
      { key: 'ballScale', type: 'range', label: 'Top boyutu', min: 0.5, max: 2, step: 0.1, fmt: fmtTimes },
      { type: 'buttons', buttons: [{ label: 'Top ekle', action: 'addBall' }, { label: 'Topları temizle', action: 'clearBalls' }] }
    ] },
    { title: 'Engeller', items: [
      { key: 'autoBarriers', type: 'toggle', label: 'Otomatik engel ekle' },
      { key: 'maxBarriers', type: 'range', label: 'Otomatik engel sınırı', min: 0, max: 12, step: 1, fmt: fmtInt, hint: 'Elle eklenen engeller sınıra dahil değil.' },
      { key: 'barrierInterval', type: 'range', label: 'Ekleme aralığı', min: 1, max: 20, step: 1, fmt: fmtSec },
      { type: 'buttons', buttons: [{ label: 'Engelleri temizle', action: 'clearBarriers' }] }
    ] },
    { title: 'Ses', items: [
      { key: 'muted', type: 'toggle', label: 'Sessiz' },
      { key: 'instrument', type: 'select', label: 'Enstrüman', groups: instrumentGroups(), statusId: 'instrument-status' },
      { key: 'volume', type: 'range', label: 'Ses düzeyi', min: 0, max: 1, step: 0.05, fmt: fmtPct },
      { key: 'reverb', type: 'range', label: 'Yankı', min: 0, max: 0.8, step: 0.05, fmt: fmtPct, hint: 'Salon etkisi; 0 tamamen kuru ses.' },
      { key: 'velocity', type: 'toggle', label: 'Çarpma hızı ses şiddetini etkilesin', hint: 'Hızlı düşen top daha güçlü basar.' },
      { key: 'duration', type: 'range', label: 'Nota süresi', min: 0.25, max: 4, step: 0.25, fmt: fmtSec },
      { key: 'scale', type: 'select', label: 'Dizi', options: Object.keys(SCALES).map(function (k) { return [k, SCALES[k].label]; }) },
      { key: 'root', type: 'select', label: 'Tonik', options: NOTE_NAMES.map(function (n, i) { return [i, prettyNote(n)]; }) },
      { key: 'baseOctave', type: 'range', label: 'Başlangıç oktavı', min: 1, max: 5, step: 1, fmt: fmtInt },
      { key: 'octaves', type: 'range', label: 'Oktav sayısı', min: 1, max: 4, step: 1, fmt: fmtInt }
    ] },
    { title: 'Görünüm', items: [
      { key: 'trails', type: 'toggle', label: 'İz bırak' },
      { key: 'labels', type: 'toggle', label: 'Nota etiketleri' },
      { key: 'grid', type: 'toggle', label: 'Tuş çizgileri' }
    ] }
  ];

  function songMode() { return S.mode !== 'free'; }

  // ------------------------------------------------------------------ State

  var S = loadSettings();

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, floorY = 0;

  var balls = [];
  var barriers = [];      // { fx: 0..1 fraction of width, auto: bool }
  var labels = [];
  var keys = [];

  var running = false;
  var started = false;
  var ballId = 0;
  var notesPlayed = 0;
  var spawnClock = 0;
  var barrierClock = 0;
  var autoBarriersAdded = 0;

  // Melody modes
  var song = null;         // parsed song: { title, bpm, notes: [{ midi|null, beats, beat }], totalBeats }
  var songNext = 0;        // next note index to play (sequence) or to launch (choreography)
  var songBeat = 0;        // choreography playhead, in beats
  var songOffset = 0;      // beats added for each loop of the song
  var songDone = false;

  var pointer = { x: -1, y: -1, inside: false, dragging: null };

  // ------------------------------------------------------------- Settings

  function loadSettings() {
    var s = Object.assign({}, DEFAULTS);
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.keys(DEFAULTS).forEach(function (k) {
        if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
      });
    } catch (e) { /* storage unavailable: use defaults */ }
    if (!SCALES[s.scale]) s.scale = DEFAULTS.scale;
    if (!SoundEngine.has(s.instrument)) s.instrument = DEFAULTS.instrument;
    if (!MODES.some(function (m) { return m[0] === s.mode; })) s.mode = DEFAULTS.mode;
    if (!Songs.has(s.song)) s.song = DEFAULTS.song;
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  function setSetting(key, value) {
    if (typeof DEFAULTS[key] === 'number') value = Number(value);
    S[key] = value;
    saveSettings();
    applySetting(key);
    updateVisibility();
  }

  function applySetting(key) {
    switch (key) {
      case 'instrument': SoundEngine.setInstrument(S.instrument); break;
      case 'volume': SoundEngine.setVolume(S.volume); break;
      case 'reverb': SoundEngine.setReverb(S.reverb); break;
      case 'scale': case 'root': case 'baseOctave': case 'octaves': buildKeys(); break;
      case 'mode': case 'song': case 'customSong': loadSong(key === 'mode'); break;
      case 'maxBalls': trimFreeBalls(); break;
      case 'ballScale': balls.forEach(function (b) { b.r = SIZES[b.size].r * S.ballScale; }); break;
      case 'clickMode': syncClickMode(); break;
    }
  }

  // ---------------------------------------------------------------- Keys

  function prettyNote(name) { return name.replace('#', '♯'); }

  function makeKey(midi, isRoot) {
    var name = NOTE_NAMES[midi % 12];
    return { name: name, octave: Math.floor(midi / 12) - 1, midi: midi, sharp: name.length > 1, isRoot: isRoot, flash: 0, color: '#fff' };
  }

  function buildKeys() {
    keys = [];
    if (S.mode !== 'free' && song && song.range) {
      // Melody modes: a chromatic keyboard covering exactly the song's range.
      for (var m = song.range[0]; m <= song.range[1]; m++) keys.push(makeKey(m, m % 12 === 0));
      return;
    }
    var steps = SCALES[S.scale].steps;
    for (var o = 0; o < S.octaves; o++) {
      for (var i = 0; i < steps.length; i++) {
        var semi = S.root + steps[i];
        var midi = Math.min(108, 12 * (S.baseOctave + o + 1) + semi);
        keys.push(makeKey(midi, i === 0));
      }
    }
  }

  function keyIndexOfMidi(midi) {
    for (var i = 0; i < keys.length; i++) if (keys[i].midi === midi) return i;
    return -1;
  }

  function keyCenter(i) { return (i + 0.5) * W / keys.length; }

  function keyIndexAt(x) {
    var i = Math.floor(x / (W / keys.length));
    return Math.max(0, Math.min(keys.length - 1, i));
  }

  function instrumentGroups() {
    var groups = [];
    SoundEngine.instruments.forEach(function (inst) {
      var g = groups[groups.length - 1];
      if (!g || g.label !== inst.group) groups.push(g = { label: inst.group, options: [] });
      g.options.push([inst.id, inst.label]);
    });
    return groups;
  }

  function playKey(index, x, color, impact, duration) {
    var key = keys[index];
    if (!key) return;
    key.flash = 1;
    key.color = color;
    notesPlayed++;

    if (S.labels) {
      labels.push({ x: x, y: floorY - 14, text: prettyNote(key.name) + key.octave, color: color, life: 1 });
    }
    if (!S.muted && started) {
      var velocity = S.velocity ? 0.3 + 0.7 * Math.min(1, impact / S.maxSpeed) : 0.8;
      try {
        SoundEngine.play(key.name, key.octave, { velocity: velocity, duration: duration || S.duration });
      } catch (e) { /* never let audio break the loop */ }
    }
  }

  // --------------------------------------------------------------- Balls

  function spawnBall(x, y, vx, vy) {
    var size = Math.floor(Math.random() * SIZES.length);
    var r = SIZES[size].r * S.ballScale;
    if (x === undefined) {
      x = r + Math.random() * Math.max(1, W - 2 * r);
      y = Math.max(r, H * 0.12 + Math.random() * H * 0.1);
      vx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3);
      vy = -Math.random() * 3;
    }
    balls.push({
      id: ballId,
      size: size,
      r: r,
      x: clamp(x, r, W - r),
      y: clamp(y, r, floorY - r),
      vx: vx || 0,
      vy: vy || 0,
      px: x,
      color: 'hsl(' + ((ballId * 137.508) % 360).toFixed(1) + ', 80%, 62%)',
      cooldown: 0
    });
    ballId++;
    trimFreeBalls();
  }

  function freeBallCount() {
    var n = 0;
    for (var i = 0; i < balls.length; i++) if (!balls[i].scripted) n++;
    return n;
  }

  function trimFreeBalls() {
    var extra = freeBallCount() - S.maxBalls;
    for (var i = 0; i < balls.length && extra > 0; ) {
      if (!balls[i].scripted) { balls.splice(i, 1); extra--; } else i++;
    }
  }

  function onFloorHit(b, impact) {
    if (b.scripted) {
      if (!b.spent) {
        b.spent = true;
        playKey(keyIndexOfMidi(b.midi), b.x, b.color, impact, b.noteDuration);
      }
      return;
    }
    if (S.mode === 'sequence' && song) {
      var n = nextSequenceNote();
      if (n) playKey(keyIndexOfMidi(n.midi), b.x, b.color, impact);
      return;
    }
    playKey(keyIndexAt(b.x), b.x, b.color, impact);
  }

  // --------------------------------------------------------------- Songs

  function loadSong(modeChanged) {
    song = Songs.load(S.song, S.customSong);
    var lo = Infinity, hi = -Infinity;
    song.notes.forEach(function (n) {
      if (n.midi === null) return;
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
    });
    if (lo <= hi) {
      while (hi - lo + 1 < 13) {      // at least an octave of keys so they don't get huge
        if (lo > 21) lo--;
        if (hi - lo + 1 < 13 && hi < 108) hi++;
      }
      song.range = [lo, hi];
    }
    buildKeys();
    if (modeChanged) {
      // Choreography owns the stage; free balls would only get in the way.
      if (S.mode === 'choreo') balls = [];
      else balls = balls.filter(function (b) { return !b.scripted; });
    }
    restartSong();
    renderModeStatus();
  }

  function restartSong() {
    songNext = 0;
    songOffset = 0;
    songDone = false;
    // Start early enough that the first ball can fall the whole way.
    songBeat = song && song.notes.length ? -dropPlan().frames / framesPerBeat() - 0.25 : 0;
    balls = balls.filter(function (b) { return !b.scripted; });
  }

  function playableNotes() {
    return song ? song.notes.filter(function (n) { return n.midi !== null; }).length : 0;
  }

  function nextSequenceNote() {
    if (!song || songDone) return null;
    for (var tries = 0; tries <= song.notes.length; tries++) {
      if (songNext >= song.notes.length) {
        if (!S.loop) { songDone = true; return null; }
        songNext = 0;
      }
      var n = song.notes[songNext++];
      if (n.midi !== null) return n;
    }
    return null;
  }

  function framesPerBeat() { return 3600 / (song.bpm * S.tempo); }

  // How choreographed balls fall. Every ball takes the same time to land, so
  // notes are launched in order; smaller balls simply start a little lower.
  function dropPlan() {
    var rMax = SIZES[SIZES.length - 1].r * S.ballScale;
    var dist = Math.max(40, floorY - 2 * rMax - 2);
    var g = S.gravity;
    if (g >= 0.02) return { g: g, vy0: 0, dist: dist, frames: Math.sqrt(2 * dist / g) };
    return { g: 0, vy0: 6, dist: dist, frames: dist / 6 };   // no gravity: constant fall
  }

  function updateChoreo(dt) {
    if (!song || songDone || !song.notes.length) return;
    var fpb = framesPerBeat();
    songBeat += dt / fpb;

    while (true) {
      if (songNext >= song.notes.length) {
        if (!S.loop) { songDone = true; return; }
        songOffset += song.totalBeats + 2;    // two beats of silence between loops
        songNext = 0;
      }
      var n = song.notes[songNext];
      if (n.midi === null) { songNext++; continue; }

      var plan = dropPlan();
      var launchBeat = songOffset + n.beat - plan.frames / fpb;
      if (songBeat < launchBeat) return;
      launchBall(n, plan, (songBeat - launchBeat) * fpb, fpb);
      songNext++;
    }
  }

  function launchBall(note, plan, late, fpb) {
    var idx = keyIndexOfMidi(note.midi);
    if (idx < 0) return;
    var size = Math.floor(Math.random() * SIZES.length);
    var r = SIZES[size].r * S.ballScale;
    var y0 = floorY - r - plan.dist;
    var tx = keyCenter(idx);
    var spread = W * 0.25;
    var x0 = clamp(tx + (Math.random() - 0.5) * 2 * spread, r, W - r);
    var vx = (tx - x0) / plan.frames;
    var t = Math.min(late, plan.frames - 1);   // catch up if we launched a little late
    balls.push({
      id: ballId,
      size: size,
      r: r,
      g: plan.g,
      x: x0 + vx * t,
      y: y0 + plan.vy0 * t + 0.5 * plan.g * t * t,
      vx: vx,
      vy: plan.vy0 + plan.g * t,
      px: x0,
      color: 'hsl(' + ((ballId * 137.508) % 360).toFixed(1) + ', 80%, 62%)',
      cooldown: 0,
      scripted: true,
      midi: note.midi,
      noteDuration: clamp(note.beats * fpb / 60 * 1.6, 0.35, 3),
      spent: false,
      alpha: 1
    });
    ballId++;
  }

  function stepBall(b, h, g) {
    var e = S.restitution;
    b.px = b.x;
    b.vy += (b.scripted ? b.g : g * (S.sizeGravity ? SIZES[b.size].g : 1)) * h;

    var speed = Math.hypot(b.vx, b.vy);
    if (!b.scripted && speed > S.maxSpeed) {           // clamp the magnitude, in every direction
      b.vx *= S.maxSpeed / speed;
      b.vy *= S.maxSpeed / speed;
    }

    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.cooldown > 0) b.cooldown -= h;

    // Side walls and ceiling: push out, then reflect.
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * e; }
    else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * e; }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * e; }

    // Keyboard (floor).
    if (b.y + b.r > floorY) {
      var impact = b.vy;
      b.y = Math.max(b.r, 2 * (floorY - b.r) - b.y);   // mirror the overshoot to conserve energy
      b.vy = -Math.abs(b.vy) * e;
      if (impact > MIN_IMPACT && b.cooldown <= 0) {
        onFloorHit(b, impact);
        b.cooldown = 4;
      }
      if (Math.abs(b.vy) < 0.3) { b.vy = 0; b.y = floorY - b.r; }  // came to rest
    }

    if (b.spent) b.alpha -= 0.025 * h;   // a choreographed ball fades out after its note

    // Barriers: resolve once per ball, on the side the ball came from.
    if (b.scripted || S.mode === 'choreo') return;
    for (var i = 0; i < barriers.length; i++) {
      var bx = barriers[i].fx * W;
      if (Math.abs(b.x - bx) < b.r) {
        var side = (b.px !== bx ? b.px - bx : b.x - bx) >= 0 ? 1 : -1;
        b.x = bx + side * (b.r + 0.01);
        b.vx = side * Math.abs(b.vx) * e;
      }
    }
  }

  function collide(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var minD = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD || d2 === 0) return;

    var d = Math.sqrt(d2);
    var nx = dx / d, ny = dy / d;
    var ma = a.r * a.r, mb = b.r * b.r;   // mass ∝ area
    var overlap = minD - d;

    a.x -= nx * overlap * mb / (ma + mb);
    a.y -= ny * overlap * mb / (ma + mb);
    b.x += nx * overlap * ma / (ma + mb);
    b.y += ny * overlap * ma / (ma + mb);

    var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel >= 0) return;                 // already separating
    var j = -(1 + S.restitution) * rel / (1 / ma + 1 / mb);
    a.vx -= j * nx / ma; a.vy -= j * ny / ma;
    b.vx += j * nx / mb; b.vy += j * ny / mb;
  }

  // ------------------------------------------------------------ Barriers

  function addBarrier(x, auto) {
    barriers.push({ fx: clamp(x / W, 0.01, 0.99), auto: !!auto });
  }

  function randomBarrierX() {
    // Similar to the original: around one of a few evenly spaced columns.
    var slots = 4;
    var slot = 1 + Math.floor(Math.random() * (slots - 1));
    return W * slot / slots + (Math.random() - 0.5) * W * 0.2;
  }

  function barrierNear(x, tol) {
    var best = -1, bestD = tol;
    for (var i = 0; i < barriers.length; i++) {
      var d = Math.abs(barriers[i].fx * W - x);
      if (d <= bestD) { best = i; bestD = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- Loop

  function update(dt) {
    var seconds = dt / 60;

    if (S.mode === 'choreo') updateChoreo(dt);

    if (S.autoSpawn && S.mode !== 'choreo' && freeBallCount() < S.maxBalls) {
      spawnClock += seconds;
      if (spawnClock >= S.spawnInterval) { spawnClock = 0; spawnBall(); }
    } else {
      spawnClock = 0;
    }

    if (S.autoBarriers && S.mode !== 'choreo' && autoBarriersAdded < S.maxBarriers) {
      barrierClock += seconds;
      if (barrierClock >= S.barrierInterval) {
        barrierClock = 0;
        addBarrier(randomBarrierX(), true);
        autoBarriersAdded++;
      }
    } else {
      barrierClock = 0;
    }

    // Sub-step so fast balls can't tunnel through barriers or each other.
    var steps = Math.min(16, Math.max(1, Math.ceil(dt * S.maxSpeed / 5)));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      for (var i = 0; i < balls.length; i++) stepBall(balls[i], h, S.gravity);
      if (S.collisions) {
        for (var a = 0; a < balls.length; a++) {
          if (balls[a].scripted) continue;    // choreographed balls must not be knocked off course
          for (var b = a + 1; b < balls.length; b++) if (!balls[b].scripted) collide(balls[a], balls[b]);
        }
      }
    }
    balls = balls.filter(function (b) { return !b.scripted || b.alpha > 0; });
  }

  var lastTime = performance.now();
  var lastStats = 0;

  function frame(now) {
    var ms = Math.min(50, now - lastTime);   // don't explode after a background tab
    lastTime = now;
    var dt = ms / (1000 / 60);

    if (running) update(dt * S.simSpeed);
    draw(dt);

    if (now - lastStats > 250) { lastStats = now; renderStats(); }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- Draw

  function draw(dt) {
    if (S.trails) {
      ctx.fillStyle = 'rgba(10, 13, 19, 0.2)';
    } else {
      ctx.fillStyle = CANVAS_BG;
    }
    ctx.fillRect(0, 0, W, H);

    var keyW = W / keys.length;
    var i;

    if (S.grid) {
      for (i = 1; i < keys.length; i++) {
        ctx.fillStyle = keys[i].isRoot ? 'rgba(124, 156, 255, 0.16)' : 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(Math.round(i * keyW), 0, 1, floorY);
      }
    }

    // Barriers (inactive while choreographing)
    var showBarriers = S.mode !== 'choreo';
    var hover = showBarriers && pointer.inside ? (pointer.dragging !== null ? pointer.dragging : barrierNear(pointer.x, BARRIER_GRAB_PX)) : -1;
    for (i = 0; showBarriers && i < barriers.length; i++) {
      var x = barriers[i].fx * W;
      ctx.fillStyle = i === hover ? '#ffffff' : 'rgba(230, 233, 239, 0.75)';
      ctx.fillRect(x - (i === hover ? 1.5 : 1), 0, i === hover ? 3 : 2, floorY);
    }
    if (showBarriers && pointer.inside && hover < 0 && S.clickMode === 'barrier' && pointer.y < floorY) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(124, 156, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(pointer.x + 0.5, 0);
      ctx.lineTo(pointer.x + 0.5, floorY);
      ctx.stroke();
      ctx.restore();
    }

    // Balls
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      ctx.globalAlpha = b.scripted ? Math.max(0, b.alpha) : 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating note labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    for (i = labels.length - 1; i >= 0; i--) {
      var l = labels[i];
      l.life -= 0.012 * dt;
      l.y -= 1.6 * dt;
      if (l.life <= 0) { labels.splice(i, 1); continue; }
      ctx.globalAlpha = l.life;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.globalAlpha = 1;

    drawKeyboard(keyW, dt);
  }

  function drawKeyboard(keyW, dt) {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, floorY, W, KEYBOARD_H);

    var showAll = keyW >= 26;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var x = i * keyW;
      ctx.fillStyle = k.sharp ? '#2a3040' : '#e8ebf2';
      ctx.fillRect(x + 1, floorY + 2, keyW - 2, KEYBOARD_H - 3);

      if (k.flash > 0) {
        ctx.globalAlpha = k.flash;
        ctx.fillStyle = k.color;
        ctx.fillRect(x + 1, floorY + 2, keyW - 2, KEYBOARD_H - 3);
        ctx.globalAlpha = 1;
        k.flash = Math.max(0, k.flash - 0.04 * dt);
      }

      if (showAll || k.isRoot) {
        ctx.fillStyle = k.sharp ? '#c9cfdc' : '#3a4152';
        ctx.fillText(prettyNote(k.name) + k.octave, x + keyW / 2, floorY + KEYBOARD_H - 6);
      }
    }
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var oldW = W, oldFloor = floorY;

    W = Math.max(200, rect.width);
    H = Math.max(KEYBOARD_H + 120, rect.height);
    floorY = H - KEYBOARD_H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (oldW) {
      balls.forEach(function (b) {
        b.x = clamp(b.x * W / oldW, b.r, W - b.r);
        b.y = clamp(b.y * floorY / oldFloor, b.r, floorY - b.r);
      });
    }
  }

  // ------------------------------------------------------------------ UI

  function buildPanel() {
    visibilityRules = [];
    var root = document.getElementById('controls');
    root.textContent = '';
    SCHEMA.forEach(function (section) {
      var sec = el('section', 'section');
      sec.appendChild(el('h2', null, section.title));
      section.items.forEach(function (item) { sec.appendChild(buildControl(item)); });
      root.appendChild(sec);
    });
    updateVisibility();
    renderModeStatus();
  }

  function buildControl(item) {
    var wrap = el('div', 'control');
    var id = 'ctl-' + item.key;

    if (item.type === 'toggle') {
      var lab = el('label', 'toggle');
      var span = el('span', null, item.label);
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = !!S[item.key];
      input.addEventListener('change', function () { setSetting(item.key, input.checked); });
      lab.append(span, input, el('span', 'switch'));
      wrap.appendChild(lab);
    } else if (item.type === 'range') {
      var head = el('div', 'control-head');
      var l = el('label', null, item.label);
      l.htmlFor = id;
      var val = el('span', 'control-value');
      head.append(l, val);
      var r = document.createElement('input');
      r.type = 'range';
      r.id = id;
      r.min = item.min; r.max = item.max; r.step = item.step;
      r.value = S[item.key];
      var show = function () {
        val.textContent = item.fmt(Number(r.value));
        r.style.setProperty('--fill', ((r.value - item.min) / (item.max - item.min) * 100) + '%');
      };
      show();
      r.addEventListener('input', function () {
        show();
        if (item.live !== false) setSetting(item.key, r.value);
      });
      r.addEventListener('change', function () { setSetting(item.key, r.value); });
      wrap.append(head, r);
    } else if (item.type === 'select') {
      var h = el('div', 'control-head');
      var sl = el('label', null, item.label);
      sl.htmlFor = id;
      h.appendChild(sl);
      var sel = document.createElement('select');
      sel.id = id;
      var addOptions = function (parent, options) {
        options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0];
          opt.textContent = o[1];
          parent.appendChild(opt);
        });
      };
      if (item.groups) {
        item.groups.forEach(function (g) {
          var og = document.createElement('optgroup');
          og.label = g.label;
          addOptions(og, g.options);
          sel.appendChild(og);
        });
      } else {
        addOptions(sel, item.options);
      }
      sel.value = S[item.key];
      sel.addEventListener('change', function () { setSetting(item.key, sel.value); });
      wrap.append(h, sel);
      if (item.statusId) {
        var status = el('p', 'control-hint control-status');
        status.id = item.statusId;
        wrap.appendChild(status);
        if (item.key === 'instrument') SoundEngine.onStatus(renderSoundStatus);
      }
    } else if (item.type === 'textarea') {
      var th = el('div', 'control-head');
      var tl = el('label', null, item.label);
      tl.htmlFor = id;
      th.appendChild(tl);
      var ta = document.createElement('textarea');
      ta.id = id;
      ta.rows = 4;
      ta.spellcheck = false;
      ta.value = S[item.key];
      ta.addEventListener('change', function () { setSetting(item.key, ta.value); });
      wrap.append(th, ta);
    } else if (item.type === 'buttons') {
      var row = el('div', 'button-row');
      item.buttons.forEach(function (bd) {
        var btn = el('button', 'btn', bd.label);
        btn.type = 'button';
        btn.addEventListener('click', ACTIONS[bd.action]);
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    }

    if (item.hint) wrap.appendChild(el('p', 'control-hint', item.hint));
    if (item.visible) visibilityRules.push({ node: wrap, test: item.visible });
    return wrap;
  }

  var visibilityRules = [];
  function updateVisibility() {
    visibilityRules.forEach(function (r) { r.node.hidden = !r.test(); });
  }

  var ACTIONS = {
    addBall: function () { spawnBall(); },
    clearBalls: function () { balls = []; spawnClock = 0; },
    clearBarriers: function () { barriers = []; autoBarriersAdded = 0; barrierClock = 0; },
    restartSong: function () { restartSong(); renderModeStatus(); }
  };

  var MODE_HINTS = {
    free: 'Toplar rastgele zıplar; hangi tuşa düşerse o çalar.',
    sequence: 'Her çarpma şarkının sıradaki notasını çalar; ritim toplardan gelir.',
    choreo: 'Her nota için bir top atılır ve tam zamanında doğru tuşa düşer. Engeller bu modda devre dışı.'
  };

  function renderModeStatus() {
    var node = document.getElementById('mode-status');
    if (!node) return;
    var text = MODE_HINTS[S.mode];
    if (songMode() && song) {
      if (song.errors.length) text += ' Anlaşılamayan: ' + song.errors.slice(0, 5).join(', ');
      else if (!playableNotes()) text += ' Şarkıda nota yok.';
    }
    node.textContent = text;
    node.dataset.status = songMode() && song && (song.errors.length || !playableNotes()) ? 'error' : 'ok';
  }

  function renderSoundStatus(st) {
    var node = document.getElementById('instrument-status');
    if (!node) return;
    node.textContent = st.text;
    node.dataset.status = st.status;
  }

  function renderStats() {
    var text = balls.length + ' top · ';
    if (S.mode !== 'choreo') text += barriers.length + ' engel · ';
    text += notesPlayed + ' nota';
    if (songMode() && song && playableNotes()) {
      text += ' · ♪ ' + song.title.split(' — ')[0];
      if (songDone) text += ' (bitti)';
    }
    document.getElementById('stats').textContent = text;
  }

  function setRunning(on) {
    running = on;
    document.getElementById('btn-play').textContent = on ? '⏸ Duraklat' : '▶ Devam';
  }

  function syncClickMode() {
    document.querySelectorAll('.segmented button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.mode === S.clickMode));
    });
  }

  function reset() {
    balls = [];
    barriers = [];
    labels = [];
    notesPlayed = 0;
    spawnClock = 0;
    barrierClock = 0;
    autoBarriersAdded = 0;
    keys.forEach(function (k) { k.flash = 0; });
    restartSong();
  }

  function bindUI() {
    document.getElementById('btn-start').addEventListener('click', function () {
      started = true;
      SoundEngine.unlock();
      document.getElementById('start-overlay').hidden = true;
      setRunning(true);
    });

    document.getElementById('btn-play').addEventListener('click', function () {
      if (!started) { document.getElementById('btn-start').click(); return; }
      setRunning(!running);
    });

    document.getElementById('btn-reset').addEventListener('click', reset);

    document.getElementById('btn-panel').addEventListener('click', function () {
      var app = document.getElementById('app');
      var hidden = app.classList.toggle('panel-hidden');
      this.setAttribute('aria-expanded', String(!hidden));
      requestAnimationFrame(resize);
    });

    document.getElementById('btn-defaults').addEventListener('click', function () {
      S = Object.assign({}, DEFAULTS, { clickMode: S.clickMode });
      saveSettings();
      Object.keys(S).forEach(applySetting);
      buildPanel();
    });

    document.querySelectorAll('.segmented button').forEach(function (b) {
      b.addEventListener('click', function () { setSetting('clickMode', b.dataset.mode); });
    });

    // Canvas pointer interaction
    function localPoint(ev) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = ev.clientX - rect.left;
      pointer.y = ev.clientY - rect.top;
    }

    canvas.addEventListener('pointermove', function (ev) {
      localPoint(ev);
      pointer.inside = true;
      if (pointer.dragging !== null) {
        barriers[pointer.dragging].fx = clamp(pointer.x / W, 0.01, 0.99);
      }
      canvas.style.cursor = pointer.dragging !== null || barrierNear(pointer.x, BARRIER_GRAB_PX) >= 0 ? 'ew-resize' : 'crosshair';
    });

    canvas.addEventListener('pointerleave', function () { pointer.inside = false; });

    canvas.addEventListener('pointerdown', function (ev) {
      localPoint(ev);
      var near = S.mode === 'choreo' ? -1 : barrierNear(pointer.x, BARRIER_GRAB_PX);

      if (ev.button === 2) {
        if (near >= 0) barriers.splice(near, 1);
        return;
      }
      if (ev.button !== 0) return;

      if (near >= 0) {
        pointer.dragging = near;
        canvas.setPointerCapture(ev.pointerId);
      } else if (pointer.y < floorY) {
        if (S.mode === 'choreo') return;   // the song drives the balls
        if (S.clickMode === 'barrier') addBarrier(pointer.x, false);
        else spawnBall(pointer.x, pointer.y, (Math.random() - 0.5) * 4, 0);
      }
    });

    canvas.addEventListener('pointerup', function () { pointer.dragging = null; });
    canvas.addEventListener('pointercancel', function () { pointer.dragging = null; });

    canvas.addEventListener('dblclick', function (ev) {
      localPoint(ev);
      var near = barrierNear(pointer.x, BARRIER_GRAB_PX);
      if (near >= 0) barriers.splice(near, 1);
    });

    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        document.getElementById('btn-play').click();
      } else if ((ev.key === 'b' || ev.key === 'B') && S.mode !== 'choreo') {
        spawnBall();
      }
    });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
  }

  // --------------------------------------------------------------- Utils

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- Init

  SoundEngine.init();
  SoundEngine.setInstrument(S.instrument);
  SoundEngine.setVolume(S.volume);
  SoundEngine.setReverb(S.reverb);
  resize();
  loadSong(false);
  buildPanel();
  bindUI();
  syncClickMode();
  renderStats();
  requestAnimationFrame(frame);

  // Small handle for debugging from the console.
  window.musicGen = {
    get balls() { return balls; },
    get barriers() { return barriers; },
    get keys() { return keys; },
    get settings() { return S; },
    get notesPlayed() { return notesPlayed; },
    get song() { return song; },
    get songNext() { return songNext; },
    spawnBall: spawnBall,
    addBarrier: addBarrier,
    reset: reset
  };
})();
