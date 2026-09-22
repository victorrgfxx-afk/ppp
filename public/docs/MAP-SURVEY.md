# Site survey — reconstructing the yard from the six reference photographs

Coordinate system used by the game: **+X = east, +Z = south, +Y = up**, origin roughly
the middle of the yard. All units are metres. Heading 0° = map north (−Z), increasing
clockwise. Map north is *not* true north — see §6.

This is the third pass over the photographs. The first two are worth describing,
because what was wrong with them is what this document is really about.

## 0. What the first two reconstructions got wrong

Both earlier attempts measured apparent sizes correctly and then divided by a
focal length that was assumed rather than derived. Apparent size fixes the ratio
`distance ∝ 1 / apparent size`; it says nothing about absolute distance until you
know the lens. Guessing a 65–75° field of view put the hall around 50 m away in
one shot and, from the same standpoint, the office cabin 30 m in front of it —
an arrangement no other photograph supports.

The two lenses are recoverable from the photographs themselves. Two of the yard
shots are the same view seconds apart: same cars, same people, same backhoe. The
hall's facade measures **390 px** in one and **752 px** in the other — a ratio of
1.93, near enough 2.0 that they can only be a phone's 0.5× and 1× cameras. That
fixes both: a 3:4 portrait frame at 1× is **48° horizontal**, at 0.5× about
**87°**. Every distance below follows from those two numbers and nothing else.

## 1. Scale anchors

Objects of known factory size, used to convert pixels to metres:

| Object                        | Real dimensions                  |
|-------------------------------|----------------------------------|
| Romanian licence plate        | 0.520 × 0.110 m                  |
| 200 L steel drum              | 0.585 m diameter, 0.880 m tall   |
| 120 L wheelie bin             | 0.48 × 0.55 × 0.93 m             |
| Sandwich wall panel           | 1.00 m module                    |
| Dacia Dokker                  | 4.363 × 1.751 × 1.814 m          |
| Škoda Octavia III Combi       | 4.659 × 1.814 × 1.452 m          |
| Ford Mondeo Mk5               | 4.871 × 1.852 × 1.482 m          |
| Opel Astra G                  | 4.252 × 1.709 × 1.425 m          |
| Volvo XC60                    | 4.688 × 1.902 × 1.658 m          |
| RAM 1500 Crew Cab             | 5.817 × 2.017 × 1.943 m          |
| Prefab site-office cabin      | 6.0 × 2.45 × 2.55 m              |

## 2. The service hall

Measured on the 0.5× yard shot with a luminance edge finder rather than by eye
(the edges below are where the horizontal gradient peaks at y = 1138):

```
x = 995   facade's west corner          pier   27 px
x = 1022  door 1, left reveal
x = 1108  door 1, right reveal          door   86 px
x = 1147  door 2, left reveal           pier   39 px
          ... bay pitch 125 px, three bays
x ≈ 1385  facade's east corner
```

Facade 390 px over three 86 px openings on a 125 px pitch. Taking the clear
opening as **3.2 m** — which is what the same measurement gives on the garage,
where a 1 m panel module is visible — the hall is:

* **15.5 m** wide, **13 m** deep — no longer than its three bays, which is what
  the user confirmed from the site;
* doors **3.2 m wide × 3.9 m tall**, at **4.95 m** centres, 1.2 m of pier at each end;
* eave **4.6 m** at the front, rising to about 5.4 m at the back.

The openings are taller than they are wide (aspect 0.82), which is also what the
garage close-up shows; the earlier 4.2 × 4.0 m landscape doors were wrong.

## 3. The garage

The only single-bay building, seen in two close-ups. A 1 m panel module is
directly countable along its wall, which makes this the best-measured structure
on the site:

* door **3.05 m wide × 3.8 m tall**, its east reveal **1.0 m** from the corner;
* panel joints run **vertically**;
* the eave is about **5.1 m** above the apron at the door and falls **0.144 per
  metre eastwards** — a mono-pitch running *along the door face*, not back away
  from it. Modelled as 12 m wide, 6.2 m at the west gable and 4.6 m at the east;
* the eave projects **1.3 m** over that face on diagonal struts;
* a street-lamp head on a curved tube bracket sits west of the opening;
* at the east corner, in order: kerb block, leaning grating, blue barrel, red
  TOTAL drum, a wheeled gas trolley (not an extinguisher), rubble.

## 4. The office cabin

A prefab site cabin, not a shipping container: narrow vertical ribbing, a dark
drip fascia round a flat roof, one two-pane sliding window on the long face and
a narrow door on the end. Its window measures **1.86 × 1.29 m** against its own
2.55 m height, which is a standard cabin window and confirms the identification.

Its close-up gives the one piece of geometry that ties the whole site together.
With the camera looking at the hall:

| feature                | apparent size | distance | bearing |
|------------------------|---------------|----------|---------|
| cabin's near corner    | 417 px/m      | 4.96 m   | −2.85°  |
| hall facade            | 144 px/m      | 14.85 m  | +6.75°  |

so the cabin stands about **10 m out from the hall doors**, a little west of
them. The camera height falls out of the same two numbers without needing the
lens at all — the difference in their ground lines divided by the difference in
their scales — and comes to **1.60 m**, exactly eye height for a standing adult.
That agreement is the check that the measurements are sound.

## 5. The yard, and the standpoint that pins it

The 1× and 0.5× yard shots share a standpoint. Reading both at once:

| feature            | 1× px/m | 0.5× px/m | distance |
|--------------------|---------|-----------|----------|
| Dokker             | 158     | 81        | 13.1 m   |
| Volvo XC60         | —       | 70        | 14.7 m   |
| office cabin       | 67.9    | 35        | 30.5 m   |
| hall facade        | 49.3    | 25.5      | 42 m     |

The cabin-to-hall gap comes out at 11.5 m from this standpoint against 10 m from
the close-up — two independent routes to the same number. So the yard in front of
the hall is **about 40 m deep**, open gravel, with the queue of waiting cars along
its west side, a tree line behind them, and the backhoe standing 9 m from the
standpoint at a bearing of 32°, which is what makes it fill the right edge of
both frames.

## 6. Which way the site faces

The photographs settle this and it is not the obvious answer. Sampling the
buildings:

```
hall, piers between the doors     rgb(106,110,110)   rgb(104,110,110)
hall, west return wall            rgb(194,196,186)
garage, door face                 rgb(109,108,98)    rgb(130,135,135)
garage's apron, same frame        rgb(185,173,151)
office cabin, in sun              rgb(171,177,179)
```

Both door faces are in shade while the ground beside them and the gable next to
them are in full sun. At 44.9° N in late September the sun never crosses north of
due east or due west, so a south-facing wall is lit all day: **these faces cannot
be looking south.** The map is therefore laid out with its −Z axis along a true
bearing of **286°**, which puts the sun at about 265° in map terms at midday —
raking across the yard from the map's west, lighting the ground and the gable
ends and leaving the doors in their own shadow, as photographed.

`SITE.north` in `src/gfx/Atmosphere.js` carries that offset; the solar position
itself is still computed properly for 44.94° N, 25.90° E on 22 September.

## 7. Reconstructed standpoints

Stored in `PHOTO_SPOTS`, reachable in game from the menu. `fov` is vertical, for
the 3:4 portrait frame the originals were shot in: 61° there is 48° horizontal.

| # | shot                                | x     | z     | fov |
|---|-------------------------------------|-------|-------|-----|
| 1 | garage from the drive, Octavia in it| 25.6  | −32.9 | 61  |
| 2 | office cabin and the hall           | −23.5 | −37.2 | 61  |
| 3 | the yard and the hall, 1×           | −22.0 | −11.0 | 61  |
| 4 | the same view at 0.5×               | −22.0 | −11.0 | 96  |
| 5 | the garage close up                 | 22.6  | −35.3 | 61  |
| 6 | the industrial estate over the fence| 8.0   | −30.0 | 78  |

## 8. What is still inferred rather than measured

* How far the garage's blank wall runs west — it leaves every frame. 12 m is the
  least assumption consistent with the photographs.
* The site's south half: the entrance, the gate and the street are not in any
  photograph. They are laid out plausibly, not measured.
* The industrial estate beyond the west fence is modelled from one distant shot,
  so its buildings are the right kind and roughly the right size, no more.
* The two neighbouring houses are placed from the bearing and apparent size of
  their roofs over the hedges; their plans are invented.
