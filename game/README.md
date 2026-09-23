# Strada — Strada Gării, Câmpina, noaptea

Joc 3D în browser care reproduce **Strada Gării din Câmpina (jud. Prahova),
segmentul nr. 103–128**, la scara 1:1, împreună cu capătul ei de pe **malul
Prahovei** și cartierul din jur. Te plimbi **pe jos**, oriunde vrei: pe stradă,
prin cartier, pe prundiș și chiar prin apă.

Harta nu e desenată de mână: traseele, clădirile, albia și relieful sunt
generate din date geografice reale (vezi [Date și surse](#date-și-surse)).
Detaliile de pe stradă, pe care hărțile nu le conțin (mașini, stâlpi, lămpi,
garduri, marcaj), sunt refăcute după fotografiile de referință.

Rulează local, fără build și fără conexiune la internet.

```bash
# din rădăcina repo-ului
python3 -m http.server 8000
# apoi deschide http://localhost:8000/game/
```

Un server local e obligatoriu: fișierele sunt module ES, iar `file://` le
blochează prin CORS. Cere WebGL2 (Chrome/Edge/Firefox/Safari 15+). Pe telefon,
jocul detectează ecranul tactil și pornește cu presetul *Telefon*.

## Comenzi

| Tastatură / mouse | Telefon | Ce face |
|---|---|---|
| `W A S D` | joystick stânga | mergi |
| `SHIFT` | joystick împins la capăt | fugi (5,6 m/s) |
| `SPAȚIU` | `SARI` | sari |
| `CTRL` / `C` | `JOS` | te ghemuiești |
| `MOUSE` | tragi cu degetul în dreapta | privești în jur |
| `ROTIȚA` | — | distanța camerei |
| `V` | `CAM` | persoana I ↔ persoana a III‑a |
| `H` | — | ascunzi interfața |
| `P` | — | salvezi o captură PNG |
| `R` | — | revii la începutul străzii |
| `ESC` | `☰` | meniu și setări |

Pe desktop, privirea cu mouse-ul pornește după un click pe canvas (pointer lock).

## Ce conține harta

Pinul de referință e la **45,13403° N, 25,71109° E**. Harta e rotită astfel
încât strada să fie pe axa Z (azimut real 42,1°), iar minimapul arată nordul
adevărat.

- **zona jucabilă**: 340 × 480 m; relief detaliat pe 660 × 525 m, iar dincolo
  de el un fundal de teren până la orizont;
- **Strada Gării**: 272 m de asfalt care coboară real de la 407,4 m (capătul
  dinspre gară) la 403,4 m, apoi drum de pământ până în albie;
- **170 de clădiri** din amprentele OpenStreetMap, cu numărul real de niveluri
  unde e cartat și plăcuțe albastre cu numerele caselor de pe stradă;
- **Prahova**: albia din multipoligonul OSM, cu prundiș, maluri înierbate și un
  fir de apă care curge; nivelul apei scade cu 8,56 m/km (panta măsurată pe
  2,6 km de curs), cu 398,4 m în dreptul străzii. Pârâul Câmpinița e și el pe hartă;
- **calea ferată și Gara Câmpina** în spatele capătului dinspre SV: linii pe
  terasament de piatră spartă, peroane cu lămpi, stâlpi de catenară;
- **străzile din jur** cu numele lor reale (Cireșului, Rozelor, Zarzărului,
  aleile Măceșului și Magnoliei), afișate în HUD când ești pe ele;
- **pe strada principală**, după fotografii: stâlpi la 28 m cu lămpi
  cobra‑head și rețeaua de cabluri, 18 mașini parcate cu plăcuțe românești,
  bordură de 13 cm, trotuar, marcaj lateral discontinuu, garduri, porți,
  cutii de branșament, capace de canal, guri de scurgere.

Apa e fizică: intri în ea, iar viteza scade cu adâncimea (la 0,73 m mergi cu
2,5 m/s). Sunetul râului crește pe măsură ce te apropii, iar din când în când
se aude un tren în gară.

## Date și surse

| Sursă | Ce aduce | Licență |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) — API `map` pe bbox `25.7020,45.1285,25.7200,45.1395` + relația `1308475` (albia Prahovei) | străzi, clădiri, albie, râuri, cale ferată, utilizarea terenului, copaci | ODbL, © contribuitorii OpenStreetMap |
| Copernicus GLO-30 DEM, placa `N45_00_E025_00` | relieful (rezoluție ~30 m) | © DLR e.V. 2010-2014 și © Airbus Defence and Space GmbH 2014-2018, furnizat prin programul COPERNICUS al Uniunii Europene și ESA |

Atribuirea apare și în joc, pe ecranul de start și în meniu.

Relieful Copernicus a fost verificat cu EU-DEM 25 m: pe stradă cele două surse
diferă cu cel mult ±0,5 m.

### Cum se regenerează harta

Tot ce vine din date reale stă în `src/zona.js`, generat de `tools/build_zona.py`:

```bash
pip install numpy rasterio
game/tools/fetch_data.sh                 # descarcă OSM + placa DEM (~45 MB) în tools/data/
cd game/tools/data && python3 ../build_zona.py ../../src/zona.js
```

Generatorul:

1. proiectează datele OSM în metri, cu originea în pin;
2. rotește cadrul după azimutul străzii și îl centrează pe culoarul dintre
   fațadele reale (axul OSM al străzii e decalat cu 1,06 m față de clădiri);
3. netezește DEM-ul, sapă albia după poligonul OSM cu un nivel al apei
   calculat de‑a lungul râului (nu un plan înclinat, pentru că râul cotește) și
   aplatizează drumurile pe profile longitudinale netezite;
4. exportă totul, cu atribuirile incluse, în `src/zona.js`.

Pe datele descărcate la 23.09.2026, rularea reproduce `src/zona.js` identic,
byte cu byte. O descărcare ulterioară aduce starea curentă a OSM, deci harta se
poate schimba dacă între timp cineva editează zona.

### Limite cunoscute

- DEM-ul are ~30 m rezoluție și e netezit: pantele mari sunt corecte, dar
  micro‑relieful (șanțuri, taluzuri mici) nu e măsurat.
- OSM dă doar amprenta și numărul de niveluri. Fațadele, acoperișurile,
  gardurile și curțile sunt generate procedural; doar strada principală e
  refăcută după fotografii.
- Casa nr. 128 e mutată cu 0,75 m, pentru că amprenta ei din OSM intra pe
  carosabil.
- Adâncimea apei e modelată, nu măsurată.
- Mașinile și stâlpii de pe strada principală sunt așezați după fotografii,
  nu după măsurători la fața locului.

## Cum e făcut

Fără assete externe: **fiecare textură e desenată procedural** în `<canvas>` la
pornire (albedo + normal map + roughness), iar geometria e generată din cod.
Singura dependență e Three.js r169, inclus în `vendor/`.

| Fișier | Rol |
|---|---|
| `src/zona.js` | datele reale ale zonei, generate (nu se editează de mână) |
| `src/terrain.js` | funcția unică de înălțime `surfaceY`, drumuri, albie, bordură, trotuar, marcaj |
| `src/water.js` | suprafața Prahovei și a Câmpiniței, cu curgere animată |
| `src/world.js` | asamblează harta: clădiri, drumuri, gară, stâlpi, mașini, vegetație |
| `src/noise.js` | value‑noise tileabil, fBm, conversie înălțime → normal map |
| `src/textures.js` | asfalt, beton, lemn, cărămidă, tencuială, țiglă, iarbă, prundiș, piatră spartă, apă, plăcuțe |
| `src/geo.js` | merge de geometrii, netezire de normale, catenare, coliziuni cu grilă spațială |
| `src/props.js` | clădiri din amprente OSM, stâlpi, cabluri, garduri, porți, copaci, mobilier urban |
| `src/carmodel.js` | mașini prin extrudarea siluetei laterale, coapte în geometrie statică |
| `src/lighting.js` | pool fix de SpotLight‑uri + bălți de lumină + flare + halou de ceață |
| `src/sky.js` | cupolă de cer cu gradient, stele și halou de poluare luminoasă |
| `src/postfx.js` | HDR + MSAA → bloom → auto‑expunere pe GPU → ACES, gradare, vignetă, grain, dither |
| `src/player.js` | controller de personaj cu coliziuni, trepte, vad și ciclu de mers |
| `src/touch.js` | joystick, privire și butoane pentru telefon |
| `src/audio.js` | sunet procedural (WebAudio): pași pe asfalt/prundiș/apă, râul, trenul |
| `src/hud.js` | minimap orientat spre nord, numele zonei și al străzii |
| `tools/` | descărcarea datelor și generatorul `zona.js` |

### Decizii tehnice care contează

**O singură funcție de înălțime.** `surfaceY(x, z)` guvernează deopotrivă
terenul vizibil, drumurile, albia și pasul jucătorului, deci nu există niciodată
decalaj între ce vezi și pe ce mergi. Mașinile parcate stau înclinate pe panta
reală a străzii.

**Iluminat.** Numărul de lumini din scenă nu se schimbă niciodată: un *pool
fix* de 6 SpotLight‑uri se reatașează celor mai apropiate lămpi. Dacă numărul
de lumini ar varia, Three.js ar recompila shaderele și jocul ar sacada. Lămpile
îndepărtate sunt redate prin bălți de lumină proiectate, care preiau exact cât
lasă lumina reală — fără dublă contribuție.

**Auto‑expunere.** Luminozitatea medie a cadrului se măsoară pe GPU (ponderată
spre centrul și partea de jos a imaginii) și se adaptează treptat, ca ochiul:
sub lămpi imaginea nu se arde, iar pe malul întunecat al râului se deschide.

**Albia exactă.** Celulele de teren care ating poligonul albiei sunt tăiate
după contur, astfel încât malul urmează linia reală, fără trepte.

**Performanță.** Geometria statică e unită pe material și pe plăci spațiale,
iar mașinile sunt coapte în geometrie statică. Pe *Ridicată*: ~625 draw‑call‑uri
și ~550 k triunghiuri. Pe *Telefon*: ~165 draw‑call‑uri și ~260 k triunghiuri.

## Setări

Meniul (`ESC` sau `☰`) reglează în timp real expunerea, bloom‑ul, granulația,
câmpul vizual, sensibilitatea, volumul și ora (noapte → zori → zi). Calitatea
(Telefon / Scăzută / Medie / Ridicată / Ultra) reîncarcă pagina; controlează
MSAA, rezoluția de randare, densitatea de pixeli, umbrele, ceața, bloom‑ul și
numărul de lumini dinamice.
