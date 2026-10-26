// The air between the eye and what it sees (V62), one model for the map (three's fog chunks, patched in main.js) and
// for the far relief to the horizon (geo/terrain.js FAR):
//  * the molecules (Rayleigh scattering): extinction at sea level 5.8 / 13.5 / 33.1 x 10^-6 per m at 680 / 550 / 440 nm
//    (blue is lost ~5.7 times faster than red), falling off with height over a scale height of 8 km;
//  * the haze (aerosols): the same at every wavelength, set by the weather's visibility, falling off with height over
//    ~1.2 km on a clear day (the boundary layer: valleys and plains hazier than the ridges above them); the
//    precipitation weathers fill the whole column evenly instead.
// The optical depth along the line of sight is the extinction integrated from the height of the eye to the height of
// the point (closed form for an exponential profile), per colour channel. Of the point's own light exp(-depth) is left;
// the air adds the light it scatters towards the eye: whitish from the haze, bluish from the molecules.
// Visibility (meteorological, Koschmieder): where a dark object is down to 2 % contrast against the horizon sky,
// V = 3.912 / extinction at 550 nm. A clear autumn day over the Subcarpathians ~32 km: the aerosol optical depth at
// 500 nm at Măgurele by Bucharest averages 0.23 (AERONET, 2012-2015); the hills, away from the city, ~0.13-0.15,
// over a 1.2 km scale height.
// The haze's optical depth also goes to the distance blur (post.js AerialBlurPass): the aerosols scatter mostly at
// small angles forward, so part of the light that reaches the eye from far away comes in slightly off its line - the
// softness of distant hills, which grows with the optical depth (multiple scattering; Narasimhan & Nayar 2003,
// Monte-Carlo studies of the atmospheric point spread function).

export const AIR_H0 = 405.25;                     // the street's height above the sea (geo.json meta.origin.h0)
export const RAYLEIGH = [5.8e-6, 13.5e-6, 33.1e-6];
export const RAYLEIGH_H = 8000;
export const HAZE_H = 1200;                       // the aerosols' scale height on a clear day (m)
// the molecules' extinction at 550 nm at the street's level
const R550 = RAYLEIGH[1] * Math.exp(-AIR_H0 / RAYLEIGH_H);
// the aerosols' extinction at the street's level for a visibility of vis metres (the molecules take their share)
export const hazeFor = (vis) => Math.max(0, 3.912 / vis - R550);
// the visibility at the street's level from the aerosols' extinction there
export const visibilityOf = (bM) => 3.912 / (bM + R550);

// GLSL: airColumn() and airPath() (cameraPosition-free: the caller passes the eye)
export const AIR_GLSL = /* glsl */`
float airColumn(float ha, float hb, float d, float H) {
  float x = (hb - ha) / H;
  return d * exp(-ha / H) * (abs(x) > 1e-3 ? (1.0 - exp(-x)) / x : 1.0 - 0.5 * x);
}
// how far a line of sight v looks to the sun's (s) side of the sky, by azimuth: 1 straight at it, 0 straight away (at a
// low sun only the air on its side is lit golden: main.js)
float airToward(vec3 v, vec3 s) {
  return pow(max(0.5 + 0.5 * dot(v.xz, s.xz) * inversesqrt(max(dot(v.xz, v.xz) * dot(s.xz, s.xz), 1e-12)), 0.0), 2.5);
}
void airPath(vec3 e, vec3 p, float bM, float hM, vec3 hazeM, out vec3 T, out vec3 L, out float tauM) {
  float d = length(p - e), he = max(e.y, -250.0), hp = max(p.y, -250.0);
  vec3 tR = vec3(${RAYLEIGH.map(v => v.toExponential(2)).join(', ')}) * airColumn(he + ${AIR_H0.toFixed(2)}, hp + ${AIR_H0.toFixed(2)}, d, ${RAYLEIGH_H.toFixed(1)});
  tauM = bM * airColumn(he, hp, d, hM);
  vec3 tt = tR + tauM;
  T = exp(-tt);
  L = (tR * hazeM * vec3(0.72, 0.88, 1.15) + tauM * hazeM) / max(tt, vec3(1e-9)) * (1.0 - T);
}`;
