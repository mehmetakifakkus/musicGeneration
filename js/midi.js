/*
 * Minimal Standard MIDI File (SMF) reader and a converter to the song notation
 * of songs.js, so an imported file can be read, edited and choreographed like
 * any typed melody.
 */
var MidiImport = (function () {
  'use strict';

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var DRUM_CHANNEL = 9;          // General MIDI channel 10: percussion, not pitches
  var GRID = 0.125;              // onsets are quantised to 1/32 notes (1/8 beat)
  var MAX_GROUPS = 1500;         // keep the planner and the text box responsive
  // Durations the notation can write, largest first.
  var DURS = [[6, 'w.'], [4, 'w'], [3, 'h.'], [2, 'h'], [1.5, 'q.'], [1, 'q'], [0.75, 'e.'], [0.5, 'e'],
              [0.375, 's.'], [0.25, 's'], [0.1875, 't.'], [0.125, 't']];

  // ------------------------------------------------------------ Parsing

  function parse(buffer) {
    var d = new Uint8Array(buffer), p = 0;

    function need(n) { if (p + n > d.length) throw new Error('Dosya beklenenden kısa.'); }
    function u8() { need(1); return d[p++]; }
    function u16() { need(2); var v = (d[p] << 8) | d[p + 1]; p += 2; return v; }
    function u32() { need(4); var v = ((d[p] << 24) >>> 0) + ((d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]); p += 4; return v; }
    function tag() { need(4); var s = String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]); p += 4; return s; }
    function vlq() {
      var v = 0, b, n = 0;
      do { b = u8(); v = (v << 7) | (b & 0x7f); if (++n > 4) throw new Error('Bozuk MIDI verisi.'); } while (b & 0x80);
      return v;
    }
    function text(len) { need(len); var s = ''; for (var i = 0; i < len; i++) s += String.fromCharCode(d[p + i]); p += len; return s; }

    if (tag() !== 'MThd') throw new Error('Bu bir MIDI dosyası değil.');
    var headerLen = u32();
    var start = p;
    var format = u16(), trackCount = u16(), division = u16();
    p = start + headerLen;
    if (division & 0x8000) throw new Error('SMPTE zaman biçimli MIDI desteklenmiyor.');

    var tracks = [], tempos = [];
    for (var t = 0; t < trackCount && p + 8 <= d.length; t++) {
      var id = tag(), len = u32(), end = Math.min(d.length, p + len);
      if (id !== 'MTrk') { p = end; continue; }
      var tick = 0, status = 0, name = '', open = {}, notes = [];
      while (p < end) {
        tick += vlq();
        var b = u8();
        if (b === 0xff) {                              // meta event
          var type = u8(), l = vlq();
          if (type === 0x51 && l === 3) tempos.push({ tick: tick, us: (d[p] << 16) | (d[p + 1] << 8) | d[p + 2] });
          if (type === 0x03 && !name) { name = text(l); continue; }
          need(l); p += l;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { var sl = vlq(); need(sl); p += sl; status = 0; continue; }  // sysex

        var d1;
        if (b & 0x80) { status = b; d1 = u8(); }
        else { if (!status) throw new Error('Bozuk MIDI verisi (running status).'); d1 = b; }
        var kind = status & 0xf0, ch = status & 0x0f;
        if (kind === 0xc0 || kind === 0xd0) continue;   // one data byte
        var d2 = u8();
        var key = ch * 128 + d1;
        if (kind === 0x90 && d2 > 0) {
          (open[key] = open[key] || []).push({ tick: tick, vel: d2 });
        } else if (kind === 0x80 || kind === 0x90) {
          var on = open[key] && open[key].shift();
          if (on) notes.push({ tick: on.tick, dur: tick - on.tick, midi: d1, ch: ch, vel: on.vel });
        }
      }
      Object.keys(open).forEach(function (k) {         // notes never switched off
        open[k].forEach(function (on) { notes.push({ tick: on.tick, dur: tick - on.tick, midi: k % 128, ch: Math.floor(k / 128), vel: on.vel }); });
      });
      notes.sort(function (a, b2) { return a.tick - b2.tick || a.midi - b2.midi; });
      tracks.push({ index: tracks.length, name: name.trim(), notes: notes });
      p = end;
    }

    tempos.sort(function (a, b2) { return a.tick - b2.tick; });
    return { format: format, division: division, tracks: tracks, tempos: tempos };
  }

  // Tracks worth offering: those with pitched notes.
  function playableTracks(midi) {
    return midi.tracks.map(function (tr) {
      var n = tr.notes.filter(function (x) { return x.ch !== DRUM_CHANNEL; }).length;
      return { index: tr.index, name: tr.name, count: n };
    }).filter(function (tr) { return tr.count > 0; });
  }

  // ---------------------------------------------------------- Converting

  // Converts ticks to beats at the file's first tempo, following tempo changes.
  function beatClock(midi) {
    var div = midi.division;
    var tempos = midi.tempos.length ? midi.tempos : [{ tick: 0, us: 500000 }];
    if (tempos[0].tick > 0) tempos = [{ tick: 0, us: tempos[0].us }].concat(tempos);
    var baseUs = tempos[0].us;
    return {
      bpm: 60e6 / baseUs,
      beats: function (tick) {
        var beats = 0, last = 0, us = tempos[0].us;
        for (var i = 1; i < tempos.length && tempos[i].tick < tick; i++) {
          beats += (tempos[i].tick - last) / div * (us / baseUs);
          last = tempos[i].tick;
          us = tempos[i].us;
        }
        return beats + (tick - last) / div * (us / baseUs);
      }
    };
  }

  function nameOf(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  // Writes `beats` (a multiple of GRID) as the largest notation durations.
  function split(beats) {
    var out = [];
    for (var i = 0; i < DURS.length && beats > 1e-9; i++) {
      while (beats >= DURS[i][0] - 1e-9) { out.push(DURS[i]); beats -= DURS[i][0]; }
    }
    return out;
  }

  /*
   * opts.track: track index, or 'all'
   * opts.topOnly: keep only the highest note of each chord (the melody line)
   * Returns { text, notes, groups, bpm, truncated, dropped }
   */
  function toNotation(midi, opts) {
    var clock = beatClock(midi);
    var bpm = Math.round(Math.min(300, Math.max(20, clock.bpm)));
    var byOnset = {}, dropped = 0;

    midi.tracks.forEach(function (tr) {
      if (opts.track !== 'all' && tr.index !== opts.track) return;
      tr.notes.forEach(function (n) {
        if (n.ch === DRUM_CHANNEL) return;
        if (n.midi < 21 || n.midi > 108) { dropped++; return; }
        var at = Math.round(clock.beats(n.tick) / GRID) * GRID;
        var g = byOnset[at] || (byOnset[at] = {});
        var len = clock.beats(n.tick + n.dur) - clock.beats(n.tick);
        if (!g[n.midi] || g[n.midi] < len) g[n.midi] = len;
      });
    });

    var onsets = Object.keys(byOnset).map(Number).sort(function (a, b) { return a - b; });
    var truncated = onsets.length > MAX_GROUPS;
    if (truncated) onsets = onsets.slice(0, MAX_GROUPS);
    if (!onsets.length) return { text: '', notes: 0, groups: 0, bpm: bpm, truncated: false, dropped: dropped };

    var tokens = [], beat = 0, bar = 0, count = 0;
    function emit(tok, beats) {
      var b = Math.floor(beat / 4 + 1e-9);               // 4/4 bar lines, for readability only
      if (b > bar) { tokens.push('|'); bar = b; }
      tokens.push(tok);
      beat += beats;
    }
    function letter(d) { return d[1] === 'q' ? '' : d[1]; }

    onsets.forEach(function (at, i) {
      var pitches = Object.keys(byOnset[at]).map(Number).sort(function (a, b) { return a - b; });
      if (opts.topOnly) pitches = [pitches[pitches.length - 1]];
      var gap = i + 1 < onsets.length ? onsets[i + 1] - at
        : Math.max(1, Math.round(Math.max.apply(null, pitches.map(function (m) { return byOnset[at][m]; })) / GRID) * GRID);
      var parts = split(gap);
      var head = pitches.map(nameOf);
      emit((head.length > 1 ? '[' + head.join(' ') + ']' : head[0]) + letter(parts[0]), parts[0][0]);
      parts.slice(1).forEach(function (r) { emit('-' + letter(r), r[0]); });
      count += pitches.length;
    });

    // Wrap the text into lines of about four bars.
    var lines = [], line = [], bars = 0;
    tokens.forEach(function (tk) {
      if (tk === '|' && ++bars % 4 === 0) { lines.push(line.join(' ')); line = []; return; }
      line.push(tk);
    });
    if (line.length) lines.push(line.join(' '));

    return {
      text: 'bpm=' + bpm + '\n' + lines.join('\n'),
      notes: count, groups: onsets.length, bpm: bpm, truncated: truncated, dropped: dropped
    };
  }

  return { parse: parse, playableTracks: playableTracks, toNotation: toNotation };
})();
