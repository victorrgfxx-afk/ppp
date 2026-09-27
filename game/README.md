# Strada Gării · Poiana Câmpina — joc open‑world first‑person (versiunea cu harta reală)

Strada, casa și curtea din cele 21 de fotografii, reconstruite 3D și jucabile în browser (stil GTA: mers liber, fugă, sărit, urci în orice mașină parcată și conduci) — **așezate în zona reală de 6 × 6 km** din jurul punctului 45,13403° N, 25,71109° E, construită din date cartografice deschise.

> Branch‑ul `claude/realistic-first-person-gta-game-aq1h6w` rămâne harta inițială (doar din poze). Branch‑ul acesta (`…-geo`) e copia cu harta reală.

## Harta reală: surse și ce e exact

| Ce | Sursă (date deschise) | Cum e folosit |
|---|---|---|
| Clădiri (8825), străzi (1459), gară, peroane, poduri, linia CF 300 electrificată, liniile de 110 kV (39 de turnuri), râuri, lacuri, păduri, livezi, terenuri | OpenStreetMap (© contribuitorii OSM, ODbL) | amprentele exacte ale caselor, extrudate cu numărul de niveluri din OSM; drumuri cu lățimea din benzi/clasă și materialul din `surface` |
| Relief ±3 km (grilă 5 m, 1201 × 1201 puncte) | Terrain Tiles AWS (terrarium z15, EU‑DEM/SRTM) | teren, profilul real al Străzii Gării, săpături/umpluturi sub drumuri și calea ferată |
| Relief până la 12 km (dealurile și munții de la orizont) | Copernicus GLO‑30 | inelul îndepărtat (cele două DEM‑uri diferă cu 1–3 m în zonă) |
| Culoarea solului | Sentinel‑2 cloudless 2023 by EOX (CC BY‑NC‑SA 4.0) | colorează textura de iarbă/pământ/pietriș; unde e verde în imagine se pun copaci în curți |
| Râul Prahova | OSM (albia ca poligon, axul cu lățime 20 m) + DEM | nivelul apei scade monoton în aval (≈ 0,86 %: 438,6 → 371,9 m pe 7,8 km), prundiș în albie |
| Soarele | calcul astronomic | 26 sept., 11:30: elevație 38,7°, azimut 148° (SSE) |

**Aliniere**: axa Străzii Gării (way 16947629) are azimutul 42,02° și e dreaptă de la intersecția din SV până la capătul spre râu, exact ca în poze. Casa din poze este **Strada Gării nr. 123H**. În OpenStreetMap apare ca nr. **123** (way 264516816; OSM și Nominatim nu au litera H), iar aceasta e exact amprenta pe care e pusă casa (fața la 5,6–6,1 m de ax, ca veranda măsurată pe poze; grădina din sud, gardul vișiniu și vecinii se potrivesc cu pozele 1, 6, 7). Capătul „sud” al străzii din poze e spre NE: malul înalt al Prahovei cu râpa de lut (poza 7) e terasa de ~55 m de peste râu, la 450–600 m.

**Ce e dedus, nu măsurat**: culorile pereților și acoperișurilor caselor care nu apar în poze (OSM nu le are), forma acoperișului (în patru ape din descompunerea amprentei, în două ape la unele case), ferestrele (textură), gardurile de pe celelalte străzi și stâlpii de iluminat (generați de‑a lungul străzilor), pozițiile copacilor (din poligoanele de pădure/livadă și verdele din Sentinel‑2), înălțimea caselor cu tag implicit `height=4` (luată din numărul de niveluri). Vecinii din poze (casa albă, casa din lemn închis, casa cu coș, casele de după zidul gri și gardul vișiniu) au amprenta din OSM și aspectul din poze; două dintre ele sunt mutate 3 m mai departe de stradă, ca în poze.

**Refacerea datelor**: `python3 geo/fetch_raw.py` (descarcă ~40 MB în `geo/raw`) apoi `python3 geo/build_geo.py` → `assets/geo/`. `geo/debug_map.py` desenează o hartă de control; `node tools/geo-test.mjs` face capturi automate.

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
| V | – | cameră spate ↔ interior (cockpit) |
| L / H | – | faruri / claxon |
| 1 – 9, 0 | te duce exact în punctul din care a fost făcută fiecare poză (toate 14 sunt și în lista din ecranul de start) | |
| P / Esc | captură ecran / meniu (calitate grafică, sunet) | |

Pe telefon: joystick virtual în stânga, tragi cu degetul în dreapta ca să te uiți, butoane pentru sărit/fugă/F/claxon/cameră.

## Ce e „1:1” și ce e aproximat

* **Texturi reale din poze** (`tools/extract_textures.py`): fațada prispei și a verandei (fereastra albă, pălăria roșie, jaluzelele, ușa), peretele bej cu aerisirile, tabla acoperișului, ecranul de iederă al gardului (tăiat exact între bare, ca barele 3D să cadă peste cele din poză), placajul de piatră, zidul de piatră al vecinului, betonul, cornierul ruginit de la bordură și asfaltul (rectificat de sus din poza 1).
* **Dimensiuni**: estimate din poze folosind repere cu mărime cunoscută (lățimea Opel Corsa C = 1,65 m, BMW E90 = 4,52 m, înălțimea camerei ≈ 1,5 m, lățimea ușii). Poziția casei, a gardului, a stâlpului, a BMW‑ului și a Opel‑ului „PH 13 KLI”, a SUV‑ului, a gropii de canal și a marcajelor sunt puse după poze; eroarea e de ordinul zecilor de centimetri, nu măsurători cu ruleta.
* **Partea de sud** (pozele 6–10): Peugeot 508 gri „PH 77 XXS”, straturile cu plante (yucca, urechea‑ursului, arbuști) cu bordură de beton, zidul gri de vizavi cu tencuială reală din poză, soclu de piatră, coamă de țiglă, poarta mare de lemn și portița nr. 10 cu cutia poștală, platforma de beton, gardul vișiniu cu oțetarul, stâlpii cu lămpi LED pe partea de est, trecătorul cu sacoșa galbenă și dealul de la capăt cu râpa de lut.
* **Curtea** (pozele 11–14): prispa adâncă de ~2,5 m cu stâlpii de lemn și căpriorii la vedere, ușa verandei cu plasă, cele două trepte cu gresie și preșul „HELLO”, vaza de Horezu, ghiveciul pe suport de răchită, peretele cu placaj tip cărămidă și ușa de la capătul prispei, coșurile suspendate, setul de ratan, uscătorul de rufe, stratul cu bordură de beton, țevile galbene de gaz spre firida de lângă gard și grădina din sud cu gazon, bancă, masă cu față de masă, umbrelă și spalier.
* **Restul străzii și tot satul** vin din harta reală (secțiunea de mai sus): fiecare casă pe amprenta ei din OpenStreetMap, pe relieful real.
* **Câinii** (pozele 15–16): ciobănescul belgian negru (Groenendael) culcat pe gazon lângă stâlpii verzi ai sârmei de rufe, cu tufa de trandafiri și smocul de păiuș albastru din poză, și câinele mic roșcat cu urechi mari, stând la soare pe prispă lângă ușa verandei. Corpurile sunt sculptate din forme netede (câmp de distanțe, rețea „surface nets”), blana e din straturi de fire (lungă și culcată la ciobănesc, scurtă la cel roșcat); respiră și gâfâie, dau din coadă, întorc capul după tine, iar cu **E** îi mângâi. Tastele de vizualizare 15 și 16 sunt în lista din ecranul de start.
* **Strada din pozele 17–21**: acoperișurile sunt orientate după perspectiva din poze (coama perpendiculară pe stradă la casa albă cu coș, la casa înaltă cu șindrilă și la casa piersicie cu două etaje; coamă de-a lungul străzii cu fronton spre stradă la casa ocru de după poarta nr. 10), cu țiglă metalică maro unde apare în poze și tablă zincată deschisă la casa cu șindrilă, la anexa ei și la clădirea joasă de după gardul verde; fațadă din șindrilă de lemn gri-maronie; pe partea de vest: gardul vișiniu cu stâlpi turcoaz și poarta din plasă, stâlpul rotund cu baza vopsită albastru deschis, gardul verde-mentă pe soclu de piatră, apoi tabla vișinie; spre deal: tabla vișinie continuă până la gardul de scânduri maro din fața șopronului, STOP la colțul cu aleea (poza 17) și la intersecția în T (poza 19); scumpia (oțetarul) din fața casei cu șindrilă; râpa de lut de pe deal mutată la stânga axei, ca în poza 17. Mașinile sunt așezate ca în pozele 19–20 (mai noi decât poza 1, deci SUV-ul și hatchback-ul alb din poza 1 nu mai sunt pe dreapta): BMW Seria 1 (PH 71 GRK) la câțiva metri după Corsa, Ford Focus (PH 22 PXZ) urmat de încă două mașini pe acostamentul din stânga, un Golf IV albastru închis lângă gardul maro, o mașină roșie lângă STOP și un SUV alb după intersecție. Pozele 17–19 sunt făcute cu zoom 2x, așa că vederile lor folosesc același unghi de câmp (revine la normal când pleci din loc). Pozele 17–21 sunt în lista din ecranul de start (tastele 1–0 rămân pentru primele 10). Ce nu se poate verifica: numerele complete ale mașinilor acoperite în poze (Golf, Kuga) sunt generice, iar Golf-ul break BV 79 BNA din poza 21 nu e pus, pentru că ar sta exact în punctul de vizualizare 9.
* **Pozele 22–23**: casa nr. 111 (OSM way 264515510) e acum casa veche din poza 22: parter, tencuială gri decorativă cu model de puncte și romburi, acoperiș în patru ape din tablă ruginie; în față gard maro din șipci pe soclu de beton, poarta dublă și portița din cadru de oțel maro cu panou presat jos (plăcuțele 111 și vechiul 12), arbuștii cu flori mov și cireșul din dreapta porții; tabla vișinie începe după casă. Pe partea casei tale, după gardul vișiniu al vecinului: garajul vechi din lemn cu uși din tablă roșie, apoi gardul cu stâlpi placați cu piatră și panouri negre de oțel, cu buxuși și yucca pe spațiul verde; casa nr. 122 din spatele lui are țiglă metalică maro. Râpa de lut de pe deal are acum două zone golașe, câte una de fiecare parte a axei străzii, cu pădure între ele (pozele 17, 23). Mașinile ca în poza 23: Peugeot-ul „PH 77 XXS” parcat pe partea opusă lângă tabla vișinie, Golf-ul în fața lui, iar pe locul unde era Peugeot-ul în pozele 6–7 un hatchback argintiu (modelul exact, un Mercedes, nu există în joc).
* **Mașinile** sunt modelate parametric după profilele reale (E90, Corsa C, SUV, Logan, Sandero) — nu sunt modele comerciale scanate.

## Grafică

Three.js r186 (inclus în `vendor/`, merge offline): materiale PBR cu hărți de normale generate din poze, iluminare de cer înnorat (IBL din cerul procedural), umbre soft, ambient occlusion (GTAO) pe Înaltă/Ultra, bloom discret, SMAA, gradare „fotografică” (vignetă, grain), iarbă 3D și frunziș care se mișcă în vânt. Sunetul (vânt, păsări, pași pe asfalt/pietriș/iarbă/gresie, motor, derapaj, claxon, impact) e sintetizat procedural.

Calitatea implicită e aleasă automat (Scăzută pe telefon, Medie/Înaltă pe PC) și se poate schimba din meniu.

## Structură

```
index.html            UI + importmap
src/main.js           bucla jocului, camere, intrare/ieșire din mașină
src/hero.js           casa din poze (fațadă, prispă, verandă, foișor, poartă, țevi de gaz)
src/world.js          stradă, vecini, stâlpi, fire, mașini parcate, vegetație
src/cars.js           caroserii parametrice   src/vehicle.js  fizica mașinii
src/npc.js            trecătorul (animație de mers, poate fi lovit și se ridică)
src/player.js         mersul la persoana I     src/collision.js coliziuni 2D + relief
src/textures.js       texturi foto + procedurale   src/post.js  post‑procesare
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
