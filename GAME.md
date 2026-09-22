# Service Auto — Freeroam

An open-world, first-person 3D sandbox running in the browser, built on a yard
reconstructed **1:1 from four photographs**. Designed for phones first
(virtual stick, look-drag, pedals) and equally playable with mouse and
keyboard.

Everything ships in `public/`. There is no build step, no art pipeline and no
asset downloads — the textures, the sky, the vehicles and every sound are
generated at runtime.

```
https://<your-vercel-domain>/          ← the game
https://<your-vercel-domain>/dev/car.html   ← vehicle model viewer
```

Locally:

```bash
npm run game          # static server on http://127.0.0.1:8099
```

## What is in the world

| | |
|---|---|
| **Service hall** | 19.2 × 13 m — only as long as its three bays — with 4.2 × 4.0 m sectional doors, two bays open with two-post lifts, workbench, compressor, tyre stacks |
| **Garage** | 14 × 14 m, mono-pitch roof falling east along the door face on a deep bracketed eave, a portrait 3.1 × 3.6 m door at the east corner, the black Octavia parked half inside with its tailgate and driver's door open |
| **Yard** | crushed stone, two poured concrete pads with real expansion joints, worn dirt tracks, the entrance driveway and a sliding gate |
| **Vehicles** | 10 cars plus a Komatsu-style backhoe loader, all at factory dimensions, with the licence plates as they read in the photos |
| **Props** | the TOTAL oil drum, the blue barrel, the gas-cylinder trolley with its coiled hose, kerb block, leaning grating, jerrycan, pallets, tyres, cones, skip, wheelie bins, scrap pile |
| **Boundaries** | welded-mesh fencing with the two licence plates nailed to the orchard fence, the concrete power line, the dark green industrial hall, distant warehouses and chimneys |
| **Vegetation** | a 63-tree apple orchard on 4.2 m rows, the hedge, the west tree line, wind-animated foliage and grass |
| **People** | the mechanic working at the Octavia's tailgate and the man in a cap by the Astra |

## Controls

**Touch (phone/tablet)**

* left thumb — virtual stick, move / drive
* right side — drag to look
* `ALEARGĂ` sprint · `SARI` jump · `GHEMUIT` crouch · `INTRĂ` enter/exit
* in a vehicle: `GAZ` throttle, `FRÂNĂ` brake and reverse, `MÂNĂ` handbrake, `CLAXON` horn
* top-right: menu, photo-match, lights

**Keyboard and mouse**

| | |
|---|---|
| `WASD` | walk / drive |
| `Shift` | sprint · `Ctrl` crouch · `Space` jump (handbrake in a car) |
| `E` | enter or leave a vehicle, open doors and the gate |
| `F` | headlights / torch · `H` horn |
| `R` | reset the car · `G` flip it back over |
| `P` | cycle the four photo-match viewpoints · `1`–`4` jump to one |
| `Tab` | menu |
| `T` / `G`, `Y` / `B` | backhoe loader arm and boom, when driving it |

## Photo-match mode

Press `P` (or the ◉ button) to step through the four reconstructed camera
poses — the positions, headings and fields of view the original photographs
were taken with. It is there so the reconstruction can be checked against the
source rather than taken on trust. `docs/MAP-SURVEY.md` shows how each one was
derived.

## Settings

The menu exposes quality presets (low → ultra), render scale, FOV, shadow
distance, post-processing, GTAO, adaptive resolution, look sensitivity, stick
dead zone, gyroscope aiming, tilt steering, haptics, head bob, volume, time of
day with a live sun, weather (clear / cumulus / overcast / rain) and wind.

Quality is auto-detected from the GPU string, CPU count and memory, then held
at ~60 fps by an adaptive resolution controller. URL overrides are available
for testing: `?q=high`, `?post=0`, `?t=1200`, `?w=rain`.

## How it is built

```
public/
  index.html            app shell + import map
  styles/ui.css         mobile-first HUD, safe-area aware
  src/
    core/               engine, settings + device detection, input, audio, quality
    gfx/                tileable procedural textures, materials, sky/sun/weather, post
    physics/            cannon-es world, materials, fixed-step loop
    world/              1:1 site plan, structure builders, props, vegetation, batching
    vehicles/           parametric car factory, drivetrain, backhoe
    player/             first-person capsule controller
    ui/                 HUD, minimap, menu
  vendor/               three.js r186 + cannon-es (vendored, no CDN at runtime)
  docs/                 map survey and lighting calibration
```

Notable pieces:

* **Everything is procedural.** Gravel, concrete, asphalt, grass, sandwich
  panel, trapezoid roof sheet, corrugated steel, sectional doors, roof tiles,
  plaster, bark, foliage cards, welded mesh and the licence plates are all
  generated into canvases at boot, with normal and roughness maps derived from
  the height field. The noise lattices are periodic, so every ground texture
  tiles seamlessly.
* **Lighting is measured, not guessed.** See `docs/LIGHTING.md`.
* **Native post-processing.** three r186's `renderer.setEffects` keeps MSAA and
  applies tone mapping after the effect chain, so bloom, GTAO and the grade pass
  run in linear HDR without giving up hardware antialiasing.
* **Static batching.** Meshes are merged by material at load — a car drops from
  ~120 draw calls to ~20, the whole scene from ~2000 to ~1100 including the
  shadow pass.
* **Audio is synthesised.** The engine note is a stack of saw harmonics at the
  firing frequency plus filtered noise, modulated by rpm and load; tyres, wind,
  footsteps per surface, impacts, the horn and the birds are all WebAudio.
* **Tyre dust.** A pooled point system throws up the loose surface behind the
  driven wheels, tinted per surface (warm limestone on the yard, grey on the
  concrete pads) and blown by the same wind vector that moves the foliage.

## Freestyle scoring

Holding a drift, catching air, brushing past a parked car at speed and
sustaining a high speed all score, with a multiplier that climbs while you keep
the run going and banks when you stop. The best total is kept in local storage.
It is the reason to keep driving laps of a yard rather than a mission structure.

## Tests

```bash
npm run game &
npm run test:game      # 20 assertions: walking, sprint, driving, doors, menu, photo mode
npm run test:mobile    # 17 assertions: layout, joystick, look-drag, pedals on a phone viewport
```

## Honest limits

* Absolute metric accuracy is about ±10 %. Four hand-held photos without survey
  markers cannot do better; every dimension is anchored to objects of known
  size in the frames (see `docs/MAP-SURVEY.md` §1).
* The machines moved between the reference shots — the backhoe is working in
  the fourth photo and parked in the second — so the game places them in their
  photo-3/4 arrangement and the second viewpoint differs accordingly.
* The vehicles are parametric low-poly models at correct dimensions and
  liveries, not licensed CAD; people are stylised.
* The terrain is flat, which is what the photos show apart from the 6 cm step
  between the gravel and the concrete pads — and that step is modelled.
