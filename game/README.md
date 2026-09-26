# Strada · Prahova — joc open‑world first‑person

Strada și casa din cele 5 fotografii, reconstruite 3D și jucabile în browser (stil GTA: mers liber, fugă, sărit, urci în orice mașină parcată și conduci).

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
| 1 – 5 | te duce exact în punctul din care a fost făcută fiecare poză | |
| P / Esc | captură ecran / meniu (calitate grafică, sunet) | |

Pe telefon: joystick virtual în stânga, tragi cu degetul în dreapta ca să te uiți, butoane pentru sărit/fugă/F/claxon/cameră.

## Ce e „1:1” și ce e aproximat

* **Texturi reale din poze** (`tools/extract_textures.py`): fațada prispei și a verandei (fereastra albă, pălăria roșie, jaluzelele, ușa), peretele bej cu aerisirile, tabla acoperișului, ecranul de iederă al gardului (tăiat exact între bare, ca barele 3D să cadă peste cele din poză), placajul de piatră, zidul de piatră al vecinului, betonul, cornierul ruginit de la bordură și asfaltul (rectificat de sus din poza 1).
* **Dimensiuni**: estimate din poze folosind repere cu mărime cunoscută (lățimea Opel Corsa C = 1,65 m, BMW E90 = 4,52 m, înălțimea camerei ≈ 1,5 m, lățimea ușii). Poziția casei, a gardului, a stâlpului, a BMW‑ului și a Opel‑ului „PH 13 KLI”, a SUV‑ului, a gropii de canal și a marcajelor sunt puse după poze; eroarea e de ordinul zecilor de centimetri, nu măsurători cu ruleta.
* **Restul străzii** (casele mai îndepărtate, curțile din spate) e generat procedural în stilul străzii, ca să ai unde să te plimbi.
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

Încarcă jocul, verifică erorile din consolă, face capturi din cele 5 unghiuri ale pozelor și conduce BMW‑ul câțiva metri.
