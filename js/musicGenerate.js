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

    choreoReuse: 'max',
    choreoTolerance: 0.1,
    choreoTilt: 12,
    choreoWalls: true,
    choreoMaxHop: 0.8,
    choreoMaxSpeed: 14,
    choreoSize: 'mixed',
    launchFrom: 'random',
    launchSpread: 0.25,
    launchHeight: 1,

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
    { title: 'Koreografi', visible: function () { return S.mode === 'choreo'; }, items: [
      { key: 'choreoReuse', type: 'select', label: 'Top kullanımı', statusId: 'choreo-status', options: [
        ['none', 'Her nota yeni top'], ['repeat', 'Yalnızca tekrarlanan notalar'], ['max', 'Fiziğin izin verdiği kadar az top']] },
      { key: 'choreoTolerance', type: 'range', label: 'Enerji toleransı', min: 0, max: 0.4, step: 0.02, fmt: fmtPct,
        hint: 'Bir sekme doğal sekmeden en fazla bu kadar güçlü/zayıf olabilir (tuşun küçük itmesi). Esneklik %100 iken eşit ritimli notalar zincirlenir.',
        visible: function () { return S.choreoReuse !== 'none'; } },
      { key: 'choreoTilt', type: 'range', label: 'Tuş eğimi', min: 0, max: 25, step: 1, fmt: function (v) { return Math.round(v) + '°'; },
        hint: 'Basılan tuşun eğimi topu en fazla bu açının iki katı döndürebilir; yakın tuşlara geçişi bu sağlar. 0°: top yön değiştirmez.',
        visible: function () { return S.choreoReuse === 'max'; } },
      { key: 'choreoWalls', type: 'toggle', label: 'Duvarlardan yansıyabilsin',
        hint: 'Top yan duvarlara ayna gibi çarpıp yön değiştirerek uzak ya da geri yöndeki tuşa geçebilir.',
        visible: function () { return S.choreoReuse === 'max'; } },
      { key: 'choreoMaxHop', type: 'range', label: 'Azami sıçrama yüksekliği', min: 0.1, max: 1, step: 0.05, fmt: fmtPct,
        hint: 'Boş yüksekliğe göre. Uzun aralar yüksek sıçrama ister; sığmayan nota yeni topla çalınır.', visible: function () { return S.choreoReuse !== 'none'; } },
      { key: 'choreoMaxSpeed', type: 'range', label: 'Azami yatay hız', min: 2, max: 40, step: 1, fmt: fmtInt,
        hint: 'Uzak tuşlara hızlı geçişleri sınırlar.', visible: function () { return S.choreoReuse !== 'none'; } },
      { key: 'choreoSize', type: 'select', label: 'Top boyutu', options: [
        ['mixed', 'Karışık'], ['small', 'Küçük'], ['medium', 'Orta'], ['large', 'Büyük']] },
      { key: 'launchFrom', type: 'select', label: 'Atış yeri', options: [
        ['random', 'Tuşun çevresinden (rastgele)'], ['above', 'Tuşun tam üstünden'], ['center', 'Ortadan'],
        ['left', 'Soldan'], ['right', 'Sağdan']] },
      { key: 'launchSpread', type: 'range', label: 'Atış dağılımı', min: 0, max: 0.5, step: 0.05, fmt: fmtPct,
        visible: function () { return S.launchFrom === 'random'; } },
      { key: 'launchHeight', type: 'range', label: 'Atış yüksekliği', min: 0.2, max: 1, step: 0.05, fmt: fmtPct,
        hint: 'Atış yeri ve yüksekliği tek notalık toplar için. Birkaç nota çalan top, ilk sekmesine uyan yükseklikten ve hızla kendiliğinden girer.' }
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
  var plan = null;         // choreography plan of the first repetition (for the status line)
  var pending = [];        // queued ball launches: { beat, chain, offset }
  var plannedOffset = 0;   // song offset (beats) of the next repetition to plan
  var debugHit = null;     // optional hook for tests: called on every choreographed hop

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
      case 'gravity': case 'tempo': if (S.mode === 'choreo') renderModeStatus(); break;
      case 'choreoReuse': case 'choreoTolerance': case 'choreoTilt': case 'choreoWalls': case 'choreoMaxHop': case 'choreoMaxSpeed': case 'restitution':
      case 'choreoSize': case 'launchFrom': case 'launchSpread': case 'launchHeight':
        if (S.mode === 'choreo') { restartSong(); renderModeStatus(); }
        break;
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
      if (b.spent) return;
      // Loudness shouldn't depend on hop size, so use a steady "impact".
      playKey(keyIndexOfMidi(b.midi), b.x, b.color, S.maxSpeed * 0.75, noteSeconds(b.noteBeats));
      var next = b.queue.shift();
      if (!next) { b.spent = true; return; }
      // Hop to the next key so we land exactly on its beat. Aiming from the
      // real hit time and position corrects any drift along the way.
      var T = Math.max(2, (next.beat - songBeat) * framesPerBeat());
      var idx = keyIndexOfMidi(next.midi);
      var vxIn = b.vx, vyNatural = -b.vy;      // after the bounce: |vy| = e · impact
      var landErr = Math.abs(b.x - keyCenter(keyIndexOfMidi(b.midi)));
      var prevVia = b.via;
      b.vx = hopVelocity(next.via, b.x, keyCenter(idx), T, b.r, b.e).out;
      b.via = next.via;
      b.mirrored = false;
      b.vy = -b.g * T / 2;
      if (debugHit) debugHit({ vyNatural: vyNatural, vyOut: -b.vy, vxIn: vxIn, vxOut: b.vx, via: next.via, prevVia: prevVia, landErr: landErr });
      b.midi = next.midi;
      b.noteBeats = next.beats;
      b.hopCooldown = T * 0.5;
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
    plan = null;
    pending = [];
    plannedOffset = 0;
    balls = balls.filter(function (b) { return !b.scripted; });
    songBeat = 0;
    if (!song || !W || !playableNotes()) return;
    enqueueLoop();
    // Start early enough that the first ball can make its whole entrance.
    songBeat = Math.min(0, pending.length ? pending[0].beat : 0) - 0.25;
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

  function noteSeconds(beats) {
    return clamp(beats * framesPerBeat() / 60 * 1.6, 0.35, 3);
  }

  var CHOREO_SIZES = { small: 0, medium: 1, large: 2 };

  function chainSize() {
    var fixed = CHOREO_SIZES[S.choreoSize];
    return fixed === undefined ? Math.floor(Math.random() * SIZES.length) : fixed;
  }

  function largestRadius() {
    var fixed = CHOREO_SIZES[S.choreoSize];
    return SIZES[fixed === undefined ? SIZES.length - 1 : fixed].r * S.ballScale;
  }

  // How a new choreographed ball falls onto its first key. Every drop takes the
  // same time, so balls are launched in order; smaller balls start a bit lower.
  function dropPlan() {
    var room = Math.max(40, floorY - 2 * largestRadius() - 2);   // free height above the keys
    var dist = Math.max(20, room * S.launchHeight);
    var g = S.gravity;
    if (g >= 0.02) return { g: g, vy0: 0, room: room, dist: dist, frames: Math.sqrt(2 * dist / g) };
    return { g: 0, vy0: 6, room: room, dist: dist, frames: dist / 6 };   // no gravity: constant fall
  }

  /*
   * Assign the song's notes to balls so that every ball moves like a real one:
   * between two hits it flies a free parabola, its sideways speed stays the same,
   * and each bounce gives back e (restitution) of the vertical speed — so the
   * time between bounces goes T, e·T, e²·T, ...
   *
   * A note can therefore continue a ball's chain only if its timing fits that
   * pattern (within the energy tolerance: the small push a key may give) and the
   * change of direction can come from the pressed key's tilt: bouncing off a
   * surface tilted by θ turns the ball by up to 2θ, i.e. |Δvx| ≤ tan(2θ)·vy.
   * Repeated notes and evenly timed steps to nearby keys chain naturally;
   * everything else gets its own ball.
   */
  // Ways to fly from one key to the next: straight, or mirrored once off a side wall.
  var VIA_DIRECT = 0, VIA_RIGHT = 1, VIA_LEFT = 2;

  // Horizontal speed leaving x1 and arriving at x2 after T frames along `via`.
  // A wall returns e of the horizontal speed, like the floor does vertically.
  function hopVelocity(via, x1, x2, T, r, e) {
    if (via === VIA_DIRECT) { var v = (x2 - x1) / T; return { out: v, inn: v }; }
    var wall = via === VIA_RIGHT ? W - r : r;
    var d1 = Math.abs(wall - x1), d2 = Math.abs(wall - x2);
    var out = (d1 + d2 / e) / T * (via === VIA_RIGHT ? 1 : -1);
    return { out: out, inn: -e * out };
  }

  function planChoreo() {
    var fpb = framesPerBeat();
    var drop = dropPlan();
    var e = Math.max(0.05, S.restitution);
    var tol = S.choreoTolerance;
    var tilt = S.choreoReuse === 'max' ? Math.tan(2 * S.choreoTilt * Math.PI / 180) : 0;
    var canHop = drop.g >= 0.02 && S.choreoReuse !== 'none';
    var vias = S.choreoReuse === 'max' && S.choreoWalls ? [VIA_DIRECT, VIA_RIGHT, VIA_LEFT] : [VIA_DIRECT];
    var maxHop = S.choreoMaxHop * drop.room;
    var maxT = canHop ? Math.sqrt(8 * maxHop / drop.g) : 0;   // longest hop that fits under the limit
    var rPlan = SIZES[1].r * S.ballScale;                     // walls are aimed again with the real radius

    var P = [];
    song.notes.forEach(function (n) {
      if (n.midi === null) return;
      var idx = keyIndexOfMidi(n.midi);
      if (idx >= 0) P.push({ note: n, t: n.beat * fpb, x: keyCenter(idx) });
    });
    var N = P.length;
    var alive = P.map(function () { return true; });
    var V = vias.length;

    // One hop a -> b along a given path, or null if it isn't possible on its own.
    function hop(a, b, via) {
      var T = b.t - a.t;
      if (T < 4 || T > maxT) return null;
      if (S.choreoReuse === 'repeat' && b.x !== a.x) return null;
      var v = hopVelocity(via, a.x, b.x, T, rPlan, e);
      if (Math.abs(v.out) > S.choreoMaxSpeed) return null;
      return v;
    }
    // The bounce at b, between arriving with vIn (after hop of length T1) and
    // leaving with vOut (hop of length T2), respects energy and key tilt.
    function bounceOK(T1, vIn, T2, vOut) {
      if (Math.abs(T2 - e * T1) > tol * e * T1 + 1e-9) return false;
      return Math.abs(vOut - vIn) <= tilt * drop.g * T2 / 2 + 1e-9;
    }

    var chains = [];
    while (canHop) {
      // best[(i*N+j)*V+v] = longest chain whose last hop is i -> j along vias[v].
      var best = new Map(), bestKey = -1, bestLen = 0, bestWalls = 0;
      for (var j = 0; j < N; j++) {
        if (!alive[j]) continue;
        for (var i = j - 1; i >= 0 && P[j].t - P[i].t <= maxT; i--) {
          if (!alive[i]) continue;
          var T2 = P[j].t - P[i].t;
          for (var v = 0; v < V; v++) {
            var h2 = hop(P[i], P[j], vias[v]);
            if (!h2) continue;
            var len = 2, walls = v ? 1 : 0, prev = -1;
            for (var k = i - 1; k >= 0 && P[i].t - P[k].t <= maxT; k--) {
              for (var u = 0; u < V; u++) {
                var st = best.get((k * N + i) * V + u);
                if (!st) continue;
                var cand = st.len + 1, candWalls = st.walls + (v ? 1 : 0);
                if (cand < len || (cand === len && candWalls >= walls)) continue;
                if (!bounceOK(P[i].t - P[k].t, st.vIn, T2, h2.out)) continue;
                len = cand; walls = candWalls; prev = (k * N + i) * V + u;
              }
            }
            var key = (i * N + j) * V + v;
            best.set(key, { len: len, walls: walls, prev: prev, i: i, j: j, via: vias[v], vIn: h2.inn, vOut: h2.out });
            if (len > bestLen || (len === bestLen && walls < bestWalls)) { bestLen = len; bestWalls = walls; bestKey = key; }
          }
        }
      }
      if (bestKey < 0) break;
      // Walk back: collect notes and the path used for every hop.
      var idxs = [], hopVias = [], key2 = bestKey, firstOut = 0;
      while (key2 >= 0) {
        var stt = best.get(key2);
        idxs.push(stt.j);
        hopVias.push(stt.via);
        firstOut = stt.vOut;
        if (stt.prev < 0) idxs.push(stt.i);
        key2 = stt.prev;
      }
      idxs.reverse();
      hopVias.reverse();
      idxs.forEach(function (q) { alive[q] = false; });
      chains.push({
        notes: idxs.map(function (q) { return P[q].note; }),
        vias: hopVias,                 // vias[h] = path of the hop into notes[h + 1]
        firstPeriod: P[idxs[1]].t - P[idxs[0]].t,
        firstVx: firstOut
      });
    }
    for (var q = 0; q < N; q++) if (alive[q]) chains.push({ notes: [P[q].note], vias: [] });

    var longest = 0, wallHops = 0;
    chains.forEach(function (c) {
      c.size = chainSize();
      c.launch = launchFor(c, drop, e, fpb);
      longest = Math.max(longest, c.notes.length);
      c.vias.forEach(function (v) { if (v) wallHops++; });
    });
    chains.sort(function (x, y) { return x.notes[0].beat - y.notes[0].beat; });
    return { chains: chains, notes: N, longest: longest, wallHops: wallHops, fpb: fpb };
  }

  // Where and how a chain's ball enters so that it reaches its first key on time.
  function launchFor(c, drop, e, fpb) {
    var r = SIZES[c.size].r * S.ballScale;
    var tx = keyCenter(keyIndexOfMidi(c.notes[0].midi));
    if (c.notes.length >= 2) {
      // Fall from rest from exactly the height whose bounce gives the first hop.
      var vyOut = drop.g * c.firstPeriod / 2;
      var vyIn = vyOut / e;
      var frames = vyIn / drop.g;
      var h = vyIn * vyIn / (2 * drop.g);
      return { frames: frames, x0: tx - c.firstVx * frames, y0: floorY - r - h, vx: c.firstVx, vy0: 0,
               fadeIn: h < drop.room * 0.35 };
    }
    var x0 = launchX(tx, r);
    return { frames: drop.frames, x0: x0, y0: floorY - r - drop.dist, vx: (tx - x0) / drop.frames, vy0: drop.vy0, fadeIn: false };
  }

  // Plans one more repetition of the song and queues its balls.
  function enqueueLoop() {
    var p = planChoreo();
    if (!plan) plan = p;
    var offset = plannedOffset;
    p.chains.forEach(function (c) {
      pending.push({ beat: offset + c.notes[0].beat - c.launch.frames / p.fpb, chain: c, offset: offset });
    });
    pending.sort(function (a, b) { return a.beat - b.beat; });
    plannedOffset += song.totalBeats + 2;    // two beats of silence between loops
  }

  function updateChoreo() {
    if (!song || !plan || !plan.notes) return;
    var loopLen = song.totalBeats + 2;
    // Keep one repetition planned ahead so long lead-ins are never late.
    if (S.loop && songBeat > plannedOffset - 2 * loopLen) enqueueLoop();

    var fpb = framesPerBeat();
    while (pending.length && pending[0].beat <= songBeat) {
      var job = pending.shift();
      launchChain(job.chain, job.offset, (songBeat - job.beat) * fpb);
    }
    if (!pending.length && !S.loop) songDone = true;
  }

  function launchX(tx, r) {
    switch (S.launchFrom) {
      case 'above': return tx;
      case 'left': return r;
      case 'right': return W - r;
      case 'center': return W / 2;
      default: return clamp(tx + (Math.random() - 0.5) * 2 * S.launchSpread * W, r, W - r);
    }
  }

  function launchChain(chain, offset, late) {
    var L = chain.launch;
    var first = chain.notes[0];
    var g = dropPlan().g;
    var t = Math.min(late, L.frames - 1);      // catch up if we launched a little late
    balls.push({
      id: ballId,
      size: chain.size,
      r: SIZES[chain.size].r * S.ballScale,
      g: g,
      x: L.x0 + L.vx * t,
      y: L.y0 + L.vy0 * t + 0.5 * g * t * t,
      vx: L.vx,
      vy: L.vy0 + g * t,
      px: L.x0,
      color: 'hsl(' + ((ballId * 137.508) % 360).toFixed(1) + ', 80%, 62%)',
      cooldown: 0,
      hopCooldown: 0,
      scripted: true,
      midi: first.midi,
      noteBeats: first.beats,
      queue: chain.notes.slice(1).map(function (n, h) {
        return { midi: n.midi, beats: n.beats, beat: n.beat + offset, via: chain.vias[h] || VIA_DIRECT };
      }),
      e: Math.max(0.05, S.restitution),
      via: VIA_DIRECT,
      mirrored: false,
      spent: false,
      alpha: L.fadeIn ? 0 : 1,
      fadingIn: L.fadeIn
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

    // Side walls and ceiling: push out, then reflect. Choreographed balls are
    // aimed precisely, so they may briefly leave the top of the screen instead.
    if (!b.scripted) {
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * e; }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * e; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * e; }
    } else {
      if (b.hopCooldown > 0) b.hopCooldown -= h;
      // A side wall acts as a mirror only on a hop planned to use it, once.
      if (!b.spent && !b.mirrored) {
        if (b.via === VIA_LEFT && b.x < b.r) { b.x = 2 * b.r - b.x; b.vx = Math.abs(b.vx) * b.e; b.mirrored = true; }
        else if (b.via === VIA_RIGHT && b.x > W - b.r) { b.x = 2 * (W - b.r) - b.x; b.vx = -Math.abs(b.vx) * b.e; b.mirrored = true; }
      }
    }

    // Keyboard (floor).
    if (b.y + b.r > floorY) {
      var impact = b.vy;
      b.y = Math.max(b.r, 2 * (floorY - b.r) - b.y);   // mirror the overshoot to conserve energy
      b.vy = -Math.abs(b.vy) * e;
      if (b.scripted) {
        if (impact > 0 && b.hopCooldown <= 0) onFloorHit(b, impact);
      } else {
        if (impact > MIN_IMPACT && b.cooldown <= 0) {
          onFloorHit(b, impact);
          b.cooldown = 4;
        }
        if (Math.abs(b.vy) < 0.3) { b.vy = 0; b.y = floorY - b.r; }  // came to rest
      }
    }

    if (b.spent) b.alpha -= 0.025 * h;   // a choreographed ball fades out after its last note
    else if (b.fadingIn) { b.alpha = Math.min(1, b.alpha + 0.08 * h); if (b.alpha >= 1) b.fadingIn = false; }

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

    if (S.mode === 'choreo') updateChoreo();
    var fpbNow = S.mode === 'choreo' && song ? framesPerBeat() : 0;

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
      if (fpbNow) songBeat += h / fpbNow;
      for (var i = 0; i < balls.length; i++) stepBall(balls[i], h, S.gravity);
      if (S.collisions) {
        for (var a = 0; a < balls.length; a++) {
          if (balls[a].scripted) continue;    // choreographed balls must not be knocked off course
          for (var b = a + 1; b < balls.length; b++) if (!balls[b].scripted) collide(balls[a], balls[b]);
        }
      }
    }
    balls = balls.filter(function (b) { return !b.scripted || b.alpha > 0 || b.fadingIn; });
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
      if (section.visible) visibilityRules.push({ node: sec, test: section.visible });
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
    choreo: 'Toplar notaların tam zamanında doğru tuşa düşer; bir top birkaç notayı sıçrayarak çalabilir. Engeller bu modda devre dışı.'
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

    var cs = document.getElementById('choreo-status');
    if (cs) {
      cs.dataset.status = 'ok';
      if (!plan || !plan.notes) cs.textContent = '';
      else if (S.choreoReuse !== 'none' && S.gravity < 0.02) cs.textContent = 'Yerçekimi olmadan top sıçrayamaz; her nota yeni top.';
      else cs.textContent = plan.notes + ' nota, ' + plan.chains.length + ' topla çalınıyor' +
        (plan.chains.length < plan.notes ? ' (bir top en fazla ' + plan.longest + ' nota' +
          (plan.wallHops ? ', ' + plan.wallHops + ' geçişte duvar yansıması' : '') + ').' : '.') +
        (S.choreoReuse === 'max' && plan.longest < 4 ? ' Daha uzun zincirler için yerçekimini veya tuş eğimini artırın ya da tempoyu düşürün (değişiklik şarkı baştan başlayınca uygulanır).' : '');
    }
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
    get plan() { return plan; },
    get pending() { return pending; },
    set onHop(fn) { debugHit = fn; },
    spawnBall: spawnBall,
    addBarrier: addBarrier,
    reset: reset
  };
})();
