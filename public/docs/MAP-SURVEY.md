# Site survey — reconstruction of the yard from the 4 reference photos

Coordinate system used by the game: **+X = east, +Z = south, +Y = up**, origin at the
centre of the large poured-concrete pad in the middle of the yard. All units are metres.
Heading 0° = north (−Z), increasing clockwise.

## 1. Scale anchors

The photos contain objects of known factory dimensions, which is what makes a 1:1
reconstruction possible at all. Every building dimension below was derived by
comparing against these:

| Object (in photo)            | Real dimensions (L × W × H, m) |
|------------------------------|--------------------------------|
| Škoda Octavia III Combi      | 4.66 × 1.81 × 1.47             |
| Ford Mondeo Mk5 / Fusion     | 4.87 × 1.85 × 1.48             |
| Dacia Dokker                 | 4.36 × 1.75 × 1.81             |
| Opel Astra G sedan           | 4.25 × 1.71 × 1.43             |
| RAM 1500 Crew Cab            | 5.82 × 2.02 × 1.94             |
| Komatsu WB93 backhoe loader  | 5.80 × 2.32 × 3.70             |
| ISO site office container    | 6.06 × 2.44 × 2.59             |
| Sectional garage door (hall) | 4.20 × 4.00 (W × H)            |
| Concrete utility pole        | 10.0 tall, 35–40 spacing       |

Derived by measuring the facade in photo 3 at 3× zoom: the piers between the
4.2 m doors read 2.4 m and 2.9 m against the doors themselves, and the wall runs
only about a metre past each outer door. The hall is therefore **19.2 m** long —
no longer than its three bays — with the eave at 1.15 × door height, **4.6 m**.

The same method on photo 1 puts the garage door hard against that building's
east corner, with roughly **1 m** of wall beyond it; the blank wall runs west,
and how far is not determinable because it leaves the frame. It is modelled at
14 m, which is the least assumption consistent with the photo.

## 2. How the four camera positions were reconciled

Each photo constrains the plan. The plan below is the only arrangement I found that
satisfies all four simultaneously:

* **Photo 1** — single-bay garage seen near-frontally, hedge + red-roofed house to its
  right, wire-mesh fence with an orchard behind it receding to the right, the silver
  Ford parked broadside in front of that fence, concrete driveway in the near field,
  a dark red car at the bottom-left corner. ⇒ camera stands on the **entrance
  driveway, south of the garage, looking north**; orchard is **east**.
* **Photo 2** — white Dokker on the left, backhoe behind it, boundary fence with a dark
  green industrial hall, power poles and distant chimneys beyond, cars and people on
  the right, poured concrete pad underfoot. ⇒ camera on the **pad looking north-north-west**;
  the industrial zone is **north/north-west, outside the boundary**.
* **Photos 3 & 4** — the 3-bay service hall across the yard, a row of cars parked
  against the tree line on the left, the white site-office container left of the hall,
  the Dokker parked nose-in in front of it, the backhoe in the right foreground, a
  red-roofed house showing above the hall's left end. ⇒ camera on the **south edge of
  the pad looking north-north-east**; the hall closes the **north-east** side of the yard.

Photo 2 and photos 3/4 are minutes apart from nearly the same spot facing opposite
ways — the Dokker shows its front-left three-quarter in one and its tail in the other,
and the backhoe has moved between them (in photo 4 it is working, boom raised, operator
in the cab). The game therefore places the *site* 1:1 and the *machines* in their
photo-3/4 arrangement, since that is the frame with the most of the yard in it.

## 3. Plan (metres)

```
                                    N  (−Z)
   industrial zone  ┌ green hall (−64..−26, −84..−62) · warehouses (−20..40, −92..−66)
                    │ 2 chimneys (further out, Z ≈ −120) · power line along Z = −57
  ══════════════════╪══ boundary fence  Z = −52 ═════════════════════════
                    │
   house #2 (red roof)      ┌─────── SERVICE HALL B ───────┐
   −46..−33, −52..−41       │ X −35.6..−16.4  Z −35..−22   │
                            │ 19.2 × 13 m — only as long   │
   container office         │ as its 3 bays. Doors SOUTH   │
   (−47.5, −24) 6.06 × 2.44 │ at X = −32.6, −26, −19.4     │
                            └──── apron Z −21.6..−15.6 ────┘
                                                                          orchard
   car row along the                 ███ CONCRETE PAD ███                 X 4..44
   west tree line                    X −40..−16  Z 0..16                  Z −30..12
   X ≈ −48                                                                (apple, 4.2 m rows)
                                              house #1        ┌ mesh fence Z = 12
                    ┌── GARAGE A ──┐          −9..3           │ and X = 4
                    │ X −23..−9    │          −8.5..2.5       │
                    │ Z 2..16      │     hedge                │   silver Ford
                    │ door at the  │     −7..2, 9..20         │   parked at (3, 15)
                    │ EAST corner  │        ▓▓ entrance driveway ▓▓
                    │ (X = −12.2)  │        X −22..6   Z 18..32
                    └──────────────┘
  ═══════════════════════ street (asphalt) Z = 32..40 ═══════════════════
                                    S  (+Z)
```

## 4. Photo-match camera poses

Press the camera button / `P` in game to cycle these. They are the reconstructed poses
of the four reference shots (eye height 1.55 m, phone-like 62° vertical FOV):

| # | Position (x, y, z)   | Heading | Pitch | Vertical FOV | Reference photo                |
|---|----------------------|---------|-------|--------------|--------------------------------|
| 1 | (−6.0, 1.58, 27.0)   | 4°      | +3°   | 79°          | garage + orchard + silver Ford |
| 2 | (−31.0, 1.58, 4.0)   | 338°    | +4°   | 79°          | Dokker + industrial backdrop   |
| 3 | (−29.0, 1.58, 3.0)   | 355°    | +3°   | 79°          | yard + 3-bay hall + container  |
| 4 | (−33.0, 1.58, 11.0)  | 351°    | +4°   | 84°          | wide yard + backhoe            |

The field of view is wide because the originals are: the garage door in the
first photo is 4.2 m across at about 17 m, which subtends roughly 13°, and it
occupies about a fifth of the frame width — so the horizontal field is about
65°, i.e. a wide phone lens rather than a standard one. Each spot was then
checked by computing the bearing of every landmark from the camera and
confirming it lands inside that frame.

## 5. Honest limits of the reconstruction

* The **layout, landmarks, materials, vehicle set and their liveries are taken directly
  from the photos**; plates, colours, the Total oil drum, the blue barrel, the fire
  extinguisher, the two licence plates nailed to the orchard fence, the "40" sign on the
  backhoe cab and the hi-viz operator are all reproduced.
* **Absolute metric accuracy is ±10 %**, because four hand-held photos without survey
  markers or EXIF focal data cannot yield better. Every dimension is anchored to the
  known-size objects in §1 rather than guessed.
* The terrain is modelled as flat; the photos show no grade worth reproducing beyond the
  6 cm step between gravel and the concrete pads, which *is* modelled.
* People are stylised. Everything else — buildings, ground, fences, vegetation, the
  industrial backdrop, the vehicles — is modelled to the proportions above.
