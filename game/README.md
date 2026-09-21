# Strada — lume deschisă 3D, reconstruită din fotografii

Joc 3D în browser care reproduce **strada din fotografiile de referință**: un
cartier rezidențial românesc noaptea, cu mașini parcate lângă bordură, stâlpi
de utilități cu lămpi cobra‑head și rețeaua de cabluri suspendate, garduri de
lemn, piatră și metal, curți cu thuja și case cu țiglă. Te miști liber, pe jos
sau la volanul oricărei mașini de pe stradă.

Rulează local, fără build și fără conexiune la internet.

```bash
# din rădăcina repo-ului
python3 -m http.server 8000
# apoi deschide http://localhost:8000/game/
```

Un server local e obligatoriu: fișierele sunt module ES, iar `file://` le
blochează prin CORS. Cere WebGL2 (Chrome/Edge/Firefox/Safari 15+).

## Comenzi

| Tastă | Pe jos | La volan |
|---|---|---|
| `W A S D` | deplasare | accelerație / frână / direcție |
| `SHIFT` | fugă | — |
| `SPAȚIU` | săritură | frână de mână (derapaj) |
| `CTRL` / `C` | ghemuit | — |
| `F` | urci în mașina din apropiere | cobori |
| `V` | persoana I ↔ persoana III | urmăritoare / capotă / cinematică |
| `L` | — | faruri |
| `ROTIȚA` | distanța camerei | — |
| `H` | ascunde interfața | |
| `P` | salvează o captură PNG | |
| `R` | revii la poziția inițială | |
| `ESC` | meniu și setări | |

Mișcarea camerei se face cu mouse-ul, după ce dai click pe canvas (pointer lock).

## Ce conține harta

Strada‑erou măsoară ~450 m și e construită la scară 1:1 după fotografii:

- **carosabil de 6 m** cu bombament real de 2,6 %, bordură de 13 cm, trotuar
  betonat pe stânga și acostament înierbat pe dreapta;
- **marcaj lateral discontinuu** (linie 1,5 m / pauză 2,0 m), uzat, retras 45 cm
  de la margine — exact tiparul din poze;
- **13 stâlpi** la 28 m, cu consolă, izolatori, braț curbat și corp de iluminat
  cobra‑head; între ei 6 fire în catenară plus branșamente care traversează
  strada în diagonală;
- **19 mașini** parcate în șirul din fotografii (berline, break‑uri, hatchback‑uri,
  un SUV), fiecare conducibilă, cu plăcuțe românești;
- **garduri** de lemn cu soclu de beton, ziduri de piatră cu stâlpi de cărămidă,
  garduri metalice pe soclu, porți de lemn și metal;
- **case** cu soclu de piatră, acoperiș în două ape, ferestre (unele luminate),
  garaje, terase și burlane;
- detalii: podețe de beton în dreptul porților, cutii de branșament, capace de
  canal, guri de scurgere, pubele, cutii poștale, tufe și smocuri de iarbă;
- în plus, un **cvartal întreg** (două străzi transversale, o stradă paralelă și
  o alee) ca să ai circuit închis de condus, nu doar un coridor.

## Cum e făcut

Fără assete externe: **fiecare textură e desenată procedural** în `<canvas>` la
pornire (albedo + normal map + roughness), iar geometria e generată din cod.
Singura dependență e Three.js r169, inclus în `vendor/`.

| Fișier | Rol |
|---|---|
| `src/noise.js` | value‑noise tileabil, fBm, conversie înălțime → normal map |
| `src/textures.js` | asfalt, beton, dale, lemn, cărămidă, piatră, tencuială, țiglă, iarbă, frunze, flare, marcaj |
| `src/terrain.js` | funcția unică de înălțime `surfaceY` + generarea benzilor de drum |
| `src/geo.js` | merge de geometrii, catenare, registru de coliziuni cu grilă spațială |
| `src/props.js` | stâlpi, cabluri, garduri, porți, case, copaci, mobilier urban |
| `src/carmodel.js` | mașini prin extrudarea siluetei laterale, cu pasaje decupate |
| `src/lighting.js` | pool fix de SpotLight‑uri + bălți proiectate + flare + con de ceață |
| `src/sky.js` | cupolă de cer cu gradient, stele și halou de poluare luminoasă |
| `src/postfx.js` | HDR half‑float + MSAA → bloom pe 5 niveluri → ACES, gradare, vignetă, grain, dither |
| `src/player.js` | controller de personaj cu coliziuni și ciclu de mers |
| `src/vehicle.js` | fizică de mașină cu unghiuri de derivă |
| `src/audio.js` | sunet procedural (WebAudio), zero fișiere audio |
| `src/hud.js` | minimap rotativ, vitezometru, indicatoare |

### Decizii tehnice care contează

**Iluminat.** Numărul de lumini din scenă nu se schimbă niciodată: există un
*pool fix* de 6 SpotLight‑uri care se reatașează celor mai apropiate lămpi. Dacă
numărul de lumini ar varia, Three.js ar recompila shaderele și jocul ar
sacada. Lămpile îndepărtate sunt redate prin bălți de lumină proiectate pe
carosabil, care preiau exact cât lasă lumina reală — fără dublă contribuție.

**O singură funcție de înălțime.** `surfaceY(x, z)` guvernează deopotrivă
geometria vizibilă, pasul jucătorului și suspensia mașinii, deci nu există
niciodată decalaj între ce vezi și pe ce mergi. Mașinile parcate stau înclinate
pe bombamentul real al străzii, nu orizontal.

**Fizică la pas fix.** Modelul de mașină rulează la 120 Hz indiferent de
framerate: unghiuri de derivă cu saturarea forței laterale, deci subvirare la
intrarea prea rapidă în viraj și derapaj controlabil la frâna de mână.

**Post‑procesare proprie.** Scena se randează în HDR half‑float cu MSAA, apoi
trece prin bright‑pass, cinci niveluri de bloom, tone‑mapping ACES, gradare
nocturnă (umbre reci, lumini calde), vignetă, aberație cromatică, granulație și
*dither* — fără dither, degradeurile întunecate ar face benzi vizibile.

## Setări

Meniul (`ESC`) reglează în timp real expunerea, bloom‑ul, granulația, câmpul
vizual, sensibilitatea, volumul și ora. Calitatea (scăzută / medie / ridicată /
ultra) se alege tot de acolo și reîncarcă pagina; controlează MSAA, rezoluția
de randare, umbrele și densitatea vegetației.

Pe o placă video dedicată jocul merge la 60 fps în 1080p pe setarea *ridicată*
(~560 k triunghiuri, ~560 draw‑call‑uri). Pe grafică integrată, alege *medie*
sau coboară rezoluția de randare la 0,8.
