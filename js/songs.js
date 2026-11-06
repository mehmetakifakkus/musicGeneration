/*
 * Public-domain melodies in a compact text notation.
 *
 *   E4         note + octave, a quarter note by default
 *   D#5s       sharps with #, flats with b (Bb3)
 *   C4h.       duration letter: w=4, h=2, q=1, e=1/2, s=1/4, t=1/8 beats; a trailing "." makes it dotted
 *   -e         rest (here an eighth)
 *   [C4 E4 G4]h  chord: notes sounding together, one duration for all
 *   bpm=72     tempo (quarter notes per minute), usually first
 *   |          bar line, ignored
 */
var Songs = (function () {
  'use strict';

  var LIST = [
    { id: 'ode', group: 'Klasikler', title: 'Neşeye Övgü — Beethoven', bpm: 120,
      notes: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4q. D4e D4h | ' +
             'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4q. C4e C4h | ' +
             'D4 D4 E4 C4 | D4 E4e F4e E4 C4 | D4 E4e F4e E4 D4 | C4 D4 G3h | ' +
             'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4q. C4e C4h' },
    { id: 'furElise', group: 'Klasikler', title: 'Für Elise — Beethoven', bpm: 66,
      notes: 'E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e -s C4s E4s A4s | B4e -s E4s G#4s B4s | C5e -s E4s E5s D#5s | ' +
             'E5s D#5s E5s B4s D5s C5s | A4e -s C4s E4s A4s | B4e -s E4s C5s B4s | A4q.' },
    { id: 'turkishMarch', group: 'Klasikler', title: 'Türk Marşı — Mozart', bpm: 100,
      notes: 'B4s A4s G#4s A4s | C5e -e D5s C5s B4s C5s | E5e -e F5s E5s D#5s E5s | B5s A5s G#5s A5s B5s A5s G#5s A5s | ' +
             'C6q A5e B5e | C6e B5e A5e G#5e | A5e E5e F5e D5e | C5q B4e. A4s | A4q' },
    { id: 'canon', group: 'Klasikler', title: 'Kanon — Pachelbel', bpm: 70,
      notes: 'F#5h E5h | D5h C#5h | B4h A4h | B4h C#5h | D5h C#5h | B4h A4h | G4h F#4h | G4h E4h | ' +
             'D4 F#4 A4 G4 | F#4 D4 F#4 E4 | D4 B3 D4 A4 | G4 B4 A4 G4 | F#4w' },

    { id: 'twinkle', group: 'Çocuk şarkıları', title: 'Twinkle Twinkle Little Star', bpm: 100,
      notes: 'C4 C4 G4 G4 | A4 A4 G4h | F4 F4 E4 E4 | D4 D4 C4h | G4 G4 F4 F4 | E4 E4 D4h | ' +
             'G4 G4 F4 F4 | E4 E4 D4h | C4 C4 G4 G4 | A4 A4 G4h | F4 F4 E4 E4 | D4 D4 C4h' },
    { id: 'frere', group: 'Çocuk şarkıları', title: 'Frère Jacques', bpm: 110,
      notes: 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4h | E4 F4 G4h | G4e A4e G4e F4e E4 C4 | G4e A4e G4e F4e E4 C4 | ' +
             'C4 G3 C4h | C4 G3 C4h' },
    { id: 'mary', group: 'Çocuk şarkıları', title: 'Mary Had a Little Lamb', bpm: 110,
      notes: 'E4 D4 C4 D4 | E4 E4 E4h | D4 D4 D4h | E4 G4 G4h | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4w' },

    { id: 'jingle', group: 'Yeni yıl', title: 'Jingle Bells', bpm: 130,
      notes: 'E4 E4 E4h | E4 E4 E4h | E4 G4 C4q. D4e | E4w | F4 F4 F4q. F4e | F4 E4 E4 E4e E4e | E4 D4 D4 E4 | D4h G4h | ' +
             'E4 E4 E4h | E4 E4 E4h | E4 G4 C4q. D4e | E4w | F4 F4 F4 F4 | F4 E4 E4 E4e E4e | G4 G4 F4 D4 | C4w' },
    { id: 'merry', group: 'Yeni yıl', title: 'We Wish You a Merry Christmas', bpm: 120,
      notes: 'D4 | G4 G4e A4e G4e F#4e | E4 E4 E4 | A4 A4e B4e A4e G4e | F#4 D4 D4 | B4 B4e C5e B4e A4e | G4 E4 D4e D4e | E4 A4 F#4 | G4h' },

    { id: 'custom', group: 'Kendi melodin', title: 'Kendi melodin', bpm: 100, notes: null }
  ];

  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125 };
  var NOTE_RE = /^([A-Ga-g])([#b]?)(\d)([whqest]?)(\.?)$/;
  var PITCH_RE = /^([A-Ga-g])([#b]?)(\d)$/;
  var REST_RE = /^-([whqest]?)(\.?)$/;
  var CHORD_RE = /^\[([^\]]*)\]([whqest]?)(\.?)$/;
  var BPM_RE = /^bpm=(\d+(?:\.\d+)?)$/i;
  // A chord (brackets may contain spaces), or any other run of non-space characters.
  var TOKEN_RE = /\[[^\]]*\][whqest]?\.?|\[[^\]]*$|[^\s|\[\]]+/g;

  function midiOf(m) {
    var semi = SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (Number(m[3]) + 1) + semi;
  }

  function beatsOf(letter, dot) {
    var b = DUR[letter || 'q'];
    return dot ? b * 1.5 : b;
  }

  // Returns { notes: [{ midi|null, beats, beat }], totalBeats, errors: [token...], bpm|null }.
  // Notes of a chord share the same `beat`.
  function parse(text) {
    var notes = [], errors = [], beat = 0, bpm = null;
    ((text || '').match(TOKEN_RE) || []).forEach(function (tok) {
      var m, beats, midi;
      if ((m = BPM_RE.exec(tok))) {
        var v = Number(m[1]);
        if (v >= 20 && v <= 300) bpm = v; else errors.push(tok);
      } else if ((m = CHORD_RE.exec(tok))) {
        beats = beatsOf(m[2], m[3]);
        var inner = m[1].split(/\s+/).filter(Boolean);
        if (!inner.length) { errors.push(tok); return; }
        inner.forEach(function (p) {
          var pm = PITCH_RE.exec(p);
          if (!pm || (midi = midiOf(pm)) < 21 || midi > 108) { errors.push(p); return; }
          notes.push({ midi: midi, beats: beats, beat: beat });
        });
        beat += beats;                      // keep the timing even if a chord note was wrong
      } else if ((m = NOTE_RE.exec(tok))) {
        beats = beatsOf(m[4], m[5]);
        midi = midiOf(m);
        if (midi < 21 || midi > 108) { errors.push(tok); return; }
        notes.push({ midi: midi, beats: beats, beat: beat });
        beat += beats;
      } else if ((m = REST_RE.exec(tok))) {
        beats = beatsOf(m[1], m[2]);
        notes.push({ midi: null, beats: beats, beat: beat });
        beat += beats;
      } else {
        errors.push(tok);
      }
    });
    return { notes: notes, totalBeats: beat, errors: errors, bpm: bpm };
  }

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  return {
    list: LIST,
    has: function (id) { return !!byId(id); },
    parse: parse,
    // Returns the parsed song, using customText for the "custom" entry.
    load: function (id, customText) {
      var s = byId(id) || LIST[0];
      var p = parse(s.notes === null ? customText : s.notes);
      p.id = s.id;
      p.title = s.title;
      p.bpm = p.bpm || s.bpm;   // a "bpm=" in the text wins
      return p;
    },
    groups: function () {
      var groups = [];
      LIST.forEach(function (s) {
        var g = groups[groups.length - 1];
        if (!g || g.label !== s.group) groups.push(g = { label: s.group, options: [] });
        g.options.push([s.id, s.title]);
      });
      return groups;
    }
  };
})();
