// The Moon's place in the sky (low-precision lunar theory after P. Schlyter, "How to compute planetary positions":
// Keplerian orbit + the 12 largest longitude and 5 latitude perturbations, topocentric parallax), good to ~0.2 deg.
// Checked against PyEphem for Poiana Campina on 26 September 2026 (full moon at 16:49 UTC).
const R = Math.PI / 180;
const rev = (x) => x - Math.floor(x / 360) * 360;

export function moonAltAz(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5, d = jd - 2451543.5;
  const N = rev(125.1228 - 0.0529538083 * d), i = 5.1454, w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666, e = 0.0549, M = rev(115.3654 + 13.0649929509 * d);
  const ws = rev(282.9404 + 4.70935e-5 * d), Ms = rev(356.047 + 0.9856002585 * d);
  let E = M + (180 / Math.PI) * e * Math.sin(M * R) * (1 + e * Math.cos(M * R));
  for (let k = 0; k < 6; k++) E = E - (E - (180 / Math.PI) * e * Math.sin(E * R) - M) / (1 - e * Math.cos(E * R));
  const xv = a * (Math.cos(E * R) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E * R);
  const v = Math.atan2(yv, xv) / R, r = Math.hypot(xv, yv);
  const xh = r * (Math.cos(N * R) * Math.cos((v + w) * R) - Math.sin(N * R) * Math.sin((v + w) * R) * Math.cos(i * R));
  const yh = r * (Math.sin(N * R) * Math.cos((v + w) * R) + Math.cos(N * R) * Math.sin((v + w) * R) * Math.cos(i * R));
  const zh = r * Math.sin((v + w) * R) * Math.sin(i * R);
  let lonE = Math.atan2(yh, xh) / R, latE = Math.atan2(zh, Math.hypot(xh, yh)) / R;
  const Ls = rev(Ms + ws), Lm = rev(M + w + N), D = Lm - Ls, F = Lm - N;
  const s = (x) => Math.sin(x * R);
  lonE += -1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D) - 0.057 * s(M - 2 * D + Ms)
    + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms)
    - 0.015 * s(2 * F - 2 * D) + 0.011 * s(M - 4 * D);
  latE += -0.173 * s(F - 2 * D) - 0.055 * s(M - F - 2 * D) - 0.046 * s(M + F - 2 * D) + 0.033 * s(F + 2 * D) + 0.017 * s(2 * M + F);
  const dist = r - 0.58 * Math.cos((M - 2 * D) * R) - 0.46 * Math.cos(2 * D * R);   // Earth radii
  const ecl = (23.4393 - 3.563e-7 * d) * R;
  const xe = Math.cos(lonE * R) * Math.cos(latE * R);
  const ye = Math.sin(lonE * R) * Math.cos(latE * R) * Math.cos(ecl) - Math.sin(latE * R) * Math.sin(ecl);
  const ze = Math.sin(lonE * R) * Math.cos(latE * R) * Math.sin(ecl) + Math.sin(latE * R) * Math.cos(ecl);
  const ra = Math.atan2(ye, xe), dec = Math.atan2(ze, Math.hypot(xe, ye));
  const n = jd - 2451545.0, gmst = rev(280.46061837 + 360.98564736629 * n);
  const ha = (gmst + lon) * R - ra, phi = lat * R;
  let el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  el -= Math.asin(1 / dist) * Math.cos(el);                                          // seen from the surface, not the centre
  // phase: the illuminated fraction from the Sun-Moon elongation
  const sunLon = rev(Ls + 1.915 * s(Ms) + 0.02 * s(2 * Ms));
  const elong = Math.acos(Math.cos((lonE - sunLon) * R) * Math.cos(latE * R));
  return { el: el / R, az: rev(az / R), illum: (1 - Math.cos(elong)) / 2 };
}
