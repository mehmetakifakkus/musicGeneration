/*
 * Sound engine (Web Audio API).
 *
 * Two kinds of instruments:
 *  - sampled: recorded notes in audio/<id>/ (every 3rd semitone: C, D#, F#, A);
 *    other notes are played from the nearest sample with a pitch shift.
 *  - synth:   notes generated on demand with audiosynth.js (works offline,
 *    even from file://).
 *
 * Everything goes through one graph so volume, reverb and note velocity apply
 * to every instrument:  voice -> (dry | reverb) -> master -> compressor -> out
 */
var SoundEngine = (function () {
  'use strict';

  var NOTE_INDEX = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
  var SAMPLE_NOTES = [['C', 0], ['Ds', 3], ['Fs', 6], ['A', 9]];
  var MAX_VOICES = 32;

  var INSTRUMENTS = [
    { id: 'grand',       label: 'Kuyruklu piyano',     group: 'Gerçek kayıtlar', trim: 1.6, release: 0.6 },
    { id: 'epiano',      label: 'Elektrik piyano',     group: 'Gerçek kayıtlar', trim: 0.6, release: 0.4 },
    { id: 'harpsichord', label: 'Klavsen',             group: 'Gerçek kayıtlar', trim: 0.8, release: 0.3 },
    { id: 'marimba',     label: 'Marimba',             group: 'Gerçek kayıtlar', trim: 0.9, release: 0.3 },
    { id: 'harp',        label: 'Arp',                 group: 'Gerçek kayıtlar', trim: 0.9, release: 0.5 },
    { id: 'guitar',      label: 'Klasik gitar',        group: 'Gerçek kayıtlar', trim: 0.9, release: 0.4 },
    { id: 'synth-piano',    label: 'Piyano (sentez)',  group: 'Sentezlenmiş', synth: 'piano',    trim: 0.5, release: 0.2 },
    { id: 'synth-organ',    label: 'Org (sentez)',     group: 'Sentezlenmiş', synth: 'organ',    trim: 0.5, release: 0.2 },
    { id: 'synth-acoustic', label: 'Gitar (sentez)',   group: 'Sentezlenmiş', synth: 'acoustic', trim: 0.5, release: 0.2 },
    { id: 'synth-edm',      label: 'EDM (sentez)',     group: 'Sentezlenmiş', synth: 'edm',      trim: 0.4, release: 0.2 }
  ];
  var FALLBACK = 'synth-piano';

  var byId = {};
  INSTRUMENTS.forEach(function (i) { byId[i.id] = i; });

  var ctx = null, master, dry, wet, convolver;
  var state = {};          // id -> { status, loaded, total, buffers: { key: AudioBuffer }, pending: {} }
  var current = 'grand';
  var voices = [];
  var listener = function () {};

  // ------------------------------------------------------------ Graph

  function ensureContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.connect(comp);

    dry = ctx.createGain();
    dry.connect(master);

    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(2.6, 3);
    wet = ctx.createGain();
    convolver.connect(wet);
    wet.connect(master);
    return ctx;
  }

  // A synthetic room: decaying stereo noise.
  function makeImpulse(seconds, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------------------------------------------------------- Loading

  function getState(id) {
    if (!state[id]) state[id] = { status: 'idle', loaded: 0, total: 0, buffers: {}, pending: {} };
    return state[id];
  }

  function notify(id) {
    if (id === current) listener(status());
  }

  function decode(arrayBuffer) {
    // Promise form isn't available in older Safari; the callback form works everywhere.
    return new Promise(function (resolve, reject) {
      ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });
  }

  function loadSampled(id) {
    var st = getState(id);
    if (st.status !== 'idle') return;
    if (location.protocol === 'file:') {      // browsers block fetch() from file://
      st.status = 'error';
      notify(id);
      return;
    }
    st.status = 'loading';

    var jobs = [];
    for (var oct = 0; oct <= 8; oct++) {
      SAMPLE_NOTES.forEach(function (n) {
        var midi = 12 * (oct + 1) + n[1];
        if (midi < 21 || midi > 108) return;        // piano range A0..C8
        jobs.push({ midi: midi, url: 'audio/' + id + '/' + n[0] + oct + '.mp3' });
      });
    }
    st.total = jobs.length;
    notify(id);

    var failed = 0;
    Promise.all(jobs.map(function (job) {
      return fetch(job.url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(decode)
        .then(function (buf) { st.buffers[job.midi] = buf; st.loaded++; notify(id); })
        .catch(function () { failed++; });
    })).then(function () {
      st.status = st.loaded ? 'ready' : 'error';
      if (failed && st.loaded) st.status = 'partial';
      notify(id);
    });
  }

  // Synth notes are rendered by audiosynth into a WAV blob, then decoded.
  function synthBuffer(inst, midi, duration) {
    var st = getState(inst.id);
    var key = midi + '|' + duration;
    if (st.buffers[key]) return Promise.resolve(st.buffers[key]);
    if (st.pending[key]) return st.pending[key];

    var name = Object.keys(NOTE_INDEX)[midi % 12];
    var octave = Math.floor(midi / 12) - 1;
    var url = Synth.generate(inst.synth, name, octave, Math.max(0.5, duration));
    st.pending[key] = fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(decode)
      .then(function (buf) { st.buffers[key] = buf; delete st.pending[key]; return buf; });
    return st.pending[key];
  }

  function nearestSample(st, midi) {
    for (var d = 0; d <= 24; d++) {
      if (st.buffers[midi - d]) return midi - d;
      if (st.buffers[midi + d]) return midi + d;
    }
    return null;
  }

  // ---------------------------------------------------------- Playing

  function startVoice(inst, buffer, rate, velocity, duration) {
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    var env = ctx.createGain();
    var peak = velocity * inst.trim;
    env.gain.setValueAtTime(peak, t);
    var end = t + duration;
    env.gain.setValueAtTime(peak, end);
    env.gain.setTargetAtTime(0, end, inst.release / 3);

    src.connect(env);
    env.connect(dry);
    env.connect(convolver);
    src.start(t);
    src.stop(end + inst.release * 2);

    var voice = { src: src, env: env };
    voices.push(voice);
    src.onended = function () {
      env.disconnect();
      var i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
    };

    // Voice stealing: fade the oldest quickly when there are too many.
    if (voices.length > MAX_VOICES) {
      var old = voices.shift();
      old.env.gain.cancelScheduledValues(t);
      old.env.gain.setTargetAtTime(0, t, 0.03);
      try { old.src.stop(t + 0.15); } catch (e) { /* already stopping */ }
    }
  }

  function play(noteName, octave, opts) {
    if (!ctx || ctx.state !== 'running') return;
    var velocity = opts && opts.velocity !== undefined ? opts.velocity : 0.8;
    var duration = opts && opts.duration ? opts.duration : 2;
    var midi = 12 * (octave + 1) + NOTE_INDEX[noteName];

    var inst = byId[current];
    if (!inst.synth) {
      var st = getState(inst.id);
      var s = nearestSample(st, midi);
      if (s !== null) {
        startVoice(inst, st.buffers[s], Math.pow(2, (midi - s) / 12), velocity, duration);
        return;
      }
      if (st.status === 'loading') return;   // first samples are on their way
      inst = byId[FALLBACK];                 // samples unavailable (e.g. opened from file://)
    }
    synthBuffer(inst, midi, duration).then(function (buf) {
      startVoice(inst, buf, 1, velocity, duration);
    }).catch(function () { /* ignore a note that fails to render */ });
  }

  // ------------------------------------------------------------- API

  function status() {
    var inst = byId[current];
    if (inst.synth) return { id: current, status: 'ready', text: 'Tarayıcıda sentezlenir, indirme yok.' };
    var st = getState(current);
    switch (st.status) {
      case 'loading': return { id: current, status: 'loading', text: 'Örnekler yükleniyor… ' + st.loaded + '/' + st.total };
      case 'ready': return { id: current, status: 'ready', text: 'Hazır · gerçek kayıt örnekleri' };
      case 'partial': return { id: current, status: 'ready', text: 'Hazır · bazı örnekler yüklenemedi (' + st.loaded + '/' + st.total + ')' };
      case 'error': return { id: current, status: 'error', text: 'Örnekler yüklenemedi; sentez piyano çalınıyor. Sayfayı bir web sunucusundan açın.' };
      default: return { id: current, status: 'idle', text: '' };
    }
  }

  return {
    instruments: INSTRUMENTS,
    has: function (id) { return !!byId[id]; },

    // Creates the context early (suspended) so samples can be decoded before the first click.
    init: function () { ensureContext(); },

    // Must be called from a user gesture.
    unlock: function () {
      if (ensureContext() && ctx.state === 'suspended') ctx.resume();
    },

    setInstrument: function (id) {
      if (!byId[id]) id = 'grand';
      current = id;
      if (!ensureContext()) return;
      if (!byId[id].synth) loadSampled(id);
      notify(id);
    },

    setVolume: function (v) { if (ensureContext()) master.gain.value = v; },

    setReverb: function (r) {
      if (!ensureContext()) return;
      wet.gain.value = r * 0.9;
      dry.gain.value = 1 - r * 0.35;
    },

    onStatus: function (fn) { listener = fn; fn(status()); },
    status: status,
    play: play,
    get voiceCount() { return voices.length; },
    get contextState() { return ctx ? ctx.state : 'unsupported'; }
  };
})();
