# Rastgele Müzik Üreteci

Zıplayan toplar alttaki piyano klavyesine çarptıkça nota çalan, tarayıcıda çalışan etkileşimli bir müzik oyuncağı. Toplar rastgele zıplayıp kendiliğinden melodi üretebilir. İstenirse bilinen bir şarkıyı, yazdığınız bir melodiyi ya da bir MIDI dosyasını da fiziğe uygun bir koreografiyle çalabilirler.

**Canlı sürüm:** https://mehmetakifakkus.github.io/musicGeneration/

Hiçbir kütüphane ya da derleme adımı gerektirmez. Düz HTML, CSS, JavaScript ve Web Audio API ile yazılmıştır.

---

## İçindekiler

- [Hızlı başlangıç](#hızlı-başlangıç)
- [Modlar](#modlar)
- [Koreografi: toplar nasıl planlanıyor?](#koreografi-toplar-nasıl-planlanıyor)
- [Nota yazımı](#nota-yazımı)
- [MIDI dosyası yükleme](#midi-dosyası-yükleme)
- [Ayarlar paneli](#ayarlar-paneli)
- [Fare ve klavye kısayolları](#fare-ve-klavye-kısayolları)
- [Enstrümanlar](#enstrümanlar)
- [Yerelde çalıştırma](#yerelde-çalıştırma)
- [Dosya yapısı](#dosya-yapısı)
- [Lisanslar ve teşekkürler](#lisanslar-ve-teşekkürler)

---

## Hızlı başlangıç

1. Sayfayı açın ve **▶ Başlat**'a basın. Tarayıcılar ses çalmak için bir tıklama ister.
2. Toplar düşmeye ve klavyeye çarptıkça nota çalmaya başlar.
3. Sağdaki panelden ayarları değiştirin; değişiklikler anında uygulanır ve tarayıcıda saklanır.
4. Bilinen bir şarkı dinlemek için panelde **Mod → Koreografi** ve **Şarkı → Neşeye Övgü** seçin.

---

## Modlar

| Mod | Ne olur |
|---|---|
| **Serbest** | Toplar rastgele zıplar; hangi tuşa düşerse o nota çalar. Klavye seçilen diziye (majör, pentatonik, blues…) göre kurulur. |
| **Sıradaki nota** | Toplar yine serbestçe zıplar, ama her çarpma şarkının **sıradaki notasını** çalar. Notalar doğru sırada gelir, ritim toplardan gelir. Akorun bütün notaları tek çarpmada çalar. |
| **Koreografi** | Her nota tam zamanında doğru tuşa düşen bir topla çalınır. Bir top, fiziğe uygun olduğu sürece birçok notayı art arda sekerek çalabilir. Melodi doğru ritmiyle duyulur. |

Melodi modlarında klavye, şarkının en pes ve en tiz notası arasındaki bütün yarım sesleri kapsayacak şekilde kurulur.

### Hazır şarkılar

Hepsi kamu malıdır (public domain). Notalar ana melodiyi tek ses olarak içerir.

- **Klasikler:** Neşeye Övgü (Beethoven), Für Elise (Beethoven), Türk Marşı (Mozart), Kanon (Pachelbel)
- **Çocuk şarkıları:** Twinkle Twinkle Little Star, Frère Jacques, Mary Had a Little Lamb
- **Yeni yıl:** Jingle Bells, We Wish You a Merry Christmas
- **Kendi melodin:** Kendiniz yazdığınız ya da MIDI'den aktardığınız melodi

---

## Koreografi: toplar nasıl planlanıyor?

Koreografi modu, her topun gerçek bir top gibi davrandığı bir plan çıkarır:

- **Uçuş:** İki çarpma arasında top serbest bir parabol çizer. Yatay hızı sabit kalır.
- **Sekme:** Her sekme dikey hızın *e* (esneklik) katını geri verir. Bu yüzden sekmeler arası süre `T, e·T, e²·T, …` şeklinde ilerler.
- **Tuş eğimi:** Basılan tuş hafifçe eğilir. θ kadar eğik bir yüzeyden seken topun yönü en fazla 2θ değişir: `|Δvx| ≤ tan(2θ)·vy`. Yakın tuşlara geçişleri bu sağlar.
- **Enerji toleransı:** Bir sekme doğal sekmeden en fazla bu kadar güçlü ya da zayıf olabilir. Bunu tuşun topa verdiği küçük bir itme olarak düşünebilirsiniz.
- **Yan duvarlar:** Ayna gibi davranır. Duvara çarpan topun yatay hızı tersine döner ve esneklik katı kadar azalır.
- **Tavan:** Fazla enerjili bir top üst kenara çarpıp daha kısa sürede geri iner.
- **Geçici aynalar:** Gerektiğinde topun yolunda kısa süreliğine bir ayna belirir ve top ondan yansıyınca kaybolur. İki çeşidi vardır:
  - Dikey ayna, topun hızını koruyarak yönünü çevirir.
  - Yatay ayna, topun sekme enerjisini koruyarak sekmeyi kısaltır.

Planlayıcı her seferinde fiziğe uyan en uzun nota dizisini bulup bir topa verir (dinamik programlama). Kalan notalar için aynı işi tekrarlar. Her geçişte şu yolları şu sırayla dener:

1. Doğal uçuş
2. Gerçek duvar ve tavan
3. Geçici aynalar

Hiçbiri uymuyorsa o nota için yeni bir top atılır. Birden fazla nota çalacak bir top, ilk sekmesine tam uyan yükseklikten ve yatay hızla sahneye girer. Her çarpmada top, gerçek zamanı ve konumu üzerinden yeniden nişan alır; böylece hatalar birikmez.

Panelin durum satırı şarkının kaç topla çalındığını ve kaç yansıma kullanıldığını gösterir. Örneğin: *"62 nota, 8 topla çalınıyor (bir top en fazla 43 nota; yansımalar: 5 duvar, 47 geçici ayna)"*.

**Daha az topla çalmak için:**
- Yerçekimini artırın. Hızlı sekmelerde yön değiştirme payı artar.
- Tempoyu düşürün.
- Tuş eğimini artırın.
- Geçici aynaları açın.
- Esnekliği %100'de tutun.

---

## Nota yazımı

"Kendi melodin" kutusuna yazılan metin şu kurallarla okunur. Hazır şarkılar da aynı yazımla tanımlıdır (`js/songs.js`).

### Nota

Nota harfi (`C D E F G A B`), isteğe bağlı diyez (`#`) ya da bemol (`b`), oktav numarası ve isteğe bağlı süre harfi:

```
C4      Do, 4. oktav (orta Do), dörtlük
F#5     Fa diyez
Bb3e    Si bemol, sekizlik
A4h.    La, noktalı ikilik (3 vuruş)
```

Notalar **A0 ile C8** arasında olmalıdır (88 tuşlu piyano aralığı).

### Süreler

Süre harfi yazılmazsa nota dörtlük (`q`, 1 vuruş) kabul edilir. Sona eklenen `.` süreyi 1,5 katına çıkarır.

| Harf | Ad | Vuruş | Noktalı |
|---|---|---|---|
| `w` | birlik | 4 | 6 |
| `h` | ikilik | 2 | 3 |
| `q` | dörtlük (varsayılan) | 1 | 1,5 |
| `e` | sekizlik | ½ | ¾ |
| `s` | on altılık | ¼ | ⅜ |
| `t` | otuz ikilik | ⅛ | 3⁄16 |

### Sus

`-` ve isteğe bağlı süre harfi:

```
-       dörtlük sus
-h      ikilik sus
-e.     noktalı sekizlik sus
```

### Akor

Köşeli parantez içindeki notalar aynı anda çalar. Süre parantezin sonuna yazılır ve hepsi için geçerlidir:

```
[C4 E4 G4]h     Do majör akoru, ikilik
[D4 F#4]e       iki notalı akor, sekizlik
```

### Tempo

Dakikadaki dörtlük sayısı, genellikle en başa yazılır (20–300 arası). Yazılmazsa kendi melodiniz için 100 kabul edilir. Paneldeki **Tempo** kaydırıcısı bunun üzerine 0,5× ile 1,5× arası çarpan uygular.

```
bpm=72
```

### Ölçü çizgisi

`|` yalnızca okumayı kolaylaştırır ve dikkate alınmaz. Satır sonları ve boşluklar da serbesttir.

### Örnekler

Neşeye Övgü'nün başı:

```
E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4q. D4e D4h
```

Akorlu ve tempolu bir parça:

```
bpm=90
[C4 E4 G4]h [A3 C4 E4]h | [F3 A3 C4]h [G3 B3 D4]h |
C5e B4e A4e G4e F4 E4 | D4h. -q | [C4 E4 G4 C5]w
```

Hatalı yazılmış parçalar (ör. `X7`, kapanmamış `[C4 E4`) atlanır ve panelde listelenir. Akorun içindeki hatalı bir nota zamanlamayı kaydırmaz.

---

## MIDI dosyası yükleme

Melodi modlarında "Kendi melodin" kutusunun altında **MIDI dosyası seç…** düğmesi vardır.

- Standart MIDI dosyaları (format 0 ve 1) okunur.
- Dosya yukarıdaki nota yazımına çevrilip metin kutusuna yazılır; orada düzenleyebilirsiniz.
- **İz seçimi:** Tüm izler ya da tek bir iz seçilebilir. İzler nota sayılarıyla listelenir.
- **Yalnızca en üst ses (melodi):** Varsayılan olarak açıktır. Her an yalnızca en tiz notayı alarak kalabalık bir parçadan melodiyi çıkarır. Kapatılırsa akorlar da gelir.
- **Tempo:** Tempo değişiklikleri gerçek süreleriyle korunur (dosyanın ilk temposuna göre). Nota başlangıçları ⅛ vuruşa (otuz ikilik) yuvarlanır; yuvarlama hatası birikmez.
- **Atlananlar:** Davul kanalı (kanal 10) ve piyano aralığı dışındaki notalar atlanır.
- **Uzun dosyalar:** En fazla 1500 nota başlangıcı alınır.

---

## Ayarlar paneli

Panelde yalnızca seçili moda uyan ayarlar görünür. Bütün ayarlar tarayıcıda saklanır; **Varsayılan ayarlara dön** düğmesi hepsini sıfırlar.

### Mod ve melodi
- **Mod**, **Şarkı**, **Kendi melodin** (metin kutusu), **MIDI dosyasından**
- **Tempo** (0,5×–1,5×), **Şarkı bitince başa dön**, **Şarkıyı baştan başlat**

### Koreografi
- **Top kullanımı:** Her nota yeni top / Yalnızca tekrarlanan notalar / Fiziğin izin verdiği kadar az top
- **Enerji toleransı** (varsayılan %10), **Tuş eğimi** (varsayılan 12°)
- **Duvarlardan yansıyabilsin**, **Tavandan yansıyabilsin**, **Geçici aynalar**
- **Azami sıçrama yüksekliği**, **Azami yatay hız**, **Top boyutu**
- **Atış yeri**, **Atış dağılımı**, **Atış yüksekliği**. Bunlar tek notalık toplar içindir; birkaç nota çalan top fiziğe göre kendiliğinden girer.

### Fizik
- **Toplar birbirine çarpsın**
- **Yerçekimi**
- **Küçük toplar daha hızlı düşsün:** Her boyut kendi ritminde zıplar.
- **Esneklik**, **Azami hız**, **Simülasyon hızı**

### Toplar
- **Otomatik top ekle**, **Azami top sayısı**, **Ekleme aralığı**, **Top boyutu**
- **Top ekle**, **Topları temizle**

### Engeller
- **Otomatik engel ekle**, **Otomatik engel sınırı**, **Ekleme aralığı**, **Engelleri temizle**
- Engeller koreografi modunda devre dışıdır.

### Ses
- **Sessiz**, **Enstrüman**, **Ses düzeyi**
- **Yankı:** Salon etkisi.
- **Çarpma hızı ses şiddetini etkilesin**
- **Nota süresi**
- Serbest mod için: **Dizi**, **Tonik**, **Başlangıç oktavı**, **Oktav sayısı**

### Görünüm
- **İz bırak**, **Nota etiketleri**, **Tuş çizgileri**

---

## Fare ve klavye kısayolları

| Eylem | Sonuç |
|---|---|
| Tıklama | Engel ya da top ekler (üst çubuktan **Engel ekle / Top ekle** seçilir; koreografide devre dışı) |
| Engeli sürükleme | Engeli taşır |
| Sağ tık / çift tık | Engeli siler |
| `Boşluk` | Duraklatır / devam ettirir |
| `B` | Top ekler (koreografi dışında) |
| ⚙ düğmesi | Paneli gizler / gösterir |
| ↺ Sıfırla | Topları, engelleri ve sayaçları temizler; şarkıyı baştan başlatır |

---

## Enstrümanlar

| Grup | Enstrümanlar |
|---|---|
| **Gerçek kayıtlar** | Kuyruklu piyano (varsayılan), Elektrik piyano, Klavsen, Marimba, Arp, Klasik gitar |
| **Sentezlenmiş** | Piyano, Org, Gitar, EDM. İndirme gerektirmez, tarayıcıda üretilir. |

Gerçek kayıtlar için her 3 yarım seste bir (C, D#, F#, A) örnek bulunur; aradaki notalar perde kaydırılarak çalınır. Bir enstrümanın örnekleri yalnızca o enstrüman seçildiğinde iner: kuyruklu piyano 1,4 MB, diğerleri ~0,7 MB.

Ses Web Audio API ile çalınır. Bütün enstrümanlar aynı ses zincirinden geçer: yankı, vuruş şiddeti, en fazla 32 eşzamanlı ses ve taşmayı önleyen bir sıkıştırıcı.

---

## Yerelde çalıştırma

Gerçek kayıt örnekleri `fetch()` ile yüklendiği için sayfanın bir web sunucusundan açılması gerekir:

```bash
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini açın.

`index.html` doğrudan dosya olarak (`file://`) açılırsa tarayıcı örneklerin yüklenmesine izin vermez. Bu durumda uygulama sentezlenmiş piyanoya geçer ve panelde bunu belirtir.

Ses örnekleri `tools/build_samples.sh` ile npm paketlerinden yeniden üretilebilir (ayrıntılar betiğin başında).

---

## Dosya yapısı

```
index.html              Sayfa iskeleti
css/styles.css          Arayüz stilleri (koyu tema, duyarlı yerleşim)
js/musicGenerate.js     Simülasyon, fizik, koreografi planlayıcısı, panel
js/sound.js             Web Audio ses motoru (örnekler + sentez)
js/songs.js             Nota yazımı çözümleyicisi ve hazır şarkılar
js/midi.js              MIDI dosyası okuyucu ve nota yazımına çevirici
js/audiosynth.js        Sentezlenmiş enstrümanlar (audiosynth.js)
audio/<enstrüman>/      Ses örnekleri (MP3)
audio/CREDITS.md        Örneklerin kaynakları ve lisansları
tools/build_samples.sh  Ses örneklerini yeniden üreten betik
```

---

## Lisanslar ve teşekkürler

- **Geliştiren:** [Mehmet Akif AKKUŞ](http://www.ceng.metu.edu.tr/~akifakkus/doku.php)
- **Kuyruklu piyano örnekleri:** [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3), Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- **Diğer enstrüman örnekleri:** FluidR3 GM SoundFont, Frank Wen, MIT
- **Sentezlenmiş enstrümanlar:** [audiosynth.js](http://keithwhor.github.io/audiosynth), Keith Horwood

Örnekler üzerinde yapılan değişiklikler (kesme, sönümleme, mono'ya indirme, ses düzeyi eşitleme, yeniden kodlama) [`audio/CREDITS.md`](audio/CREDITS.md) dosyasında açıklanmıştır.
