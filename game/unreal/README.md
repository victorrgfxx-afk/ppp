# Poiana Câmpina în Unreal Engine 5

Lumea din joc (16 × 16 km în jurul Poienii Câmpina, cu relieful până la 20 km) se exportă din joc și se importă automat în Unreal Engine 5.5 sau mai nou.

## 1. Exportul (o dată, ~5–15 minute)

Ai nevoie de [Node.js LTS](https://nodejs.org) și de Microsoft Edge (există deja pe Windows).

1. Copiază folderul `game` de pe ramura `claude/realistic-first-person-gta-game-aq1h6w-geo` (de exemplu în `D:\PoianaCampina\game`; merge pe orice disc).
2. Dublu-click pe `game\tools\export-unreal.bat`.
   - Se deschide Edge, jocul se construiește la calitate Ultra și exportul se scrie lângă folderul `game`, de exemplu în `D:\PoianaCampina\unreal-export`.
   - Din linia de comandă: `node tools/export-unreal.mjs <folder> [--quality ultra|high] [--headless]`.

Ce conține exportul:

| Fișier / folder | Ce e |
|---|---|
| `manifest.json` | tile-urile, copacii, mașinile, camerele pozelor, poziția soarelui, originea geografică |
| `tiles/T_*.gltf` | pentru fiecare km²: terenul exact din joc (inclusiv zonele refăcute la 1 m), clădirile, drumurile, locurile din poze, gardurile, stâlpii, firele, sticla, apa |
| `terrain/FarTerrain.gltf` | relieful până la 20 km (orizontul) |
| `materials.json`, `textures/` | fiecare material cu valorile PBR, texturile, repetarea și materialele speciale (teren, apă, frunziș, vopsea de mașină, sticlă) |
| `trees/` | modelul fiecărui tip de copac și instanțele lor: cei ~423 000 din hartă, ~3,7 milioane din pădurile generate și ~1,4 milioane de arbuști |
| `cars/` | mașinile parcate, acolo unde stau în joc |
| `calibration.gltf` | un cub de 1 × 2 × 3 m; scriptul măsoară pe el cum convertește Unreal axele și unitățile |

Coordonatele rămân cele din joc (metri, +Y în sus, glTF standard). Validarea: fișierele trec validatorul oficial Khronos glTF, iar vizualizatorul `tools/verify-unreal-export.html` refacă scenele pozelor doar din fișierele exportate.

## 2. Proiectul Unreal

1. Unreal Engine 5.5+ → **Games → Blank** (sau **First Person** dacă vrei direct personajul), cu **Starter Content** oprit.
2. **Edit → Plugins**: pornește **Python Editor Script Plugin** (glTF-ul se importă prin Interchange, pornit implicit în 5.5), apoi repornește editorul.
3. **File → New Level → Empty Open World** (World Partition: încarcă și descarcă zonele pe distanță, necesar pentru 16 km).
4. **Edit → Project Settings**:
   - la *Rendering*, Dynamic Global Illumination = **Lumen**, Reflection Method = **Lumen**, *Support Hardware Ray Tracing* pornit dacă placa video îl are;
   - la *Engine → Rendering → Virtual Textures*, pornește *Enable virtual texture support* (opțional, pentru texturile mari).

## 3. Importul

1. Scriptul găsește singur exportul: folderul `unreal-export` de lângă `game` (unde îl scrie exportul) sau `X:\PoianaCampina\unreal-export` pe orice disc. Doar dacă l-ai mutat în altă parte, setează `EXPORT_DIR` sus în `import_poiana.py`.
2. În editor: **Tools → Execute Python Script…** → `import_poiana.py` (sau în Output Log, modul *Cmd*: `py "D:/PoianaCampina/game/unreal/import_poiana.py"`).
3. Durează (zeci de minute: Nanite se construiește pentru fiecare tile). Progresul apare în fereastra de progres și în Output Log, pe liniile `[Poiana]`.

Ce face scriptul:

- **Calibrarea**: importă cubul de calibrare și măsoară axele și scara importului glTF. Aceeași conversie o aplică copacilor, camerelor și soarelui.
- **Texturile**: le importă și setează sRGB/liniar, hărțile de normale (cu verdele întors: three.js e OpenGL, Unreal e DirectX) și repetarea.
- **Materialele**: construiește nod cu nod materialele master:
  - `M_Poiana_PBR`: culoare, rugozitate, metal, normale, emisie, culoarea vârfurilor și masca de fațadă a clădirilor; opac, mascat sau transparent;
  - `M_Poiana_Foliage`: frunziș pe două fețe, variație de culoare pe copac, vânt mai puternic spre vârf;
  - `M_Poiana_Glass`, `M_Poiana_CarPaint` (clear coat), `M_Poiana_Unlit`;
  - `M_Poiana_Terrain_*`: shaderul terenului din joc rescris în HLSL: culoarea din satelit (Sentinel-2) peste iarbă, pădure, arătură și pietriș;
  - `M_Poiana_Water`: apă cu valuri care curg.

  Apoi face câte un material instance pentru fiecare material exportat.
- **Tile-urile**: le importă și le pune materialele. Terenul și lumea statică primesc **Nanite** și coliziune exactă (poți merge și conduce pe ele). Actorii ajung în folderul `PoianaCampina/Tiles` din Outliner.
- **Copacii**: câte un actor la 2 × 2 km, cu câte o componentă HISM pe fiecare tip de copac. Arbuștii sunt opriți implicit (`STEPS["understory"]`).
- **Mașinile**, **camerele** și **iluminarea**:
  - câte o CineCamera pentru fiecare poză: „Poza 73 — …”, la înălțimea camerei Google (2,5 m) sau a telefonului (1,6 m), cu același unghi de vedere;
  - un PlayerStart la casă;
  - soarele la poziția reală (26 septembrie, 11:30 ora României), atmosferă, lumină de cer în timp real, nori volumetrici, ceață volumetrică și post-process cu Lumen.

Scriptul poate fi rulat din nou: șterge ce a pus înainte. Pașii se pornesc și se opresc din `STEPS`.

## 4. Nivelul următor

- **Copaci**: pentru copaci mai buni, pune modelele tale în `TREE_REPLACE`, de exemplu `"beech": "/Game/Fab/European_Beech/SM_Beech_01"`, cu modele Nanite din Fab/Megascans sau SpeedTree. Rulează din nou doar pasul `trees`. Instanțele rămân exact unde sunt copacii din joc.
- **Iarbă densă**: se adaugă cu PCG (*Surface Sampler* pe meshurile de teren).
- **Personajul și condusul**: șabloanele *First Person* și *Vehicle* din Unreal (Chaos Vehicles). Mutarea logicii din joc (câinii, trecătorii, HUD-ul cu harta, Peugeot-ul reglat) e etapa următoare.

## Limite cunoscute (v1)

- Scriptul e scris pentru API-ul Python din UE 5.5, dar **nu a fost rulat încă într-un Unreal real** (mediul de lucru nu are Unreal). A fost verificat cu un modul `unreal` simulat, care controlează numele pinilor din materiale, tipurile valorilor, citirea fișierelor și calculul transformărilor. Dacă un pas dă eroare, copiază liniile `[Poiana]` din Output Log și trimite-le. Pașii sunt independenți, deci restul continuă.
- Copacii nu au coliziune (HISM fără coliziune); trunchiurile se pot adăuga cu o formă simplă pe mesh.
- Efectele din shaderele jocului (vântul din three.js, AO-ul) sunt refăcute cu echivalentele din Unreal, nu copiate.
- Mormintele și obiectele mici din tile-uri au coliziunea tile-ului (complexă).
