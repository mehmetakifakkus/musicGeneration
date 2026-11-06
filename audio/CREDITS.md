# Ses örnekleri / Audio samples

Dosyalar `tools/build_samples.sh` ile üretildi: her 3 yarım seste bir nota (C, D#, F#, A),
kısaltılmış, sonu yumuşatılmış, mono, 64 kbps MP3. Aradaki notalar çalınırken perde kaydırılır.

| Klasör | Kaynak | Lisans |
|---|---|---|
| `grand/` | [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3), Alexander Holm (Yamaha C5), velocity 8 katmanı; npm paketi [`@audio-samples/piano-mp3-velocity8`](https://www.npmjs.com/package/@audio-samples/piano-mp3-velocity8) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `epiano/`, `harpsichord/`, `marimba/`, `harp/`, `guitar/` | FluidR3 GM SoundFont, Frank Wen; npm paketi [`soundfont-for-samplers`](https://www.npmjs.com/package/soundfont-for-samplers) (`electric_piano_1`, `harpsichord`, `marimba`, `orchestral_harp`, `acoustic_guitar_nylon`) | MIT |

Değişiklikler (CC BY 3.0 gereği belirtilir): kesme, sönümleme, mono'ya indirme, ses düzeyi normalleştirme ve yeniden kodlama.
