# Strada Gării · Poiana Câmpina — joc open‑world first‑person (versiunea cu harta reală)

Strada, casa și curtea din cele 21 de fotografii, reconstruite 3D și jucabile în browser (stil GTA: mers liber, fugă, sărit, urci în orice mașină parcată și conduci) — **așezate în zona reală de 16 × 16 km** din jurul punctului 45,13403° N, 25,71109° E, construită din date cartografice deschise.

> Branch‑ul `claude/realistic-first-person-gta-game-aq1h6w` rămâne harta inițială (doar din poze). Branch‑ul acesta (`…-geo`) e copia cu harta reală.

## Harta reală: surse și ce e exact

| Ce | Sursă (date deschise) | Cum e folosit |
|---|---|---|
| Clădiri (23 595: Poiana Câmpina, Câmpina, Breaza și satele din jur), străzi (3662), gări, peroane, poduri, linia CF 300 electrificată, liniile de 110 kV (187 de turnuri), râuri, lacuri, păduri, livezi, terenuri | OpenStreetMap (© contribuitorii OSM, ODbL) | amprentele exacte ale caselor, extrudate cu numărul de niveluri din OSM; drumuri cu lățimea din benzi/clasă și materialul din `surface` |
| Relief: ±3 km în jurul străzii (grilă 5 m, 1201 × 1201) și toată harta ±8 km (grilă 10 m, 1601 × 1601) | FABDEM V1‑2 (Hawker et al. 2022, Univ. Bristol, CC BY‑NC‑SA 4.0): Copernicus GLO‑30 cu pădurile și clădirile scoase, adică solul gol | teren, profilul real al Străzii Gării, săpături/umpluturi sub drumuri și calea ferată; cele două grile se îmbină exact la marginea de ±3 km. Înainte era EU‑DEM/SRTM (Terrain Tiles AWS), care e model de suprafață: măsurat pe hartă, stătea cu mediana de 6,9 m mai sus în păduri (pe coroane) și 1,9 m în teren deschis; în teste pe albiile râurilor din OSM, fundul văii cade la 14 m de râu cu FABDEM față de 22 m înainte. Verificat pe toată harta (la 50 m) cu GEDTM30 (OpenGeoHub 2025, alt model de sol gol, făcut independent): în teren deschis diferența mediană e −0,24 m, cu 2,0 m abatere pătratică; în păduri e 4,7 m, unde ambele ghicesc solul de sub coronament. Pe vârfurile cotate din OSM, cele două modele sunt la 1,4–6,5 m unul de altul |
| Pădurile: unde sunt, foioase/rășinoase, densitatea coronamentului | Copernicus HRL Forest Type 2018 și Tree Cover Density 2018, Copernicus CLC+ Backbone 2021 (toate 10 m, EEA/CLMS, date deschise) | o celulă de 5 m e pădure când cel puțin două din trei hărți independente (cele două Copernicus și harta genurilor de mai jos) spun asta; ele coincid pe 92 % din celule. OSM avea doar ~60 % din pădurile reale de aici |
| Speciile arborilor (genul, pe celule de 10 m) | National 10 m Forest Tree‑Genus and Stand‑Composition Map of Romania (Keskes & Niță 2026, Univ. Transilvania Brașov, Zenodo 21786853, CC BY 4.0, an de referință 2025) | genul care conduce arboretul (fag, gorun/stejar, carpen, molid, brad, pin, plop, salcâm, salcie, tei) și dacă arboretul e pur (≥ 80 %) sau doar dominat (50–80 %) |
| Relief până la 20 km (dealurile și munții de la orizont) | Copernicus GLO‑30 (4 plăci de 1°, 2″) | inelul îndepărtat, dincolo de harta jucabilă |
| Culoarea solului | Sentinel‑2 cloudless 2023 by EOX (CC BY‑NC‑SA 4.0) | colorează textura de iarbă/pământ/pietriș; unde e verde în imagine se pun copaci în curți |
| Râul Prahova | OSM (albia ca poligon, axul cu lățime 20 m) + DEM | nivelul apei scade monoton în aval (≈ 0,93 %: 496,7 → 353,4 m pe 15,5 km), prundiș în albie |
| Soarele | calcul astronomic | 26 sept., 11:30: elevație 38,7°, azimut 148° (SSE) |

**Aliniere**: axa Străzii Gării (way 16947629) are azimutul 42,02° și e dreaptă de la intersecția din SV până la capătul spre râu, exact ca în poze. Casa din poze este **Strada Gării nr. 123H**. În OpenStreetMap apare ca nr. **123** (way 264516816; OSM și Nominatim nu au litera H), iar aceasta e exact amprenta pe care e pusă casa (fața la 5,6–6,1 m de ax, ca veranda măsurată pe poze; grădina din sud, gardul vișiniu și vecinii se potrivesc cu pozele 1, 6, 7). Capătul „sud” al străzii din poze e spre NE: malul înalt al Prahovei cu râpa de lut (poza 7) e terasa de ~55 m de peste râu, la 450–600 m.

**Ce e dedus, nu măsurat**: culorile pereților și acoperișurilor caselor care nu apar în poze (OSM nu le are), forma acoperișului (în patru ape din descompunerea amprentei, în două ape la unele case), ferestrele (textură), gardurile de pe celelalte străzi și stâlpii de iluminat (generați de‑a lungul străzilor), pozițiile exacte ale copacilor (pădurile și speciile vin din hărțile de 10 m de mai sus; copacii din livezi, curți și câmp din poligoanele OSM, verdele din Sentinel‑2 și densitatea coronamentului), înălțimea caselor cu tag implicit `height=4` (luată din numărul de niveluri). Vecinii din poze (casa albă, casa din lemn închis, casa cu coș, casele de după zidul gri și gardul vișiniu) au amprenta din OSM și aspectul din poze; două dintre ele sunt mutate 3 m mai departe de stradă, ca în poze.

**Detaliu pe zone** (ca să rămână jucabil pe 256 km²): relieful are 5 m în jurul străzii și 10 m în rest; copacii sunt compleți până la 1,6 km, apoi tot mai rari (pădurile de dincolo de 3 km păstrează ~15 % din arbori, restul e culoarea reală a pădurii din Sentinel‑2); clădirile, drumurile și gardurile sunt îmbinate în bucăți de 750 m lângă stradă și de 2 km în rest, ascunse după 6,8 km (ceața le acoperă oricum), iar stâlpii, gardurile și marcajele după 1,6 km. Pe 931 000 de copaci, doar cei de lângă tine (150–260 m) sunt modele 3D, restul sunt imagini pre-randate.

**Refacerea datelor**: `python3 geo/fetch_raw.py` și `python3 geo/fetch_world.py` (descarcă ~300 MB în `geo/raw`: OSM pe 64 de bucăți, relief FABDEM și Copernicus, Sentinel‑2, hărțile de 10 m ale pădurilor) apoi `python3 geo/build_geo.py` (~2,5 min) → `assets/geo/`. `geo/debug_map.py` desenează o hartă de control; `node tools/geo-test.mjs` face capturi automate.

## Pornire

Nu are nevoie de build. Orice server static merge:

```bash
cd game
python3 -m http.server 8765      # sau: npx serve .
```

Deschide `http://localhost:8765` → **Joacă**. (Direct din `file://` nu merge — browserele blochează modulele ES.)

## Control

| Tastă | Pe jos | În mașină |
|---|---|---|
| W A S D / săgeți | mers | accelerație / frână‑marșarier / volan |
| Mouse | privire | rotește camera |
| Shift | fugă | – |
| Space | săritură | frână de mână (drift) |
| C / Ctrl | ghemuit | – |
| F / E | urcă în mașina de lângă tine | coboară |
| E | lângă focul de tabără de la sonde (lângă Fiatul roșu): îl aprinzi / îl stingi | – |
| V | – | cameră spate ↔ interior (cockpit) |
| L / H | – | faruri / claxon |
| 1 – 9, 0 | te duce exact în punctul din care a fost făcută fiecare poză (toate 14 sunt și în lista din ecranul de start) | |
| P / Esc | captură ecran / meniu (calitate grafică, vremea, ora, sunet) | |
| T / O | vremea (senin, parțial noros, înnorat, ploaie torențială, ninsoare, viscol, zăpadă cu senin) / ora (8:00 – 23:30, cu noaptea cu lună plină) | la fel |
| B | vântul: după vreme, calm, adiere, vânt moderat, vânt tare, vijelie (copacii, iarba și foșnetul frunzelor) | la fel |
| E / F | lângă crucea de pe deal: iei Glock 18-ul de pe placa de beton | – |
| Clic stânga / clic dreapta | cu Glock-ul: tragi (pe automat, rafală cât ții apăsat) / ochești prin cătare | – |
| R / X / Q | cu Glock-ul: reîncarci / automat ↔ foc cu foc / îl pui deoparte și îl scoți | – |
| L | lanterna (noaptea se aprinde singură) | faruri |
| G | contorul de performanță: FPS, timpul CPU și GPU al unui cadru, desenări, triunghiuri, rezoluția | la fel |
| K | te duce la marginea luminișului din pădurea de lângă cruce, unde se petrece scena (doar la 23:30, pe vreme înnorată) | la fel (cobori întâi) |

## Lumina: vremea, ora și umbrele

* **Vremea** (tasta **T** sau meniul): *senin*, ca în capturile Street View: cer albastru adânc cu cumulus luminați din partea soarelui, soare puternic și umbre clare. *Parțial noros*: mai mulți nori, umbre puțin mai moi. *Înnorat*: plafonul gri de sfârșit de septembrie din pozele tale 1–23, identic cu lumina de până acum. Fiecare vreme schimbă împreună cerul, soarele, lumina cerului, reflexiile, ceața și expunerea. La soare, umbra primește și lumina reflectată de solul, zidurile și frunzele luminate din jur (nu doar albastrul cerului), ca să nu iasă albastră și neagră.
* **Ora** (tasta **O** sau meniul): soarele e pus din poziția reală pentru 26 septembrie la Poiana Câmpina (formulele NOAA), de la 8:00 (8° deasupra orizontului) la 18:30 (6°); în listă e și 16:11, ora clipului IMG_0725 (28°). Pozele sunt făcute pe la 11:30 (39°). Culoarea și puterea soarelui vin din drumul luminii prin atmosferă (masa de aer Kasten–Young, împrăștiere Rayleigh și aerosoli): la amiază e alb-gălbui, spre apus portocaliu. Cerul, norii și ceața se încălzesc și se întunecă odată cu el.
* **Golden hour (V78)** (`src/main.js`, `src/geo/index.js`, `src/sky.js`, `src/air.js`): în lista orelor (tasta **O** sau meniul) sunt două ore noi, *Golden hour, dimineața* și *Golden hour, seara*, cu ora lor reală alături.
  * **Ora e calculată, nu aleasă la ochi.** Golden hour înseamnă soarele jos, la câteva grade deasupra orizontului. Aici orizontul nu e plat: spre est dealul de la ~0,7 km se ridică la ~3,7°, spre vest dealurile de la 1,5–1,9 km la 6–7°. Jocul caută minutul în care soarele, cu refracția atmosferei inclusă (formula Saemundsson), stă la 1° deasupra orizontului real văzut de pe stradă. Orizontul e citit din relieful hărții, apoi din cel până la 20 km și din inelul până la 100 km, cu curbura Pământului. Rezultatul, pe 26 septembrie: **7:40** dimineața și **18:15** seara. Cu zăpadă (1 februarie): 7:58 și 16:34.
  * **Soarele apune după deal, nu după linia ochilor.** La orice oră, lumina directă se stinge când soarele (discul are 0,27° rază) coboară sub orizontul real din direcția lui. Pe 26 septembrie, la 18:30 și la 19:00 strada e deja în umbra dealului, deși soarele e încă deasupra orizontului matematic. Relieful îndepărtat rămâne luminat cât timp soarele îl atinge. Noaptea, luna e tratată la fel.
  * **Cerul și ceața sunt aurii doar spre soare.** Pâcla împrăștie lumina mai ales înainte (Mie), deci la soare jos orizontul se aprinde galben-portocaliu doar pe partea soarelui, în culoarea luminii care a traversat ~10 mase de aer. Pe partea opusă cerul rămâne albastru-pal. Înainte, tot orizontul se încălzea la fel și cerul arăta ca la amurg în toate direcțiile. Banda aurie stă lipită de orizont (~5–10°), iar în jurul soarelui cerul e lumina lui înroșită, împrăștiată de aer: albastrul e înmulțit cu nuanța luminii solare, nu amestecat cu portocaliu. Amestecul dădea mov-lavandă (pixeli cu roșu ≈ verde < albastru); acum cerul trece din albastru prin alb-pal în auriu. Același lucru se aplică ceții de pe hartă și reliefului până la 300 km: dinspre soare sunt aurii și luminoase, dinspre partea opusă albăstrui. Ziua, cu soarele sus, ambele părți au culoarea de dinainte, deci restul orelor nu se schimbă.
* **Cât de departe se vede (V59)**: ca în realitate, după vreme și după relieful real până la 100 km.
  * **Vizibilitatea** e cea meteorologică: distanța la care un obiect închis la culoare abia se mai deosebește de cer (contrast 2 %, legea lui Koschmieder: V = 3,9 / coeficientul de extincție al aerului). Senin ~55 km, parțial noros ~40 km, înnorat ~21 km, zăpadă cu senin (aer rece și curat) ~70 km, ploaie ~2 km, rafale ~1,6 km, ninsoare ~3 km, viscol ~330 m (și mai puțin în rafale). Înainte, pe senin, vizibilitatea era ~25 km și nimic nu se desena după 17 km.
  * **Relieful până la 100 km** (`geo/build_horizon.py` → `assets/geo/horizon.json` și `horizon.jpg`): înălțimile Terrain Tiles (AWS, ~110 m) și culoarea Sentinel‑2 cloudless 2023 (EOX), pe ±100 km în jurul satului, într-o proiecție azimutală echidistantă din centrul hărții (fiecare punct la distanța și în direcția lui reală; la ±20 km se potrivește cu harta cu ~60 m). Din jocul de la 20 km în afară se întinde un inel de relief cu celule care cresc cu distanța (~250 m la 20 km, ~1,2 km la 100 km).
  * **Curbura Pământului**, cu refracția obișnuită (raza efectivă 6371 km / 0,87): față de privirea ta, munții de la 40 km coboară cu ~105 m, cei de la 100 km cu ~680 m (până la 8 km harta rămâne plană, diferența e sub 5 m), deci ies din orizont cât ies și în realitate. Din dealul crucii (517 m) se văd spre NNV Bucegii și Baiul (~2000 m, la 32–38 km, cam la 2° deasupra orizontului) și spre N–NE culmile de pe Valea Doftanei (1200–1400 m, la 20–30 km).
  * **Perspectiva aeriană**: cu cât e mai departe, cu atât relieful e mai albăstrui și mai șters, după aceeași extincție ca restul lumii, iar spre soare ceața se luminează (împrăștierea Mie înainte). Pe zăpadă munții de peste ~900–1400 m sunt albi.
  * **Tehnic**: cerul și relieful îndepărtat se desenează într-o trecere separată (`post.js` FarPass, cu planul apropiat la 30 m și cel îndepărtat la 260 km), apoi lumea hărții peste ele; astfel adâncimea rămâne precisă și aproape, și la 100 km. Obiectele (case, copaci, stâlpi) se taie după vizibilitate: pe senin până la marginea hărții, pe ploaie la ~2 km, pe viscol la 1,2 km, adică abia când ceața le-ar fi ascuns oricum. Relieful de la 8–20 km se ascunde când vizibilitatea scade sub 6 km, inelul de 20–100 km sub 14 km.
  * **Exportul Unreal** include și relieful îndepărtat.
* **Aerul dintre tine și ce vezi, ca pentru ochi (V62)** (`src/air.js`, `src/post.js` AerialBlurPass, `geo/build_horizon.py`):
  * **Departele e difuz, ca în realitate**: munții și dealurile îndepărtate nu mai sunt clare și tăiate, ci albăstrui, șterse și moi la contur, cu atât mai mult cu cât e mai mult aer până la ele.
  * **Aerul e calculat fizic, pe culori**: moleculele (împrăștiere Rayleigh: 5,8 / 13,5 / 33,1 × 10⁻⁶ pe metru la 680 / 550 / 440 nm, deci albastrul se pierde de ~5,7 ori mai repede decât roșul; scade cu înălțimea pe 8 km) și pâcla (aerosolii: la fel pe toate culorile, din vizibilitatea vremii; scade cu înălțimea pe ~1,2 km, deci văile sunt mai încețoșate decât culmile). Grosimea optică pe raza privirii e integrată exact între înălțimea ochiului și cea a punctului. Din lumina obiectului rămâne e^(−τ), iar aerul adaugă lumina pe care o împrăștie spre tine: albicioasă din pâclă, albăstruie din molecule. Același model e folosit pentru harta jocului și pentru relieful până la orizont.
  * **Vizibilitățile** (Koschmieder, V = 3,912 / extincția la 550 nm), refăcute după măsurători: pe senin ~32 km (grosimea optică a aerosolilor la Măgurele, lângă București, e în medie 0,23 la 500 nm, AERONET 2012–2015; la deal, departe de oraș, mai puțin), parțial noros ~26 km, înnorat ~18 km, zăpadă cu senin ~75 km, ploaie ~2 km, rafale ~1,6 km, ninsoare ~2,9 km, viscol ~330 m. La precipitații pâcla umple toată coloana de aer (4 km), nu doar stratul de jos. Valorile din V59 erau prea optimiste pe senin (55 km).
  * **Neclaritatea depărtării**: pâcla împrăștie lumina mai ales înainte, la unghiuri mici, așa că o parte din lumina venită de departe intră în ochi ușor deviată și contururile se înmoaie (funcția de împrăștiere a punctului în atmosferă: Narasimhan & Nayar, 2003, și studiile Monte Carlo care au urmat). O trecere de post‑procesare estompează fiecare pixel după grosimea optică a pâclei din fața lui (~1,2 mrad pe unitate de τ, cel mult 20 mrad, pe o piramidă de 5 niveluri). Ce e aproape rămâne clar.
  * **Unghiul de vedere al ochiului** (meniul: „Unghi de vedere”). *Natural* (implicit): unghiul real sub care vezi ecranul, 2·atan(înălțimea ecranului / 2 / distanța până la el). Diagonala ecranului (″) și distanța (cm) se pot scrie în meniu; altfel sunt ghicite (calculator ~65 cm, laptop ~50 cm, tabletă ~40 cm, telefon ~32 cm). Așa un deal din joc are pe ecran exact mărimea pe care ar avea-o în realitate. *Câmpul ambilor ochi*: 120° pe orizontală. *Larg, ca în jocuri*: 70° pe verticală, ca până acum.
  * **Relieful până la orizontul geometric, fără limita de 100 km**: un al doilea inel, pe ±300 km (Terrain Tiles z8, ~600 m, și Sentinel‑2 cloudless z8: `assets/geo/horizon2.json` și `horizon2.jpg`, relief între −86 și 2374 m), cu curbura Pământului și refracția. Planul îndepărtat al camerei e la 430 km. Ce se vede de fapt la 150–300 km hotărăște aerul, ca în realitate: doar crestele înalte, ca niște siluete albastre foarte palide, în zilele cele mai curate. Inelul se desenează doar când vizibilitatea trece de 25 km.
  * **Reparat: relieful de la 20 km în colo lipsea.** Din V59, cele două inele de relief (20–100 km și 100–300 km) aveau triunghiurile orientate cu fața în jos. Placa video le arunca, așa că munții de dincolo de 20 km (Bucegii, Baiul, Ciucașul) nu apăreau, iar în locul lor se vedea cerul de sub orizont, ca o bandă bej (cel mai clar de sus). Acum sunt orientate în sus și se văd.
  * **Cerul coboară până la orizontul real**: din cauza curburii Pământului, orizontul e sub linia ochilor (~0,6° de pe stradă, ~1,1° de la 1300 m). Cerul se desenează acum până acolo, nu doar până la 0°.
* **Ploaie torențială** (a patra vreme din **T**): plafon jos și întunecat, ceață (vizibilitate ~2 km), suprafețe ude și zgomot de ploaie.
  * **Picăturile** cad în două straturi în jurul tău (aproape și „perdeaua” de mai departe), cu vânt în rafale, și rămân pe loc în lume când te miști. Au mărimi diferite: cele mari (~3 mm) cad cu ~9 m/s și lasă dâre mai lungi, cele mici cu ~6 m/s. Se adună peste imagine ca lumină, fiindcă o picătură e o lentilă mică ce arată cerul. Se văd bine pe fundal întunecat (copaci, ziduri) și aproape deloc pe cer, ca în realitate. Rafalele de vânt trec prin ploaie „perdele” mai dese.
  * **Picăturile, după fizica ploii (V63)** (`src/rain.js`):
    * mărimile vin din distribuția Marshall–Palmer, N(D) = 8000·e^(−ΛD) pe m³ pe mm, cu Λ = 4,1·R^(−0,21) pe mm: la 40 mm/h cele mai multe au 0,5–1,5 mm și puține trec de 3 mm (peste ~5,5 mm se rup);
    * fiecare cade cu viteza ei terminală (Atlas, Srivastava și Sekhon, 1973: v = 9,65 − 10,3·e^(−0,6·D) m/s, adică ~4 m/s la 1 mm, ~6,5 la 2 mm, ~8 la 3 mm);
    * dâra e drumul făcut cât ochiul „ține” imaginea (~45 ms), deci cele mari lasă dâre mai lungi;
    * picăturile de peste ~1 mm oscilează în cădere (modul 2, f = √(8σ/ρa³)/2π: ~120 Hz la 2 mm, ~65 Hz la 3 mm), așa că pe dâra lor apar câteva „mărgele” mai luminoase (Garg și Nayar, „Vision and Rain”, 2007);
    * cele foarte aproape de ochi, când privești în depărtare, sunt neclare: o pată lată și slabă, cât deschiderea pupilei (3 mm ziua, 6 mm noaptea);
    * noaptea, sub felinare și în farurile mașinii, ploaia strălucește: o picătură cu lumina în spatele ei, aproape pe direcția privirii, o trimite înainte spre ochi (apa împrăștie lumina mai ales înainte).
  * **Parbrizul în ploaie (V63)** (`src/windshield.js`; în mașină, din scaunul șoferului, tasta **V**; nu pe ATV). Picăturile sunt calculate pe sticla reală a mașinii (un plan prin parbriz, în metri), deci rămân pe ea când te uiți în jur.
    * **Câte cad**: din distribuția Marshall–Palmer și viteza picăturilor spre sticlă (căderea lor pe panta parbrizului plus viteza mașinii). Pe parbrizul Maybach-ului (34° față de orizontală), la 40 mm/h, cad ~7 000 de picături pe m² pe secundă cu mașina oprită și ~36 000 la 70 km/h. Fiecare stă pe sticlă ca o calotă cu raza ~0,63·D (o semisferă cu aceeași apă).
    * **Se unesc**: unde s-a strâns apa unei picături de 2–4,5 mm se face una mare, cu altele de 0,8–2 mm între ele, iar cele mici înghițite dispar. Unde s-a strâns apa unei picături de 3,5 mm pe ~2,6 cm, aceasta e destul de grea să alunece: coboară sacadat, pe un drum șerpuit, și lasă în urmă un șir de mărgele mici. Peste ~50 km/h aerul le împinge în sus pe parbriz.
    * **Fiecare picătură e o lentilă**: prin ea vezi ce e în spate, mic și răsturnat, întunecat la margine (lumina de peste ~49° se reflectă total înapoi). Ochiul e pus pe drum, deci picăturile sunt neclare, cât lățimea pupilei: cele mici sunt o pânză fină, cele mari pete moi.
    * **Ștergătoarele**: două, în tandem, ca la o mașină cu volanul pe stânga, pe cursa aproape sinusoidală a mecanismului. Viteza o aleg după cât de repede se umple sticla: rapid (55 de curse pe minut), lent (38) sau intermitent, la câteva secunde. Normele cer cel puțin 45 de curse pe minut pe treapta rapidă și cel puțin 20 pe cea lentă (FMVSS 104). Lamelele, negre în contra luminii, împing o pană de apă și lasă sticla curată, cu o peliculă subțire care se usucă într-o fracțiune de secundă. Colțurile de sus, unde nu ajung, rămân pline de apă.
  * **Nu plouă prin copaci, acoperișuri sau mașini**: o hartă de înălțimi văzută de sus, pe ±48 m în jurul tău, dă pentru fiecare punct prima suprafață pe care cade ploaia (coroana, acoperișul, capota, tablierul podului sau solul). Picăturile se opresc acolo, stropii sar de pe ea, iar ce e cu peste ~0,5 m dedesubt rămâne adăpostit: sub coroane și sub streșini solul e doar umed, fără bălți, fără inele și fără apă care curge. Harta se reface când te muți 6 m (și la fiecare ~0,5 s, pentru mașini). Învelișul simplificat al pădurilor îndepărtate și efectele de lumină (raza lunii, stropii) nu mai contează ca adăpost: până la V49, drumurile prin pădure (de pildă DN1 spre Cornu) și dealul crucii noaptea rămâneau uscate în ploaie.
  * **Drumul ud oglindește lumea** (reflexii în spațiul ecranului, la „Medie” și peste): casele, mașinile, copacii și felinarele se văd în bălți și în asfaltul ud, cu factorul Fresnel al apei (aproape nimic privind în jos, mult spre orizont). În bălți reflexia e clară; pe pelicula de pe asfalt, micile valuri o trag în dungi verticale, ca pe un drum ud real. Noaptea, cele 8 felinare cele mai apropiate lasă în asfaltul ud dâre lungi de lumină: imaginea lor în oglindă, întinsă pe verticală cât de aspru e luciul apei.
  * **Pe asfalt și pe pavele**: unde drumul e aproape plan (sub ~2%) se adună bălți. Unde panta trece de ~3%, apa curge la vale ca o peliculă, cu valuri mici trase pe direcția pantei și cu atât mai repede cu cât drumul e mai înclinat. Panta e luată din geometria reală a drumului.
  * **Picăturile se văd pe asfalt**: pe orice suprafață dură și deschisă, solul „fierbe” de stropi mici de ~4 cm, ~140 deodată pe metru pătrat (o ploaie de ~50 mm/h aduce ~3000 de picături pe m² pe secundă). În bălți fiecare picătură face un inel care se lărgește. Mai sar și coroane de apă de pe sol, de pe acoperișuri și de pe mașini.
  * **Mașina ridică apă**: când conduci pe drum ud, roțile aruncă în urmă un val de stropi și ceață, cu atât mai mare cu cât mergi mai repede.
  * **Apa curge de pe tot** (V57, la ambele ploi). Pe ±48 m în jurul tău, placa video calculează unde se adună și pe unde curge apa, cu celule de ~19 cm. Pornește de la suprafețele solide văzute de sus: solul, drumurile, bordurile, acoperișurile, capotele, dar nu frunzele.
    * Apa stă unde terenul face o adâncitură, umplută până la nivelul la care ar da pe dinafară (algoritmul Planchon–Darboux): cel mult ~2,5 cm pe asfalt, ~2 cm pe pământ, ~1 cm pe acoperiș.
    * Restul curge spre vecinii mai joși, împărțit după pantă (direcții multiple de curgere, Quinn/Freeman), celulă cu celulă la vale. Se stabilizează în câteva secunde și urmează schimbările: rafale, mașini care pleacă.
    * Adâncimea și viteza vin din formula lui Manning: o peliculă de 1–3 mm pe asfalt, șuvoaie de centimetri de-a lungul bordurilor.
    * Suprafața unui șuvoi stă la nivel peste rigolă, așa că apa se întinde peste ce e mai jos în jur: ~1 m pe asfaltul cu 2% pantă spre bordură, aproape deloc pe un mal abrupt. Pe strada din poza 1, rigola de est duce 2–10 litri pe secundă, iar apa stă pe o fâșie de ~1,2 m, adâncă de 2–4 cm (strada e aproape plană, deci curge încet).
    * Din fiecare celulă curge ploaia care cade pe ea: toată de pe acoperișuri și mașini, ~92% de pe drumuri, ~25% de pe pământ (restul intră în sol). Sub coroane ajunge mai puțină.
    * Gardurile, stâlpii, trunchiurile și balustradele (tot ce e mai subțire de ~40 cm) nu opresc apa, care trece pe sub și printre ele. Casele și mașinile o opresc și o ocolesc.
    * Pe drum apa se vede curgând: valuri mici purtate de curent, cu creste de-a curmezișul șuvoiului, și pâlcuri de spumă purtate de apă unde curge repede. Sub câțiva milimetri de apă dispare granulația asfaltului și suprafața devine netedă, ca o oglindă tulburată de valuri. Apa de pe drum e tulbure, cenușiu-maronie, mai deschisă decât asfaltul ud de sub ea. Cea care se scurge de pe pământ e maronie, cu noroi. Pe toată apa cad inele de picături și se reflectă lumea.
    * Pe pământ și în iarbă se vede apă doar unde se adună (pârâiașe, bălți). Pelicula subțire intră printre fire și în sol.
    * **De pe streșini curge apa** în șuvoaie care se rup în picături pe măsură ce cad, iar vântul le împinge. Jos fac stropi. Sunt găsite din calcul: oriunde apa trece peste o margine de la peste ~1,9 m (o streașină). Nu sunt desenate de pe acoperișul mașinilor, unde caroseria se lărgește dedesubt.
    * Se aude susurul apei din rigolă când ești lângă ea și plescăitul șuvoaielor de pe streșini din jur.
* **Ploaie în rafale** (după *Ploaie torențială* în **T**): o furtună de vară, cu frontul de rafale al unei celule orajoase venit peste dealuri dinspre vest-nord-vest.
  * Vântul bate cu ~6–9 m/s între rafale. Cam la fiecare jumătate de minut vine o rafală care crește în câteva secunde la ~20–23 m/s (~80 km/h), ține 5–10 s și rotește direcția. Ploaia cea mai deasă vine odată cu rafala, iar vizibilitatea scade.
  * **Ploaia e împinsă de vânt**: în rafală vine aproape orizontal, la ~23° față de sol la 21 m/s, iar în acalmie la ~45°. Fiecare picătură are mica ei abatere din turbulență. Ploaia vine în perdele, benzi mai dese și mai rare purtate de aer, care trec peste stradă.
  * **Ploaia nu trece prin nimic**: aceeași hartă ca la viscol, privită din direcția din care zboară picăturile. În spatele caselor, zidurilor și mașinilor, de-a lungul zborului, nu cad picături și nu sar stropi. Sub streașina dinspre vânt ploaia intră.
  * **Pereții bătuți de vânt se udă de sus până jos** și pe ei curg șiroaie. Pereții dinspre partea adăpostită rămân mai uscați.
  * **Ceață de stropi**: picăturile care se sparg pe asfalt fac o ceață joasă, pe care rafalele o mătură în valuri de-a lungul străzii.
  * Copacii se apleacă și se zbat în rafale, iar fulgerele luminează plafonul și sunt urmate de tunete. Vântul te împinge (mai puțin la adăpost), iar viteza lui apare lângă hartă.
  * Totul se udă: solul, tencuiala și asfaltul se închid la culoare, iar suprafețele devin lucioase. Ploaia începe în ~2 s, suprafețele se udă în ~10 s și se usucă în ~1 min după ce se oprește.
* **Râurile și lacurile (V63)** (`src/geo/water.js`): Prahova, Câmpinița, pâraiele și iazurile, refăcute.
  * **Adâncimea**: fiecare colț al apei știe cât de adâncă e apa peste albia săpată (până la ~1,5 m în canalul Prahovei, câțiva centimetri la marginile cu prundiș). Nivelul și curentul se potrivesc de la o celulă la alta, deci suprafața nu mai are trepte și cusături.
  * **Curentul**: Prahova curge pe linia ei din OSM (nivelul scade ~0,9 % în aval), mai repede unde e mai adâncă (Manning: v ~ h^(2/3)): ~1,5 m/s la mijlocul canalului, ~0,5 m/s la margini. Pâraiele curg pe panta lor, iazurile stau. Valurile sunt purtate de curent (o hartă de curgere în două faze, ca să nu se întindă), mai puternice unde apa curge repede peste prundiș.
  * **Valuri staționare**: unde curge repede apar valuri care stau pe loc față de mal, de-a curmezișul curentului. Sunt valuri de gravitație care urcă exact cât de repede coboară apa, deci distanța dintre ele e 2πv²/g (~1,4 m la 1,5 m/s).
  * **Prin apă se vede fundul**: bolovani rotunjiți de 10–25 cm, cu pietriș de 3–6 cm între ei, deplasați de refracție (Snell, n = 1,33). Apa tulbure îi întunecă pe culori, după legea Beer–Lambert (roșul se pierde cel mai repede), iar culoarea aluviunilor crește cu adâncimea. La soare, valurile concentrează lumina pe fund într-o rețea mișcătoare (caustice), care se stinge cu adâncimea.
  * **Suprafața**: reflexie Fresnel (~2 % privind în jos, aproape totul la unghi razant), cu cerul, malurile, copacii și podurile oglindite până la ~170 m. Valurile prea mici ca să le mai deosebești de la distanță fac reflexia mai difuză, nu dispar. Spuma apare în dungi doar unde curge repede peste prundiș, plus o linie subțire unde apa atinge pietrele. În ploaie apar inelele picăturilor.
  * **La podul DJ100E** albia e doar canalul de apă mică (10–14 m). Apa se oprește acum pe o linie netedă de-a lungul lui și se subțiază spre mal, în loc să fie tăiată în pătrate de 5 m.
  * **Sunetul**: lângă Prahova se aude vuietul apei (zgomot filtrat pe la 1,1 kHz plus un huruit grav), din ce în ce mai tare pe ultimii ~190 m.
* **După pozele tale cu drona (V64)**: șase cadre din 18 octombrie 2026: strada de lângă Prahova, gara Câmpina cu halele, biserica și crucea de pe șa.
  * **Frunzele de toamnă** (`src/season.js`; setarea **Frunze** din meniu: *de toamnă* sau *verzi, de vară*). Fiecare foios se colorează când îi vine rândul: cei mai timpurii cu ~2 săptămâni înaintea celor târzii, iar în coroană pe pete. Culoarea depinde de gen: fagul arămiu și galben-portocaliu, carpenul și alunul galben, stejarul ultimul și doar oliv-maroniu, nucul și plopii galbeni, salcâmul galben-verzui, cireșii și perii portocaliu-roșcat. Rășinoasele rămân verzi. O frunză galbenă reflectă cam de 2 ori lumina uneia verzi (dispare clorofila care absorbea roșul și albastrul, rămân carotenoidele), una portocalie ~1,5×. Ca în poze, cam un sfert din foioase sunt în plină culoare, tot atâtea se îngălbenesc, restul sunt oliv sau încă verzi. Se aplică la copacii de aproape, la siluetele de departe, la pădurea generată și la coronamentul de la orizont. Iarba de pe pășuni se usucă pe pete spre oliv și pai, iar gazonul din curți rămâne mai verde. Ziua jocului rămâne 26 septembrie (soarele și luna plină reală), deci frunzele sunt o setare, nu urmează data.
  * **Acoperișurile**: proporțiile sunt numărate pe poza 3 (~50 de acoperișuri; pozele 1 și 5 arată la fel): tablă zincată ondulată sau cutată ~35 %, țiglă metalică sau tablă fălțuită maro ~18 %, roșie ~12 %, vișinie ~10 %, antracit ~4 %, verde ~4 %, tablă veche ruginită ~10 %, țiglă ceramică ~6 %. Tabla ondulată are textura ei: undele la 83 mm, florile de zinc și rugina pe pete și în dâre pe văile tablei; rugina e aspră și mată, zincul e metal mat. Magaziile au mai ales tablă goală, jumătate ruginită. Halele au tablă cutată gri-deschis cu benzi de luminatoare din policarbonat (pozele 5–6).
  * **Anexele din curți** (`src/geo/anexe.js`): în poze, aproape fiecare casă are în spate o magazie, o bucătărie de vară sau un garaj, des două, iar OSM are puține. Acum în spatele caselor din hartă (spre partea opusă străzii) stau 1–2 anexe de 2,5–4,5 × 3–6 m, cu acoperiș de tablă. Stau departe de alte clădiri, drumuri, calea ferată, ape, păduri și locurile lucrate după poze; pomii hărții de pe locul lor sunt scoși. Poziția lor e generată, nu măsurată.
  * **Vagoanele din gară** (`src/geo/wagons.js`): pe fiecare linie de garaj din OSM stau garnituri de 3–14 vagoane cuplate, cu goluri între garnituri și departe de macazuri: cisterne de 88 m³ (gri, negre, albe, verde-crud, câteva roșcate; 15,5 m peste tampoane, cazan de 3 m), vagoane deschise maro-ruginiu tip Eaos și câteva vagoane acoperite. Liniile principale și linia cu locomotiva din poza 48 rămân libere. Vagoanele sunt obstacole solide.
  * **Prahova la ape mici**: albia activă (terasa joasă până la ~1,2–1,8 m peste nivelul apei, la cel mult ~75 m de firul râului) e acum prundiș, și de aproape și de departe. Până acum era verde-pal, pentru că imaginea Sentinel-2 de vară amestecă acolo pietrișul cu apa și sălciile. Unde apa ar sta sub ~10 cm peste pietriș, prundișul rămâne descoperit, iar râul curge doar pe canale, ca în poza 1.
  * **Ce nu e ca în poze**: grădinile (straturi, vie, pomi deși) și gardurile dintre loturi nu sunt în date, așa că loturile au mai multă iarbă decât în realitate. Pădurea văzută de departe e mai „granulată” decât coroanele rotunde din poze.
* **Lumina în aer, mișcarea și culorile (V65)**:
  * **Razele de soare** (`src/shafts.js`, pe Înaltă și Ultra): când soarele e în cadru sau aproape, lumina lui trece printre trunchiuri, coroane, acoperișuri și zăbrelele crucii și se vede în aer ca raze. Se adaugă doar ce fac obstacolele: cerul și perspectiva aeriană conțin deja lumina împrăștiată pe un drum liber spre soare. Deci pe un câmp deschis sau pe zăpadă nu apare niciun văl, iar pe un obiect la un pas de tine nu se pictează raze, fiindcă în fața lui nu e destul aer de luminat. Razele au culoarea soarelui și se sting sub plafonul înnorat, noaptea și în viscol. Tehnic: împrăștiere volumetrică în spațiul ecranului (Mitchell, GPU Gems 3, cap. 13), la jumătate de rezoluție, în două treceri de 48 de eșantioane. Contribuția e ponderată cu cât din drumul fiecărui pixel spre soare e blocat și cu aerul din fața lui (1 − e^(−z/25 m)). Măsurat (media cadrului, fără raze / cu raze): câmp cu zăpadă la amiază 170 / 171, pădure de iarnă cu soarele în față 147 / ~157, pădure de toamnă la 17:00 66 / ~73.
  * **Estomparea de mișcare** (setarea **Estompare de mișcare**: *Oprită*, *Ușoară*, *Cinematică*; implicit Ușoară pe Ultra, oprită în rest): imaginea se estompează după cât s-a mișcat camera într-o parte din durata cadrului (Ușoară 0,3, Cinematică 0,5, adică obturatorul de 180° al filmelor). Se calculează din adâncimea fiecărui pixel și din camera cadrului anterior. Mașina ta, cabina și ce e în conturul ei rămân clare. La o teleportare sau la schimbarea camerei (salt de peste 6 m sau 0,6 rad) cadrul nu se estompează.
  * **Culori** (setare): curba care duce lumina scenei la ecran. *Contrast (ACES)* e cea implicită, de până acum. *Naturale, de film (AgX)* nu arde luminile puternice spre galben. *Fidele (Khronos Neutral)* păstrează cel mai bine nuanțele. Fiecare are expunerea ei, ca imaginea să rămână la fel de luminoasă.
  * **Reparații**:
    * noaptea, pe ploaie, luna se vedea pe dealul crucii printr-o gaură perfect rotundă în nori, adică un inel negru în jurul ei; acum spărtura are margini neregulate, de nori (±2° de zgomot în jurul lunii);
    * iarna, frunzele copacilor rămâneau uneori verzi, fiindcă placa video păstra textura de vară; acum textura se reîncarcă;
    * efectul de cinema din filmări (profunzimea câmpului, estomparea) citea o adâncime ștearsă de trecerile anterioare, deci nu făcea nimic; acum adâncimea e copiată imediat după desenarea scenei.
  * **Verificare**: 10 combinații de vreme și oră (senin 11:30, 18:30 și 23:30; ploaie 15:00 și 22:00; rafale 11:30 și 16:11; ninsoare 11:30; viscol 20:00; zăpadă cu senin 13:00), fiecare în 5 locuri (strada, satul de sus, crucea, pădurea, sondele), plus o secundă la volan: zero erori și zero avertismente în consolă, niciun cadru negru sau ars. Pe zăpadă mașina face 2,3 m în prima secundă față de 7,2 m pe uscat, cum e gândită aderența (~0,3).
  * **Limite**: razele se fac din ce e pe ecran, deci un obstacol din afara cadrului nu aruncă raze și ele se sting când soarele iese din cadru. Privind spre un soare jos peste o culme, aerul de deasupra pantei primește o strălucire caldă, ca în contre-jour.
* **Noaptea, zăpada, culorile și ploaia, după cele reale (V66)**:
  * **Noaptea are lumina în rapoartele reale.**
    * Luna plină dă ~0,25 lx și e sursa principală.
    * Cerul din jurul ei adaugă o cincime până la un sfert din lumina ei, ca cerul de zi față de soare. De aceea umbrele lunii sunt adânci.
    * Sub plafonul înnorat nu e lumină directă, doar strălucirea difuză a norilor.
    * Lumina lunii are culoarea soarelui, puțin mai roșie (~4100 K). Albastrul nopții vine din ochi, nu din lumină (mai jos).
  * **Bugul principal al nopții.** Jumătatea de jos a luminii de mediu (lumina pe care o întoarce solul) era fixă la valoarea de zi, 0,33, adică de ~5 ori cât luna.
    * Efectul: noaptea, iarba și frunzele străluceau în culori, iar umbrele erau spălate.
    * Acum valoarea e albedoul solului (~0,2) înmulțit cu lumina care ajunge efectiv la el.
    * Măsurat separat pe fiecare sursă, pe strada casei la 23:30: lumina de mediu dădea aproape toată imaginea, luna singură aproape nimic.
  * **Dealul crucii** nu mai primește pe cer senin de 9 ori lumina lunii din restul hărții. Raza de lună rămâne doar sub plafonul de furtună, prin spărtura din nori, și doar cât lumina lunii pe cer senin.
  * **Ochiul noaptea** (`src/vision.js`).
    * Sub ~5 cd/m² conurile cedează locul bastonașelor, care nu văd culori (zona mezopică CIE 191:2010, între 0,005 și 5 cd/m²).
    * Pentru fiecare pixel se calculează cât din imagine o văd bastonașele și luminanța lor, din CIE XYZ (Larson, Rushmeier & Piatko 1997; Jensen et al. 2000).
    * Rezultatul se afișează ca un gri deplasat spre albastrul vederii nocturne (Thompson, Shirley & Ferwerda 2002).
    * Ce luminează doar luna devine gri-albăstrui, iar roșul se închide aproape de negru (efectul Purkinje). Ce e luminat puternic, ca lanterna sau becurile, își păstrează culoarea.
  * **Surse false de lumină, oprite noaptea:**
    * stopurile tuturor mașinilor parcate (aveau o emisie roșie permanentă);
    * fațadele construite din poze (aveau lumina pozei adăugată și noaptea).
  * **Lanterna și farurile.** Lanterna are 30 cd (avea 12, abia mai mult decât luna din jur) și face o pată clară pe asfalt. Farurile au 80.
  * **Măsurat la 23:30, senin** (media cadrului, sRGB 0–255):
    * strada casei: 36 → ~22;
    * iarba de pe dealul crucii: (30, 28, 15), oliv → (15, 17, 22), gri-albăstrui;
    * drumul luminat de lună: ~35, cu umbrele copacilor pe el;
    * umbrele lunii: 2–4.
  * **Zăpada.**
    * Coroanele golașe nu mai au un nor de puncte negre în jur. Fiecare carton de rămurele are acum mip-uri care păstrează acoperirea (după Castaño, „Computing alpha mipmaps”, 2010), iar rămurelele nu mai pornesc dintr-un nod gros: de departe coroana e o pânză fină.
    * Zăpada de pe crengile molizilor urmează arcul crengii, intră sub ace și are bulgări de 2–6 cm. De aproape nu mai e o placă albă plată cu margine zimțată.
    * Crucea și stâlpii de înaltă tensiune sunt zăbrele prin care zăpada și ploaia cad liber. Soclul crucii are betonul lui, nu pe cel al drumurilor, care se transformă în zloată. Acum soclul e alb, cu umbrele zăbrelelor pe el.
    * Zăpada de pe geamurile mașinilor e opacă și în pete, ca pe caroserie, nu o peliculă albă străvezie prin care se vedeau volanul și scaunele. Mașina condusă își păstrează geamurile curate.
    * Iarna, florile din jardiniere și din strat sunt uscate, oțetarii (Rhus typhina, pozele 7, 19, 22–23) n-au frunze, iar iarba și plantele joase sunt în repaus (pai, oliv-brun) unde zăpada le lasă la vedere.
  * **Culorile, verificate pe pozele tale.** Am folosit raportul liniar asfalt/cer, care nu depinde de expunerea camerei.
    * În pozele 1 și 7 raportul era 0,29 și 0,32; în joc ieșea 0,28 și 0,42.
    * Acum asfaltul are albedo ~0,17 (asfaltul îmbătrânit are 0,10–0,18, iar cel nou 0,05).
    * Betonul și bordurile au un gri-bej cald, ca trotuarul din poza 7.
    * Scoarța generică are ~0,06 (avea 0,03, aproape de cărbune).
    * Restul măsurătorilor e în intervalele reale: tencuiala albă 0,64, zăpada ~0,9, iarba ~0,07, frunzele 0,10–0,18, molidul 0,02–0,04 (în poza 1 molidul e la fel de închis).
  * **Ploaia.** O suprafață poroasă udă se închide mai mult pe canalele de culoare mai închise (Ångström 1925; Lekner & Dorf 1988: A_ud = A / (n² − (n² − 1)·A), cu n = 1,33). De aceea materialele ude par mai saturate, ca în realitate: cărămida mai roșie, pământul mai brun. Întunecarea medie rămâne la ~0,45–0,65 din albedoul uscat, cât s-a măsurat pentru pământ, beton și asfalt îmbibate.
  * **Limite.**
    * Felinarele stradale strălucesc, se reflectă în asfaltul ud și luminează ploaia și ninsoarea, dar nu luminează suprafețele.
    * Vederea de noapte se calculează per pixel, fără adaptare locală. O suprafață închisă sub lanternă poate ieși la fel de gri ca una deschisă sub lună.
    * De foarte aproape (sub ~2 m), crengile molizilor sunt cartoane plate.
    * Sub pădurea de foioase golașe, la începutul ninsorii, solul rămâne în mare parte brun, cu pete de zăpadă. O primă corecție (să treacă mai multă zăpadă printre crengi) n-a schimbat nimic în imagine, deci n-am păstrat-o: cauza e în altă parte.
* **Ninsoare** și **Zăpadă, senin** (ultimele două vremi din **T**): iarna, pe 1 februarie 2026. Soarele e jos (26° la 11:30, răsare pe la 7:40 și apune la 17:25), iar noaptea e lună plină sus pe cer („luna zăpezii”, 22:09 UTC): 49° la 22:00, verificat cu aceeași teorie a lunii.
  * **Ninsoarea**: plafon gri-alb, ceață (vizibilitate ~2 km) și ~56 000 de fulgi în două straturi în jurul tău (aproape și mai departe). Fulgii cad încet (0,75–1,35 m/s, cât cade zăpada reală), plutesc fiecare în felul lui și sunt purtați de rafale. Rămân pe loc în lume când te miști și nu cad sub copaci, streșini sau poduri (aceeași hartă de sus ca la ploaie). Lanterna îi luminează noaptea.
  * **Zăpada se așază și se adună în timp**: în ~1 minut de ninsoare devin albe toate suprafețele orientate în sus și sub cerul liber (acoperișuri, sol, ziduri, garduri, capote, crengi). Apoi stratul crește cu ~8 cm pe minut, până la 60 cm. În realitate o ninsoare grea aduce 2–8 cm pe oră, deci jocul accelerează timpul. Adâncimea apare lângă hartă („zăpadă 25 cm”). *Zăpadă, senin* e a doua zi: are cel puțin 25 cm, cerul e albastru adânc și soarele de iarnă face umbre lungi. Pereții verticali și locurile de sub streșini, coroane și mașini rămân fără zăpadă. Pe zăpada proaspătă sclipesc cristale la soare. La altă vreme zăpada se topește cu ~1 cm/s (în ploaie cu 2,5 cm/s), iar ultimul strat alb dispare în ~40 s (~15 s în ploaie).
  * **Zăpada are volum și relief**: în jurul tău, pe ±48 m, e un strat real cu un vârf la fiecare 40 cm, nu doar o culoare.
    * O hartă de înălțimi văzută de sus (ce acoperă solul) și una văzută de jos (solul de sub orice) arată unde e cer liber până la pământ. Acolo zăpada se așază pe sol, trotuare, borduri și trepte. Sub streșini, mașini, poduri și molizi nu ajunge, iar spre ele stratul se subțiază.
    * Nu e plată: se fac troiene în spatele gardurilor, zidurilor, mașinilor și tufelor, pe ~3 m, unde vântul lasă zăpada pe care o cară. Pe partea dinspre vânt zăpada e spulberată. Mai sunt valuri de vânt (creste la ~3 m una de alta, lungi de ~10 m), movile rotunjite peste ce e îngropat (smocuri, pietre, tufe mici) și cocoloașe de câțiva centimetri. Cu cât stratul e mai gros, cu atât umple și rotunjește treptele și bordurile.
    * Gardurile, soclurile și bordurile se îngroapă treptat: la 5 cm se văd, la 45 cm dispar.
    * Pe drumurile din OSM roțile tasează zăpada: rămâne asfalt ud cu zloată, iar pe margini se ridică un mal care coboară spre asfalt pe ~1 m. Mașina pe care o conduci dă zăpada la o parte.
    * Mai departe de 48 m continuă doar stratul alb de pe suprafețe.
  * **Brazii de lângă tine sunt detaliați**, iarna și vara. Cei mai apropiați 40 de molizi și brazi (24 la „Medie”, 12 la „Scăzută”), pe o rază de ~46 m, nu mai sunt carduri în etaje:
    * au trunchi și ramuri adevărate, în verticile la ~42 cm (creșterea unui an), câte 5–6 ramuri plus câteva mai mici între ele. Ramurile coboară spre mijloc și își ridică vârful, ca la molid;
    * pe fiecare ramură e un „spray” de ace, cu încă unul înclinat dedesubt pentru volum. Ramurile din partea de jos și din mijlocul coroanei au și „pieptenele” de rămurele atârnate al molidului;
    * molizii crescuți în pădure au pe trunchi, sub coroană, cioturi de ramuri uscate.
    * Textura de ace e desenată ac cu ac (1–2 cm, verde închis, cu vârfurile noi mai deschise).
    * Iarna, pe fiecare ramură stă o pernă de zăpadă cu cocoloașe, mai groasă la mijlocul ramurii, uneori ruptă în două. Crește odată cu stratul și e plină de la ~20 cm.
    * Brazii de departe sunt redesenați o dată iarna, din modelul detaliat cu zăpadă pe ramuri.
  * **Prin pădurea de molid crește tineret**: desișuri de molizi tineri de 2–5 m, cu ramuri până la pământ, pe ~o cincime din arboret, unde în realitate se regenerează pădurea. Pe tulpina lor nu treci, o ocolești, dar printre ramuri da. Mașina trece peste ei.
  * **Când intri într-un brad, ramurile se dau la o parte** în jurul tău, pe jos sau cu mașina. Când ieși, revin și se leagănă ca un arc amortizat (~1,7 Hz). Auzi foșnetul acelor.
    * Zăpada de pe ramurile pe care le miști cade pe tine și în jur: ~70% pulbere și restul bulgări de 2–7 cm. Cade întâi de jos, apoi de mai sus, pe măsură ce scuturătura urcă pe brad.
    * Pulberea încetinește imediat la ~0,7 m/s și se împrăștie. Bulgării cad liber și se sparg în pulbere când ajung jos. Se aude o bufnitură moale și foșnetul pulberii.
    * Ramurile scuturate rămân fără zăpadă. Cât ninge, se acoperă din nou în ~1,5 minute.
    * Dacă lovești cu mașina trunchiul unui brad, se scutură tot, cu toată zăpada.
    * Din când în când, o ramură își lasă singură încărcătura să cadă.
  * Sub pădurile înalte (coroane la peste 10 m) ajunge totuși la sol cam jumătate din zăpadă.
  * **Iarna, foioasele stau goale**: stejarii, fagii, carpenii, salcâmii, pomii și tufele au doar crengi și rămurele, cu zăpadă pe ele. Copacii îndepărtați și pădurile de pe dealuri trec la crengi gri-maronii, iar molizii și pinii rămân verzi. Iarba nu se mai vede sub zăpadă, iar sub foioasele goale ninge până la sol.
  * **Mașina alunecă**: pe zăpadă aderența scade la ~1/3 din cea pe asfalt uscat (pe zăpadă bătătorită μ ≈ 0,2–0,3, pe asfalt uscat 0,8–1). Accelerația și frânarea rămân sub ~0,33 g (la 508-ul hyper ~0,46 g). Frânarea de la 50 km/h ține 27,8 m în loc de 9,8 m, iar 0–50 km/h ia 4,7 s în loc de 3,4 s (testat pe modelul mașinii). Mașina nu poate vira mai strâns decât țin cauciucurile (~0,34 g lateral față de ~1,7 g pe uscat) și iese din curbă dacă intri prea repede. La ploaie condusul rămâne ca înainte. În afara drumului zăpada adâncă ține mașina în loc: la 45 cm ajunge la 30 km/h abia în ~16 s și nu trece de ~37 km/h. Tot acolo, pe jos, mergi mai încet: la 50 cm, de 2 ori mai încet.
  * Pașii scârțâie în zăpadă, păsările tac cât ninge (și sunt mai rare cât stă zăpada), iar cauciucurile aproape nu mai scârțâie în viraje.
  * **Urme în zăpadă.** Fiecare pas lasă urma bocancului: o talpă de ~29 cm, cu toc și cu crampoane.
    * Zăpada proaspătă e presată până la ~un sfert din grosime, cu pereți puțin surpați și o bordură împinsă în jur (cel mult ~6 cm).
    * Din zăpada de peste ~20 cm picioarele nu se mai ridică de tot: între urme rămâne un șanț târât.
    * Când alergi, urmele sunt mai lungi. Când aterizezi dintr-o săritură, rămân amândouă tălpile.
    * Și trecătorul de pe Strada Gării lasă urme.
    * **Roțile mașinii lasă făgașe** cu modelul anvelopei, care stă pe loc. În zăpada mai adâncă decât garda la sol (~17 cm), burta mașinii ară un șanț lat între ele.
    * Pe stratul subțire și pe drumuri, urmele apar ca zăpadă bătătorită, mai închisă, prin care se vede pământul sau asfaltul ud.
    * Cât ninge, urmele se umplu la loc: în ~2,5 minute, iar pe viscol în ~1 minut.
    * Harta urmelor acoperă ±24 m în jurul tău, cu 2,3 cm pe pixel (4,7 cm pe grafica scăzută și medie).
    * Ca să se vadă forma urmelor, cu umbrele lor, zăpada din fața ta (12,8 × 12,8 m) are un vârf la fiecare 3,3 cm. Marginea acestei zone urmează exact triunghiurile stratului mare, ca să nu apară crăpături.
  * **Zăpada e opacă și rotunjită.**
    * Unde zăpada acoperă doar în parte (la început, pe drumuri, sub coroane), stă în fulgi și pete albe, cu pământul între ele. Nu mai e o peliculă albă prin care se vede ce e dedesubt.
    * Un strat adevărat (~10 cm și peste) acoperă orice pantă până la ~60°.
    * Forma stratului se calculează doar din ce e solid: pământ, borduri, ziduri, mașini, pietre. Pe crengile puieților și ale tufelor zăpada nu mai stă în strat și nu mai face vârfuri ascuțite.
    * Troienele din spatele obstacolelor sunt cozi lungi și rotunde: urcă până la creastă la ~1,5 m și se sting la ~5 m.
    * Toată forma e netezită pe ~±1 m și citită cu o interpolare cubică. Movilele, malurile și troienele ies rotunde, fără muchii și colțuri.
    * Sub crengile joase ajunge totuși puțină zăpadă, în pete.
    * Zăpada lipită pe partea dinspre vânt e o crustă în dungi și pete.
      * Pe scoarța copacilor se prinde cel mai bine: după ninsoare și în ziua senină de după, trunchiurile din pădure sunt albe pe o parte, ca în pozele de iarnă.
      * Pe un gard vopsit sau pe un zid se prinde doar pe viscol adevărat.
  * **Pădurea de iarnă.**
    * Pinii negri nu mai au în coroană bila de umplutură care iarna arăta ca o acadea cu căciulă de zăpadă. Coroana e din smocuri de ace, mai dese, ca la un pin adevărat.
    * Pe ramurile tuturor coniferelor stă mai multă zăpadă.
    * Molizii își păstrează forma și încărcătura: zăpada care cade singură e doar o pulbere de pe vârful unei ramuri. Ramurile scuturate de tine se încarcă la loc după ~3 minute (~1,5 minute cât ninge).
  * **Zăpada arată mai real.**
    * Cristalele sclipesc doar unde le bate soarele sau luna și doar sub unghiul potrivit. Sclipirile se mută când te miști și dispar în umbră.
    * Lumina pătrunde puțin în zăpadă și iese alături. De aceea, partea umbrită a fiecărei movile și pereții urmelor sunt ușor luminați, albăstrui.
    * Vântul lasă riduri scurte, la 15–30 cm, cu panta lină spre vânt și cea abruptă în partea opusă, întrerupte și pe petice. Sunt clare după viscol și abia se văd după o ninsoare liniștită.
    * Zgomotul care dă forma troienelor, a movilelor și a ridurilor rămâne corect și la kilometri de centrul hărții. Înainte se netezea pe dealul crucii, din cauza preciziei calculelor.
* **Viscol** (între *Ninsoare* și *Zăpadă, senin* în **T**): o furtună de zăpadă. Bate crivățul, dinspre nord-est (vântul care aduce viscolele în Muntenia; aici în lungul Străzii Gării), cu ~15 m/s și are rafale între ~8 și ~22 m/s (până la ~80 km/h). Direcția se rotește puțin, iar viteza apare lângă hartă („vânt 60 km/h”).
  * **Fulgii zboară aproape orizontal**, ca dâre de mișcare (cât parcurg în ~1/50 s), în trei straturi în plus față de ninsoare: unul chiar la fața ta, unul des aproape și unul mai departe. Sunt aruncați de turbulență în sus și în jos.
  * **Viscolul nu trece prin nimic.** O hartă de adâncime privește exact din direcția din care zboară fulgii (vântul plus căderea lor, ~4° sub orizontală la 15 m/s). Ea vede tot ce le stă în cale: case, ziduri, garduri pline, mașini, trunchiuri, stâlpi, stânci.
    * Un fulg aflat în spatele unui obstacol, de-a lungul zborului lui, nu apare. La fel unul aflat în interiorul unei case sau sub un acoperiș cu partea deschisă spre adăpost.
    * În spatele obstacolelor, vârtejurile aduc zăpada înapoi abia după 3–14 m, și doar sub cerul liber.
    * Prin frunze, ace, gardul de sârmă, grilaje și zăpada de pe crengi vântul trece.
    * Relieful nu contează, pentru că aerul urmează dealurile.
    * Harta se reface când te muți cu 3 m sau când rafalele rotesc zborul cu 1,5°.
    * În mașina pe care o conduci nu intră niciun fulg.
    * Pe ninsoare liniștită e la fel, dar zăpada cade aproape vertical.
  * **La adăpost nici vântul nu te mai împinge.** Se caută în direcția din care bate vântul ce stă între el și tine.
    * În spatele unui zid sau al unei case trece ~10% din rafală aproape de obstacol și jumătate la ~4 înălțimi de el. La ~6 înălțimi bate din nou din plin.
    * Un trunchi sau un stâlp te adăpostește doar cât e de lat. În pădure vântul scade cu până la ~60%.
    * Același adăpost oprește împingerea, încetinirea când mergi contra vântului, zgâlțâiala camerei și împingerea laterală a mașinii.
    * Vuietul se aude înăbușit, iar sâsâitul zăpezii dispare.
    * Lângă hartă scrie vântul de unde ești, cu „(la adăpost)” când e cazul. Măsurat: 0 în stradă, 0,9 în spatele casei și al mașinii.
  * **Zăpada de pe jos e spulberată**: șuvițe care curg pe suprafața zăpezii (nu peste acoperișuri), mai încet decât vântul de sus, în panglici șerpuite. Majoritatea curge sub genunchi, puțină ajunge la înălțimea capului. Șuvițele se opresc în ziduri, garduri și mașini și nu ajung sub ele.
  * **Vizibilitatea scade la ~250 m** și se închide cu fiecare rafală ca o perdea albă, apoi se deschide la loc. Lumina e plată, fără umbre, sub un plafon alb-cenușiu.
  * **Zăpada se lipește pe partea dinspre vânt** a trunchiurilor, stâlpilor, zidurilor, gardurilor și geamurilor, în dungi. Rămâne și după viscol, până se topește.
  * Troienele din spatele obstacolelor și valurile de vânt de pe zăpadă devin de ~2 ori mai mari. Stratul crește cu ~12 cm pe minut.
  * Copacii se clatină mult mai tare. Brazii își scutură singuri zăpada de pe ramuri la câteva secunde, în rafale.
  * **Se aude vuietul vântului**, care crește și scade cu rafalele și șuieră la vârfuri, plus sâsâitul zăpezii purtate de vânt.
  * **Te simți în furtună**: camera e zgâlțâită de rafale (mai puțin în mașină). Contra vântului mergi cu ~o treime mai încet, cu vântul puțin mai repede, iar vântul te împinge ușor.
  * **Mașina e împinsă lateral** (~0,9 m/s² la 20 m/s, forța laterală ½·ρ·v²·A·C) și se abate de pe bandă dacă nu corectezi din volan.
  * **Farurile mașinii luminează acum cu adevărat** (tasta **L** în mașină; se aprind singure noaptea și în viscol): un fascicul cald pe drum, în care fulgii se aprind. Noaptea, fulgii se învârt luminați în jurul celor mai apropiate 6 felinare și în conul lanternei.
* **Noaptea, cu lună plină** (orele 22:00 și 23:30; la 20:00 e amurg): noaptea de 26 septembrie 2026 chiar are lună plină (16:49 UTC). Luna e pusă exact unde e pe cer (32° deasupra orizontului spre est-sud-est la 22:00, 44° spre sud-est la 23:30), verificat cu PyEphem la 0,1°. Cerul are stele, discul lunii are mări și halo, felinarele sunt aprinse, iar lanterna (**L**) aruncă umbre.
  * **Lumina aparte a lunii cade doar pe dealul crucii** (deasupra Străzii Măgurii): o rază rece, argintie, pe ~110 m în jurul crucii, din direcția reală a lunii. Crucea și copacii aruncă umbre lungi în ea. Când e înnorat sau plouă, norii se deschid exact în dreptul lunii și raza coboară ca o coloană de lumină prin ploaie, cu picăturile strălucind în ea. În rest, noaptea e întunecată.
* **Noaptea pe furtună (ploaie torențială + 22:00 sau 23:30): modul horror.** Fulgere la 6–22 s, cu tunet care vine după cât a parcurs sunetul; un fond sonor jos și neliniștitor; cadru mai întunecat și cu mai mult grăunte; fără păsări.
  * **Pe dealul crucii umblă un urs brun** de Carpați, de ~2 m, sculptat cu blană adevărată (ca și câinii), cu cocoașa de umeri, gheare și colți. Se plimbă și adulmecă prin pădure în jurul crucii. Te observă de la ~30 m (de la ~44 m dacă ai lanterna aprinsă), se oprește, rage și atacă în galop.
  * Dacă te prinde pe jos, te doboară și apoi se retrage. Într-o mașină nu te poate atinge: stă în fața ei și mârâie.
  * Ursul apare doar în combinația noapte + ploaie.
* **Scena din pădure**: cele două clipuri tale, jucate în joc, nu ca film: tu rămâi la control, te miști și te uiți
  unde vrei și o luminezi cu lanterna ta. Are loc în pădurea de pe dealul crucii de deasupra Străzii Măgurii (pinul
  45,1182321 N 25,7049276 E e chiar la marginea pădurii, așa că luminișul e la 28 m de el, în primul loc plat din pădure,
  acoperit cu frunze uscate).
  * **Doar la ora 23:30, pe vreme înnorată.** Atunci, cei doi bărbați așteaptă în luminiș. Când ajungi la 16 m, creatura
    palidă iese din întuneric în fugă și urlă cu brațele sus; cel în maiou negru o prinde pe la spate, cel în tricou crem
    îi prinde brațul și o trântesc pe frunze, unde o țin la pământ. Apoi cel în maiou trece la picioarele ei, o ridică de
    picioare și atârnă cu capul în jos, zbătându-se; o aruncă, iar ea fuge în patru labe în întuneric, printre trunchiuri
    și în partea opusă ție, cu amândoi după ea.
  * Totul merge continuu (în clipuri sunt două cadre: a doua parte e întoarsă față–spate ca să continue exact de unde
    rămâne prima). Drumurile pe care fug sunt găsite pe loc, ocolind trunchiurile, buștenii și pietrele. Nu treci prin
    ei. Sunetele (urletul răgușit, trântitul, foșnetul) se aud mai încet de departe. După ce nu-i mai vezi, au dispărut;
    scena se poate întâmpla din nou după ce te-ai îndepărtat 60 m. La altă oră sau pe altă vreme nu se întâmplă nimic.
  * **K** (sau butonul „Scena din pădure” din meniu) te duce la marginea luminișului, la 19 m, cu cea mai liberă privire
    printre copaci; la altă oră sau vreme doar îți spune când are loc.
  * Cele trei personaje sunt sculptate procedural (forme cu distanță semnată → plasă de ~42 000 de vârfuri fiecare) și
    au schelet cu 19 oase; brațele și picioarele ajung unde trebuie prin cinematică inversă (mâinile pe umerii, brațele
    și gleznele creaturii), iar picioarele calcă singure pe panta reală a luminișului. Frunzele zboară cu fizică (gravitație,
    frecare cu aerul, rotire).
  * Personajele se construiesc pe alt fir de execuție (un worker) din momentul în care ora e 23:30 și e înnorat, deci
    jocul nu se oprește deloc: durează câteva secunde, cât timp mergi spre luminiș. Unde browserul nu permite worker, se
    construiesc câte ~5 ms între cadre. Nu se adaugă nicio lumină nouă, deci niciun shader nu se reface.
* **Scena din clipul tău IMG_0725** (`src/geo/urcus.js`, `src/geo/urcus_mask.js`, `src/hikers.js`): pe ulița asfaltată
  care trece dealul de la Strada Măgurii (OSM way 198810461), la ~1 km de intersecție, unde străbate pădura de deasupra
  poienii. Pinul tău (45,1146323 N, 25,6952029 E) e chiar pe marginea drumului de acolo. Clipul e filmat mergând spre
  nord-est (spre intersecție, ușor la deal), cu soarele de la 16:11 aproape în spate. De aceea tufele și coroanele
  galbene apar luminate din față.
  * **Drumul pus pe ortofoto**: pe porțiunea s = 860–1225 m, linia OSM e cu până la 3,3 m la sud-est de asfalt. Am trasat
    centrul benzii gri din ortofoto Esri (z18) din 5 în 5 m, iar ulița e mutată pe el. Lățimea e de 4,5 m.
  * **Potrivit pe primul cadru** (obiectivul 3x, ~27,5° pe latura lungă), direct cu camera și relieful jocului, pe
    cadrul de 2160 × 3840:
    * omul e la 15 m (940 px înălțime);
    * blocul de beton e pe marginea dreaptă, unde începe desișul (eroare 10 px);
    * cei trei drumeți merg alăturați la ~75 m: unul pe marginea dreaptă a asfaltului, doi pe malul din dreapta, la
      1,3–2,3 m de asfalt, printre tufe (capetele lor la ≤ 4 px de cele din clip).
  * **Relieful uliței, corectat după clip**: ulița merge pe un versant abrupt, unde o celulă de 30 m a modelului de teren
    cuprinde ~10 m diferență de nivel. Pe relieful nou (FABDEM), drumeții ieșeau cu 330 px prea jos în cadru. Copernicus
    GLO‑30 și GEDTM30 dau același profil ca FABDEM, deci e limita grilei de 30 m, nu a unui singur model. Potrivit în
    camera jocului, ulița din fața camerei e cu 1,75 m mai sus la bloc (s = 1021) și cu 6,75 m mai sus la drumeți
    (s = 983) decât în model. Groapa de după ei (s = 930–980), pe care clipul nu o vede, e umplută la o pantă dreaptă.
    Corecția e întreagă pe 25 m de o parte și de alta a drumului și se stinge pe următorii 60 m (`CLIP_LANE` în
    `geo/build_geo.py`).
  * **Locul**: pe dreapta e un acostament cosit, apoi desișul (pâlcul întunecat de lângă drum de pe ortofoto). Desișul e
    ținut sub linia privirii spre șoldurile celor trei, iar printre tufe e lăsată poteca lor. În clip nu se vede nicio
    linie electrică, așa că am scos stâlpii generați automat pe porțiunea asta.
  * **Pădurea** e trasată pe ortofoto pe 700 × 700 m, în celule de 5 m. Pădurea de la sud de drum lipsea din joc și
    acum există.
  * **Speciile pădurii** sunt cele din clip: fag care trece în portocaliu și galben, carpen galben, mesteacăn, stejar
    încă verde, câțiva fagi încă verzi. Unde harta genurilor dă stejarul ca specie principală, stejarii sunt mai mulți.
    **Fără conifere**: clipul nu arată niciuna, iar hărțile de 10 m (CLC+ 2021: niciun pixel de rășinoase pe 420 m;
    harta genurilor 2025: arborete de fag și stejar) confirmă. Coroanele verde-închis de pe ortofoto, pe care le
    luasem drept molizi, sunt stejari încă verzi și desișuri cu mure. Spre 250–420 m de loc, amestecul revine la cel
    al hărții.
  * **Scena** (doar la **16:11, pe senin**; ora e în lista tastei **O**):
    * bărbatul cărunt, desculț, în tricou alb și pantaloni scurți kaki, cu rucsac negru cu buzunar roșu, își duce
      bocancii în mâna dreaptă;
    * înainte merg alăturați trei drumeți: tricou bleumarin cu rucsac albastru, tricou albastru-deschis, tricou alb cu
      șapcă.
    Vin pe uliță de la cotul de sub poiană, iau poteca de pe mal pe lângă desiș și revin pe asfalt. Urcă până în vârful
    pantei, unde se opresc și se uită spre poiană. Tălpile nu alunecă și nu treci prin ei. După ce te îndepărtezi 250 m,
    scena se reia.
  * Vederea „Clipul IMG_0725” din listă te pune exact unde a fost filmat, cu câmpul vizual al obiectivului 3x, la ora
    și în momentul din clip.
  * Cei patru se construiesc în worker din momentul în care e 16:11 pe senin.
  * Aproximat:
    * poteca de pe mal: nu e pe hartă; e dedusă din clip;
    * speciile și înălțimea copacilor;
    * fețele oamenilor (procedurale).
    În joc e 26 septembrie, iar clipul e din octombrie, așa că doar pădurea din jurul locului e îngălbenită.
* **Umbre în cascadă**: soarele are mai multe hărți de umbră. Una fină în jurul tău (texel de ~2 cm la „Înaltă”), una largă de ±260 m (±150 și ±600 m la „Ultra”) și trecere lină între ele. Așa, casele, stâlpii și copacii aruncă umbră până departe, nu doar în primii 45 m. Hărțile stau în fața camerei și sunt aliniate la texel, ca umbrele să nu „tremure” când mergi. La „Scăzută” rămâne o singură hartă.

Pe telefon: joystick virtual în stânga, tragi cu degetul în dreapta ca să te uiți, butoane pentru sărit/fugă/F/claxon/cameră.

## Ce e „1:1” și ce e aproximat

* **Texturi reale din poze** (`tools/extract_textures.py`): fațada prispei și a verandei (fereastra albă, pălăria roșie, jaluzelele, ușa), peretele bej cu aerisirile, tabla acoperișului, ecranul de iederă al gardului (tăiat exact între bare, ca barele 3D să cadă peste cele din poză), placajul de piatră, zidul de piatră al vecinului, betonul, cornierul ruginit de la bordură și asfaltul (rectificat de sus din poza 1).
* **Dimensiuni**: estimate din poze folosind repere cu mărime cunoscută (lățimea Opel Corsa C = 1,65 m, BMW E90 = 4,52 m, înălțimea camerei ≈ 1,5 m, lățimea ușii). Poziția casei, a gardului, a stâlpului, a BMW‑ului și a Opel‑ului „PH 13 KLI”, a SUV‑ului, a gropii de canal și a marcajelor sunt puse după poze; eroarea e de ordinul zecilor de centimetri, nu măsurători cu ruleta.
* **Partea de sud** (pozele 6–10): Peugeot 508 gri „PH 77 XXS”, straturile cu plante (yucca, urechea‑ursului, arbuști) cu bordură de beton, zidul gri de vizavi cu tencuială reală din poză, soclu de piatră, coamă de țiglă, poarta mare de lemn și portița nr. 10 cu cutia poștală, platforma de beton, gardul vișiniu cu oțetarul, stâlpii cu lămpi LED pe partea de est, trecătorul cu sacoșa galbenă și dealul de la capăt cu râpa de lut.
* **Curtea** (pozele 11–14): prispa adâncă de ~2,5 m cu stâlpii de lemn și căpriorii la vedere, ușa verandei cu plasă, cele două trepte cu gresie și preșul „HELLO”, vaza de Horezu, ghiveciul pe suport de răchită, peretele cu placaj tip cărămidă și ușa de la capătul prispei, coșurile suspendate, setul de ratan, uscătorul de rufe, stratul cu bordură de beton, țevile galbene de gaz spre firida de lângă gard și grădina din sud cu gazon, bancă, masă cu față de masă, umbrelă și spalier.
* **Restul străzii și tot satul** vin din harta reală (secțiunea de mai sus): fiecare casă pe amprenta ei din OpenStreetMap, pe relieful real.
* **Câinii** (pozele 15–16): ciobănescul belgian negru (Groenendael) culcat pe gazon lângă stâlpii verzi ai sârmei de rufe, cu tufa de trandafiri și smocul de păiuș albastru din poză, și câinele mic roșcat cu urechi mari, stând la soare pe prispă lângă ușa verandei. Corpurile sunt sculptate din forme netede (câmp de distanțe, rețea „surface nets”), blana e din straturi de fire (lungă și culcată la ciobănesc, scurtă la cel roșcat); respiră și gâfâie, dau din coadă, întorc capul după tine, iar cu **E** îi mângâi. Tastele de vizualizare 15 și 16 sunt în lista din ecranul de start.
* **Strada din pozele 17–21**: acoperișurile sunt orientate după perspectiva din poze (coama perpendiculară pe stradă la casa albă cu coș, la casa înaltă cu șindrilă și la casa piersicie cu două etaje; coamă de-a lungul străzii cu fronton spre stradă la casa ocru de după poarta nr. 10), cu țiglă metalică maro unde apare în poze și tablă zincată deschisă la casa cu șindrilă, la anexa ei și la clădirea joasă de după gardul verde; fațadă din șindrilă de lemn gri-maronie; pe partea de vest: gardul vișiniu cu stâlpi turcoaz și poarta din plasă, stâlpul rotund cu baza vopsită albastru deschis, gardul verde-mentă pe soclu de piatră, apoi tabla vișinie; spre deal: tabla vișinie continuă până la gardul de scânduri maro din fața șopronului, STOP la colțul cu aleea (poza 17) și la intersecția în T (poza 19); scumpia (oțetarul) din fața casei cu șindrilă; râpa de lut de pe deal mutată la stânga axei, ca în poza 17. Mașinile sunt așezate ca în pozele 19–20 (mai noi decât poza 1, deci SUV-ul și hatchback-ul alb din poza 1 nu mai sunt pe dreapta): BMW Seria 1 (PH 71 GRK) la câțiva metri după Corsa, Ford Focus (PH 22 PXZ) urmat de încă două mașini pe acostamentul din stânga, un Golf IV albastru închis lângă gardul maro, o mașină roșie lângă STOP și un SUV alb după intersecție. Pozele 17–19 sunt făcute cu zoom 2x, așa că vederile lor folosesc același unghi de câmp (revine la normal când pleci din loc). Pozele 17–21 sunt în lista din ecranul de start (tastele 1–0 rămân pentru primele 10). Ce nu se poate verifica: numerele complete ale mașinilor acoperite în poze (Golf, Kuga) sunt generice, iar Golf-ul break BV 79 BNA din poza 21 nu e pus, pentru că ar sta exact în punctul de vizualizare 9.
* **Pozele 22–23**: casa nr. 111 (OSM way 264515510) e acum casa veche din poza 22: parter, tencuială gri decorativă cu model de puncte și romburi, acoperiș în patru ape din tablă ruginie; în față gard maro din șipci pe soclu de beton, poarta dublă și portița din cadru de oțel maro cu panou presat jos (plăcuțele 111 și vechiul 12), arbuștii cu flori mov și cireșul din dreapta porții; tabla vișinie începe după casă. Pe partea casei tale, după gardul vișiniu al vecinului: garajul vechi din lemn cu uși din tablă roșie, apoi gardul cu stâlpi placați cu piatră și panouri negre de oțel, cu buxuși și yucca pe spațiul verde; casa nr. 122 din spatele lui are țiglă metalică maro. Râpa de lut de pe deal are acum două zone golașe, câte una de fiecare parte a axei străzii, cu pădure între ele (pozele 17, 23). Mașinile ca în poza 23: Golf-ul și un hatchback argintiu (modelul exact, un Mercedes, nu există în joc) pe partea opusă, lângă tabla vișinie; Peugeot-ul „PH 77 XXS” a rămas la poarta ta, ca în pozele 6–7.
* **Crucea de pe deal (poza 24)**: la coordonatele trimise (45,1184046° N, 25,7037585° E), pe culmea de deasupra Străzii Măgurii, la ~526 m altitudine (120 m peste strada ta) și 1,9 km SV de casă; mutată 5 m de pe aleea pe care OSM o trece chiar prin punct. Nu are date publice (nu e în OSM și nici în lista crucilor înalte din România), așa că dimensiunile sunt măsurate din perspectiva pozei: ~10 m peste placă, brațe de ~6,2 m la 2/3 din înălțime, grinzi cu zăbrele de 0,8 m (4 țevi de colț, rigle la fiecare panou, diagonale în X pe toate fețele), 4 picioare înclinate, tiranți ruginii între brațe și coloană, placă de beton de ~6,2 × 6,2 m așezată în pantă. Orientarea: brațele sunt pe direcția 101,6°/281,6°, măsurată din poza 60, care o vede exact din profil de la ~95 m est (rezecție pe silueta dealului, vezi mai jos). Poza 24 e făcută spre NNV (~352°, umbra crucii cade în spate, soarele e în spatele fotografului), la ~20° de normala brațelor: brațul drept apare cu 21% mai lung. În jur e poiană fără copaci și fără stâlpi, ca în poză; tasta de vizualizare 24 e în lista din ecranul de start. **Relieful din spatele crucii**: în poza 24, în dreapta crucii, terenul coboară spre vale chiar de la marginea plăcii, iar în stânga urcă un deal împădurit. FABDEM, Copernicus GLO‑30 și GEDTM30 au acolo o cocoașă de 3–4 m la 30–60 m în spatele crucii (umărul dealului sau tufele pe care modelele de sol gol nu le scot), care ar ascunde valea. Pe sectorul în care poza vede valea (azimut 344–30°, până la 80 m, cu trecere până la 140 m), relieful față de cruce e luat din vechiul EU‑DEM, care are panta (`CROSS_BROW` în `geo/build_geo.py`). Dealul din stânga și locul din care e făcută poza 60 rămân pe FABDEM. Culmea e plană pe ~11 m în jurul plăcii: în poza 24, camera, aflată la 11 m, vede placa de sus, iar FABDEM cobora ~1,6 m până acolo.
* **Pădurile** (165 km², 64 % din hartă; înainte 107 km² din OSM): sunt luate din hărți de 10 m, nu din poligoanele OSM. Pe ortofoto se vede că OSM nu avea păduri întregi (de exemplu ~900 ha de pădure la sud de Breaza, la ~5 km NV de stradă, erau pajiște în joc). O celulă de 5 m e pădure când cel puțin două din trei hărți independente spun asta: Copernicus HRL Forest Type 2018, Copernicus CLC+ Backbone 2021 și harta națională a genurilor 2025. Se scot petele sub 0,1 ha și se umplu golurile sub 0,05 ha.
  * **Speciile** vin din harta genurilor (Keskes & Niță 2026): **fag 71 %** din suprafața pădurilor, **stejar/gorun 25 %**, salcâm 2,2 %, carpen 0,8 % ca specie principală, molid 0,35 %, pin 0,34 %, apoi plop, salcie și alte foioase. Rășinoasele sunt sub 1 %. Și cele două hărți Copernicus dau 0,5–0,7 % rășinoase, așa că petele de „amestec și pin negru” puse înainte peste tot erau greșite. Pe dealul de peste Prahova (pozele 7, 17, 23) datele dau 2–12 % rășinoase, ca în poze.
  * **Compoziția arboretului**: genul hărții are 88 % din arbori într-un arboret pur și 62 % într-unul dominat. Restul sunt însoțitori: genurile care conduc arboretele din jur (pe ~300 m) plus carpenul, care însoțește fagul și gorunul de deal aici (habitatele 91V0 „păduri dacice de fag” și 91Y0 „păduri dacice de stejar și carpen”), deși rar conduce un arboret. În medie, pe toată harta, ies ~54 % fag, ~24 % stejar, ~15 % carpen, ~5 % alte foioase (paltin, frasin, cireș, tei; desenate ca un carpen), ~1,4 % salcâm și ~0,4 % rășinoase. Ponderile însoțitorilor sunt o estimare, harta dă doar genul principal.
  * **Densitatea**: arboretele rare sunt rărite după densitatea coronamentului din Copernicus (2018). Sub ~80 % acoperire rămân proporțional mai puțini arbori.
  * **Subarboretul** (alun, păducel, corn) e rar sub fag, care face cea mai deasă umbră, și bogat sub stejar și salcâm. Puieții sunt din specia arboretului (fag tânăr sub fag, molid sub rășinoase).
  * **Tufărișurile** din afara pădurilor (CLC+ 2021 „plante lemnoase joase”, 94 ha: păducel, porumbar, măceș și arbori tineri pe pășunile vechi) au tufe de 3,5–6 m. Arborii izolați din câmp sunt puși doar unde densitatea coronamentului arată copaci (≥ 30 %).
  * **Arăturile**: textura de pământ arat e pusă doar unde CLC+ 2021 vede teren arabil (462 ha). Terenul marcat „agricol” în OSM (2 793 ha) e doar 15 % arat; ~40 % e fâneață sau pășune (iarbă în joc) și ~40 % are copaci.
  * **Livezile din OSM**: OSM are 4 096 ha de livezi și vii pe hartă, dar 80 % din suprafața lor e pădure după cel puțin două din cele trei hărți de 10 m (HRL 81 %, CLC+ 79 %, harta genurilor 69 %; densitate medie 64 %). Pe ortofoto, punctele verificate sunt pădure închisă, fără rânduri de pomi. Acolo rămâne doar pădurea. Înainte, pădurea și rândurile de pruni erau puse una peste alta. Pomii de livadă (32 500) rămân doar pe restul de 20 %.
  * **Salcâmul**: fâșia de pădure dintre DN1 și Prahova de la giratoriul Cornu (poza 37) nu e în harta genurilor, dar HRL și CLC+ o văd ca pădure de foioase (densitate 59–77 %), iar ortofoto o arată ca arboret tânăr. Primește genul celui mai apropiat arboret cartat, aici salcâm (la 140 m). O fotografie KartaView din iulie 2016 de pe DN1 confirmă fâșia: arbori cu coroane aerisite, înfrunziți până jos la margine. Salcâmul are acum frunze compuse (foliole eliptice pe rahis, verde‑gălbui) în locul frunzelor mici ale pomilor fructiferi, care îl făceau să pară uscat. La liziere are o formă mai joasă, ramificată de la ~2,5 m.
  * **Pomii fructiferi și sălciile** au acum o textură de frunze de două ori mai deasă (acoperire 20 % față de 10 %). În pozele tale de pe stradă (1, 7, 17, 23), pomii din curți au coroane pline, iar în joc păreau desfrunziți.
  * **Pomii din curți și de pe mal** sunt aceiași ca în V46 (același șir aleator, așezat cu pădurile din OSM, ca la potrivirea pozelor). Doar cei care cad în pădurile noi sunt scoși. Curțile și malurile pe care OSM le avea sub pădure, dar hărțile de 10 m le văd deschise, primesc pomi doar unde densitatea coronamentului arată copaci (≥ 10 % în curți, ≥ 30 % pe mal). La fel, gardurile și stâlpii sunt cei din V46.
  * **Limite**: harta genurilor e o clasificare din satelit (Sentinel‑2 + date de amenajament), cu erori mai mari la liziere și în arboretele amestecate. Nu deosebește gorunul de stejar (gen *Quercus*) și nu dă procentele însoțitorilor, care sunt estimate ca mai sus. 11,7 % din pădure (fâșii, pâlcuri și liziere din afara fondului forestier) nu apare în harta genurilor. Aceste celule iau genul celui mai apropiat arboret cartat, aproape toate de la sub 100 m (10,8 % din pădure); malurile râurilor iau salcie și plop. Regula e testată ascunzând o bandă de 30 m la marginea arboretelor cartate (golurile reale sunt tot la margini): ghicește genul în 76 % din cazuri. Genul cel mai des întâlnit pe o rază de 50–200 m ajunge la 73–76 %, dar pierde genurile rare, ca salcâmul și plopul (recall mediu pe genuri 0,16–0,21 față de 0,41). Locurile trasate de mână pe ortofoto (dealul crucii, pădurea din clipul IMG_0725) își păstrează conturul trasat.
  * **Copacii** nu mai sunt stocați: se generează în jurul tău dintr-un hash al celulei de 5,2 m (aceeași pădure de fiecare dată), deși (~330 de arbori/ha). Sunt fag cu scoarță cenușie, stejar, carpen, salcâm, plop, salcie, molid și pin negru. La liziere sunt foioase cu crengi până jos și molizi cu ramuri până la pământ, ca pădurea să arate ca un zid verde, nu ca un șir de stâlpi. Vârsta arboretelor variază pe suprafețe mari (arborete tinere și bătrâne). Aproape (140 m la „Înaltă”) sunt modele 3D cu umbre, cu subarboret și puieți (70 m), iar trunchiurile au coliziune. Până la ~1,1 km sunt imagini pre-randate. Mai departe pădurea e un „acoperiș” de coroane la înălțimea arboretului, colorat după Sentinel‑2, care coboară la liziere, drumuri și poieni. Solul pădurii e frunziș uscat pe pământ închis, cu puțin mușchi.
* **Asfaltul pe teren**: drumurile sunt benzi trase pe teren, iar terenul are celule de 5 m (1 m în zonele refăcute). Un audit pe toate drumurile din raza de 3 km a arătat unde iese terenul prin asfalt. Exista și în V46 (5 778 de segmente cu peste 6 cm) și nu venea din FABDEM. Două cauze:
  * de-a lungul drumului, vârfurile la 3,5 m tăiau cocoașele și marginile de debleu. Acum un pas se înjumătățește, până la ~0,4 m, unde terenul de la mijloc trece cu peste 1 cm de coardă;
  * peste lățime, o celulă de 5 m intra în profilul plat al drumului. Acum asfaltul urmează terenul (cel mult 30 cm peste nivelul axului) pe partea unde marginea intră cel mult 30 cm în teren; roțile rulează oricum pe teren. Unde marginea dă de un taluz mai înalt, partea aceea rămâne plată și taluzul o acoperă, ca înainte.

  La pasajul CF (pozele 25–29), zidurile, taluzurile și colțul din piatră sunt construite după poze peste marginile drumului din OSM, așa că acolo drumul rămâne ca înainte. Rezultat (V48 → V49): segmente cu teren peste asfalt cu peste 1 cm de la 11 693 la 2 824, cu peste 6 cm de la 5 749 la 1 873, la mijlocul drumului cu peste 3 cm de la 297 la 11. Cele rămase sunt la marginea taluzurilor înalte (drumuri adâncite, ziduri de sprijin, colțul de la pasaj).
* **Toate drumurile verificate, unul câte unul (V79)** (`src/geo/roadbed.js`, `src/geo/roads.js`, `tools/roads-audit.mjs`):
  * **Auditul.** `tools/roads-audit.mjs` reconstruiește fiecare din cele 3 669 de drumuri (950 km, 2,2 milioane de triunghiuri) exact cum le desenează jocul și măsoară, pe fiecare:
    * unde iese terenul prin asfalt și unde plutește marginea;
    * panta și cocoașele profilului;
    * suprapunerile cu alte drumuri;
    * ce stă pe carosabil: case, stâlpi, copaci, tufe, garduri;
    * cum arată de departe, la fiecare nivel de detaliu al terenului.

    Locurile cele mai grave le-am verificat apoi și la vedere, înainte și după.
  * **Ce era greșit și cum e acum:**
    * **Iarbă prin asfalt, în dinți de fierăstrău** (DN1, străzile pe coastă). Celulele de 5 m și 10 m ale terenului intrau în drum. Acum drumul se planifică înaintea terenului, iar nodurile grilei din jur se mută:
      * sub drum, terenul e umplut până chiar sub asfalt;
      * pe marginea dinspre vale, e adus la nivelul ei;
      * unde ieșea peste asfalt, e coborât (debleu).

      Lângă case terenul nu coboară sub soclu; acolo drumul urcă puțin, cel mult 40 cm, ca marginea unei străzi spre curte. Unde panta e prea abruptă pentru celulele de 10 m, de la marginea drumului coboară un taluz făcut din terenul însuși, cu același material și aceleași culori.
    * **De departe** (de la ~300 m), iarba acoperea bucăți întregi de drum. Nivelurile de detaliu ale terenului sunt acum coborâte la fel sub drumuri.
    * **Profilul urma zgomotul modelului de teren:** trepte de jumătate de metru la câțiva metri distanță, până la 40 % pe un drum județean. Acum e nivelat ca un drum construit:
      * media se face pe 8–25 m, după clasa drumului;
      * abaterea față de teren e de cel mult 0,3–1,2 m, iar lângă case de 10–25 cm;
      * capetele, intersecțiile și zonele refăcute de mână rămân pe teren.
    * **Intersecții:** drumul mic stătea până la 0,5 m peste sau sub cel mare, iar acostamentele de pietriș treceau peste asfaltul vecin. Acum drumul mic se racordează la nivelul celui mare, cu o trecere pe 10 m, iar acostamentele intră sub asfalt.
    * **DN1:** cele două sensuri se suprapuneau, cu marcaje și dungi de pietriș în mijlocul benzii. Axele erau la 6–7 m, iar fiecare sens avea 8 m; unde OSM pune „4 benzi”, chiar 15 m. Acum fiecare sens are 2 benzi, ca în pozele de la Etu, iar sensurile se despart cu 0,6 m (128 de drumuri mutate).
    * **Erori de date:** o stradă cu „21 de benzi” (55 m) are acum 5,6 m, iar cele 96 de drumuri care treceau de marginea hărții sunt tăiate la ea.
    * **Case pe drum (384):** unde linia OSM trece prin colțul unei case, drumul se mută sau se îngustează pe lângă perete (540 de drumuri), de exemplu pe Strada Cireșului, lângă start. Au rămas 27, unde drumul trece chiar prin clădire (pasaje sub blocuri, copertina benzinăriei); acolo e lăsat ca în OSM.
    * **Pe carosabil stăteau** 510 stâlpi de iluminat și electrici, 52 de stâlpi ai liniilor cartate, 384 de copaci și 685 de tufe de pădure. Stâlpii sunt mutați pe margine, iar copacii și tufele nu mai cresc pe drum.
    * **Mașinile și jucătorul calcă pe suprafața drumului,** nu pe terenul de sub el.
  * **Rezultatul**, măsurat de același audit:

    | Problemă | Înainte | Acum |
    | --- | --- | --- |
    | Teren peste asfalt (> 2 cm) | 89 906 m² | 2 329 m² |
    | Teren peste acostament | 17 694 m² | 902 m² |
    | Drum acoperit de teren la 300–600 m | 105 689 m² | 2 910 m² |
    | Drum acoperit la 1–2 km | 293 517 m² | 15 760 m² |
    | Drum acoperit, harta mare (> 3 km) | 774 572 m² | 15 761 m² |
    | Trepte de peste 5 cm la intersecții | 8 982 m² | 3 378 m² |
    | Acostament peste asfaltul altui drum | 4 880 m² | 962 m² |
    | Drumuri cu salt de pantă > 15 % pe 4 m | 482 | 230 (mai ales poteci și drumuri de câmp, care urmează terenul) |
    | Case / stâlpi / copaci și tufe pe carosabil | 384 / 562 / 1 069 | 27 / 14 / 0 |

  * **Costul:** ~4 s în plus la încărcare, pe mașina de test fără placă video. Cea mai mare parte o ia aducerea terenului sub drumuri (~3 s), iar planificarea drumurilor se făcea și înainte, doar mai târziu. Taluzurile adaugă 318 000 de triunghiuri, față de 2,2 milioane cât au drumurile, și apar doar unde golul trece de 10 cm.
* **Fără stâlpi în mijlocul drumului (V80)** (`src/geo/roadbed.js` postSpot, `src/geo/props.js`, `src/geo/grigorescu.js`):
  * **Stâlpii generați:** de iluminat și electrici de pe străzi, stâlpii liniilor cartate și pilonii de 110 kV.
    * Un stâlp care cade pe un drum e mutat pe marginea lui, ca în V79.
    * Dacă nici acolo nu are loc, e scos, iar firele se întind direct până la stâlpul următor. Asta se întâmplă când stâlpul cade în mijlocul unei intersecții, cu drumuri de jur împrejur, sau în spațiul îngust dintre cele două sensuri ale unui drum cu benzi despărțite, cum e DN1.
    * Au fost scoși 38. Niciun stâlp generat nu mai stă pe carosabil sau între sensuri.
  * **Felinarele-glob de pe promenada de la baza sportivă (Grigorescu):** cele trei care cădeau pe drumul de serviciu și pe alee nu mai sunt puse.
  * **Drumurile refăcute după poze sunt respectate.** În V79, despărțirea sensurilor DN1 și ocolirea caselor mutaseră și carosabilele măsurate manual (Cornu, Etu, Păstrăvăria, Măgurii, Pițigaia), iar lămpile solare de la Cornu ajunseseră pe carosabil.
    * 52 de drumuri, cu secțiunea stabilită de module (lățime, borduri, refugii), rămân acum exact cum le-au făcut acestea.
    * Alte 10, mutate de module doar pe porțiuni (de exemplu Strada Gării la pod), își păstrează porțiunile acelea; în rest sunt reparate ca oricare drum.
  * **Rezultat:** pe carosabil mai stau doar 3 stâlpi, toți lămpi solare de la Cornu, pe refugiul și insulele din poza 37.
* **Clădirile, încă o dată după toate pozele (V81)** (`src/geo/buildings.js`, `src/geo/geotex.js`, `geo/build_geo.py` OVERRIDES, `geo/sync_overrides.py`, `src/config.js`):
  * **Cum am lucrat:** am refăcut toate cele 20 de poze care mai există în proiect (1–10, 15–24) la rezoluția lor întreagă, cu decupaje pe fiecare casă. Am randat jocul din aceleași puncte, cu unghiul de vedere al telefonului (obiectivul 1×: ~67° pe înălțimea pozei; 2×: ~37°), și am pus pozele una lângă alta.
  * **Ce au toate casele din poze și lipsea din joc** (acum pe toate clădirile cu acoperiș înclinat din jurul străzii):
    * **Streașina adevărată:** scândura frontală (sacul) pe marginea acoperișului și pe frontoane, plus lambriul de dedesubt, de la perete până la margine. Culorile sunt numărate pe poze: scânduri băițuite maro închis ~50 %, brad lăcuit ~15 %, alb ~15 %, tabla acoperișului îndoită peste margine ~20 %.
    * **Jgheaburi și burlane** cu cotul de sub streașină: zincate ~40 %, maro ~30 %, albe ~10 %. Casele vechi (~20 %, ca nr. 111 din poza 22) nu au.
    * **Streașina mai adâncă:** 0,5–0,8 m, cât se vede în poze (înainte 0,45 m peste tot).
    * **Coșurile** au capul de cărămidă în trepte și placa de beton (pozele 1, 18).
    * **Ramele ferestrelor:** maro, ca lemnul, la cam o treime din case (pozele 2, 3–6, 17). Restul au PVC alb, ca până acum.
    * **Frontoanele** caselor mai noi, la ~un sfert din ele, sunt îmbrăcate în scânduri (pozele 21, 23).
  * **Cât costă:** detaliile se pun pe casele dintr-o rază în jurul străzii, după calitate: 600 m la Scăzută, 1,2 km la Medie, 2 km la Înaltă și 3 km la Ultra. Casele fotografiate le au oricum. Am măsurat la Medie: ~88 de mii de triunghiuri în plus (~12 MB), adică sub 0,5 % din cele 23,6 milioane ale scenei. Jgheaburile și burlanele nu se mai desenează de la 600 m, unde nu se mai văd, iar scândurile de la 1,5 km.
  * **Casă cu casă, după poze:**
    * **Casa albă de vizavi (pozele 1–2):** streașină cu lambriu maro, ferestre cu rame maro, burlan zincat, țeava galbenă de gaz pe fațadă (înainte era doar pe varianta fără hartă), acoperiș în patru ape la ~22°.
    * **Casa albă cu acoperiș mare de tablă deschisă (poza 1, dreapta):** acum e albă, cu acoperiș deschis la culoare în patru ape și burlan alb.
    * **Casa înaltă cu coș de cărămidă (pozele 1, 18, 20):** fronton spre stradă la ~38°, streașină de 0,8 m cu lambriu alb, jgheab închis la culoare. Coșul e pe panta de sud, spre spate, nu pe coamă.
    * **Casa cu șindrilă (pozele 1, 19, 20):** acoperiș aproape plat (~15°), streașină de 0,9 m cu lambriu maro, fronton din scânduri.
    * **Clădirea de tablă din spatele gardului mentă (pozele 18–20):** conturul din OSM are 17 × 20 m. Cu acoperiș în două ape, avea spre stradă un fronton de 20 m, înalt de 3 m, ca o hală, pe care pozele nu-l arată. Acum e joasă (streașina la 2,7 m), în patru ape la 14°, cu tablă pe margini și jgheab maro.
    * **Casa de la poarta nr. 10 (pozele 8, 21):** acoperișul de țiglă metalică ciocolatie coboară la 2,7 m, ca în poză (înainte zidul galben era cât un etaj în plus), la ~35°, cu frontoane din scânduri maro. Galbenul e mai stins.
    * **Casa nr. 111 (poza 22):** tencuiala decorativă e gri închis, nu gri deschis, iar tabla veche e maro-ruginie, nu roz. Fără jgheab, cu lambriu închis la culoare. Măsurat pe randare, din același punct: acoperișul iese #796663 față de #807772 în poză (înainte #866c65), iar peretele #4c514d față de #424347 (înainte #6a6f6a).
    * **Casa nr. 122 (pozele 6, 23):** fronton spre stradă cu lambriu de brad lăcuit, țiglă metalică maro, ~35°.
    * **Casa crem cu țiglă antracit (poza 23, dreapta):** fronton spre stradă, scânduri închise la culoare.
    * **Casa piersicie de la capătul străzii (poza 17):** acoperiș abrupt (~42°) de țiglă metalică ciocolatie, nu roșie și aproape plat. Rame și burlane maro, piersiciul mai prăfuit.
  * **Culorile noi** (piersiciu prăfuit, galben muștar stins, gri închis decorativ, țiglă ciocolatie, tablă veche ruginie) sunt potrivite comparând pozele cu randările jocului din aceleași puncte. Paleta veche rămâne pentru casele din celelalte poze, care sunt potrivite deja pe ele.
  * **`geo/sync_overrides.py`** copiază tabelul cu aspectul caselor fotografiate (`OVERRIDES` din `build_geo.py`) în `assets/geo/geo.json`, fără refacerea hărții (aceea cere descărcările brute OSM/DEM). Scriptul se oprește dacă s-ar schimba ceva ce harta are deja încorporat: mutarea conturului, tipul clădirii, forma acoperișului.
  * **Ce n-am schimbat și de ce:**
    * **Pozițiile caselor rămân cele din OSM** (cu mutările făcute anterior după poze). Am încercat să le triangulez din pozele 1, 18 și 20, dar camerele sunt prea aproape una de alta (~9 m) față de case (15–40 m). La câteva grade de eroare de direcție, intersecțiile ieșeau în stradă sau la 20 m distanță, deci nu sunt o măsurătoare.
    * Pentru casa piersicie, mărimea ferestrei din poza 17 o pune la 45–55 m de cameră, iar jocul o are la ~40 m. E un indiciu, nu o măsurătoare sigură, așa că n-am mutat-o. Nici corpul ei din față, mai jos, cu acoperiș separat, nu e făcut: amprenta din OSM e un singur dreptunghi.
    * **Vederile 6 și 18** (tastele pozelor) nu stau exact unde a fost făcută poza. Vederea 6 e în curte, în spatele porții, iar 18 e rotită cu ~10° spre stânga, așa că strada nu intră în cadru. Le-am lăsat așa; e o problemă de cameră, nu de clădiri.
  * **Pozele 11–14 și 25–86 nu mai sunt în proiect** (doar descrierile lor, din versiunile trecute). Dacă le trimiți din nou, le iau și pe ele la fel.
* **Pasajul CF de pe DJ100E, lângă Strada Gării (pozele 25–29, capturile tale de Street View de la 45,12956° N, 25,71549° E)**: DEM‑ul de 25 m netezește rambleul căii ferate, așa că pe ~400 m în jurul pasajului rambleul e refăcut din gabaritul de pe indicator (3 m; tablierul la 3,4 m deasupra drumului, grosime ~1 m, liniile la ~4,4 m peste carosabil), cu pante de 1:1,5 și fără să atingă străzile. În jurul deschiderii terenul e refăcut la 1 m (celulele de 5 m sunt decupate), ca să existe pereți verticali: culee din piatră sub tablier, aripi din piatră evazate spre drum, cu vârful coborând spre capete și taluz înierbat deasupra, tablier de beton cu rigidizări galbene, grindă cu dungi alb‑negru, indicatorul „3 m” pe ambele fețe și balustradă zincată; pe partea de nord‑vest trotuar cu bordură vopsită alb‑negru, balustradă galbenă și brâu alb pe perete. Drumul prin pasaj e nivelat între capete (DEM‑ul lăsa o cocoașă). Tot din capturi: zidul jos din piatră care rotunjește colțul și borna „21 DJ 100E”, tuiele de pe taluzuri, stâlpii înalți de iluminat cu ghivece de mușcate pe Strada Gării, trecerile de pietoni, trotuarul înălțat cu zid de piatră, balustradă și mușcate spre pasaj, magazinul „SHOPPING Oana” (amprenta OSM tăiată în corpul cu fronton și acoperiș de țiglă metalică roșie și aripa joasă cu copertină roșie) și Blocul 19 cu acoperiș de țiglă. Fără gardurile generate în zonă. Capturile nu sunt incluse în proiect (sunt imagini Google); le-am folosit doar ca referință vizuală.
* **Podul DJ100E peste Prahova, între Poiana Câmpina și Câmpina (pozele 30–32, capturile tale de Street View de la 45,1291427° N, 25,7187383° E)**: podul din OSM (way 17505165, 173 m) are acum tablier propriu (`src/geo/bridge.js`), ușor bombat (0,75 m) între culee: carosabil de 7,5 m cu linie continuă, pe partea de amonte parapet de beton cu blocuri înalte de 1,25 m și crestături de 0,45 m (talpă înclinată spre drum) și trotuar înălțat de 1,8 m, pe partea de aval parapet vopsit în blocuri galben/negru, pasarelă de 1,1 m și stâlpi zincați cu braț curbat, care poartă și cele 4 conductoare de joasă tensiune (legate la câte un stâlp de beton pe fiecare mal); balustrade cu stâlpi pătrați la 2,4 m, bare verticale la 13 cm și panouri alternativ galben decolorat și negru / ruginit. Dedesubt: 5 grinzi prefabricate pe deschidere, pile‑lamelă cu capete rotunjite la ~27 m (una pe zona mediană a DN1, care trece pe sub pod cu cele două căi) și culee. Pe imaginile aeriene (folosite doar pentru măsurători, nu sunt incluse) am poziționat canalul betonat de pe malul vestic, de la priza de lângă prag, pe sub pod, până la vărsarea în râu (în trepte, cu apă), pragul de beton de ~190 m amonte (cu spumă unde deversează firul apei) și poiana dintre canal și stadion; în jurul podului albia de ape mici e îngustată la ~10 m, restul e prundiș, ca în poza 32. Aproximat: poziția pilelor (nu apar pe nicio imagine), secțiunea exactă a canalului și a pragului. Tot acum: sub orice pod mașinile și pietonii rămân pe drumul de jos (înainte „săreau” pe tablier), coliziunile mașinilor cu zidurile, pilele și gardurile de pe hartă țin cont de cota lor (sub cota 0 erau ignorate), iar atingerea razantă a unui zid/parapet frânează prin frecare (μ 0,5), nu mai oprește mașina pe loc.
* **Strada Nicolae Grigorescu (DJ100E) în Câmpina, după pod (pozele 33–35, capturile tale de Street View de la 45,1293068° N, 25,7207781° E)** (`src/geo/grigorescu.js`): înainte, toată zona era pădure. Acum, după OSM și imaginile aeriene (folosite doar pentru măsurători), acolo sunt: **baza sportivă** (terenul mic de fotbal cu gazon sintetic, linii și porți, două perechi de terenuri de tenis din zgură cu linii și fileu, perechea din mijloc sub un dom alb gonflabil), fiecare teren nivelat ca terasă la media colțurilor (DEM‑ul de 25–30 m le înclina cu 6–7 m) și înconjurat de zid alb de sprijin, plasă verde de vânt și plasă de sârmă, cu stâlpi de nocturnă zăbreliți la colțuri; **triunghiul cu iarbă** dintre Str. Nicolae Grigorescu și Str. Plevnei, cu buldoexcavatorul galben, indicatorul turistic maro (textul nu se citește în captură, am pus cele două muzee memoriale din Câmpina) și mașina argintie parcată lângă zid; **trotuarul** cu bordură pe partea dinspre baza sportivă și parc, stâlpii de beton cu rețeaua de joasă tensiune, lămpile stradale, bordura și zidul jos de la piciorul versantului împădurit; **poarta Seva Parc** (stâlpi și arc alb cu inscripția, canaturi cu model de ramuri, panou lateral), gardul închis la culoare și șirul de tuia înalte; **Parcul Curiacul** de lângă Lacul Curiacul: peluză, gard decorativ cu model de dreptunghiuri, tuia, lămpi‑glob și bănci pe alee, coșul de gunoi verde de la bordură; copacii parcului rămân. Aproximat: nivelul exact al teraselor, pozițiile stâlpilor, lămpilor și tuiilor.
* **DN1 (E60) la sensul giratoriu de la Cornu (pozele 36–37, capturile tale de Street View de la 45,1398295° N, 25,7098525° E)** (`src/geo/cornu.js`): în OSM cele două sensuri ale DN1 dinspre Câmpina sunt desenate prea aproape (linia benzilor spre giratoriu trece prin mijlocul zonei hașurate), așa că, după imaginea aeriană (folosită doar pentru măsurători), benzile sunt mutate la secțiunea reală: zona hașurată cu bordură și trotuar din dale roșii spre drumul de serviciu, cele două benzi, refugiul de 2,5 m din dale roșii care începe în dreptul restaurantului și se lărgește în insula de separare de la giratoriu, sensul spre Câmpina și parapetul de beton (profil New Jersey) pe margine. La giratoriu: insula centrală (gazon, inel de pavele, panoul cu săgeți roșu‑alb, indicatorul „ocolire pe dreapta”, stâlpii roșu‑alb), insulele de separare din dale roșii pe toate brațele, indicatoarele „cedează trecerea” + „sens giratoriu”, săgețile de pe benzi și linia de cedare, lămpile solare; benzinăria Rompetrol (clădirea din OSM era de fapt copertina: acum copertină pe stâlpi, pompe, totem cu prețuri), terasa restaurantului cu steagul DORNA și molizii, panoul publicitar alb de pe partea cealaltă. Aproximat: forma exactă a insulelor pe brațele fără poze; prețurile de pe totem nu se citesc în captură, așa că panourile de prețuri sunt goale.
* **Benzinăria Etu Oil & Gas de pe DN1, la Cornu de Jos (pozele 38–39, capturile tale de Street View, Plus Code 4MXW+GH3 = 45,14876° N, 25,69642° E)** (`src/geo/etu.js`): în OSM fiecare sens al DN1 are aici `lanes=4`; în poze sunt 2 benzi pe sens, așa că fiecare cale are acum 7,6 m, cu parapet New Jersey cu catadioptri roșii pe mijloc, indicatorul „80” și „ocolire pe dreapta”. **Banda de decelerare** din asfalt de-a lungul DN1, cu săgeata de viraj (în OSM ambele intrări porneau din axul drumului, cea nordică marcată beton), din care se desprinde intrarea în curte; **insula cu iarbă** și bordură dintre ea și benzinărie, cu **totemul Etu** (logo, cele 5 prețuri din captura din noiembrie 2023: Diesel 7,58, Super Diesel 8,09, Benzină Standard 6,95, TOP Premium 7,50, GPL Auto 3,60, pictogramele de servicii), tufele tunse și indicatoarele albastre „înainte” de la capătul insulei; **curtea din pavele** cu săgeți roșii; **copertina** (clădirea din OSM era de fapt copertina: acum acoperiș pe stâlpi cu banda roșie și siglele Etu, panouri solare deasupra, 3 insule de pompe, magazinul cu vitrină și perete albastru dedesubt); pavilionul de sticlă cu dom; **clădirea de birouri** albă, pe 3 niveluri, cu benzi albastre, și șirul de molizi din fața ei. Curtea (după imaginea aeriană, folosită doar pentru măsurători) nu mai e pădure: iarbă și spațiu deschis, iar pajiștea de la sud își păstrează copacii răzleți. Aproximat: poziția totemului, a indicatorului „80” (nodul din OSM e pe o îmbinare de segmente; l-am pus unde apare în poza 38) și a molizilor, forma exactă a copertinei și a magazinului, parcările (acum iarbă). Tot acum, pe toată harta: marcajele nu se mai întrerup unde două segmente OSM ale aceluiași drum se continuă cap la cap (doar la intersecțiile reale).
* **Strada Pițigaia (DC117), la gura ulicioarei spre est (pozele 40–41, pozele tale de la 45,1229934° N, 25,7157007° E)** (`src/geo/pitigaia.js`): ambele poze privesc în sus pe stradă, spre sud-vest (drumul urcă ~11 %). Pe imaginea aeriană (folosită doar pentru măsurători) carosabilul e cu ~2 m spre sud-est față de linia din OSM și are ~5 m lățime, așa că tronsonul de ~155 m (plus primii 24 m ai ulicioarei) e mutat acolo, împreună cu stâlpii și gardurile de pe margini. Drumul e refăcut din **dale de beton turnat** pe două rânduri, cu rosturi umplute cu bitum la 4,3–5,7 m, fisuri, reparații și margini ciupite (în OSM scrie asfalt). Gura ulicioarei e lărgită, fără borduri. **Pe dreapta (poza 40):** fâșie de iarbă, trotuar de beton de 1 m (ridicat cu 7 cm), gardul de fier cu vârfuri de suliță al casei nr. 857 (acoperiș de tablă ruginită) pe soclu de beton, cu poartă, portiță și plăcuța cu numărul. Numărul e cel din OSM, fiindcă în poză nu se citește sigur. Mai sunt dulapul galben al regulatorului de gaz cu țevile, gardul de scânduri închis la culoare, tufele din spate, pomul cu trunchiul văruit și firul de branșament de la stâlp la un catarg din curte. **Pe stânga (poza 41):** șanțul cu buruieni (adânc de 36 cm, terenul refăcut la 1 m), podețul de beton cu tub la intrare, gardul din panouri de plasă zincată cu poartă dublă, lotul năpădit de buruieni cu casa veche cu țiglă (nr. 892) și șopronul de lemn cu tablă ruginită, plus cutia albă de contor pe stâlpiș. Acoperișurile caselor din jur sunt colorate după imaginea aeriană. Aproximat: pozițiile porților, ale cutiilor și ale șopronului, înălțimea buruienilor. Oamenii din poze nu sunt modelați.
* **Strada Măgurii (pozele 42–45, capturile tale de Street View: prima de la 45,1270483° N, 25,7122588° E, celelalte din septembrie 2022 de la Plus Code 4PG7+624 = 45,12551° N, 25,71258° E)** (`src/geo/magurii.js`). **Poza 42, DJ100E la Aleea Croitorului:** troița de pe colț (soclu, stâlpi de lemn, icoana pictată, acoperiș de tablă în două ape cu cruciuliță), stâlpul de beton cu oglinda convexă, plăcuța străzii și semnul de parcare, panoul cu săgeți roșu‑alb, bordurile vopsite în alb pe colțul rotunjit, capacele de canal, iar vizavi poarta albă din lamele, panourile verzi de plasă și țeava galbenă de gaz. **Pozele 43–45, Strada Măgurii la gura Străzii Tulburii:** pe imaginea aeriană (folosită doar pentru măsurători) carosabilul e cu ~2,3 m spre est față de linia din OSM, așa că tronsonul de ~185 m e mutat acolo, împreună cu stâlpii și gardurile de pe margini; capătul Străzii Tulburii urmează intersecția. Asfaltul e vechi, cu fisuri colmatate cu bitum și petice; bordurile sunt vopsite în alb și gri, iar trotuarele sunt înguste. La nord de intersecție: pe vest fâșia de asfalt crăpat, **canalul de beton cu apă** (terenul refăcut la 1 m sub el), stâlpii ruginiți cu vârful îndoit, sârmele și plasa împletită spre pajiște; pe est zidul scund cu gardul verde din bare, apoi gardul viu. Canalul intră sub intersecție printr‑un tub cu balustradă verde din țeavă, lângă curtea cu pietriș și stivele de piatră. La colțul de după Strada Tulburii e gardul verde din tablă. La sud (drumul urcă ~10 %): pe vest trotuarul, gardul verde din tablă cutată, poarta și gardul din lamele gri, casa albă cu acoperiș roșu (nr. 704); pe est **bordura din blocuri de piatră**, șanțul de pământ cu buruieni, podețul de beton spre poartă și **gardul maro din tablă trapezoidală**. Mașinile din poze sunt parcate la locurile lor: hatchback‑ul gri și sedanul închis la culoare lângă bordura de est, SUV‑ul argintiu pe pietriș. Acoperișurile caselor din jur sunt colorate după imaginea aeriană și după poze. Aproximat: poziția troiței și a semnelor (pozele nu au o coordonată pentru fiecare), textul de pe plăcuța străzii (se citește doar că e o plăcuță albastră; am scris numele aleii de pe colț, din OSM), locul exact al porților, stivelor și mașinilor.
* **Strada Gării: Parcul Triumf, Stadionul Fortuna, zidul de sub calea ferată și gara (pozele 46–50, din mașină: 46–47 la 45,12911° N, 25,71685° E; 48 la 45,12988° N, 25,71492° E; 49–50 la gara Poiana Câmpina, 45,13241° N, 25,71193° E)** (`src/geo/gara.js`). **Pozele 46–47:** pe dreapta, trotuarul cu bordură și gardul scund de plasă cu stâlpi albi al Parcului Triumf, panoul alb „PARC TRIUMF POIANA CÂMPINA” pe doi stâlpi, plopul înalt și brazii tineri, locul de joacă (covor de cauciuc, balansoare portocalii, căluți pe arc, bănci, coș roșu) și felinarele cu glob alb; pe stânga, șantierul împrejmuit cu plasă verde de ~2 m, panoul albastru al proiectului (textul nu se poate citi în poză, așa că e redat doar ca benzi), discul alb pe stâlp, plopii și trunchiul retezat. La poarta Stadionului Fortuna: turnul cu patru stâlpi de beton (~10 m, capete de cărămidă și lămpi mici), poarta albă din bare, zidul de piatră cu grilaje mici spre nord-vest, care se apropie de drum (pe imaginea aeriană platforma are ~22 m lângă poartă și ~13 m la capăt), copacii cu trunchiul văruit, brazii din spatele zidului, platforma asfaltată cu separatorul îngust cu borduri și stația de autobuz la capătul zidului. **Poza 48:** terasamentul căii ferate se termină în zidul de sprijin din piatră cu graffiti (terenul e refăcut ca treaptă verticală: jos la nivelul trotuarului, sus la nivelul căii ferate), cu o locomotivă albastru-alb pe linia de garare de lângă zid (terenul de sus rămâne la cota liniei, ca șinele să nu se miște); pe stânga pinii cu trunchiul văruit pe fâșia de iarbă, bordurile vopsite alb-negru pe ambele părți, trotuarele; pe dreapta șirul de tuia, copacii mari și stâlpii înalți de iluminat. **Pozele 49–50:** clădirea gării cu etaj, din cărămidă roșie cu acoperiș de țiglă, gardul de tablă gri, insula cu borduri dintre Strada Gării și bucla stației de maxi-taxi, cu brazii înalți pe pozițiile copacilor din OSM, semnele de sens interzis și de acces interzis, stâlpii de iluminat, catargul LED cu două brațe la bordura parcării dintre insulă și strada laterală, mașinile parcate în parcare, în fața insulei și de-a lungul ei, bradul mare din fața gării (poza 50 e făcută chiar la coordonată, pe lângă insulă, cu mașini parcate pe ambele părți). **Unde stă camera:** pozele sunt făcute cu obiectivul ultra-wide al telefonului (~90° pe lățime, cât cadrul jocului la fov 59), așa că pozițiile vederilor 46–50 sunt calculate din distanțele și unghiurile unor repere cunoscute din cadru (panoul, turnul, locomotiva, bradul, stâlpul LED): 46 la ~27 m înainte de panoul parcului, 47 chiar la coordonată, cu mașina virând spre platforma stadionului, 48 la coordonată, 49 la ~10 m înainte de intersecția cu bucla, 50 la coordonată. Aproximat: poziția exactă a panourilor, a stâlpilor și a mașinilor, modelul locomotivei (e o formă generică, nu un model anume), textul panoului de proiect.
* **Strada Gării la castelul de apă al gării (pozele 51–53, la 45,13282° N, 25,71127° E, din mașină spre nord-vest, apoi la intrarea în curte)** (`src/geo/castel.js`). Clădirile nu sunt în OSM, așa că amprentele sunt măsurate pe imaginea aeriană Bing (z19, doar pentru măsurători), iar înălțimile și detaliile din poze. **Castelul de apă:** puț octogonal din cărămidă roșie (~7,6 m) cu ferestre în arc pe două niveluri, brâu și consolă, casa rezervorului octogonală din scânduri suprapuse vopsite gri-verde, decolorate, cu trapă și ferestruici, streașină și acoperiș piramidal de tablă gri cu jgheab și burlan (~18 m în total), lângă el clădirea de cărămidă cu acoperiș maro. **Postul de transformare** de la marginea drumului: tencuială crem, rugoasă, două uși duble de tablă gri, găuri de aerisire, placa groasă de beton cu streașină. **Gardurile:** tablă cutată gri spre sud-est (cu cutiuța albă), tablă perforată între post și castel, plăci de beton prefabricate spre nord-vest. **Curtea** cu pietriș, semnul de acces interzis și **clădirea cu trei etaje** cu benzi de cărămidă roșie și tencuială crem, etajul de sus din cărămidă cu grilaje mici, ușa cu grilaj, aparatele de aer condiționat. Pe partea cealaltă: fâșia de pietriș pentru parcare cu blocurile de beton vopsite și bradul argintiu mare. Mașinile din poze sunt parcate pe ambele părți (Opel Corsa vișiniu, Renault albastru, Skoda și VW închise, cele de lângă gardul de beton). Aproximat: înălțimea exactă a castelului și a clădirii cu dungi (estimate din poze), clădirea de cărămidă de lângă castel (se vede doar acoperișul pe imaginea aeriană), numărul de ferestre, poziția exactă a mașinilor.
* **Intersecția DJ100E cu Strada Dimitrie Gusti și brațul de est al Străzii Centru, cu monumentul (poza 54, la 45,12858° N, 25,71276° E, din mașină, pe Strada Centru dinspre sud-est)** (`src/geo/monument.js`). OSM desenează intersecția ca un triunghi de bretele cu sens unic, cu iarbă la mijloc; pe imaginea aeriană Bing (z19, doar pentru măsurători) triunghiul e asfaltat, cu o insulă rotundă de ~3,6 m rază în jurul monumentului, iar carosabilul DJ100E trece pe lângă ea spre nord-vest (vârful din mijloc al axului e mutat cu 1,6 m, ca banda să nu treacă prin insulă). În joc: asfaltul pe tot triunghiul, insula cu bordură, iarbă, gardul scund negru și tufe tunse, coloana înaltă de piatră (soclu în două trepte, fus pătrat de ~5,6 m, cornișă, piesa închisă la culoare din vârf și placa), insulița cu indicatorul văzut din spate, gardul negru cu panouri arcuite din stânga, stâlpii de iluminat cu braț și mașina albă parcată la bordură. Aproximat: forma exactă și inscripțiile monumentului (în OSM apare doar ca „monument”, iar în poză se vede de departe, în contra-lumină), fața indicatorului (se vede doar spatele), poziția exactă a stâlpilor.
* **Strada Toma Cantacuzino, coborârea cu parapete prin pădure (poza 55, la 45,13278° N, 25,70670° E, din mașină, la vale spre nord-est)** (`src/geo/cantacuzino.js`). La coordonata din poză, imaginea aeriană Bing (z19, doar pentru măsurători) și OSM arată case chiar la marginea drumului, pe dreapta; cadrul din poză (pădure deasă pe ambele părți, fără case) se potrivește cu porțiunea imediat de dedesubt, unde drumul intră în pădure (~50 m mai jos), așa că vederea e pusă acolo. În joc: parapete metalice tip W pe ambele părți (lisă zincată, patinată, pe stâlpi la 2 m, capete coborâte în pământ, cu coliziune), linie continuă pe mijloc pe toată porțiunea (`solidAt` în `roads.js`), copaci și tufe dese chiar în spatele parapetelor, fără gardurile generate; jos, casele unde drumul cotește. Aproximat: capetele exacte ale parapetelor, speciile și poziția fiecărui copac, locul exact al pozei.
* **Strada Toma Cantacuzino, curtea veche cu hala dezafectată și bifurcația cu rezervorul (pozele 56–57, la 45,13451° N, 25,70569° E, din mașină, spre nord-vest, la vale)** (`src/geo/hala.js`). Nimic din pozele acestea nu apare în OSM. Hala (două travei, ~51 × 31,5 m, perpendiculară pe drum), rezervorul rotund (raza exterioară ~5,3 m, măsurată pe marginea umbrei lui), rampa de beton și grămada de pietriș sunt măsurate pe imaginea aeriană Bing (z19, doar pentru măsurători). Pozele sunt făcute cu obiectivul principal (1×), deci vederile au fov 32. Camerele sunt puse din perspectivă: în poza 56 hala, de la blocul alb până la colțul îndepărtat, ocupă ~32° din cadru, iar în poza 57 rezervorul pare cât ar fi la ~50 m. Modelul de teren urcă ~7 m sub hală, dar în poză zidurile ei stau la același nivel, așa că amprenta halei e nivelată în pantă. În joc: gardul din plasă cu trei fire de sârmă ghimpată (stâlpi de beton cu capete îndoite spre nord-vest de poartă, țevi spre sud-est), poarta în două canaturi în capul rampei și bordura joasă de pe o latură, portalul zăbrelit din spatele gardului (~12 m, ~9 m înălțime, după picioarele lui din poză), stâlpii de beton cu linia lor; hala, cu ziduri de 2,4 m din cărămidă silico-calcară albă, stâlpi zăbreliți, ferme, grinzi și pane fără acoperiș, plus blocul alb de la capătul dinspre drum. La bifurcație: rezervorul din beton turnat (~7,5 m), cu stuf și buruieni în jur, grămada de pietriș din fața lui, bordura de beton a bretelei, parapetul scurt pe timpanul de beton, gardul curții pe soclu de boltari de-a lungul bretelei, cu magazia în spate, stâlpul cu semnul de avertizare și desișul din dreapta. Drumul nu are marcaje aici, ca în poze. Zidul alb și stâlpul generate procedural în fața rampei au fost scoase. Aproximat: poziția exactă a portalului și a porții, înălțimea rezervorului, detaliile structurii halei, magazia; mașinile din poze erau în mers, așa că nu sunt puse.
* **Capătul Străzii Toma Cantacuzino și Strada Gării la triaj (pozele 58–59, la 45,13531° N, 25,70545° E, din mașină, spre gară)** (`src/geo/triaj.js`). Poza 58: cotul la stânga spre calea ferată, cu clădirea veche din interiorul curbei (OSM 1475571528: tencuială nisipie pătată, streașina la ~3 m, acoperiș metalic închis cu pantă mică și o supraînălțare cu jaluzele), gardul de șipci gri și nucul mare din fața ei (coroana se vede pe imaginea aeriană Bing, z19, doar pentru măsurători), cele două parapete și desișul din exteriorul curbei. Poza 59: Strada Gării spre nord-vest de-a lungul liniilor: gardul viu înalt de tuia în spatele unui gard cu stâlpi de beton și al unui acostament cu pietriș, pe stânga; parapetul pe zidul jos de piatră spre triaj, stâlpul de lemn cu contrafișă care duce linia peste drum și stâlpul cu proiectoare din triaj, pe dreapta. Asfaltul fără marcaje pe ambele străzi, ca în poze. Distanțele sunt din perspectivă (obiectiv principal, 1×; mașinile din față dau scara). Aproximat: poziția exactă a stâlpului de lemn și a proiectorului, forma supraînălțării, speciile din desiș, mașinile din poze (erau în mers, nu sunt puse).
* **Drapelul de lângă crucea de pe deal (poza 60, la 45,1184398° N, 25,7042024° E, lângă mașină)** (`src/geo/drapel.js`, `src/geo/drapel_mask.js`). Camera e găsită prin rezecție pe poză: silueta dealului împădurit (trasată pe ~100 de coloane) comparată cu solul gol (FABDEM) plus ~20 m de arbori, și vârful și baza crucii (pixelii 646,1106 / 650,1283). Am rezolvat poziția, direcția, înclinarea și distanța focală: silueta se potrivește la 0,24° (medie pătratică), crucea la 2–3 px. Poza iese aceeași, în limita a 3 m, pentru arbori de 14–22 m. Pe vechiul relief (EU‑DEM) potrivirea era de 0,37°, iar fără refacere, pe relieful nou, ar fi ieșit 1,0°. Camera stă la ~95 m est de cruce (coordonata pozei e deplasată ~70 m), privește spre vest (282°), e înclinată în sus 15,8° și are un câmp vizual vertical de 54,4° (cadru decupat). Crucea se vede exact din profil, deci brațele ei sunt pe 101,6°/281,6°. Plafonul mașinii e la 3° sub orizont, ca în poză (0,23 m sub ochi), deci terenul coboară ~0,35 m până la ea. Catargul, cu grosimea de 17 px la plafon (țeavă de ~11 cm), stă la ~9,75 m, chiar după botul mașinii. Marginea de sus a cadrului e acolo la ~10,7 m, iar lancea continuă deasupra, deci catargul are ~11,5 m. Tricolorul (~3 × 2 m) atârnă moale spre dreapta, în spatele catargului, până la ~7 m. SUV-ul gri-verzui are spatele la ~4 m (lățimea lui acoperă jumătate din cadru). Pădurea: dealul din spate (OSM way 86204340, `leaf_cycle=deciduous`, fără `leaf_type`) avea pini și amestec puși aleator de build; toate pădurile marcate `deciduous` sunt acum de foioase (505 ha din 2587, în `build_geo.py` și în `forest.json`). Acoperirea pădurii de pe deal e trasată din ortofoto Bing (z17). Pâlcurile de porumbar și păducel și arborii mici de pe pajiște (134 de pâlcuri, 1161 de plante) sunt detectate pe ortofoto la 1 m (z19). Drumurile de pământ (niciunul nu e în OSM, iar ortofoto e mai vechi decât ele) sunt luate din poză, prin proiectarea pixelilor pe relief. Primul e drumul foarte denivelat pe care ai urcat cu mașina: pornește din alee chiar la sud de cruce și ajunge la catarg (stânga-jos în poză, la 8,7 m, 12,4 m, 68 m, 81 m și 96 m, și intră în alee la 120 m). Al doilea e drumul de după cruce, care duce spre pădure: pleacă din alee la 120 m, urcă movila chiar în stânga crucii și cotește ușor la dreapta la marginea pădurii (−1,1° lângă cruce, +2,3° la copaci), apoi intră în pădure. Amândouă au denivelările în teren, nu doar în textură: făgașe de ~10 cm la 1,56 m una de alta (ecartamentul unei mașini), cocoașă cu iarbă la mijloc, valuri de 2–7 m diferite sub fiecare roată și gropi. Pe ele mașina se înclină lateral de 9–18 ori mai mult decât pe alee (ruliu cumulat pe segment: 35–70° față de 4°). Locul de parcare de lângă catarg e bătătorit, cu panta din poză (5,5 %). Relieful FABDEM de 30 m cobora acolo ~0,95 m de la cameră până la mașină. Aproximat: înălțimea catargului și a coronamentului, mărimea și faldurile steagului, speciile din pâlcuri. Ortofoto e mai vechi decât crucea.
* **Pădurea și pajiștile de pe dealul crucii, de aproape** (`src/geo/hillwood.js`). Sunt generate doar pe dealul din pozele 24 și 60, în dale de 16 m în jurul jucătorului, la fel de fiecare dată:
  * **Pajiștile** (terenul deschis trasat din ortofoto) au iarbă deasă: iarbă scurtă verde și uscată, fân până la genunchi cu spice (sfârșit de vară, galben pe movile, ca în poza 60) și flori de pajiște în pâlcuri (coada-șoricelului, sunătoare, albăstrițe). Iarba e călcată mai scurtă lângă cruce, catarg și mașină, lipsește din făgașe și crește pe cocoașa dintre ele. Are trei inele de detaliu, de la ~26 m la ~110 m la calitatea Înaltă.
  * **Pădurea** (fag, carpen, stejar) are pe jos frunzișul de anul trecut, crenguțe și ramuri, pâlcuri de ferigi la umbră, iarbă rară care se îndesește spre margine și mure la margine.
  * **Lemnul mort** e pus unde e firesc: 516 trunchiuri căzute, mai dese în arboretele bătrâne și pe pante. Cad mai ales la vale, cum le doboară vântul, iar unele au turta de rădăcini smulsă din pământ. Au mușchi pe partea de sus și cioturi de ramuri.
  * **Bolovanii** sunt unde terenul e abrupt, pentru că gresia de fliș a dealurilor subcarpatice iese la suprafață pe pante: 863 de bolovani, unii grupați în aflorimente, cu mușchi și licheni, câțiva și pe malurile cele mai abrupte ale pajiștii. Arborii generați nu cresc prin trunchiuri sau bolovani. Trunchiurile și bolovanii mari au coliziune.
  * **Easter egg:** în pădure, lângă capătul drumului care urcă de la cruce, e un schelet întins lângă un fag căzut, iar pe un bolovan sunt aliniate cranii. Când ajungi la el, apare un mesaj.
* **Podul Vadului – DJ101R (pozele 61–62, capturile tale de Street View de la 45,1425988° N, 25,6948875° E)** (`src/geo/vad.js`). Podul are 330 m (OSM way 17505067). Trece peste Strada Gării, cele două linii CF 300, un drum de pietriș, un drum de câmp și Prahova, până la DN1.
  * **Strada Gării e mutată pe asfaltul real.** În OSM e desenată cu 3–5 m prea la vest pe tot tronsonul de sub pod (măsurat pe ortofoto Bing, folosit doar pentru măsurători; casele din OSM se potrivesc cu ortofoto). Tronsonul e mutat cu 4,6 m spre est, de la ~70 m nord de pod până la ~100 m sud de intersecție, cu trecere lină la capete. Intersecția rămâne un singur punct, iar ulița spre vest o urmează. Gardurile și stâlpii de pe margine se mută cu drumul, iar patul drumului e refăcut sub asfalt.
  * **Camera din poza 62 e găsită prin rezecție** pe 5 colțuri ale culeei (eroare medie 2,8 px). Stă pe Strada Gării, la ~10 m după intersecție, pe marginea de vest, privește spre 334,6°, e înclinată ~7° în jos și are un câmp vertical de ~73°. Tot din rezecție reies două lucruri. Fața culeei e înclinată: jos e cu ~2,5 m mai spre stradă decât sus. Zidurile întoarse încep cu ~8,6 m înainte de piciorul culeei.
  * **Culeea de vest**: fața înclinată stă la ~0,8 m de marginea Străzii Gării. Zidurile laterale sunt la marginea tablierului, cu cornișa albă deasupra. În fața fiecăruia e un sfert de con pavat cu beton (1:1), cu vârful unde încep parapetele. Taluzul e pavat la fel și cu 8 m înainte. Scara coboară în diagonală pe taluzul de sud, cu mâna curentă neagră pe ambele părți: în poza 62 e banda de pe muchia pavajului, iar în poza 61 mâna curentă coboară spre cameră.
  * **Stâlpul cu drapelul** e prins de zidul de sud, la ~1 m de fața culeei, de la nivelul intradosului până la ~5,4 m peste tablier.
  * **Tablierul**: 7,5 m de asfalt cu linie continuă, trotuare înălțate după borduri, cornișe albe și grinzi exterioare albe, intradosul închis la culoare. Pe tablier coliziunea e de pod: mașina merge pe el, iar pe Strada Gării trece pe dedesubt.
  * **Parapetele** (2025–26, poza 62) au bare albastre și rame alternativ albastre și albe, cu plăci galbene peste trotuare unde încep. Pe rampă sunt parapete din tablă ondulată pe ambele părți. Cel de nord intră în parapetul podului. Cel de sud se oprește la scară.
  * **Profilul**: creasta tablierului e la 7,04 m peste Strada Gării (poza 62), iar capătul rampei cu 0,1 m mai jos. Pe vechiul relief asta însemna 26,95 m. Pe FABDEM strada e cu 1,3 m mai jos, așa că și podul coboară cu ea (altfel ar fi stat la 8,3 m peste stradă). Tablierul rămâne la ~6,5 m peste calea ferată. Pe FABDEM, strada se lasă sub pod, așa că banda ei de asfalt e desenată la pas de 1 m, ca terenul de 1 m de sub ea. Cu pasul obișnuit de 3,5 m, coardele intrau 2–4 cm sub teren și iarba ieșea prin asfalt în fața camerei din poza 62 (în V47). De la ~85 m coboară ~6,7 % odată cu valea, până la intersecția cu DN1 (12,2 m). Pilele sunt cadre cu doi stâlpi, la ~20 m, puse în afara drumurilor, a liniilor și a râului.
  * **Pe Strada Gării**:
    * indicatorul de 30 km/h e la bordură, la ~4,5 m după intersecție, cu fața spre cei care vin din sud;
    * teiul e în spatele lui, pe singurul loc de pe raza din poză care nu e pe asfalt și nici în casă;
    * gardul de șipci vechi e în fața curții;
    * casa are pereți ocru deschis și acoperiș de tablă gri (poza 61);
    * locul fără garduri de lângă con e acolo unde e parcat Astra gri;
    * colțul de vest al intersecției e asfaltat.
  * **Aproximat**:
    * înălțimea tablierului e scoasă din proporțiile pozei 62;
    * panta rampei și a podului spre Prahova e din umbra tablierului pe ortofoto;
    * pilele (niciuna nu se vede);
    * rampa rămâne pe linia OSM (pe ortofoto pare cu 1–3 m mai la nord, dar un tablier înalt e deplasat pe ortofoto de perspectivă);
    * poziția exactă a scării și a teiului;
    * poza 61 e din 2023, cu parapete galben‑negru; am păstrat culorile din 2026.
* **Ieșirea de pe Podul Vadului în DN1, la intrarea în Breaza (poza 63, poza ta din mașină la 45,1435469° N, 25,6988803° E)** (`src/geo/breaza.js`). Drumul de pe pod se desparte la capătul lui:
  * **Ramurile**: ramura spre DN1 (OSM 148233510, sens unic, STOP la DN1) ține dreapta, iar cea dinspre DN1 (148506882) vine pe stânga. Pe ortofoto ramura dinspre DN1 e cu ~2 m mai la nord-vest la mijloc, așa că e curbată acolo. Cu ea, monumentul cade pe axul insulei, ca în poză.
  * **Camera** e găsită din poză: la ~2 m înainte de despărțire, pe banda din dreapta (parapetele podului sunt în spate, nu apar în cadru), privește spre 63,6°. Unghiurile obiectelor sunt măsurate pe poză (obiectiv de telefon ~26 mm, 53° pe lățime): monumentul e la 1,2° dreapta, STOP‑ul la 7,6° dreapta (pe nodul lui din OSM), panoul la 14,2° stânga, BREAZA la 18,4° dreapta. Distanțele sunt din mărimi: panoul la ~34 m, BREAZA la ~31 m, monumentul la ~35 m.
  * **Între ramuri**: ~30 m de zonă hașurată (asfalt, linii de margine, dungi oblice), apoi insula îngustă cu bordură și iarbă uscată.
  * **Monumentul „BREAZA”**, chiar după vârful insulei. Forma e luată din cele 3 capturi Street View trimise (aprilie 2022), iar mărimea și poziția din poza 63 (~34 m, 1° dreapta; pata întunecată de pe ortofoto):
    * soclu-pană din lespezi de piatră, lung de ~2,4 m, înalt de 0,71 m în spate, coborând la 0,15 m în față;
    * cadru verde de oțel în A, înalt de 3 m, cu triunghi verde din tablă ondulată în vârf;
    * literele albe „BREAZA” (0,74 m înălțime, 2,5 m lățime) spre ramura noastră, iar pe partea cealaltă un rând verde puțin mai mare;
    * trei steaguri: UE, România și unul deschis la culoare. Din poza 63 se vede partea verde, aproape din profil; de aici rezultă orientarea planului (50°).
    * Pinii din spatele monumentului sunt dincolo de DN1 (coroanele întunecate de pe ortofoto). Pinii tineri pe care îi pusesem în colțul triunghiului dinspre DN1 i-am scos: în Street View acolo e doar iarbă până la DN1.
  * **Bordurile** insulei și ale triunghiului cu panoul sunt vopsite alb‑negru din metru în metru, ca în poze. Tăblița „BREAZA” are chenar roșu subțire, ca în poza 63.
  * **În stânga**: rampa care coboară din DN1 și triunghiul cu iarbă cu panoul Lac Verde („Primul teren privat de GOLF din România”, 0754 093 291, „24 … de ÎNCÂNTARE”, golfer), cu lampă deasupra. Pădurea de dincolo de rampă rămâne.
  * **În dreapta**: stâlpul ruginit cu felinar, cu tăblița „BREAZA” și un anunț deasupra. Un cablu merge de la el la stâlpul dublu de la STOP. La STOP sunt plăcuțele albastre „Ploiești →” / „← Brașov” și indicatorul „accesul interzis vehiculelor cu tracțiune animală” cu plăcuța lui.
  * **Terenul**: bordurile la iarba de pe ambele părți. Pe insule, pe iarba dintre ramuri și pe câmpul de lângă legătura spre DN1 nu sunt copaci, garduri sau stâlpi, ca în poză. Grila de 5 m avea la despărțire o groapă de ~1 m și ridica marginea ramurii curbate cu până la 0,45 m, așa că terenul e refăcut la 1 m: fiecare drum are patul drept pe lățime, cu profilul în lung netezit din grilă. Primii 12 m sunt la un singur nivel, iar drumurile se despart treptat până la 40 m. Astfel rampa coboară cu cel mult ~10% (înainte cobora 1 m pe 6 m lângă ramura curbată, iar taluzul ieșea prin asfaltul ei). Drumul de pietriș care pleacă spre sud din nod (OSM 303232125, platforma deschisă la culoare de pe ortofoto) e ținut cu 2 cm sub asfalt la nod. Ramurile n-au acostamente de pietriș: au borduri și hașură.
  * **Aproximat**: pozițiile obiectelor sunt din unghiurile și mărimile din poză, deci au o eroare de câțiva metri. Culorile și inscripțiile care nu se citesc (al treilea steag, anunțul, plăcuța indicatorului) sunt generice. Capturile Street View sunt din 2022; unde diferă de poza ta (de exemplu, panoul era atunci gol), am păstrat starea din poză. Casa albă cu cadrul mare de panou din spatele stâlpului BREAZA nu e adăugată: nu i-am putut stabili poziția sigur. Mașina albastră trecea pe acolo, nu e parcată.
* **DN1 la panoul Păstrăvăriei Cornu (poza 64, captura ta Street View din 2024, la 45,1516650° N, 25,6953293° E)** (`src/geo/pastravaria.js`). E pe sensul spre Breaza, la ~320 m nord de benzinăria Etu:
  * **Drumul**: OSM dă fiecărui sens 4 benzi (15 m), iar sensurile se suprapuneau. În captură sunt 2 benzi pe sens, cu parapet de beton New Jersey la mijloc și ochi roșii reflectorizanți. Măsurat pe captură (camera Street View e la 2,5 m; o bandă are 3,5 m) și pe ortofoto:
    * între liniile de margine ale sensului nostru sunt 7,4 m, pe axa OSM;
    * parapetul e la 4,5 m vest de ea, iar sensul opus e mutat cu 1 m spre vest, cu racord pe câte 25 m la capete;
    * acostamentul asfaltat, mai deschis la culoare, are ~3,9 m în dreapta și ~1,5 m pe partea cealaltă.
  * **Camera** e pe mijlocul benzii din dreapta, rotită 2,4° spre dreapta. Unghiul de vedere al capturii (48,6° pe verticală) reiese din mărimile și pozițiile panoului, parapetului și panoului mic.
  * **Panoul „Păstrăvăria Cornu — restaurant & pensiune — Bine ați venit / Welcome”**: 2,4 × 4,7 m, pe o bază de piatră de 0,3 m, cu două panouri solare și două proiectoare deasupra. E la ~13 m în față, chiar pe marginea acostamentului, cu fața spre trafic. Benzile desenului sunt în proporțiile din captură: pini, numele în arc, păstrăvul, urarea, rândurile mici și banda cu motiv popular.
  * **Mai departe**: un panou mai mic al păstrăvăriei (~2,2 × 2,9 m, la ~44 m) și semnul „oprirea interzisă”, la ~58 m.
  * **În dreapta**: bordura joasă și închisă la culoare a câmpului, un rând de copaci tineri și tufe.
  * **Iarba uscată** e pe margini și pe câmp (luminișul de pe ortofoto); acolo nu e pădure. În stânga e iarbă până la tufăriș.
  * **Aproximat**:
    * vegetația e verde, nu de toamnă;
    * rândurile mici de pe panou (urarea în alte limbi) și pozele de pe panoul mic nu se citesc, deci sunt generice;
    * în joc, ochiul e la 1,6 m, nu la 2,5 m ca în Street View.
* **DN1 mai departe, prin pădure, spre Cornu de Sus (poza 65, captura ta Street View din noiembrie 2023, „continuarea” pozei 64)** (tot în `src/geo/pastravaria.js`). Captura n-are coordonate, așa că locul e ales după ortofoto: porțiunea unde pădurea coboară până la drum pe dreapta începe la ~300 m după panou. Camera e pusă la 120 m în ea; locul exact de-a lungul celor ~700 m de pădure nu se știe.
  * **Același profil transversal** ca în poza 64:
    * 7,3 m între liniile de margine;
    * parapetul la ~0,5 m de linia din stânga;
    * în dreapta o fâșie îngustă de asfalt, apoi pietriș, apoi tufăriș.

    Pe ortofoto, parapetul e aici la mijloc între axele OSM, care sunt la 7,3 m una de alta. De aceea fiecare sens e mutat cu 0,85 m spre exterior, cu racord față de porțiunea pozei 64. Parapetul continuă ~2,35 km de la panou, până după restaurantul din poza 66 (pe ortofoto zona mediană e neîntreruptă).
  * **Profilul în lung**: modelul de relief urmărește aici coroanele pădurii, iar DN1 urca și cobora cu 4–9 m în 100–200 m. În captură drumul urcă lin și uniform pe fundul văii. Profilul e acum anvelopa convexă de jos a înălțimilor de pe axă, netezită, pe ~870 m. Terenul de lângă drum îl urmează (partea pădurii urcă 1,5 m în 45 m) și se racordează apoi la modelul de relief.
  * **Pe margini**: iarbă uscată și tufăriș des, cu câțiva copaci mai înalți printre tufe. În dreapta, la ~50 m în față, e o bornă albă cu capac roșu.
  * **Aproximat**: locul exact de-a lungul pădurii, vegetația (verde, nu de toamnă) și forma bornei (în captură are doar câțiva pixeli). Mașinile din captură (Skoda argintie, camionul de pe sensul opus) erau în trafic, deci nu apar în joc.
* **DN1 la restaurantul de lângă drum (poza 66, captura ta Street View din noiembrie 2023, cu 45,1657080° N, 25,6905560° E)** (`src/geo/popas.js`). E pe sensul spre Breaza, la ~1,3 km după panoul Păstrăvăriei.
  * **Camera**: coordonata cade pe banda noastră, chiar în dreptul capătului de sud al restaurantului, dar în captură restaurantul e la ~45 m în față. Deci captura e făcută cu ~50 m înainte, iar camera e pusă unde o arată poza. Direcția (13° spre dreapta față de drum) și înclinarea reies din punctul de fugă al liniilor. Unghiul de vedere e 54° pe verticală, iar linia dintre benzi e la 1,4 m în stânga camerei.
  * **Drumul**: același profil transversal ca în pozele 64–65 (7,4 m între liniile de margine, parapetul la 4,5 m de linia dintre benzi). În dreptul parcării, linia de margine din dreapta e întreruptă: segmente de 1 m, goluri de 0,85 m, măsurate pe captură. Perechea următoare de căi OSM (spre nord) are tot 2 benzi pe sens și parapet.
  * **Sensurile după pădurea din poza 65**: axele OSM sunt aici la doar 7–7,9 m una de alta, așa că parapetul pus la mijloc ar fi călcat pe banda din stânga. Pe ortofoto Esri, parapetul e la 3–5,2 m în stânga axei noastre, măsurat din 50 în 50 m. Fiecare sens e acum la 4,5 m de el, ca în poza 66. În dreptul restaurantului, axa noastră rămâne practic pe cea din OSM (±0,1 m).
  * **Profilul în lung**: relieful urmărea din nou coroanele pădurii: o cocoașă de 9 m în spatele camerei și una de 4 m în față, unde captura arată drumul plan. Profilul e anvelopa convexă de jos a înălțimilor de pe axă (în grila de 10 m, de la capătul porțiunii din poza 65 până la ~250 m după pasarela din poza 67). E fixat orizontal pe 165 m prin dreptul parcării, la cota reală de acolo (teren deschis, fără coroane). Terenul din jur se mută odată cu drumul și se racordează la relief.
  * **Parcarea**: pietriș de la asfalt până la un zid scund de piatră cenușie (0,6 m), la 17–27 m de drum. Ortofotourile (mai vechi) au încă două case pe locul ei; în joc nu mai sunt.
  * **Restaurantul**: conturul din OSM are 40 m de-a lungul drumului, dar captura arată lângă drum doar capătul lui de sud. E o casă albă cu etaj (streașina la 4,85 m), cu acoperiș de tablă maro în două ape, cu coama perpendiculară pe drum (la 7,15 m). Spre drum are o aripă mai îngustă, sub un acoperiș propriu, mai jos, cu reclama Coca‑Cola la etaj. Partea dinspre răsărit și cea din spate sunt mai retrase, în spatele tuielor.
  * **Detalii**: terasa acoperită pe stâlpi de lemn închis, cu vitrine în umbră, umbrela albă mare, umbrela albastră strânsă, două steaguri roșii tip „pană”, felinarul alb cu două globuri, lada frigorifică albă, tabla de meniu și ghivecele. Lângă drum sunt panoul roșu de meniu pe stâlp și stâlpul alb de beton, mai încolo.
  * **În dreapta**: sedanul albastru-închis parcat cu botul la zid (poți urca în el), un șir de tuia înalte în spatele zidului și lângă terasă, două căsuțe roșii printre ele, un molid mare și pădurea de foioase din spate.
  * **Aproximat**:
    * forma exactă a acoperișurilor (captura are casa la ~45 m, la rezoluție mică);
    * rândurile de pe panoul de meniu nu se citesc, deci sunt generice;
    * vegetația e verde, nu de toamnă, iar cerul e cel din joc;
    * dubița albă și mașinile din trafic nu sunt în joc;
    * în joc, ochiul e la 1,6 m, nu la 2,5 m ca în Street View.
* **DN1 la pasarela roșie de la ieșirea spre Breaza (poza 67, captura ta Street View din 2021, cu 45,1721232° N, 25,6883978° E)** (`src/geo/pasarela.js`). E pe sensul spre Breaza, la ~700 m după restaurant.
  * **Camera**: captura e mărită și făcută cu ~130 m înainte de pasarelă. Unghiul de vedere (33,5° pe verticală) reiese din segmentele liniei dintre benzi: 3 m la fiecare 12 m, ca în poza 66. Coordonata cade pe drumul de ieșire, la ~65 m în fața camerei. Camera e la 0,84 m în dreapta liniei dintre benzi, rotită 1,4° spre dreapta.
  * **Drumul**: de la restaurant încolo, carosabilul e mai îngust (6,6 m între liniile de margine), cu parapetul la 3,85 m de linia dintre benzi, măsurat pe captură. Cele 2 benzi pe sens și parapetul (poziționat după ortofoto Esri) continuă până la următoarea intersecție, la ~1,5 km după pasarelă.
  * **Profilul în lung**: relieful urca aici 9 m în 100 m (coroanele pădurii). Drumul e acum drept de la restaurant la pasarelă (1,3%) și e pus cu 2,4 m sub ieșire, cât are zidul dintre ele în captură. Apoi urcă ~2,5% până la ~250 m după pasarelă, unde se racordează la relief.
  * **Ieșirea spre Breaza (DC1)**: se desparte de marginea DN1 la ~10 m în fața camerei și urcă pe o treaptă ținută de un zid de beton (0,7 m unde începe, ~2,8 m la pasarelă), cu parapet metalic deasupra, până la intersecția de pe deal. Drumul de întoarcere coboară înapoi în DN1 după pasarelă.
    * Grila de relief de 10 m nu poate ține un zid între două drumuri aflate la 0,5 m unul de altul. De aceea treapta e construită peste teren (se poate merge și conduce pe ea), iar sub DN1 terenul rămâne plat.
    * Ieșirea e mutată cu ~2 m spre exterior față de OSM, cum arată poza.
  * **Pasarela**: arc metalic vopsit roșu, ~22 m între capete, cu partea de jos a tablierului la 5,9 m deasupra DN1 și arcul la 10,7 m.
    * Pe laterale are bannere albe cu roșu, decolorate, iar la capete balustrade din zăbrele.
    * La vest: un pilon alb de beton și o scară dreaptă care coboară spre sud.
    * La est: un pilon subțire pe treaptă și o incintă înaltă (maro închis, apoi panouri gri-deschis) la capătul tablierului.
    * Se poate urca pe scară și traversa.
  * **Terenul de sub sensul opus**: după porțiunea nivelată, grila de 10 m era plată doar până la 8 m în stânga axului. Banda exterioară a sensului spre Câmpina stătea pe malul văii: marginea ei ajungea cu până la 1,3 m sub ax, iar mașinile se înclinau 13°. Acum terenul e plat pe toată lățimea ambelor sensuri până la capătul porțiunii (~1,4 km după pasarelă). Lângă calea ferată, care vine până la 27 m de ax, zona nivelată e cu 3 m mai îngustă.
  * **În jur**: parapetul metalic de pe marginea exterioară a sensului opus, cu un parapet de beton în fața pilonului; malurile albe de marnă de pe dealul din față (zonele albe din captură proiectate pe relief, fără copaci); pădurea de foioase de pe ambele părți.
  * **Aproximat**:
    * textul de pe bannere nu se citește, deci e generic;
    * forma exactă a malurilor (proiecția din captură pe un relief de 10 m);
    * vegetația e verde, nu de toamnă, iar cerul e cel din joc;
    * mașina roșie din trafic nu e în joc;
    * în joc, ochiul e la 1,6 m, nu la 2,5 m ca în Street View.
* **Strada Mihai Viteazul, de la intersecția de lângă pasarelă până la casa cu poarta aurie (pozele 68–72, capturile tale Street View din iunie și septembrie 2022, cu 45,1726527° N, 25,6893172° E)** (`src/geo/viteazul.js`, scara de est în `src/geo/pasarela.js`). Drumul urcă de pe ieșirea din poza 67 spre Breaza.
  * **Camerele**: pozele 69–71 sunt de pe mașina Google care cobora spre DN1, cu privirea întoarsă în sus pe stradă. Poza 68 e privirea spre poartă, iar poza 72 e de pe ieșire, chiar înainte de intersecție. Distanța focală a capturilor (~870 px) reiese din poartă, din bordură și din panta drumului. Coordonata ta e poziția din poza 69, dar cade cu ~4 m la nord de carosabil (GPS-ul sub copaci), așa că acolo camera e pusă pe banda de nord.
  * **Drumul**: după ortofoto (doar pentru măsurători), în dreptul caselor are liniile de margine la 6,2 m una de alta, iar linia din mijloc e cu 0,95 m la sud de linia din hartă. Mai jos, spre intersecție, se îngustează la 4,1 m între linii (măsurat din poze, cu camera la 2,5 m). Linia din mijloc e continuă, iar în curbele de lângă intersecție e dublă.
    * La nord e o rigolă de beton cu podețe la intrările în curți și o balustradă neagră.
    * La sud: bordură, peluză, apoi un taluz abrupt cu iederă și salcâmi, care la intersecție se termină cu un zid jos de piatră.
    * Terenul de aici e refăcut la 1 m, pentru că grila de 10 m nu poate ține o rigolă, o bordură sau un taluz. Zonele fine de teren merg acum și în grila mare.
  * **Poarta (poza 68)**: stâlpi placați cu piatră, la 3,6 m unul de altul și înalți de 1,9 m, cu capace de beton. Între ei: poarta dublă și portița aurii, cu bare și volute, și cutia poștală neagră.
    * Aleea coboară spre casa principală (două niveluri, acoperiș de țiglă) între ziduri albe; pe zidul de est stau rame ruginite.
    * În stânga: peluza cu căminul, gardul închis la culoare din șipci și trandafirul de lângă stâlp.
    * Mai departe: casa veche din lemn cu acoperiș ruginit, dovlecii în câmp, copacul uscat, stâlpii de curent și firele.
  * **Scara de est a pasarelei (poza 72)**: coboară spre sud de la un podest din fața incintei maro, pe treaptă, lângă ieșire. Are balustrade galbene și vanguri brun-roșcate; se poate urca.
    * Lângă ea: parapetul spre intersecție, stâlpul de iluminat cu indicatorul rotund de interzicere, placa albă și plăcuța albastră a străzii, plopii din dreapta.
  * **Aproximat**:
    * textul de pe plăcuța albă nu se citește;
    * forma exactă a caselor vine din hartă (culorile din poze și din ortofoto);
    * vegetația e generică;
    * profilul în lung al străzii vine din relieful de 30 m, netezit;
    * în joc, ochiul e la 1,6 m, nu la 2,5 m ca în Street View.
* **Unreal Engine 5** (`unreal/README.md`): exportul întregii lumi pentru UE 5.5+ și importul automat.
  * `tools/export-unreal.bat` (Windows, cu Node.js și Edge) sau `node tools/export-unreal.mjs`: construiește jocul la calitate Ultra și scrie ~800 MB în `unreal-export/`:
    * 329 de tile-uri glTF de 1 km, cu terenul exact și lumea statică (14,3 milioane de triunghiuri);
    * 653 de materiale PBR și 285 de texturi;
    * 4,1 milioane de copaci (plus 1,4 milioane de arbuști), mașinile parcate;
    * camerele celor 83 de poze, soarele și originea geografică.
  * Toate fișierele glTF trec validatorul Khronos fără erori. `tools/verify-unreal-export.html` refacă vederile pozelor doar din export.
  * `unreal/import_poiana.py` rulează în Unreal Editor și face:
    * calibrarea importului glTF;
    * texturile și materialele master construite nod cu nod: PBR, frunziș cu vânt, sticlă, vopsea clear coat, shaderul terenului în HLSL, apa;
    * tile-urile Nanite cu coliziune exactă, copacii ca HISM, mașinile;
    * CineCamera pentru fiecare poză;
    * soarele real, atmosfera, norii volumetrici și Lumen.
* **Biserica pictată „Adormirea Maicii Domnului”, cimitirul și curtea școlii „Inv. Ion Mateescu” (pozele 73–76, capturile tale Street View din iunie 2022, cu 45,1313834° N, 25,7076591° E)** (`src/geo/biserica.js`).
  * **Camerele** sunt calculate din direcțiile spre repere cunoscute (clopotnița porții, turnul bisericii, colțul școlii, stâlpii portocalii ai aleii), cu distanța focală a capturilor (~870 px) și camerele 74–75 legate de drumurile de lângă cimitir.
  * **Incinta** (măsurată pe ortofoto, doar pentru măsurători): patrulater de ~47 × 70 m cu zid de piatră de 2,8 m și copertină. Are o ușiță în zidul de vest și clădirea lungă a parohiei, cu acoperiș de tablă și perete de lemn, lipită de zidul de vest.
  * **Clopotnița de la poartă** (poza 76):
    * corp alb cu arcadă prin care se poate trece;
    * icoana Maicii Domnului pictată deasupra;
    * streașina de șindrilă;
    * clopotnița deschisă, cu stâlpi albi;
    * acoperișul înalt de șindrilă, piramidal, cu cruce.
  * **Biserica**: pereții pictați (sfinți în chenare arcuite pe fond albastru, pe două registre) pe soclu. Are absidele laterale și absida altarului, acoperișurile mari de șindrilă și turnul alb peste naos, cu ferestre, acoperiș piramidal și cruce. Conturul din OSM (decalat cu ~8 m) e înlocuit.
  * **Cimitirul** între incintă și cele două drumuri: ~1070 de morminte în rânduri (rame de beton, cruci de marmură albă, plăci de granit negru, cruci și grilaje de fier), cu alei, gard de plasă pe soclu spre drum și cei doi brazi triangulați din pozele 74 și 76.
  * **Curtea școlii** (pozele 73, 76): gardul de plasă pe soclu cu indicatorul albastru „P PARCARE”, stâlpii portocalii ai aleii, asfaltul cu locurile de parcare marcate, casa albă cu frontonul de lemn de lângă alee. Școala primește culorile din poze (tencuială ca piatra, acoperiș maro, două niveluri).
  * **Aproximat**:
    * frescele sunt o compoziție generică, nu copia picturii reale;
    * mormintele sunt așezate procedural pe rândurile din ortofoto, nu fiecare în parte, și nu au coliziune;
    * interiorul bisericii nu e modelat;
    * cerul e cel din joc.
* **Str. Uzinei (în OSM „Strada Dimitrie Gusti”), de la Primărie până la intersecția cu STOP, și Strada Bisericii (pozele 77–83, capturile tale Street View din octombrie 2024 și iunie 2022, „4PH6+MJX Poiana Câmpina”)** (`src/geo/uzinei.js`).
  * **Camerele**: fiecare hartă din capturi a fost suprapusă pe ortofoto Google (~300 de puncte comune pe hartă). Centrul discului albastru dă poziția, săgeata dă direcția.
    * Pozițiile din hărți ies decalate sistematic cu 1,5–3,5 m spre sud-vest; camerele sunt puse pe banda pe care o arată poza (bordura, mașinile parcate, zidul).
    * Poza 77 (fără hartă) e mai jos de Primărie, la ~s 380, privind în sus spre uzină: se recunosc insula vopsită din stânga, gardul pe soclu de piatră și magazinul cu etajul vitrat din dreapta. Codul plus dat cade la ~65 m de acolo, în dreptul Primăriei.
  * **Drumul** (măsurat pe ortofoto, doar pentru măsurători): linia din hartă e cu 2–3 m pe lângă asfalt.
    * Carosabilul are 7,2 m sub intersecție și ~9 m în dreptul halelor.
    * Pe partea uzinei e o bordură vopsită alb-negru, cu goluri la porțile curții, și un trotuar de beton.
    * Pe partea caselor: zidul de sprijin (2,6 m, cu treaptă de beton la bază) sub clădirea cu turn, gardurile de scânduri și de bare, gardul zincat pe soclu de piatră al parcării.
    * Sub Primărie: insula mediană vopsită, banda de acces și gardul pe soclu.
    * Terenul e refăcut la 1 m: trotuarele, treapta, pământul de deasupra zidurilor. Profilul în lung vine din relieful de 30 m netezit (pantă de până la ~13% între s 60 și s 150).
  * **Clădirile PetroUtilaj** (măsurate pe ortofoto, înlocuiesc conturul OSM):
    * hala lungă cu ferestre pătrate cu gratii și acoperiș într-o apă cu luminator (poza 81);
    * hala dinaintea ei, în trepte;
    * biroul cu trei niveluri, cu benzi de ferestre verzi și sigla pe fațadă, cu coșul metalic la colț și iedera roșie pe gard (poza 78);
    * anexa cu copertină și clădirea cu ferestre în bandă (poza 78);
    * hala lungă cu acoperiș ruginit din spatele parcării, cu banda de ferestre verzi (poza 79).
  * **Clădirea cu turn de deasupra zidului** (pozele 80–81): corp cu două niveluri, acoperiș roșu cu lucarne, turn pătrat cu fereastră rotundă și acoperiș piramidal.
  * **Intersecția (poza 83)**: indicatorul STOP, stâlpul de iluminat, stâlpul cu postul de transformare, Kangoo-ul roșu.
  * **Strada Bisericii (poza 82)**, refăcută pe ortofoto: bordura vopsită, zebra, zidul de sprijin cu spalierul de viță, trotuarul și gardul alb din șipci, linia de margine întreruptă.
  * **Mașinile**, ca în poze: BMW-ul negru și hatchback-ul roșu la bordură, mașinile din parcarea uzinei și din parcarea din spatele gardului, Peugeot-ul argintiu, Transporterul alb, Kangoo-ul roșu (modele noi: Renault Kangoo și VW Transporter).
  * **Aproximat**:
    * forma caselor de pe partea de sud-vest vine din hartă;
    * acoperișurile halelor sunt deduse din ortofoto și din pozele din stradă;
    * vegetația e generică (fără culorile de toamnă);
    * cerul e cel din joc;
    * în joc, ochiul e la 1,6 m, nu la 2,5 m ca în Street View.
  * Mașinile generate la întâmplare nu mai apar la mai puțin de 60 m de camerele pozelor (în poze sunt doar mașinile reale).
* **Sondele din pădure și drumul de pietriș spre ele (pozele 84–86, pozele tale, „45.1044027, 25.7210507”)** (`src/geo/sonda.js`).
  * **Locul**: drumul de pietriș din OSM (way 338364635) se termină la coordonată; de acolo un drumeag duce ~30 m spre sud, în luminișul de pe culme (în relief, o terasă aproape plană; platforma e nivelată). Unitățile nu sunt în OSM: mijlocul liniei lor e pus pe petele deschise din ortofoto (Esri, z18), ~35 m la sud de capătul drumului.
  * **Așezarea, din poze**:
    * ambele balansiere se văd din profil, cu capetele de cal spre exterior, pe aceeași linie (azimut ~195°): Vulcanul la nord-nord-est, unitatea ruginită la sud-sud-vest;
    * în poza 85 soarele (sus, ~50–55°, dimineața) e în mijlocul cadrului, deci camera privește spre ~130°; de aici iese direcția liniei;
    * scara vine din dubiță (Fiat Doblò, 1,82 m înălțime): orizontul, apoi înălțimea pivoților deasupra lui. Pivotul Vulcanului e la ~7,5 m, al unității ruginite la ~6,2 m; ~17–18 m între ei;
    * dulapurile sunt între garduri; stâlpul cu proiector e la ~2 m în spatele lor (în poza 85 apare în stânga dulapului înalt, în poza 84 în dreapta lui).
  * **Unitățile** (balansiere convenționale), animate cum lucrează mecanismul real (patrulater articulat):
    * manivela învârte contragreutățile, bielele trag coada balansierului;
    * capul de cal e un arc de cerc cu centrul în pivot, așa că dispozitivul de suspendare cu cabluri atârnă mereu vertical, de la înălțimea pivotului, și urcă și coboară tija lustruită prin presetupă;
    * Vulcanul face ~6 curse pe minut, cealaltă ~7.
  * **Vulcanul**: postament albastru cu scară verticală și cușcă de protecție până la platforma cu balustradă din jurul lagărului; balansier albastru cu sigla „Vulcan”; biele, manivele și contragreutăți galbene; carcasa galbenă a curelelor coboară spre motor.
  * **Unitatea ruginită**: balansierul și capul de cal ruginite, cutia galbenă de la coadă, bielele albastre, roata de curea galbenă cu spițe (neacoperită), capul de erupție cu presetupa, robinetele și conducta.
  * **Restul**:
    * gardurile din plasă sudată, cu stâlpi albaștri și indicatoare de securitate;
    * dulapurile electrice albe (unul pe picioare), cutia gri, stâlpul de beton perforat cu proiector;
    * dalele vechi crăpate, pietrișul cu buruieni și pete umede;
    * fâșia de iarbă uscată de la garduri, iarba înaltă cu morcov sălbatic în garduri și în pajiștea de la sud;
    * dubița roșie, Fiat Doblò Cargo (V67).
  * **Balta** e o oglindă pe orice vreme: reflexiile din ecran (până acum doar pe ploaie) pornesc când ești la mai puțin de 70 m de ea. Sub zăpadă dispare.
  * **Drumul prin pădure (poza 86)**:
    * pietriș gri-maroniu de ~3,6 m, cu două făgașe și frunze uscate pe margini;
    * harta pădurilor lăsa în jurul lui un culoar de iarbă de ~15 m; acum pădurea (fagi, carpeni, stejari crescuți în masiv, cu trunchi drept) vine până la 3 m de axul drumului, iar solul de pe margini e acoperit de frunzele de anul trecut;
    * stâlpii de sat generați de-a lungul lui au dispărut: nu e nicio casă și nicio linie electrică cartată acolo, iar în poză nu apar.
  * **Remodelate în V59, piesă cu piesă, după cum sunt construite cele reale**:
    * **reductorul**: flanșa de îmbinare a carcasei la înălțimea arborilor, cu șuruburi, aerisitorul și capacul de vizitare de pe dom;
    * **motorul**: carcasă cu nervuri de răcire pe lungime, capota ventilatorului, cutia de borne și cablul care coboară în pământ (spre dulapuri);
    * **frâna**: tamburul de pe arborele de intrare, banda și tija până la maneta de la capătul sasiului;
    * **balansierul**: rigidizări pe inima profilului I la ~0,7 m, plăcile peste lagărul central și șuruburile lor; **balansierul egalizator** cu lagărul de coadă și lagărele bielelor;
    * **capul de cal**: flanșele canalului de cablu de pe față și cele două cabluri așezate în canal, cu ancora de sus;
    * **manivelele**: găurile pentru bolțul bielei (pentru reglarea cursei), contragreutățile în două bucăți pe fiecare parte, prinse cu șuruburi, și rulmentul bielei pe bolț; **bielele** sunt acum profile I, nu bare pline;
    * **capul de erupție**: prevenitorul de tijă sub presetupă, cu mânerele T ale bacurilor, manometrul pe teu și clapeta de reținere pe conductă;
    * **gardurile**: capace pe stâlpi, stâlpi de colț mai groși cu contrafișe, fundații de beton și câte o **poartă dublă** spre platformă (stâlpi grei, două canaturi cu ramă și plasă, balamale, zăvor vertical și lacăt);
    * **dulapurile electrice**: soclu, ramele ușilor, balamale, mâner, fante de aerisire, iar sub cel de pe picioare tuburile de cabluri care intră în pământ;
    * **stâlpul de beton perforat**: tălpile se îngustează spre vârf (0,22 → 0,12 m), ca la stâlpii vibrați reali (înainte erau puse greșit, pe lat), cu capac; proiectorul e un LED subțire, cu radiator cu nervuri, sticla înclinată în jos, braț și cablu pe stâlp până la tubul de la bază;
    * **dalele**: au acum grosime (~10 cm, ies ~6 cm din pietriș) și muchii ciobite;
    * **balta**: are pe margine o fâșie de mâl mai închis și mai maroniu.
  * **Remediat în V67** (`src/doblo.js`, `src/geo/sonda.js`, `src/shafts.js`, `src/geo/terrain.js`, `src/geo/trees.js`):
    * **Dubița roșie e un Fiat Doblò Cargo**, prima generație (tip 223), după facelift-ul din 2005, nu un Kangoo.
      * Dimensiunile reale: 4253 × 1722 × 1818 mm, ampatament 2583 mm (Wikipedia; fișe tehnice). Forma e luată din pozele laterale, din față și din spate ale modelului (Wikimedia Commons) și din poza ta 85.
      * Ce o face Doblò: spatele orb, cu ușă culisantă și panouri presate; șina ușii culisante pe aripa din spate, la nivelul umărului; benzile negre de protecție și mânerele negre; oglinzile mari, negre, pe două brațe; stopurile înalte (roșu, alb, roșu) în ornamentele negre din colțuri; ușile din spate 60/40; a treia lampă de frână; barele din plastic nevopsit; farurile mari ale facelift-ului, cu două reflectoare; grila neagră cu sigla Fiat; antena de pe plafon; bușonul de rezervor pe stânga.
      * Cabina e după poza ta de la volan: bord gri, cu cele patru fante de dezaburire, cutia deschisă de deasupra și cozorocul ceasurilor. În spatele scaunelor e peretele despărțitor.
      * Vopseaua e roșul Fiat, oxidat și mat, ca pe capota din poză.
      * Se conduce ca 1.3 Multijet: ~16 s până la 100 km/h, ~155 km/h.
    * **Ecranul negru de pe platformă.** Privind spre soare, sclipirea lui pe un geam depășea plafonul formatului de 16 biți al imaginii.
      * Razele de soare (V65) citeau imaginea înainte de filtrul care curăță astfel de pixeli. Razele și apoi strălucirea (bloom) întindeau valoarea pe tot cadrul, care ieșea negru.
      * Acum masca razelor curăță pixelul la intrare. Bugul putea apărea oriunde pe hartă, nu doar aici; e reparat peste tot.
    * **Fanta albă din iarbă**, din spatele unităților. Unde terenul e refăcut la 1 m (platforma, pasajele de sub calea ferată, terasele terenului de sport), un colț interior al zonei rămânea la înălțimea fină, iar vecinii lui la cea grosieră. Prin crăpătura dintre ele se vedea cerul. Acum colțurile împărțite cu o celulă păstrată sunt exact nodul ei, deci terenul e etanș.
    * **Drumul de pietriș ascuns sub iarbă** la intrarea pe platformă. Zona nivelată se termina exact unde se termina racordul cu terenul, iar celulele tăiate de marginea ei aveau iarba mai sus decât înălțimea folosită pentru drum. Acum zona trece cu o celulă dincolo de racord.
    * **Tufe și puieți pe drum** (poza 86). Subarboretul generat (alun, păducel, puieți de fag și carpen) și tufele de la marginea pădurii nu țineau cont de drum: creșteau pe pietriș și îți atârnau în față. Acum drumul și primul metru de lângă el rămân libere. Arbuștii și puieții puși pe margini stau la 3,4–5,5 m de ax și sunt mai mici.
    * **Capătul drumului.** Drumul din OSM se termina după cotitură și făcea un ac de păr cu drumeagul spre platformă. Acum cotitura e rotunjită, ca urma unui camion.
    * **Culorile, după pozele 84–86.** Dalele vechi erau mai închise decât pietrișul; în poze sunt mai deschise. Acum betonul are albedo ~0,33, pietrișul platformei și al drumului ~0,22 (înainte ~0,13).
    * **Marginea platformei** nu mai e un covor ridicat: pietrișul coboară spre iarbă și se rărește în ea pe ~1,4 m.
    * **Balta** are contur neregulat. De sus nu mai e o pată neagră: fundul mâlos se vede prin apă (~0,09), iar din unghiuri joase domină reflexia.
    * **Aproximat**: fața dubiței nu se vede în pozele tale; am pus facelift-ul (2006–2009). Varianta de dinainte diferă doar la faruri, grilă și bare.
  * **Aproximat**:
    * pozițiile exacte se pot abate cu 1–3 m: camerele, liniile și distanțele sunt reconstituite din poze, cu o eroare de câțiva metri;
    * modelele sunt făcute după poze, nu după planurile fabricantului;
    * cerul e cel din joc;
    * în joc, ochiul e la 1,6 m (în poza 86 era la ~1,25 m, din mașină).
* **Focul de tabără de lângă Fiatul roșu, la sonde (V82)** (`src/campfire.js`, `src/geo/sonda.js` FIRE, `src/main.js`, `src/share.js`, `src/audio.js`, `src/post.js`):
  * **Unde:** pe pietrișul platformei, la ~6 m vest de Doblò, departe de ușile lui, de baltă și de gardurile sondelor. Lângă foc e o buturugă de stat, iar lângă dubiță câțiva bușteni despicați, stivuiți.
  * **Tasta E** (la mai puțin de 2 m de foc) îl aprinde și îl stinge. Mesajul de pe ecran arată ce se întâmplă. Nu poți intra în foc (are coliziune). Peste buturugă și peste stivă poți păși.
  * **Stins:**
    * un cerc de 12 pietre de râu, afumate pe partea dinspre foc;
    * pietrișul ars în jur, cu marginea zdrențuită;
    * cenușă și jar;
    * patru lemne sprijinite în cort peste două puse de-a curmezișul, carbonizate unde le-a prins focul.
  * **Aprins:**
    * **Cum prinde:** întâi surcelele, apoi lemnele, în câteva secunde.
    * **Flăcările:** șapte limbi pe lemne, desenate dintr-o singură comandă (cu fața mereu spre tine). Fiecare e calculată din zgomot în shader: o lacrimă care se îngustează în sus, ruptă în limbi, cu fâșii care se desprind la vârf. Sunt roșu închis pe margini, portocalii, apoi galbene, aproape albe în miezul de jos. Rămân portocalii și în plină zi, iar noaptea strălucesc.
    * **Jarul și lemnele:** crăpăturile cărbunelui de pe lemne (crapă în solzi, ca lemnul ars) și jarul de dedesubt ard roșu, pulsând.
    * **Scânteile:** urcă și sunt purtate de vânt. Când pocnește lemnul (un nod, un buzunar de rășină) țâșnesc în rafală, odată cu pocnetul.
    * **Fumul:** fâșii de fum care se rotesc și se răresc. Ziua e gri, noaptea întunecat, luminat cald doar jos, de la flăcări.
    * **Aerul tremură** deasupra focului: o trecere scurtă după netezirea temporală, pornită doar când focul e aproape și în cadru.
    * **Lumina:** caldă (~1900 K), pâlpâie odată cu flăcările pe pietriș, pe dubiță și pe copaci. La calitatea Înaltă și Ultra aruncă și umbre: ale pietrelor, ale buturugii, ale stivei și ale dubiței.
    * **Sunetul:** vuietul moale al flăcărilor și trosnetele lemnului.
  * **Stingerea:** focul sfârâie, flăcările scad, jarul mai arde cam un minut și iese un fum mai gros și mai alb, ca dintr-un foc abia stins.
  * **Ploaia** îl ține mic. Ziua lumina lui abia se vede în soare, ca în realitate.
  * **Cu un prieten (multiplayer):** dacă aprinde sau stinge unul focul, se aprinde sau se stinge și la celălalt. Cine intră mai târziu îl găsește cum e.
  * **Cât costă:**
    * Flăcările, scânteile și fumul sunt câteva desenări, doar când focul e aprins și ești la mai puțin de 250 m.
    * Lumina e în scenă de la început, stinsă, ca shaderele să nu se recompileze când o aprinzi.
    * Umbrele ei se reface la fiecare al doilea cadru (Ultra) sau al treilea (Înaltă), doar noaptea și doar la mai puțin de 60 m.
* **Pădurea și scoarța copacilor (V83)** (`src/barktex.js`, `src/textures.js`, `src/materials.js` mossy, `src/geo/trees.js`, `src/geo/firs.js`, `src/geo/hillwood.js` litterTexture, `src/campfire.js`):
  * **Scoarța, specie cu specie, pornind din relief:** fiecare textură începe ca o hartă de înălțime (crăpături, plăci, solzi). Din ea ies și culoarea, și relieful (normal map), iar fundul crăpăturilor e umbrit. O placă de textură acoperă 0,55 m pe circumferință și 1,2 m pe înălțime, deci un trunchi gros repetă scoarța de mai multe ori în jur, nu o întinde. Rezoluția e 512 × 1024 (înainte 256 × 512).
    * **fag:** netedă, gri-argintie, cu cruste de licheni, riduri fine și „sprâncenele” rămase sub ramurile căzute;
    * **carpen:** netedă, cu dungi argintii verticale;
    * **gorun:** plăci lungi și neregulate, gri (~5 cm late, ~30 cm lungi), între brazde verticale adânci și închise, de ~2 cm, care se despart și se reunesc. Rupturile de-a curmezișul plăcilor sunt mult mai înguste. De la câțiva metri, trunchiul se vede brăzdat vertical. Ici-colo, licheni pe plăci;
    * **salcâm:** creste adânci, împletite, maro-cenușii;
    * **mesteacăn:** albă, cu lenticele orizontale, coajă care se desprinde în fâșii și pete închise mici;
    * **molid:** solzi mărunți, cenușii-roșcați;
    * **pin negru** (cel plantat pe dealurile din jurul Câmpinei): plăci lungi, cenușiu-închise, cu suprafața care se exfoliază mai deschisă, între brazde adânci, aproape negre;
    * **scoarța generică** (copacii de pe străzi, crengile, buștenii): crăpături oblice care se repetă fără cusătură.
  * **Mușchi și alge verzi** pe partea de nord (cea umbrită și umedă), până la 1–3 m, și de jur împrejur la baza trunchiului. Apar întâi în crăpături, unde rămân la fel de umbrite ca adâncitura (un verde închis, nu unul deschis care să „umple” brazda). Cel mai mult pe fag și carpen, mai puțin pe gorun, puțin pe salcâm, mesteacăn și pin. Partea de sud rămâne curată.
  * **Umbra coroanelor pe trunchi:** sub coroane, un trunchi vede mai puțin cer, cel mai puțin la bază. Lumina difuză (de la cer și din jur) pe scoarță e acum ~75 % la bază și ~95 % la 15 m. Soarele trece în continuare doar prin umbrele calculate. Am încercat și 40 %, dar trunchiurile ieșeau mai închise decât frunzele de pe jos, ceea ce în pădure nu se întâmplă.
  * **Luminozitatea fiecărei scoarțe** (albedo mediu, măsurat pe texturi): mesteacăn ~0,60, fag ~0,31, carpen ~0,20, gorun ~0,07, salcâm ~0,08, molid ~0,08, pin negru ~0,06. Ordinea e cea din pădure: mesteacănul cel mai deschis, apoi fagul gri-argintiu și carpenul; gorunul, salcâmul, molidul și pinul negru, mult mai închise. Înainte, în joc, aproape toate trunchiurile ieșeau gri-deschise, aproape albe.
  * **Molizii și pinii** au scoarța lor (înainte o aveau pe cea generică), la scara corectă pe circumferință (înainte era întinsă). Molizii detaliați din apropiere și alunul din subarboret își păstrează mușchiul: copia materialului îl pierdea.
  * **Buștenii de lângă focul de tabără** (V82) au acum scoarță de gorun, cu o nuanță neutră. Nuanța caldă de dinainte compensa vechea scoarță generică, prea închisă, și cu cea nouă ieșeau portocalii.
  * **Frunzele moarte de pe jos, la mărimea lor reală:** fag 5–9 cm, carpen mai mici, gorun 8–12 cm (lobate), ~9000 pe fiecare pată de 2,6–5 m. Unele sunt răsucite (o jumătate în umbră), toate au nervura de la mijloc, iar printre ele sunt crenguțe și cupe de jir. Înainte o frunză avea 10–40 cm.
  * **Cât costă:**
    * Texturile se generează la încărcare, pe procesor: ~3,4 s măsurat în mediul meu de test (pe alt calculator durează altfel).
    * În memoria plăcii video: ~43 MB pentru cele 8 scoarțe (culoare + relief, cu mipmap-uri), față de ~8 MB înainte. La calitatea Scăzută sunt la jumătate de rezoluție (~11 MB).
    * Mușchiul și umbra coroanelor sunt câteva instrucțiuni în plus în shaderul scoarței, fără texturi noi.
* **Copacii în vânt (V84)** (`src/treewind.js`, `src/geo/broadgen.js`, `src/geo/trees.js`, `src/geo/firs.js`, `src/vegetation.js`, `src/materials.js` addWind, `src/main.js`, `src/lighting.js`, `src/audio.js`):
  * **Înainte** se mișcau doar frunzele, cu o oscilație simplă, iar trunchiurile și crengile stăteau fixe: frunzele „pluteau” pe lângă crengi, umbrele nu se mișcau, iar direcția vântului nu conta.
  * **Acum tot copacul ia vântul, ca în realitate**, pe trei niveluri, ca în jocurile mari (Crysis, SpeedTree):
    * **Trunchiul** se îndoaie în direcția vântului ca o grindă prinsă la bază (deplasarea crește cu pătratul înălțimii) și își păstrează lungimea: fiecare punct se rotește în jurul bazei, nu alunecă. Cât se îndoaie depinde de presiunea vântului pe coroană (~viteza la puterea 1,4, pentru că frunzele și crenguțele se strâng în vânt puternic). În jurul poziției aplecate se leagănă cu frecvența proprie a copacului, ~4,5 / înălțime Hz: ~0,2 Hz un copac de 20 m, ~1 Hz un puiet de 5 m. Se leagănă mai mult în lungul vântului decât de-a curmezișul, într-o elipsă.
    * **Crengile** se leagănă fiecare cu faza ei (0,75–1,35 Hz): împinse în direcția vântului, cu un balans în sus și în jos. Se mișcă mai mult crengile lungi și vârfurile. Frunzele de pe o creangă merg cu ea, deci rămân pe creangă. Tufele, fiind scurte și mai rigide, se mișcă mai puțin.
    * **Frunzele** fâlfâie (3–7 Hz, fiecare colț al unui mănunchi cu faza lui), deja de la o adiere. Acele de molid și de pin tremură mai puțin.
  * **Rafalele călătoresc prin pădure:** vântul are un câmp de rafale (~55 m în lungul vântului, ~30 m de-a curmezișul) purtat chiar de vânt (ipoteza turbulenței „înghețate” a lui Taylor). Vezi rafala cum trece peste pădure, coroanele aplecându-se una după alta. Aceleași rafale trec și prin iarbă, buruieni, ferigi și garduri vii, care acum se apleacă în direcția vântului (înainte se legănau în direcții la întâmplare).
  * **Umbrele se mișcă odată cu copacii:** trunchiurile, crengile și frunzele își mișcă și umbra, la soare și la lumina focului de tabără.
  * **Cât de tare bate** (viteza la nivelul coroanelor, după scara Beaufort):
    * după vreme: senin ~2,5 m/s, parțial noros ~3,5, înnorat ~2, ploaie torențială ~5, ninsoare ~2,5, zăpadă cu senin ~1,5, cu urcări și coborâri lente. În ploaia cu rafale și în viscol bate vijelia vremii respective, cu rafalele ei;
    * **tasta B** alege viteza: calm (0,5 m/s), adiere (3 m/s: frunzele foșnesc), vânt moderat (7 m/s: se mișcă ramurile mici), vânt tare (12 m/s: se mișcă ramurile mari, copacii se leagănă), vijelie (20 m/s: copacii se apleacă în rafale). Încă o apăsare revine la „după vreme”. Alegerea se păstrează.
    * Ce vezi, pe scara Beaufort: la 2 m/s frunzele abia se mișcă; la 3–5 m/s frunzele și crenguțele sunt în mișcare continuă; la 6–8 m/s se mișcă ramurile mici; la 11–14 m/s ramurile mari; peste 14 m/s copacii întregi; la 20 m/s coroanele se zbat și se apleacă mult în rafale.
  * **Foșnetul frunzelor:** printre copaci se aude frunzișul în vânt, tot mai tare și mai ascuțit pe măsură ce se întețește, în valuri, odată cu rafalele. Iarna, cu crengile goale, se aude mult mai încet. Vuietul vântului crește și el cu viteza.
  * **Toți copacii:** foioasele din hartă și din păduri (fag, carpen, gorun, salcâm, mesteacăn, tufele din subarboret), molizii (și cei detaliați din apropiere, cu același vânt, ca să nu sară când se schimbă modelul), pinii, copacii și tufele de pe stradă, iar de departe și copacii-imagine (doar trunchiul se îndoaie).
  * **Cât costă:** totul se calculează în shaderul de vârfuri, fără texturi noi și fără treceri de randare noi. Numărat la calitatea Medie, în pădure: copacii încărcați în jurul tău au ~12 milioane de vârfuri care trec prin codul de vânt, din care ~8 milioane aruncă umbre (înainte ca placa video să le taie pe cele din afara câmpului vizual). Ca să rămână ieftin:
    * leagănul crengilor se calculează doar până la ~140 m, iar fâlfâitul frunzelor doar până la ~70 m (mai departe se vede doar îndoirea trunchiului);
    * zgomotul rafalelor folosește un hash fără funcții trigonometrice;
    * iarba folosește o singură octavă de rafală.
    * cât scade FPS-ul pe o placă video reală n-am putut măsura aici: testele rulează cu randare software.
* **Mâinile refăcute, în mănuși tactice ca în clipul tău (V87)** (`src/handgeo.js`, `src/hand.js`, `src/weapon.js`):
  * **Umflătura de la încheietură, scoasă la cauză:**
    * capătul rotunjit al antebrațului ieșea prin dosul palmei, ca o bilă. Antebrațul, pus de cinematica brațului de la umăr, intra în mână cu 44° (stânga) și 62° (dreapta) abatere față de încheietura sculptată, iar la ochire, la alergare și la reîncărcare cu până la 107°;
    * acum antebrațul e întors spre axa manșetei mănușii, până la cel mult ~13° abatere: încheietura se îndoaie în manșetă. Cotul și umărul se mută după el, în afara ecranului;
    * mâna stângă e rotită pe încărcător (−107°) și pe închizător (+26°), ca încheietura ei să stea în linie cu brațul;
    * măsurat în toate pozițiile (stând, ochind, alergând, lângă zid, pe toată reîncărcarea): îndoirea maximă e ~13°.
  * **Mănușa e sculptată peste mână, nu doar vopsită:**
    * material sintetic negru, căptușit (~1,7 mm peste mână), fără unghii;
    * pernuțe de cauciuc mulat pe dosul primelor două falange ale fiecărui deget, perforate, ca în clip;
    * o bandă de cauciuc moletat peste cele patru încheieturi ale degetelor;
    * manșeta: un tub căptușit în jurul încheieturii, lung de ~5 cm, cu capătul drept (nu rotund: antebrațul iese din el) și tiv la margine. Are o clapă cu arici lată de 2,9 cm, mai groasă cu 2,6 mm, cu cusătură de jur împrejur;
    * un inel metalic (D-ring), cusut pe manșeta mănușii drepte, pe partea degetului mic, ca în clip;
    * tricot cu dungi pe degetul mare și pe lateralele degetelor, un panou de plasă pe dosul palmei spre degetul mic, cusături pe dosul palmei, în jurul pernuțelor, al benzii și la manșetă.
  * **Materialele:**
    * țesătura: gri foarte închis, cu fibre fine, câteva puncte care prind lumina și un luciu moale la margini;
    * cauciucul pernuțelor: gri închis, mai neted, cu găurile mai închise;
    * tricotul are dungi de 1,5 mm, iar ariciul e mat și scămoșat;
    * modelele sunt reliefuri de câteva zecimi de milimetru. Acolo unde ar fi mai fine decât pixelii, se estompează, ca să nu facă moar.
  * **Antebrațele** rămân goale (tricou), ca în clip, și ies din manșete. Mâinile de la volan au rămas cum erau, fără mănuși.
* **Glock-ul ca în clipul tău (V86)** (`src/weapon.js`, `src/hand.js`): clipul tău a fost măsurat cadru cu cadru (60 de cadre pe secundă), iar arma îl urmează.
  * **Cum e ținută:** în mijlocul ecranului, puțin sub linia privirii, cu ambele mâini, înclinată câteva grade spre dreapta, ca în Call of Duty-urile moderne. Spatele închizătorului stă unde e și în clip (~54 % din lățime, ~61 % din înălțime). Când alergi, arma rămâne vizibilă jos, înclinată (înainte ieșea din ecran).
  * **Reîncărcarea (R), după clip:**
    * arma urcă în dreapta mijlocului, întoarsă pe o parte, cu țeava în sus și spre stânga și partea stângă spre tine (~0,18 s);
    * mâna stângă prinde baza încărcătorului și îl trage afară de-a lungul mânerului (0,28–0,43 s), coboară cu el, îl pune la centură și ia unul plin;
    * revine, îl introduce și îl împinge până intră (1,15–1,28 s), iar arma tresare;
    * mâna stângă se întoarce pe mâner (~1,5 s), iar arma e din nou în centru la 1,8 s;
    * **pe gol** (~2,15 s): încărcătorul gol cade singur (rămâne pe jos), apoi la fel, plus armarea închizătorului.
  * **Reculul, măsurat pe clip:**
    * cadrul focului arată închizătorul în spate și tubul care zboară;
    * apoi arma sare în mâini, rotită în jurul mâinilor, nu al țevii: ~12–15° în sus, puțin spre stânga și răsucită, și ~3 cm spre tine;
    * atinge vârful la ~32 ms și dispare în ~90 ms, ca în clip; mișcarea e aceeași la orice FPS;
    * ochind, reculul e de ~2,5 ori mai mic;
    * în rafală, fiecare cartuș o ridică mai puțin (mâinile o țin apăsat), dar arma tremură vizibil, iar privirea urcă.
  * **Mănuși tactice negre** (refăcute în V87, vezi mai sus):
    * material textil mat, cu țesătură fină;
    * pernuțe peste încheieturile degetelor, cute mai închise și vârfurile degetelor acoperite;
    * manșeta peste încheietura mâinii, din același material;
    * antebrațele rămân goale (tricou).
  * **Tubul și fumul, la orice câmp vizual (reparat):** în modul de câmp vizual „natural” (îngust, implicit), tubul aruncat și fumul de la țeavă apăreau de câteva ori mai mari decât arma (de ~4 ori la 14°), iar tubul ieșea din ecran într-un cadru. Arma se desenează cu lentila ei, dar ele nu. Acum tubul zboară prin aceeași lentilă ca arma cât timp îl vezi, apoi cade în lume la mărimea lui reală. Fumul are și el mărimea potrivită. Verificat: la 14° și la 55° tubul, fumul și flacăra arată la fel lângă armă.
  * **Flacăra:** în clip e un pistol fără amortizor, cu flacără mare la țeavă la fiecare foc. Glock-ul tău are amortizor, care stinge flacăra. Doar primul foc după o pauză (peste ~2 s) face o scurtă flacără portocalie în jurul capătului amortizorului, timp de 2 cadre: aerul rămas în amortizor arde gazele (efectul real, numit „first round pop”). Următoarele cartușe lasă doar un mic fum.
* **Harta care nu se desena la calitatea Înaltă și Ultra (reparat în V85)** (`src/campfire.js`, `src/geo/terrain.js`, `src/main.js`):
  * **Ce se vedea:** la calitatea Înaltă (implicită pe calculatoarele cu 8 sau mai multe fire de execuție) și la Ultra, harta nu apărea: lipseau terenul, drumurile, casele și mașinile, deși te puteai mișca.
  * **Cauza 1 (din V82):** focul de tabără are la aceste calități o umbră proprie (o lumină punctiformă), desenată doar noaptea, când arde. Ziua harta ei de umbră nu exista încă, iar three.js r186 pune în locul ei o textură goală de alt tip. Placa video respinge atunci orice desen al materialelor luminate („Mismatch between texture format and sampler type”), adică aproape tot. Măsurat în test, la Înaltă: sute de desenări respinse pe cadru (asfalt, borduri, pietriș, metal, iederă…); la Medie, zero. Acum umbra focului are o hartă desenată din primul cadru, ca soarele, raza lunii și lanterna. După reparație: zero desenări respinse.
  * **Cauza 2:** materialul terenului avea nevoie de 17 texturi simultan la Înaltă: 12 proprii plus câte una pentru fiecare lumină cu umbră. Majoritatea plăcilor video dau WebGL doar 16, iar peste această limită shaderul nu se leagă și terenul nu se desenează. În testele mele, randarea software dă 32, de aceea problema nu apărea acolo. Am reprodus-o emulând o placă de 16 unități: versiunea publicată nu putea lega shaderul terenului.
    * **Reparat:** cele trei texturi de detaliu ale terenului (iarba, pământul, pietrișul) sunt acum straturile unei singure texturi-tablou, deci terenul are 10 texturi proprii. La Înaltă ajunge la 15, sub limită.
    * **Plasă de siguranță:** la pornire, jocul citește limita reală a plăcii video și, dacă tot s-ar depăși, renunță întâi la umbra focului de tabără, apoi la cea a razei lunii, apoi la cascadele îndepărtate ale umbrei soarelui. Dacă totuși un shader nu se leagă pe placa ta, renunță la încă o umbră și reîncearcă.
* **Glock 18 cu amortizor, în bandă albă de iarnă (V85)** (`src/glock.js`, `src/weapon.js`, `src/hand.js`, `src/handgeo.js`, `src/driver.js`, `src/input.js`, `src/player.js`, `src/audio.js`, `src/main.js`):
  * **Unde e:** pe placa de beton a crucii de pe deal, în partea dreaptă, între două picioare ale crucii. Stă culcat pe o parte, cu trei încărcătoare de rezervă alături. Când ajungi lângă el (sub ~2 m), apare „E — ia Glock 18-ul…”; cu E îl iei, împreună cu încărcătoarele.
  * **Modelul**, la dimensiunile reale ale lui Glock 18 (cadrul Gen 3):
    * închizător de 186 mm, țeavă de 114 mm cu capătul filetat, mânerul înclinat la 22°, lat de 32 mm;
    * amortizor de 9 mm (34 mm diametru, 170 mm lungime) și încărcătorul lung de 33 de cartușe, care iese ~9,5 cm sub mâner;
    * maneta selectorului de foc în spatele închizătorului, pe stânga (specifică lui Glock 18), fereastra de evacuare pe dreapta, striațiile din spate;
    * ochitoarele Glock: înălțătorul cu crestătură (3,8 mm) și conturul alb în „U”, cătarea (3,4 mm) cu punctul alb. Când ochești, punctul cătării stă în „U”, cu vârful cătării la nivelul înălțătorului.
  * **Banda albă, ca un camuflaj de zăpadă:** mânerul, cadrul, amortizorul, încărcătoarele și jumătatea din față a închizătorului sunt înfășurate în bandă textilă albă de 25 mm, cu ușoară suprapunere. Se văd țesătura, marginea ridicată a fiecărei spire, cu umbra ei fină, cutele benzii și puțină murdărie de la mâini. Ochitoarele, fereastra de evacuare și comenzile au rămas neacoperite, ca la o armă reală înfășurată pentru iarnă.
  * **Funcționează ca un Glock 18:**
    * **clic stânga** trage. În modul automat trage rafală cât ții apăsat, 1200 de cartușe pe minut (cadența reală a lui G18, exact 3 cadre pe cartuș la 60 FPS; restul se poartă de la un cadru la altul); în modul foc cu foc, un cartuș la fiecare apăsare;
    * **X** comută selectorul (AUTOMAT / FOC CU FOC). Maneta de pe închizător se mișcă și ea, cu un mic gest al armei;
    * încap 33 de cartușe în încărcător plus unul pe țeavă, iar rezerva e de 99. După ultimul cartuș, închizătorul rămâne blocat în spate, ca la arma reală;
    * cartușele: 9 mm subsonic (147 grain, ~295 m/s, muniția folosită cu amortizor). Fiecare glonț își zboară traiectoria, cu gravitația, cadru cu cadru, până la ce întâlnește:
      * pământul: un nor de praf și o urmă;
      * zidurile și casele: un nor de tencuială și o gaură;
      * trunchiurile: scoarță;
      * mașinile și oțelul crucii: scântei;
      * zăpada: un nor alb;
    * sunetul impactului vine de acolo, cu întârzierea zborului glonțului și a sunetului înapoi (343 m/s);
    * tubul fiecărui cartuș iese pe dreapta, se rostogolește, ricoșează pe jos (se aude) și rămâne acolo ~40 s;
    * la fiecare foc: închizătorul zboară înapoi (~12 ms) și revine (~30 ms), deci un ciclu complet în cele 50 ms dintre două cartușe, vizibil pe 2–3 cadre. Arma sare în mâini (din V86 ca în clipul tău, vezi mai sus), iar privirea urcă și revine parțial. Amortizorul scoate un mic fum. Rafala se împrăștie mai mult cu cât trage mai mult, iar în mers sau în săritură e mai puțin precisă.
  * **Ochirea (clic dreapta):** arma vine în fața ochiului, cu cocoașa înălțătorului pe linia privirii. Imaginea se strânge cu ~20 %, mergi mai încet, iar recul și împrăștierea scad. Când nu ochești, apare o cruce de țintire (4 linii) care se deschide după cât de împrăștiat trage.
  * **Reîncărcarea (R), în stilul Call of Duty 4 Modern Warfare:**
    * **cu cartuș pe țeavă** (~1,8 s): din V86, ca în clipul tău (vezi mai sus): mâna stângă scoate încărcătorul și îl pune la centură, apoi aduce unul plin;
    * **pe gol** (~2,15 s): încărcătorul gol cade (rămâne pe jos, cu sunet), mâna stângă aduce unul plin, apoi arma se întoarce cu partea de sus spre tine, iar mâna stângă prinde închizătorul pe deasupra, îl trage și îi dă drumul, ca să intre primul cartuș pe țeavă;
    * **prima oară când îl iei**, mâna stângă armează închizătorul;
    * pe gol, clic stânga face „clic” și pornește singur reîncărcarea, dacă mai ai încărcătoare.
  * **Mâinile și brațele tale** (aceleași mâini și antebrațe musculoase ca la volan, V75–V76; din V86 în mănuși tactice negre), sculptate acum într-o priză reală de pistol, cu ambele degete mari înainte:
    * **dreapta** ține mânerul sus, cu pielea dintre degetul mare și arătător sub coada cadrului. Arătătorul intră în apărătoare, cu buricul pe trăgaci, iar degetul mare stă înainte pe partea stângă a cadrului, sub închizător;
    * **stânga** acoperă vârfurile degetelor drepte. Degetele ei înconjoară fața mânerului peste cele ale dreptei, cu arătătorul sub apărătoarea trăgaciului, iar degetul ei mare stă înainte pe lateral, sub cel drept;
    * pentru încărcător și pentru armare, mâna stângă se deschide și ia altă formă;
    * pozele degetelor au fost potrivite numeric pe model, la milimetru, apoi verificate din patru unghiuri;
    * brațele urmează mâinile prin cinematică inversă (umăr, cot, încheietură);
    * arma se leagănă în mers, rămâne puțin în urmă când întorci privirea și „respiră” când stai.
  * **Q** pune arma deoparte și o scoate din nou. Când alergi (Shift), arma e ținută în jos și nu trage; lângă un zid, se ridică spre tine ca să nu treacă prin el; în mașină dispare.
  * **Cum se vede arma pe orice ecran:** câmpul vizual „natural” al jocului poate fi îngust (~25–35°), iar un pistol la 30 cm de ochi ar umple ecranul. Arma și mâinile se desenează, ca în toate jocurile cu armă la persoana întâi, cu un câmp vizual al lor (~55°), fără să se schimbe locul lor în lume. Netezirea marginilor (TAA) le urmărește propria mișcare, așa că nu lasă dâre.
  * **Ce nu face:** gloanțele trec prin oameni și animale, care nu sunt ținte. Focul nu se vede la celălalt jucător în multiplayer. FPS-ul pe o placă video reală nu l-am măsurat.
* **Peugeot 508 de la poartă, reglat la cerere pentru 500 km/h**: model de putere constantă (1400 W/kg, aderență limitată la 1,43 g), rezistență aerodinamică pentru o viteză naturală de 580 km/h și limitator electronic la 500 km/h; cutie cu 8 trepte (schimbă la 70, 125, 185, 250, 320, 390, 450 km/h), frâne de 1,4 g. Virajul: aderență de 3,2 g plus apăsare aerodinamică ce crește cu pătratul vitezei (+1,6 g la 500 km/h), deci raza minimă e ~24 m la 100 km/h, ~90 m la 200, ~190 m la 300 și ~410 m la 500 km/h (înainte: 45 / 180 / 410 / 1130 m); direcția e progresivă (virajul complet se atinge în 0,16 s la viteze mici și 0,35 s peste 300 km/h, revine la centru în 0,15 s), ca o apăsare scurtă să dea doar o corecție fină; virajul strâns costă puțină viteză (frecarea anvelopelor), iar mașina se înclină puțin (suspensie rigidă). Măsurat în joc (pas fix de 60 Hz, pe DN1): vezi tabelul din mesajul de livrare. La viteză mare fizica face sub‑pași de ≤ 0,8 m (nu trece prin ziduri), camera urmărește mai strâns și unghiul de vedere se lărgește până la ~90°. Celelalte mașini au rămas neschimbate. Locuri drepte pentru viteză: DN1 spre vest de Câmpina (~1,8 km drept în hartă) și Strada Pietriș (1,2 km).
* **ATV-ul de pe dealul crucii (V59)** (`src/atv.js`): un ATV 4×4 de 500 cm³, roșu, parcat pe un loc aproape plan la 8–17 m de cruce (în lista de locuri: „ATV — ATV-ul de pe dealul crucii”; **F** urcă, **V** schimbă între camera din spate și privirea pilotului, pilotul se vede doar din spate).
  * **Modelul**: cadru din țeavă, motor cu aripioare de răcire, carcasa variatorului CVT, scut sub motor, toba de eșapament, suspensie independentă cu brațe duble și amortizoare cu arc, aripi cu căptușeală neagră, podele cu striații, far și stopuri, portbagaje față și spate, bara de protecție cu troliu, cârma cu mânere, apărători de mâini și manete (se rotește cu roțile), anvelope de teren cu crampoane (22 × 2 rânduri), jante; pilotul are geacă, pantaloni, cizme, mănuși și cască cu vizor.
  * **Pe zăpadă**: aderența scade mult mai puțin decât la mașini (crampoane, tracțiune 4×4), se afundă de ~3 ori mai puțin (anvelope late, cu presiune mică pe sol), urcă pantele cu forța gravitației luată din panta reală (încetinește la urcare, accelerează la coborâre), viteza maximă ~80 km/h. Lasă urme în zăpadă după ecartamentul și lățimea roților lui și ridică pulbere de zăpadă din roți.
  * Pe **viscol** (tasta **T**) se merge cum ai cerut: din dealul crucii, cu vizibilitate de câteva sute de metri.
* **Mercedes-Maybach GLS 600 negru (V61)** (`src/maybach.js`): pe ulița de peste dealul crucii (OSM way 198810461), imediat după scena din clipul IMG_0725. Drumeții se opresc în vârful pantei, la 907–918 m de Strada Măgurii; mașina e parcată ~35 m mai încolo, la 875 m, pe coborârea spre cruce, cu fața spre ea. Stă pe marginea dreaptă a asfaltului, pentru că acostamentul cade acolo abrupt spre poiană; pe ulița de 4,5 m mai rămân 2,5 m de trecut. Locul e ales automat între 852 și 890 m: fără înclinare laterală (panta drumului în lung e normală pentru o mașină parcată), cu cât mai puține trunchiuri. Pe ~3,6 m în jurul ei pădurea nu mai pune copaci, tufe sau lemn mort. În lista de locuri: „Maybach”; **F** urcă.
  * **E facelift-ul din 2023**, vândut ca GLS 600 (actualizarea din iulie 2026 se numește GLS 680), la dimensiunile reale: 5,205 m lungime, 2,03 m lățime, 1,838 m înălțime, 3,135 m între axe.
  * **Fața**: grila Maybach cu ramă cromată, bare verticale fine cromate și inscripția MAYBACH; steaua în picioare pe capotă; farurile MULTIBEAM LED (lumina de zi pe margine, modulele LED, semnalizarea); prizele de aer cu modelul Maybach în ramă cromată; scutul de jos cromat.
  * **Lateral**: crom în jurul geamurilor, emblema Maybach pe stâlpul C, mânere cromate, treptele electrice strânse sub prag, ornament cromat pe prag; jante forjate de 22″ cu 20 de spițe subțiri, pe anvelope 285/45 R22 față și 325/40 R22 spate. Anvelopele au flancuri reale, iar janta se vede adâncită în ele.
  * **Spatele**: stopurile facelift-ului, cu trei blocuri orizontale de lumină; ornamentul cromat dintre ele, steaua, evacuările integrate în bară cu rame cromate, ornamentul cromat al difuzorului, eleronul cu a treia lampă de frână.
  * Vopsea negru obsidian metalizat; interior bej din piele nappa, cu lemn, cele două ecrane MBUX sub o singură sticlă și cele două scaune separate din spate, cu consola dintre ele (V68: `src/interior.js`).
  * **Merge ca cel real**: V8 biturbo de 4,0 l, 410 kW (557 CP) plus EQ Boost pe 48 V, ~2,8 t, tracțiune 4MATIC, cutie 9G-TRONIC cu 9 trepte. Verificat în simulare, cu același cod ca în joc:
    * 0–100 km/h în 4,92 s (oficial 4,9 s), 0–200 km/h în 18 s;
    * viteza limitată la 250 km/h;
    * frânare 100–0 în 35,7 m;
    * aderență laterală de 0,86 g;
    * în viraj caroseria se înclină doar ~1°, ca pe suspensia pneumatică E-ACTIVE BODY CONTROL.
  * **Surse**: comunicatul Mercedes-Benz din aprilie 2023 (grila cu bare verticale cromate și inscripția Maybach, prizele cu modelul Maybach și ramă cromată, noua jantă forjată de 23″ opțională) și datele tehnice X167 (dimensiuni, 557 CP, 0–100 în 4,9 s, 250 km/h).
* **Pădurile, refăcute (V60)** (`src/geo/broadgen.js`, `src/geo/forestfloor.js`, `src/textures.js`):
  * **Copacii foioși cresc dintr-un schelet de ramuri**, nu mai sunt un stâlp sub o minge de frunze:
    * trunchiul se subțiază treptat, e puțin strâmb și se lățește la bază (la fag cu contraforți);
    * la fag și la carpen trunchiul urcă prin coroană; la stejar și la salcâm se desface la baza coroanei în câteva crengi groase;
    * ramurile principale ies în spirală (137,5°), mai lungi unde coroana e mai lată, cu unghiul speciei (la fag urcătoare, la stejar întinse), și se curbează în sus spre lumină; din ele pornesc ramuri secundare;
    * frunzișul stă în ciorchini la capetele ramurilor, deci coroana are goluri și cer printre crengi;
    * copacii crescuți în pădure păstrează pe trunchi cioturile ramurilor de jos uscate;
    * fiecare specie are 3 variante.
  * **Scoarța fiecărei specii**:
    * fagul: netedă, gri-argintie, cu pete de licheni, riduri fine orizontale și „ochii” lăsați de ramurile căzute;
    * carpenul: gri mai închis, cu trunchiul canelat ca un mușchi încordat;
    * gorunul: gros, brăzdat vertical, cu muchiile rupte în cruce;
    * salcâmul: o rețea de creste împletite, roșcată în crăpături;
    * mesteacănul: alb, cu lenticele negre.
  * **Frunzele fiecărei specii**, desenate frunză cu frunză pe lăstari, alternativ, ca pe crenguța reală:
    * fagul: ovale, cu marginea ondulată și 7–9 perechi de nervuri;
    * carpenul: ascuțite, dublu dințate, cu ~12 perechi de nervuri pliate;
    * gorunul: lobate, strânse la vârful lăstarului;
    * câteva frunze încep să se îngălbenească (sfârșit de septembrie).
  * **Solul pădurii, în toate pădurile din jurul tău** (până acum doar pe dealul crucii):
    * covor de frunze moarte, sub molizi ace închise la culoare, crenguțe și ramuri căzute;
    * stratul de ierburi după lumina care ajunge jos: aproape nimic sub fag, rogozuri și ierburi sub stejar și salcâm;
    * ferigi la umbră și pe versanții reci, mure în luminișuri și la margini, puieți ai speciei arboretului;
    * **lemn mort ca într-o pădure gospodărită din Carpați**: cioate tăiate (cu tăietura netedă), trunchiuri căzute, mai des așezate de-a curmezișul pantei și cu mușchi pe partea de sus, iar din loc în loc câte un copac uscat în picioare, cu vârful rupt și ciuperci iască pe el;
    * **bolovani** de gresie unde panta e mare.
    * Trunchiurile căzute, cioatele mari, copacii uscați și bolovanii mari te opresc (și pe animale).
    * Culoarea solului de sub păduri nu mai e luată din satelit (acolo se văd coroanele): e cea a frunzelor moarte.
  * **Lizierele**: copacii de margine au crengi și frunze până jos, iar pe o fâșie de la margine cresc alun, păducel, corn și porumbar.
  * **Performanță**: în jurul tău, pe o rază de ~75–110 m, copacii sunt modelele întregi; mai departe se desenează varianta ușoară (aceeași coroană, mai puține crengi), apoi imaginile pre-randate, ca înainte.
* **Animalele pădurii (V60)** (`src/beasts.js`, `src/gait.js`, `src/wildlife.js`):
  * **Speciile**, la mărimea celor din Carpați:
    * vulpea roșcată: ~38 cm la greabăn, ~6 kg; gâtul și pieptul albe, „ciorapi” negri, coada stufoasă cu vârful alb;
    * lupul cenușiu: ~75 cm, ~40 kg; gri-maroniu, cu șa închisă pe spate, burta și picioarele deschise;
    * mistrețul: ~85 cm, ~90 kg; negru-cafeniu, cu creasta de peri pe greabăn, râtul cu disc și colți. **Purceii din anul acesta** sunt mai mici și maro-roșcați: la sfârșit de septembrie și-au pierdut deja dungile;
    * ursul brun: ~1,05 m la cocoașă, ~2 m lungime.
  * **Cum sunt făcute**:
    * fiecare animal e un singur corp sculptat, legat de un schelet de 19 oase: coloană, gât, cap, coada în două, iar fiecare picior în trei (umăr sau șold, cot sau genunchi, încheietură sau jaret). De aceea se îndoaie ca un corp viu, fără îmbinări rigide;
    * blana e în straturi de fire care stau lipite de piele când se mișcă; de la distanță, unde un fir e mai subțire decât un pixel, blana ia culoarea medie, fără „pistrui”.
  * **Mersul** se schimbă cu viteza, după mărimea animalului:
    * la pas, picioarele cad în ordinea reală: spate-stânga, față-stânga, spate-dreapta, față-dreapta;
    * la trap, în perechi diagonale (lupii trap în ritmul lor de ore întregi);
    * la galop, cu spatele care se strânge și se întinde;
    * picioarele se îndoaie din genunchi și din încheietură când se ridică.
  * **Comportamentul**, cum îl au în realitate:
    * vulpea își face rondul pe la margini; te observă de la ~45 m (mult mai de departe dacă ești în mașină), se oprește, se uită la tine și o ia la fugă spre pădure;
    * mistreții umblă în grup, cu râtul în frunze, grohăind; la ~40 m scroafa se oprește și adulmecă, apoi fuge toată turma în aceeași direcție, cu pufnetul de alarmă și guițatul purceilor;
    * lupii merg în șir, fiecare pe urmele celui din față; sunt cei mai sfioși: te observă de la ~85 m, se întorc și dispar. Noaptea, când stau, urlă în cor;
    * ursul umblă încet și caută de mâncare. Dacă te apropii pe jos la ~30 m, rămâne pe loc, pufnește și se îndepărtează la pas mare (mai repede decât mergi tu). Dacă alergi după el și ajungi sub ~18 m, face un atac de intimidare (se oprește la câțiva metri), apoi fuge și nu mai atacă așa o bună bucată de vreme, cum fac aproape întotdeauna urșii. De mașini nu se atinge: fuge;
    * un animal speriat rămâne cu frica în oase vreo două minute: te observă de mai departe și nu se mai oprește să se uite, fuge direct. Cine se retrage și e ajuns din urmă trece la fugă; când te-a pierdut, își vede de drum în partea opusă ție.
  * **Când și unde apar**:
    * apar doar unde harta are pădure (vulpea și pe pajiștile de lângă ea), la 70–180 m de tine, în spatele tău sau între copaci, și pleacă când te depărtezi;
    * mistreții, lupii și ursul sunt mai activi la amurg și noaptea, vulpea la orice oră;
    * în modurile cu zăpadă urșii hibernează;
    * ursul de pe dealul crucii din noaptea cu furtună a rămas cum era.
  * **Sunetele sunt sintetizate**: urletul în cor al lupilor, lătratul răgușit al vulpii, grohăitul, pufnetul și guițatul mistreților.
* **Păsările (V60)** (`src/birds.js`), ziua, nu pe ploaie:
  * șorecarul comun rotește în cercuri largi deasupra lizierelor și pajiștilor, la 40–120 m, cu aripile în V și câteva bătăi din când în când, și se aude „piii-ău”;
  * ciorile grive (gri cu negru, cioara obișnuită la noi) trec în stol de la pădure la câmp, coboară pe pajiști, merg și ciugulesc, și își iau zborul când te apropii;
  * gaițele sar din coroană în coroană (toamna ascund ghinda) și țipă la tine;
  * pițigoii trec în cârduri mici prin coroanele de la margine, cu zborul lor în salturi;
  * în pădure se aude din când în când o ciocănitoare pestriță bătând în trunchi.
* **Mașinile** sunt modelate parametric după profilele reale (E90, Corsa C, SUV, Logan, Sandero) — nu sunt modele comerciale scanate.
* **Interioarele tuturor mașinilor (V68)** (`src/interior.js`): fiecare model are habitaclul lui, construit pe aceeași caroserie și după fotografii ale interioarelor reale (BMW E90, Opel Corsa C, Peugeot 508, Renault Kangoo II, VW T5 — Wikimedia Commons — și poza ta 86, din Doblò). **V** în mașină trece pe privirea șoferului.
  * **Măsurat de la ochii șoferului**, ca la proiectarea unei mașini: punctul H al scaunului la 0,64 m sub ochi și 0,17 m în spate, centrul volanului ~0,57 m în față și ~0,27 m mai jos, înclinat 23–35° (mai culcat la dube), ceasurile la ~0,8 m, văzute prin partea de sus a volanului. Înălțimea ochilor vine din podeaua și plafonul fiecărui model: 1,13 m în BMW, 1,15 m în 508, 1,19 m în Corsa, 1,22–1,23 m în Logan/Sandero, 1,33 m în SUV, 1,36 m în Kangoo, 1,47 m în Doblò, 1,55 m în T5, 1,56 m în Maybach.
  * **Căptușeala caroseriei** (plafon, stâlpi, panourile ușilor) stă la 3–8 cm în interiorul tablei, cu garniturile negre în jurul geamurilor. Soarele intră doar prin geamuri, care nu mai aruncă umbră; plafonul și ușile umbresc interiorul. Prin geam, de afară, nu se mai vede prin mașină până de partea cealaltă.
  * **Planșa de bord**, în două tonuri, merge de la baza parbrizului până la genunchi și sub ea până la perete. Are fantele de dezaburire, gurile de aer laterale (rotunde sau dreptunghiulare, după model), torpedoul și ornamentul: nuc la BMW, aluminiu periat la 508, lemn la Maybach.
  * **Ceasurile mărcii** sunt pictate (scale, cifre, zona roșie, inele cromate, afișaje) și stau sub capota lor:
    * BMW: iluminare portocalie;
    * Corsa: cadrane argintii și afișajul de pe bord;
    * Kangoo și Sandero: trei cadrane;
    * 508 și T5: afișajul din mijloc;
    * Maybach: cele două ecrane MBUX sub aceeași sticlă.

    **Acele sunt reale**: urmăresc viteza și turația când conduci. Cadranele se aprind ziua doar cu acele; noaptea sau cu farurile aprinse se luminează tot.
  * **Navigația (V69)**: 508, SUV-ul și Maybach-ul (pe ecranul din dreapta al MBUX) o au pe ecranul lor. În celelalte mașini (BMW, Corsa, Logan, Sandero, Kangoo, T5, Doblò) apare telefonul tău cu navigația, prins pe gura de aer din mijloc, doar cât conduci tu mașina. Cu motorul oprit ecranul e negru.
  * **Fără semnal pe dealul Crucii (V69)**: pe tot dealul (crucea, pajiștile, pădurea, steagul) și pe toată ulița peste deal (1,3 km, cu locul scenei drumeților și Maybach-ul), oriunde ești la peste 150 m de o casă (ultimele case de pe Strada Măgurii sunt la ~280 m sub cruce). Cu orice mașină:
    * navigația arată **NO SIGNAL**, cu harta înghețată și întunecată în spate;
    * minimapa din colț arată purici și **NO SIGNAL**;
    * semnalul se pierde la ~1 s după ce intri în zonă și revine la ~3 s după ce ieși, ca la un GPS real;
    * dacă urci în mașină direct pe deal, navigația pornește deja fără semnal.
  * **Volanul** are spițele mărcii, airbagul cu sigla, coloana și manetele, și se rotește cu roțile.
  * **Consola centrală**: guri de aer, radio, butoanele climei, ecranul (508, SUV, Maybach). Maneta de viteze e manuală, automată (BMW, SUV) sau pe planșă (Kangoo, Doblò, T5). Mai are frâna de mână și cotiera.
  * **Scaunele sunt modelate**: pernă, laterale, spătar și tetieră pe tije. Bancheta din spate e așezată automat cât de în spate încape sub plafon, cu tetiere înalte sau joase după cât loc e. Mai sunt centurile pe stâlpii B, tapițeriile ușilor (cotieră, mâner, buzunar, difuzor, comenzile geamurilor), mocheta, pedalele, oglinda retrovizoare, parasolarele și plafoniera.
  * **Costul**: interiorul unui model se construiește o singură dată și e folosit de toate mașinile de același model. Se desenează doar la mașinile până la 16 m (prin geamurile fumurii nu se vede mai departe). Umbrele scaunelor și ale bordului le are doar mașina pe care o conduci; la celelalte doar plafonul și ușile umbresc interiorul.
    Măsurat în testul automat, pe aceeași mașină de test, V67 față de V68:
    * cele 117 mașini parcate se construiesc în 3,4 s în loc de 2,5 s, adică ~1 s în plus la încărcare;
    * în vederea 1, desenările scad de la 1 236 la 1 182, pentru că interiorul vechi se desena la toate mașinile vizibile;
    * triunghiurile cresc cu 0,8 % (5,03 → 5,07 milioane).
  * **Ce e aproximat**:
    * culoarea iluminării bordului e verificată doar la BMW (portocaliu); la celelalte e albă-neutră;
    * butoanele mici, cusăturile și grafica ecranelor sunt pictate, nu modelate.
* **Interioarele corectate și parbrizul real (V73)** (`src/interior.js`, `src/cars.js`):
  * **Stâlpii și parbrizul nu mai sunt ondulați.** Profilele caroseriei erau unite între puncte cu o curbă care încetinea la fiecare punct, așa că marginile parbrizului și ale stâlpilor ieșeau în valuri. Acum curba e o spline monotonă (Fritsch–Carlson): trece prin aceleași puncte, fără colțuri și fără să depășească valorile dintre ele. Se vede și pe capotă, care e mai netedă.
  * **Stâlpii A au panoul lor**: un ornament mulat de la marginea parbrizului până la geamul ușii, bombat ~2 cm spre interior, de la bord până în plafon. Înainte erau un tub subțire în fața unei benzi negre largi.
  * **Căptușeala** stă la 2,2 cm în interiorul tablei pe laterale și pe stâlpi și la ~6 cm sub plafon, deci garniturile negre de la geamuri sunt înguste. Ornamentul negru de afară (colțul de lângă oglindă, de sub stâlpi) e negru și pe dinăuntru.
  * **Parbrizul văzut din scaun** e un strat la 4 mm în interiorul sticlei, peste toată suprafața ei:
    * **banda ceramică neagră** de pe margini, ca la orice parbriz real: plină pe 6,5 cm sus, 8 cm jos și 3,2 cm pe laterale, apoi puncte într-o rețea hexagonală de 4,2 mm care se micșorează spre interior pe ~3,5 cm. Mai are pata din spatele piciorului oglinzii. Punctele mai mici decât un pixel se văd ca media lor, deci nu sclipesc;
    * **nuanța sticlei laminate**, puțin verzuie. Împreună cu geamul caroseriei lasă să treacă ~80–85 % din lumină;
    * **reflexia bordului** în sticlă: unghiul parbrizului trimite privirea în jos, pe planșă. Reflexia e cât de luminată e planșa: cu soarele care intră prin parbriz și cerul văzut prin el, după Fresnel pentru cele două fețe ale sticlei. Pe ea se văd fantele de dezaburire. În rest se reflectă habitaclul, slab;
    * se desenează doar când ești în scaun (V, sau pasager la prieten), în 2 desenări; din afară parbrizul rămâne cum era.
  * **Oglinzile exterioare** erau o cutie vopsită întoarsă cu fața spre ușă. Acum carcasa e lată și joasă, pe un picior negru la colțul ușii. Sticla e pe spatele carcasei, întoarsă ~11° spre șofer: din scaun vezi oglinda, nu carcasa.
  * **Parasolarele** sunt căptușite, cu colțuri rotunde, lungi cât încap sub plafon (de la piciorul oglinzii până la ~5 cm de stâlp). Au tija balamalei care intră în plafon la capătul dinspre ușă și clema de la capătul dinspre oglindă.
  * **Fără frunze în mașină**: o mașină parcată lângă un tufiș sau sub un copac avea frunzele lui în habitaclu, pe ușă și pe bord (se vedea la Peugeot-ul de la poartă). Acum frunzele nu se desenează în interiorul caroseriei mașinii în care ești, la volan sau ca pasager la prieten, cum nu apar nici picăturile și fulgii. Pe dinafară mașina rămâne în tufiș.
* **Oglinzile, ștergătoarele, praful de pe parbriz și tu la volan (V74)** (`src/mirror.js`, `src/driver.js`, `src/interior.js`, `src/cars.js`):
  * **Oglinzile arată ce e în spate.** Din scaun, retrovizoarea și cele două oglinzi laterale arată lumea cum o reflectă sticla lor spre ochii tăi: scena e randată din ochiul tău oglindit în planul sticlei, prin dreptunghiul sticlei (un tronc de piramidă asimetric cu sticla drept ecran, Kooima 2008). Planul apropiat e chiar sticla, deci carcasa și parbrizul nu intră în imagine. În retrovizoare se văd tetierele din spate, stâlpii și luneta, apoi drumul. Oglinda din dreapta e convexă, ca la mașinile europene (ECE R46), deci arată mai larg. Retrovizoarea reflectă ~80 % din lumină, cele laterale ~50 %.
    * **Costul și setarea.** Se randează câte o oglindă la două cadre, până la 200 m în spate; dincolo se vede relieful îndepărtat și cerul. Retrovizoarea primește jumătate din aceste randări, deci la 60 FPS are 15 imagini pe secundă, iar fiecare oglindă laterală 7,5. Merge pe Medie și mai sus. Măsurat în cockpitul Corsei, pe strada casei: o oglindă desenează ~390 de obiecte, adică în medie ~+8 % desenări pe cadru: 2 177 → 2 371 pe Medie, 2 460 → 2 662 pe Înaltă. Timpul cadrului crește cu ~7 % (în randarea software de test). O oglindă la fiecare cadru ar fi însemnat +16 % (2 460 → 2 852), așa că am ales una la două cadre. Din meniu, **Oglinzi: Simple** le întoarce la reflexia cerului, fără cost.
  * **Oglinzile sunt reglate ca de un șofer**, din poziția ochilor fiecărui model. Normala sticlei e la jumătatea unghiului dintre ochi și direcția spre care trebuie să privească: în oglinzile laterale, înapoi, la orizont, cu flancul mașinii la marginea dinăuntru; în retrovizoare, mijlocul lunetei.
  * **Ștergătoarele parcate** stau la baza parbrizului la toate modelele (Doblò le avea deja): brațul, lamela și capacul pivotului, exact unde le pornește trecerea de ploaie (`src/windshield.js` și `src/cars.js` folosesc aceeași geometrie a sticlei). Din scaun li se vede marginea de sus peste banda neagră. Când plouă și le vezi din scaun mișcându-se, cele parcate dispar, ca să nu fie două perechi.
  * **Pelicula de praf de pe parbriz.** Un parbriz real împrăștie ~1 % din lumina care trece prin el (praf, urme de ștergător; „haze” în sensul ASTM D1003). Lumina soarelui e împrăștiată înainte (funcție de fază Henyey–Greenstein, g = 0,7), deci când conduci spre un soare jos parbrizul se voalează, cu arcurile ștergătoarelor în el. Zonele șterse sunt mai curate, colțurile pe unde lamelele nu trec sunt mai murdare. Cu soarele în spate nu se vede nimic.
  * **Picăturile stau pe geam, nu peste ce e în fața lui.** Până acum, ploaia de pe parbriz se desena și peste retrovizoare, parasolare și marginea de sus a volanului. Acum, după trecerea scenei, partea dinăuntru a parbrizului e desenată peste adâncimea scenei: unde ceva din mașină e mai aproape de ochi decât sticla, picăturile și ștergătoarele nu se mai desenează. Merge pe Medie și mai sus, unde există adâncimea scenei.
  * **Tu la volan.** În mașina pe care o conduci stă un șofer cu dimensiunile unui adult (umăr–cot 0,31 m, cot–încheietură 0,29 m, șold–genunchi 0,46 m, genunchi–gleznă 0,45 m), așezat după cotele modelului: ochii, punctul H al scaunului, volanul, pedalele.
    * Mâinile țin volanul puțin deasupra spițelor („9 și 3”), cu dosul palmei pe partea din afară și degetul mare peste partea dinspre tine. Se rotesc cu volanul până la ~60° și de acolo alunecă pe el, ca la o mână reală.
    * Brațele ajung la ele de la umeri, cu coatele în jos și în afară (cinematică inversă pe două segmente, la fiecare cadru).
    * Piciorul drept e pe accelerație, stângul lângă pedale.
    * Privind în jos îți vezi brațele, genunchii și picioarele. Din spatele mașinii (V) se vede șoferul întreg, cu cap, prin geamuri.
* **Mâinile pe volan, sculptate anatomic (V75)** (`src/handgeo.js`, `src/hand.js`, `src/driver.js`):
  * **O mână reală, nu forme lipite.** Mâna e sculptată ca personajele din pădure: oase, încheieturi și carne ca distanțe îmbinate lin, transformate într-o suprafață netedă (~20 000 de vârfuri pe mână). Are dimensiunile mâinii unui bărbat adult (lungime ~19 cm, lățime ~8,8 cm) și falange în proporțiile obișnuite (~1 : 0,6 : 0,4). Are încheieturile degetelor care ies peste articulațiile îndoite, perne sub vârfuri, unghii cu marginea liberă albă, mușchiul de la baza degetului mare, pielea dintre degetul mare și arătător și tendoanele de pe dosul palmei.
  * **Prinderea e calculată, nu desenată.** Palma stă pe partea din afară a volanului, iar volanul trece în diagonală prin palmă, de la baza arătătorului la podul palmei, ca un mâner. Fiecare os al fiecărui deget se îndoaie exact cât îl lasă volanul, până se sprijină pe el (carnea apăsată 1,5 mm). Degetele învelesc volanul prin față, iar vârfurile lor ies pe partea dinăuntru. Degetul mare stă de-a lungul volanului, pe spate, spre vârf, cum se învață la școala de șoferi.
  * **Încheietura e naturală.** Mâna e orientată după direcția reală a antebrațului, măsurată în toate mașinile. Încheietura e îndoită ~20° pe spate și ~15° spre degetul mic, ca la orice mână care strânge un mâner. Antebrațul intră drept în mânecă, iar mâneca se termină la încheietură.
  * **Pielea.** Culoarea pielii e ușor neuniformă, mai roșiatică pe încheieturi și mai închisă în pliuri, acolo unde carnea se strânge. Unghiile sunt mai deschise și lucioase. Pielea are un luciu cald, moale, în lumina razantă.
  * **Fără sacadări.** Mâna se sculptează o singură dată, într-un fir de lucru separat (worker), cât timp mergi spre mașină (~1 s). Apoi se așază pe volanul fiecărei mașini în ~1 ms; stânga e oglinda dreptei.
* **Brațe musculoase, într-un tricou (V76)** (`src/armgeo.js`, `src/driver.js`, `src/hand.js`):
  * **Brațele unui bărbat antrenat**, sculptate ca mâinile. Brațul are ~0,31 m de la umăr la cot și ~39 cm circumferință pe biceps. Antebrațul are ~0,29 m și ~32 cm în partea cea mai groasă.
    * **Brațul de sus:** deltoidul pe umăr, coborând în V pe exterior, bicepsul în față, peste brahial, cu tendonul în plica cotului. În spate e tricepsul: capul lung și cel lateral (potcoava), care se aplatizează în tendon deasupra cotului.
    * **Cotul:** olecranul în spate și cele două epicondile.
    * **Antebrațul:** brahioradialul și extensorii lungi umflați pe partea degetului mare, flexorii în față, extensorii în spate, creasta ulnei. De la jumătate în jos rămân doar tendoanele, până la ovalul încheieturii, care continuă în mână.
    * **Vene:** câteva vene ies ~1 mm din piele pe antebraț și pe biceps.
  * **Tricoul.** Șoferul poartă acum un tricou închis la culoare, cu mânecă scurtă până la jumătatea brațului și tiv, în loc de geacă.
  * **Brațele se mișcă, nu se rup.** Fiecare braț e legat de cinci oase: brațul de sus și de patru ori antebrațul. Fiecare os al antebrațului e răsucit cu o treime mai mult spre încheietură, cum se rotește radiusul în jurul ulnei. Așa cotul se îndoaie cum cere cinematica (119–173° când virezi, ~135° drept înainte) și antebrațul se răsucește până la mâna de pe volan fără să se strângă ca un ambalaj de bomboană.
  * **Pielea** are aceeași culoare ca mâinile, mai deschisă pe interiorul brațului, mai roșiatică pe cot și mai închisă în pliurile dintre mușchi. Venele sunt cu o nuanță mai albăstrui.
  * **Fără sacadări.** Brațul se sculptează o singură dată, în fundal, la încărcarea jocului (~1,1 s), apoi se oglindește pentru brațul stâng.
* **Ramele parbrizului nu mai blochează drumul (V77)** (`src/cars.js`, `src/interior.js`):
  * **Problema, măsurată.** Am tras raze din ochiul șoferului prin cadrul parbrizului: stâlpul A din stânga acoperea 12–20° din câmpul vizual (Corsa 13,5°, BMW 20,5°, Maybach 14,8°), iar cel din dreapta 7–10°. La mașinile reale stâlpul A acoperă ~6–8° din scaunul șoferului, iar regulamentul ECE R125 permite cel mult 6° pentru ambii ochi. Ai noștri erau de două ori prea lați.
  * **Trei cauze, toate corectate:**
    * **Stâlpul din caroserie era prea lat** (~13 cm între sticle). Acum parbrizul ajunge la 95 % din lățimea acoperișului, nu la 84 %, iar geamul ușii urcă până la 4,5 cm sub marginea parbrizului, nu 7. Stâlpul are acum ~7 cm, cât unul real. Colțurile de sus se rotunjesc în marginea acoperișului.
    * **Tapițeria stâlpului ieșea în cabină** până la 4,6 cm, iar pielea interioară a stâlpului era trasă 4–5 cm înăuntru (regula plafonului, care atârnă sub acoperiș). Acum tapițeria are 1,2–2,6 cm, iar pielea interioară 1,6 cm.
    * **Banda neagră de pe marginile parbrizului era de ~2 ori prea lată.** Pe laterale are acum 1,2 cm plină plus 2,2 cm de puncte, sus 5 cm.
  * **Rezultatul, măsurat la nivelul ochilor:**

    | Model | Stâlpul stâng, înainte → acum |
    | --- | --- |
    | Corsa | 13,5° → 5,8° |
    | Maybach | 14,8° → 6,3° |
    | Kangoo | 12° → 5° |
    | Transporter | 14° → 6° |
    | Peugeot 508 | 16,8° → 8,5° |
    | BMW | 20,5° → 10° (parbriz foarte înclinat, scaun jos) |

    Stâlpul din dreapta a scăzut la 3–5°. Ștergătoarele, ploaia de pe parbriz și parasolarele urmează noua margine a sticlei.

## Multiplayer (alpha, V71–V72): tu și un prieten în aceeași lume

**Cum intrați:**
1. Proprietarul artefactului (tu) îl invită pe prieten: în claude.ai, butonul **Share** al artefactului → invită-l prin
   adresa lui de email. Prietenul trebuie să aibă cont claude.ai și să fie conectat.
2. Amândoi deschideți jocul în pagina artefactului din claude.ai, nu ca pagină separată și nu dintr-o copie locală.
   În meniu, la **Multiplayer · camera**, scrieți același cod (implicit „prieteni”), apoi **Joacă**.
3. Când intră prietenul, apare un mesaj: „… a intrat în joc — J te duce la el”.

Rândul Multiplayer din meniu arată starea: prietenul și cât de departe e, „singur în camera …” cât timp nu e nimeni,
sau „claude.ai nu a deschis camera” când pagina nu are acces (link public, cont deconectat, jocul deschis în afara
paginii artefactului, sau un invitat din afara contului tău pe care claude.ai nu îl admite).

Doar persoanele cărora le e partajat artefactul pot intra în cameră: tu și cei invitați. Cine are doar linkul public
poate juca, dar singur, fără să se poată conecta. Nu trece nimic printr-un server al nostru și nu se salvează nimic.

**Ce vezi:**
- prietenul, ca un om care merge sau aleargă, cu geaca în culoarea lui;
- numele lui deasupra, vizibil și prin pereți;
- un punct pe minimapă, la marginea ei când e departe, în direcția lui;
- mașina condusă de el se mișcă și la tine. E aceeași mașină: nu poți urca la volanul ei. Dacă urcați amândoi deodată,
  ea rămâne unuia singur;
- **J**: te duce lângă prieten, sau pe locul din dreapta în mașina lui, dacă el conduce (**F** cobori);
- vremea și ora sunt comune: le stabilește cine le schimbă ultimul. Până atunci rămân ale celui care a intrat primul;
- mașinile mutate (conduse sau împinse) rămân unde le-a lăsat cel care le-a mutat, și pentru cine intră mai târziu;
- aceeași lume vie, în timp real (V72): fiecare animal pe care îl vezi îl vede și prietenul, în același loc și făcând
  același lucru. Asta include vulpea, mistreții, lupii și ursul din pădure, ursul de pe dealul crucii în nopțile cu
  furtună, șorecarii, ciorile, gaițele, pițigoii și trecătorul de pe stradă. Fulgerele cad în aceeași clipă la amândoi.
  Scena din pădure de la 23:30 și clipul cu drumeții de la 16:11 se joacă în același moment pentru amândoi;
- animalele se feresc de cel mai apropiat dintre voi: dacă prietenul se apropie de o vulpe, ea fuge de el și o vezi și
  tu fugind. Ursul de pe deal îl poate doborî și pe prieten. Câinii din curte se uită la cine e mai aproape. Un câine
  mângâiat de prieten dă din coadă și la tine;
- lanterna prietenului (fasciculul ei în aer, noaptea), motorul și claxonul mașinii lui, mai încet cu distanța.

**Lumea comună** (`src/share.js`). Lumea o ține un singur joc: al celui care a intrat primul în cameră. El mișcă
animalele, păsările, ursul, trecătorul, fulgerele și scenele pentru amândoi. Animalele lui apar în jurul fiecăruia
dintre voi, niciodată în fața vreunuia. Le trimite odată cu jucătorul lui, de ~15 ori pe secundă, iar jocul celuilalt
le desenează unde sunt la el, cu aceleași 120 ms de interpolare ca la jucători. Dacă cel care ține lumea iese (sau îi
adoarme fila, în fundal, 3 s), celălalt joc preia lumea exact cum era și o duce mai departe. Totul încape în limita de
4 KiB a platformei: dacă ar fi prea mult, primele care nu se mai trimit sunt păsările cele mai depărtate de voi.

**Cum funcționează** (`src/net.js`, `src/remote.js`). Fiecare joc își trimite starea jucătorului de ~15 ori pe
secundă: pieton, șofer sau pasager, poziția, privirea, mașina (poziție, înclinare, volan, roți, faruri, frână). Starea
merge ca *presence* în camera artefactului, prin capabilitatea `room` din claude.ai. Celălalt joc o desenează cu
120 ms în urmă, între cele două actualizări din jurul acelui moment (interpolare de stări), deci mișcarea e lină
oricât ar varia rețeaua. Mașinile au aceeași cheie în ambele jocuri: numele și ordinea lor pe hartă. Într-o copie
locală (`python3 -m http.server`), filele aceluiași browser se găsesc între ele printr-un `BroadcastChannel`, pentru
încercări.

**Limite (alpha):**
- personajele nu se ciocnesc între ele (nici cu mașinile);
- lanterna prietenului se vede (fasciculul), dar nu luminează pământul la tine: încă o lumină în scenă ar refacea
  shaderele tuturor materialelor;
- picăturile de ploaie, fulgii, frunzele în vânt și praful de zăpadă de pe brazi sunt ale fiecărui joc (aceeași vreme,
  alte picături).

**Testat** cu două jocuri în același browser, prin canalul local, cadru cu cadru:
- se văd unul pe altul, cu numele deasupra; **J** te duce la 2,00 m de prieten;
- mersul: prietenul apare unde e (diferență de 1 cm);
- mașina condusă de prieten: aceeași poziție la amândoi, iar tu nu poți urca la volanul ei. În mers o vezi cu 7–12 cm
  în urmă (cele 120 ms). Oprită, poziția e identică la amândoi;
- **J** te urcă pe locul din dreapta în mașina în mers, iar camera stă pe scaunul pasagerului. **F** te coboară, iar
  mașina rămâne parcată în același loc la amândoi;
- ploaia pusă de unul apare și la celălalt;
- cine iese dispare la celălalt; starea trimisă are ~230 de octeți din cei 4096 permiși; 0 erori în pagini;
- `net.js` și cu o cameră claude.ai simulată (18/18 verificări): o intrare eșuată temporar se reîncearcă, o cameră
  pierdută se redeschide, „revoked” e definitiv, iar fără camere numite se folosește camera comună.

**Lumea comună testată** (V72, tot două jocuri în același browser, cadru cu cadru):
- cine intră primul ține lumea, iar celălalt o urmează;
- animalele: același id, același număr și aceeași stare la amândoi. Poziția diferă cât merg ele în 120 ms: sub
  0,6 m la lupi și vulpe, 1–1,8 m la ciori și șorecari, care zboară cu 11–14 m/s;
- prietenul se apropie la 12 m de vulpe: la gazdă vulpea fuge de el, iar el o vede fugind la fel;
- trecătorul de pe stradă: aceeași poziție, cu 13 cm de întârziere;
- ursul de pe deal, noaptea, în furtună: același loc și aceeași stare la amândoi, din alertă până la atac. Când
  ajunge la prieten, acesta e trântit 3,2 m în jocul lui și primește mesajul „Ursul te-a doborât!”;
- fulgerele gazdei cad și la prieten, cu tunetul de la aceeași distanță;
- scena din pădure, pornită de prieten, rulează la amândoi cu 0,1 s diferență. Drumeții de la 16:11, la fel;
- lanterna prietenului: fasciculul se vede când o aprinde și dispare când o stinge;
- gazda iese: celălalt preia aceleași animale (aceleași id-uri) și le duce mai departe;
- starea gazdei, cu toată lumea în ea, are ~820 de octeți din 4096; 0 erori în pagini.

Canalul real din claude.ai nu l-am putut încerca eu: e nevoie de două conturi conectate. Primul test cu el e al vostru.

## Grafică

Three.js r186 (inclus în `vendor/`, merge offline): materiale PBR cu hărți de normale generate din poze, iluminare de cer înnorat (IBL din cerul procedural), umbre soft, ambient occlusion (GTAO) pe Înaltă/Ultra, bloom discret, anti-aliasing temporal (TAA; SMAA pe Scăzută), gradare „fotografică” (vignetă, grain), iarbă 3D și frunziș care se mișcă în vânt. Sunetul (vânt, păsări, pași pe asfalt/pietriș/iarbă/gresie, motor, derapaj, claxon, impact) e sintetizat procedural.

Calitatea implicită e aleasă automat (Scăzută pe telefon, Medie/Înaltă pe PC) și se poate schimba din meniu.

### Depărtarea netedă (V70)

Departe, jocul arăta „ascuțit” și fals: pădurea de pe dealuri era un purici de pixeli colorați, firele de curent se
rupeau în puncte, iarba de la câteva zeci de metri fâșâia. Cauza nu era lipsa de ceață sau de blur, ci **aliasing-ul**:
fiecare pixel lua un singur eșantion, din centrul lui. Un lucru mai mic decât un pixel (o crenguță la 300 m, un cablu
de 2 cm la 100 m, un fir de iarbă la 40 m) ori cădea pe acel punct și apărea întreg, ori nu și lipsea, iar asta se
schimba de la un cadru la altul. Ochiul și obiectivul unui aparat adună lumina de pe toată suprafața, deci văd
amestecul (o pădure ca o masă de coroane, un cablu ca o linie fină).

**Anti-aliasing temporal (TAA, `src/taa.js`)**, după Karis 2014 (*High Quality Temporal Supersampling*), Salvi 2016
și Pedersen 2016:
- la fiecare cadru proiecția (și a reliefului îndepărtat) se mută cu o fracțiune de pixel, după șirul Halton (2,3), 8 poziții;
- cadrul nou e reeșantionat în centrele pixelilor cu un filtru gaussian (aproximarea Blackman-Harris) pe vecinii 3×3;
- rezultatul de dinainte e luat de unde era punctul acestui pixel cu un cadru în urmă. Punctul se află din adâncimea
  lui, proiectată prin camera de atunci. Mașina pe care o conduci urmează propria mișcare, deci cabina și mașina din
  fața camerei nu se întind. Cerul și relieful îndepărtat urmează direcția. Citirea se face cu filtru Catmull-Rom, ca
  imaginea să nu se înmoaie de la cadru la cadru;
- istoria e tăiată la gama de culori a vecinătății de acum (variance clipping în YCoCg), deci ce s-a mișcat sau a apărut nu lasă fantome;
- în rezultat intră ~10 % din cadrul nou (tot cadrul nou unde istoria e în afara ecranului sau după o tăietură de cadru).

Ploaia, zăpada, stropii de la roți, apa de pe streașini și pudra de zăpadă de pe molizi se mișcă prea repede ca să fie
urmărite. De aceea se desenează după TAA, peste rezultat, cu adâncimea scenei. Reflexiile din ud și umbrirea de contact
(AO) sunt calculate înainte, deci se netezesc și ele.

Frunzele și iarba se leagănă în vânt, iar reproiectarea nu știe de mișcarea asta. Fără o corecție, coroana unui copac
din apropiere ar lăsa o dâră. Materialele care se leagănă își marchează pixelii (alfa negativ, doar în trecerea
principală a scenei). Acolo TAA păstrează mai puțin din cadrele trecute, cât să rămână cel mult ~1 px de urmă. Un vârf de
coroană se mișcă cel mult ~0,24 m la 3,5 rad/s, deci ponderea cadrului nou e 7/distanța (m) × tăria vântului, între 10 %
și 50 %. Lângă tine frunzele rămân clare, iar de la ~70 m în colo se netezesc complet.

**Verificat pe o margine de test** (alb pe negru, înclinată, 256×128, `_taatest.html`), față de aceeași margine randată
la 16×16 poziții în fiecare pixel și mediată (referința):

| | treptele (abaterea de la linia dreaptă) | deplasarea marginii | lățimea (σ) |
|---|---|---|---|
| fără AA | 0,29 px | — | 0,29 px (trepte) |
| referința 16×16 | 0,06 px | 0 | 0,41 px |
| TAA, cameră fixă | **0,03 px** | 0,06 px | 0,51 px |
| TAA, 0,5 px/cadru | 0,14 px | 0,01 px | 0,66 px |
| TAA, 2 px/cadru | 0,03 px | 0,11 px | 0,52 px |

Cu semnul deplasării inversat, toate cifrele ies mai rele (0,8 px deplasare), deci convenția e cea corectă. Ponderea
pentru culorile foarte luminoase e 1/(1 + L/4): cu 1/(1 + L), cum e în articolul lui Karis, marginea alb-negru se muta
cu 0,2 px spre alb, iar un cablu închis pe cer apărea mai gros și mai negru decât e.

**Trecerile de detaliu, fără margini:**
- copacii trec de la modelul 3D la imagine (la 110–260 m, după calitate) printr-o dizolvare pe ±5 m, nu dintr-odată.
  În zonă se desenează amândouă formele, iar fiecare pixel arată una sau alta după un prag care se schimbă la fiecare
  cadru (zgomot cu gradient întrețesut, Jimenez 2014). TAA-ul transformă asta într-o trecere lină;
- pe pajiștile dealului Crucii, fânul se desenează până la 45–140 m. Mai departe, solul are culoarea fânului: media
  texturii firelor, în lumină liniară, înmulțită cu nuanța locului (mai uscat pe petice, pai unde e călcat) și cu cât
  se întunecă fânul văzut de departe. Firele se umbresc unele pe altele și li se văd bazele, deci factorul e 0,71 / 0,63
  / 0,64 pe R/G/B, măsurat pe randare. Înainte solul avea verdele închis al ortofotografiei de vară, deci iarba se
  termina într-o linie;
- fiecare inel de iarbă se rărește pe ultimii ~20 m până la desimea inelului următor, smoc cu smoc, fiecare la o
  distanță a lui; ultimul inel se rărește până la zero.

**Verificat în joc** (1280 px, Înaltă, pași de 60 cadre/s), înainte și după, pe 7 vederi: strada casei (Poza 1),
steagul de pe deal (Poza 60), valea de la Cruce, satul văzut de sus, aceeași stradă în ploaie, mașina din spate și din
cabină. Pădurea de pe dealuri
devine o masă de coroane, nu mai e purici. Firele de curent sunt linii continue, iar munții din depărtare nu mai
fâșâie. Coroana din apropiere rămâne clară în vânt. Cabina rămâne clară în mers: ceasurile și navigația se citesc.
Ploaia și reflexiile din ud arată la fel, iar consola nu are nicio eroare. Pe pajiștea de la steag, solul de dincolo de
fân a ieșit întâi prea verde, (115, 123, 66) față de fânul (102, 104, 57). După măsurare l-am calibrat la (95, 97, 56),
cu fânul la (97, 98, 54).

**Cost**: măsurat doar în randarea software de test (Chromium + SwiftShader, strada casei, alternând de două ori):
11,0 s pe cadru cu SMAA și 11,7 s cu TAA, adică +6 %, la un zgomot de ±4 % între repetări. TAA ia locul SMAA-ului, tot
cu trei treceri pe ecran. Harta culorii pajiștilor se calculează o dată, la încărcare (376×326 celule, 0,34 s).
Testul automat (`tools/geo-test.mjs`) dă 0 erori și avertismente, iar mersul cu mașina trece.

Din meniu, **Netezire**: Temporală (TAA, implicit) sau Doar margini (SMAA, ca înainte). Pe Scăzută rămâne SMAA, fiindcă
acolo scena nu are adâncimea de care are nevoie TAA.

### Performanță

Optimizat **fără să se schimbe imaginea**: aceleași triunghiuri, materiale, umbre și efecte, doar fără munca făcută de
două ori. Verificat cadru cu cadru (cadre deterministe, aceeași oră, aceeași ploaie) pe 6 scene (zi, ploaie, noapte cu
ploaie, horror pe deal, pădure, DN1): 5 identice pixel cu pixel, la ploaie 4 pixeli din 360 000 diferă cu 1/255.

- umbrele (soarele / luna, lanterna) se randau de două ori pe cadru: a doua oară în trecerea de normale a AO-ului;
- matricele celor ~7 500 de obiecte se recalculau la fiecare trecere: acum o dată pe cadru;
- o mașină parcată avea 33 de obiecte (≈36 de desenări): caroseria cu toate detaliile e o singură plasă, cu o desenare
  pe material, iar volanul, aripile interioare, cele 4 anvelope, jante și discuri sunt unite (≈17 desenări);
- three.js își reevalua programul de shader de 140–180 de ori pe cadru (geamurile văzute pe ambele fețe, umbrele
  obiectelor instanțiate): acum ~9;
- cele 120 de mașini parcate nu mai recalculează la fiecare cadru înălțimea terenului de sub roți, iar coliziunile,
  numele străzii și minimapa nu mai produc gunoi de memorie (2,4 → 1,25 MB pe cadru).

Măsurat în Chromium (aceeași mașină, Înaltă): timpul CPU al unui cadru scade cu 46–50 % (strada casei 72 → 39 ms,
DN1 48 → 24 ms, noaptea cu ploaie 76 → 39 ms, în randare software), desenările de la ~4 100 la ~2 900.

**G** arată contorul: FPS, cât durează un cadru, timpul CPU (jocul și apelurile WebGL) și timpul GPU (prin
`EXT_disjoint_timer_query_webgl2`, în Chrome/Edge pe desktop; „n/d” unde browserul nu-l oferă), desenările,
triunghiurile și rezoluția la care se randează. Pentru 60 FPS ambele trebuie să încapă în ~16,7 ms: dacă GPU-ul e
peste, limita e placa video la rezoluția aleasă (Înaltă randează la 1,25× rezoluția ecranului, Ultra la 2×).

**Scena se desenează o singură dată pe cadru (V56).** Pe Înaltă/Ultra, ambient occlusion-ul (GTAO) își randa toată
scena a doua oară, ca să-și facă harta de normale și adâncime. Acum folosește adâncimea pe care randarea scenei tocmai
a desenat-o și deduce normalele din ea, deci nu mai desenează nimic. Măsurat pe 4 scene (strada casei, spre sat,
crucea, pădurea): desenările camerei scad de la ~2 300 la ~1 370 pe cadru (−40 %), triunghiurile de la 5,75 la
4,01 milioane (−30 %). Timpul CPU în care cadrul e trimis la placa video scade cu ~22 % (55 → 43 ms în randarea
software de test, la două repetări). Imaginea e practic aceeași: iarba și frunzișul primesc și ele umbrire de
contact (înainte erau scoase din AO), deci sunt cu puțin mai umbrite. Pe Medie/Scăzută nu e AO, deci nu se schimbă
nimic.

Testat și **nelansat**: „doar ce vezi”, adică desenarea strictă a ce intră în unghiul de vedere. Three.js deja nu
desenează obiectele din afara privirii, iar pentru plasele mari unite (case, terenul, pădurile), tăierea lor în celule
a scăzut triunghiurile cu ~7 %, dar a crescut desenările cu ~4 %. Timpul cadrului a rămas același, deci n-a meritat.

## Structură

```
index.html            UI + importmap
src/main.js           bucla jocului, camere, intrare/ieșire din mașină
src/hero.js           casa din poze (fațadă, prispă, verandă, foișor, poartă, țevi de gaz)
src/world.js          stradă, vecini, stâlpi, fire, mașini parcate, vegetație
src/cars.js           caroserii parametrice   src/vehicle.js  fizica mașinii
src/maybach.js        Mercedes-Maybach GLS 600   src/doblo.js  Fiat Doblò Cargo (dubița de la sonde)
src/interior.js       interioarele mașinilor: bord, ceasuri cu ace, volan, scaune, uși, căptușeală, parbrizul văzut din scaun
src/mirror.js         oglinzile: retrovizoarea și oglinzile laterale arată ce e în spate (randate din ochiul oglindit)
src/driver.js         tu la volan: mâinile pe volan, brațele, picioarele pe pedale
src/handgeo.js        mâinile sculptate: oase, încheieturi, carne, unghii, prinderea pe volan (fără three.js)
src/hand.js           mâinile ca obiecte 3D: sculptate în fundal, așezate pe volanul fiecărei mașini, pielea
src/armgeo.js         brațele sculptate: mușchii, venele, mâneca tricoului, legate de oasele brațului
src/handworker.js     sculptează mâna și brațul într-un fir de lucru separat
src/npc.js            trecătorul (animație de mers, poate fi lovit și se ridică)
src/player.js         mersul la persoana I     src/collision.js coliziuni 2D + relief
src/textures.js       texturi foto + procedurale   src/post.js  post‑procesare
src/perf.js           contorul de performanță (G): FPS, timp CPU / GPU, desenări
src/net.js            multiplayer: camera din claude.ai (sau filele unui browser), starea trimisă și interpolată
src/remote.js         prietenul în lume: omul care merge, mașina condusă de el, numele, locul de pasager, lanterna
src/share.js          lumea comună: animalele, păsările, ursul, trecătorul, fulgerele, scenele - ținute de un joc pentru amândoi
src/taa.js            anti-aliasing-ul temporal: deplasarea sub-pixel, reproiecția, istoria; ploaia și zăpada desenate după el
src/rain.js           ploaia și zăpada: suprafețe ude / acoperite, fulgii, viscolul și harta lui văzută din vânt, stratul de zăpadă
src/snowtrail.js      urmele de pași și de roți în zăpadă (harta lor, ștampilele, umplerea cât ninge)
src/castgeo.js        personajele (pădurea, clipul IMG_0725): geometria (sculptate SDF, ponderile scheletului), fără three.js
src/castworker.js     le construiește într-un worker, ca jocul să nu se oprească
src/cast.js           plasele cu schelet și pozarea (cinematică inversă)
src/forest.js         scena din pădure, live: coregrafia, drumurile printre copaci, frunzele, cine apare și dispare
src/hikers.js         scena din clipul IMG_0725: omul desculț și cei trei pe ulița prin pădure (16:11, senin)
src/geo/urcus.js      locul clipului IMG_0725: ulița pe ortofoto, desișul, blocul, poteca, pădurea și speciile ei
src/geo/urcus_mask.js pădurea din jurul lui, trasată pe ortofoto (foioase / amestec / conifere, celule de 5 m)
tools/extract_textures.py   extrage și rectifică texturile din reference/*.jpg
tools/smoke-test.mjs        test automat în Chromium headless (capturi din cele 5 puncte)
```

## Test automat

```bash
npm i -D playwright-core
python3 -m http.server 8765 &
node tools/smoke-test.mjs shots high
```

Încarcă jocul, verifică erorile din consolă, face capturi din cele 10 unghiuri ale pozelor și conduce BMW‑ul câțiva metri.
