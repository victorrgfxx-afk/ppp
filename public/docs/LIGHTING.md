# Lighting calibration

The lighting is not eyeballed. It was solved against pixel measurements taken
from the four reference photographs, so a sunlit gravel surface in the game
lands on the same RGB values as the gravel in the photos.

## Measured targets (from the originals)

| Surface                       | Reference value        |
|-------------------------------|------------------------|
| sunlit crushed stone          | `rgb(160, 148, 130)`   |
| crushed stone in shadow       | `rgb(118, 113, 108)`   |
| sky at the zenith             | `rgb(55, 102, 165)`    |
| sky near the horizon          | `rgb(96, 148, 209)`    |
| sunlit white sandwich panel   | `rgb(226, 227, 218)`   |

## Method

1. three.js's `Sky` shader ends with a gamma-like curve, so its output is
   display-referred, not linear radiance. Dropped straight into an HDR pipeline
   it reads roughly five times too bright and forces a tiny exposure, which in
   turn crushes everything else. `SKY_GAIN = 0.205` (in `src/gfx/Atmosphere.js`)
   rescales it so the renderer can run at `toneMappingExposure = 1.0`.
2. With the sky fixed, the ground response was measured twice — once with the
   sun off and the image-based light at 1.0, once with the sun at 10 and the IBL
   off — which gives the per-unit contribution of each.
3. Solving those two linear contributions for the measured lit and shadowed
   gravel values (targeting a ~2.6:1 lit/shadow ratio rather than the flatter
   ratio the phone's HDR processing produces) gives:
   * `sunGain = 5.95`
   * `scene.environmentIntensity = 1.02`
4. A warm hemisphere light stands in for the bounce off the gravel yard, which
   is what keeps shaded white walls from going blue.

## Verification

Rendering the calibration scene and sampling the framebuffer gives:

| Surface        | Target | Rendered |
|----------------|--------|----------|
| sky zenith     | lum 90 | lum 90   |
| sunlit gravel  | lum 150| lum 149  |
| white panel    | lum 226| lum 239  |

The sun itself is placed by a real solar-position calculation for the site
(44.94 N, 25.90 E) on 22 September, so shadow directions at 13:40 match the
originals instead of being an arbitrary choice.
