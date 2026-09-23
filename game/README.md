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
| `R` | — | revii la locul din care e făcută poza 3 |
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
- **pe strada principală**, după fotografii (vezi mai jos): carosabil de
  4,4 m, bordură și trotuar doar pe stânga, acostament înierbat pe dreapta,
  marcaj scurt și des, stâlpi de beton la ~34 m cu lămpi LED, rețea torsadată,
  mașinile din poze parcate cu două roți pe trotuar și gardurile din poze.

Apa e fizică: intri în ea, iar viteza scade cu adâncimea (la 0,73 m mergi cu
2,5 m/s). Sunetul râului crește pe măsură ce te apropii, iar din când în când
se aude un tren în gară.

## Strada refăcută după fotografii

Cele trei poze sunt făcute noaptea, pe Strada Gării, privind spre Prahova.
Pentru fiecare am reconstruit camera, fără nicio presupunere despre obiectiv:

- **fuga de perspectivă** a marcajelor dă orizontul și direcția străzii;
- **lățimea reală a mașinilor** din poze (BMW Seria 3 E90 = 1,82 m, Opel Corsa C =
  1,65 m) dă înălțimea telefonului: toate cele trei poze dau **~1,33 m** de sol;
- de aici, orice punct de pe asfalt se poate măsura lateral în metri.

Ce a ieșit și e acum în joc:

| Măsurat pe poze | Valoare |
|---|---|
| carosabil (bordură stânga → marginea din dreapta) | ~4,4 m |
| banda dintre marcaje | ~3,45 m |
| marcajul lateral | linie ~0,9 m, pauză ~0,8 m |
| bordura și trotuarul | doar pe stânga, trotuar de ~1,25 m până la gard |
| dreapta | fără bordură: asfalt → acostament cu iarbă → gard, la ~2,2 m de marcaj |
| mașinile parcate | pe stânga, cu roțile din stânga pe trotuar, ies 0,3–0,7 m în bandă |
| stâlpii | pe trotuarul din stânga, lampa LED la ~6,9 m, ieșită ~1,3 m peste stradă |
| pasul stâlpilor | ~34 m (umbra fotografului pune lampa din spate la ~10 m în poza 3 și ~15 m în poza 2) |

Locurile pozelor (z în metri pe axul străzii, spre râu z scade): poza 3 la
z = −18 (acolo începe jocul), poza 2 la z = −24, poza 1 la z = −60. În dreptul
lor, fiecare element e pus după poze:

- **stânga:** panouri bordurate 3D pe soclu de piatră (poza 2), poarta de curte
  din golul de ~10 m dintre SUV și Corsa, apoi gard viu des (poza 1);
- **dreapta:** gard înalt de scânduri maro, tabla gri cu banca din fața ei,
  stâlpul de beton fără lampă, portița verde‑albăstruie (pozele 2–3), apoi zidul
  bej cu burlan și contor și poarta maro cu streașină (poza 1); în spatele
  gardurilor, pomi înalți;
- **mașinile**, în ordinea din poze: hatchback argintiu, SUV închis cu botul spre
  noi, Opel Corsa C argintiu, o mașină gri cu botul spre noi, un break negru,
  apoi (poza 1) un break argintiu, BMW‑ul negru cu botul spre noi, un SUV cu
  spatele spre noi și, departe, singura mașină parcată pe dreapta;
- **rosturile transversale de bitum** de pe asfalt.

Restul străzii, pe care pozele nu‑l arată, folosește aceleași tipuri de garduri,
porți și mașini, în proporțiile din poze.

Luminile sunt calibrate tot pe poze. Pixelii asfaltului, ai ierbii și ai gardului
din joc sunt comparați cu cei din fotografii, în aceleași zone. Lămpile LED au
distribuția „batwing” a corpurilor stradale reale: lumină uniformă între stâlpi,
nu o pată albă sub fiecare.

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
4. taie partea dinspre stradă a amprentelor care intră în culoarul măsurat pe
   poze (vezi *Limite cunoscute*);
5. exportă totul, cu atribuirile incluse, în `src/zona.js`.

Pe datele descărcate la 23.09.2026, rularea reproduce `src/zona.js` identic,
byte cu byte (verificat și după o descărcare nouă). O descărcare ulterioară aduce starea curentă a OSM, deci harta se
poate schimba dacă între timp cineva editează zona.

### Limite cunoscute

- DEM-ul are ~30 m rezoluție și e netezit: pantele mari sunt corecte, dar
  micro‑relieful (șanțuri, taluzuri mici) nu e măsurat.
- OSM dă doar amprenta și numărul de niveluri. Fațadele, acoperișurile,
  gardurile și curțile sunt generate procedural; doar strada principală e
  refăcută după fotografii.
- Amprentele OSM de lângă stradă intră 1–3 m în culoarul măsurat pe poze
  (sunt trasate după acoperișuri, cu decalajul imaginilor aeriene). Partea lor
  dinspre stradă e tăiată la liniile din poze: 5 m de ax pe stânga, 6,5 m pe
  dreapta, pentru 14 clădiri.
- Adâncimea apei e modelată, nu măsurată.
- Pozițiile pozelor și ale obiectelor din ele sunt estimate din imagini, cu o
  precizie de ordinul a 1–3 m pe lungimea străzii și de câțiva zeci de cm lateral.
  Modelele de mașini sunt generice (siluete reale ca dimensiuni, nu mărci exacte).

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

**Lumină batwing.** Fiecare dintre cele 6 SpotLight‑uri proiectează o textură
de distribuție: puțină lumină direct dedesubt, maximul spre 60–68° de la
verticală, tăiere netă după ~70°. Asfaltul dintre stâlpi e luminat uniform, ca
în poze.

**Auto‑expunere.** Luminozitatea medie a cadrului se măsoară pe GPU (ponderată
spre centrul și partea de jos a imaginii) și se adaptează treptat, ca ochiul:
sub lămpi imaginea nu se arde, iar pe malul întunecat al râului se deschide.

**Albia exactă.** Celulele de teren care ating poligonul albiei sunt tăiate
după contur, astfel încât malul urmează linia reală, fără trepte.

**Performanță.** Geometria statică e unită pe material și pe plăci spațiale,
iar mașinile sunt coapte în geometrie statică. Pe *Ridicată*: ~600 draw‑call‑uri
și ~535 k triunghiuri. Pe *Telefon*: ~110 draw‑call‑uri și ~200 k triunghiuri.

## Setări

Meniul (`ESC` sau `☰`) reglează în timp real expunerea, bloom‑ul, granulația,
câmpul vizual, sensibilitatea, volumul și ora (noapte → zori → zi). Calitatea
(Telefon / Scăzută / Medie / Ridicată / Ultra) reîncarcă pagina; controlează
MSAA, rezoluția de randare, densitatea de pixeli, umbrele, ceața, bloom‑ul și
numărul de lumini dinamice.
