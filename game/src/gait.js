// Gaits of four-legged animals for the skinned beasts (beasts.js): which foot falls when, and how far each leg swings.
//  * walk: a lateral sequence (hind left, fore left, hind right, fore right), three feet on the ground most of the time;
//  * trot: diagonal pairs together (the canids' travelling gait: a wolf trots for hours at ~8-10 km/h);
//  * gallop: rotary, the back flexing and stretching, the body pitching.
// The gait follows the speed relative to the animal's size (the Froude number v^2 / g h: walking below ~0.25, trotting
// below ~2.5, galloping above), the stride lengthening with it. Legs: the upper bone swings fore and aft through the
// stance (the foot on the ground, sliding back as fast as the body moves on) and comes forward in the swing, the lower
// joints folding as the foot lifts.

const OFF = { walk: [0.25, 0.75, 0, 0.5], trot: [0, 0.5, 0.5, 0], gallop: [0, 0.12, 0.62, 0.5] };   // FL FR HL HR (cycles)
const DUTY = { walk: 0.64, trot: 0.5, gallop: 0.36 };
const AMP = { walk: 0.3, trot: 0.4, gallop: 0.6 }, FOLD = { walk: 0.55, trot: 0.65, gallop: 0.9 };
const STRIDE = { walk: 1.7, trot: 2.4, gallop: 3.6 };                                            // x shoulder height
const sm = (t) => t * t * (3 - 2 * t);

export function gaitFor(speed, h, opts = {}) {
  const fr = speed * speed / (9.81 * h);
  if (fr < (opts.walkMax ?? 0.25)) return 'walk';
  if (fr < (opts.trotMax ?? 2.5) && !opts.noTrot) return 'trot';
  return 'gallop';
}

// state: { cycle, gait, blend } (kept by the caller); returns the pose parameters for Beast.pose()
export function gaitPose(state, dt, speed, h, opts = {}) {
  const g = speed < 0.05 ? (state.gait ?? 'walk') : gaitFor(speed, h, opts);
  if (g !== state.gait) state.gait = g;
  const stride = STRIDE[g] * h;
  state.cycle = (state.cycle ?? 0) + dt * speed / stride;
  const move = Math.min(1, speed / (0.4 * h + 0.1));                                       // 0 standing .. 1 moving
  const A = AMP[g] * move, B = FOLD[g] * move, duty = DUTY[g], off = OFF[g];
  const legs = off.map((o, i) => {
    const u = ((state.cycle + o) % 1 + 1) % 1, hind = i >= 2;
    let a, s = 0;
    if (u < duty) a = -A + 2 * A * (u / duty);
    else { const w = (u - duty) / (1 - duty); a = A - 2 * A * sm(w); s = Math.sin(Math.PI * w); }
    return hind ? [a, 0.85 * B * s, -1.0 * B * s] : [a, 0.45 * B * s, 1.15 * B * s];
  });
  const ph = state.cycle * Math.PI * 2;
  const p = { legs, pitch: 0, roll: 0, spine: 0, chest: 0, bob: 0, neck: 0, head: 0, tail: 0, tailYaw: 0 };
  if (g === 'gallop') {
    p.spine = 0.1 * Math.sin(ph) * move; p.chest = -0.08 * Math.sin(ph) * move; p.pitch = 0.07 * Math.sin(ph + 0.6) * move;
    p.bob = 0.05 * h * Math.sin(2 * ph) * move; p.head = -0.08 * Math.sin(ph) * move; p.tail = -0.35 * move;
  } else if (g === 'trot') {
    p.bob = -0.012 * h * Math.abs(Math.sin(2 * ph)) * move; p.roll = 0.02 * Math.sin(ph) * move; p.tailYaw = 0.08 * Math.sin(ph); p.tail = -0.1 * move;
  } else {
    p.bob = -0.01 * h * Math.abs(Math.sin(2 * ph)) * move; p.roll = 0.035 * Math.sin(ph) * move; p.head = 0.06 * Math.sin(2 * ph) * move * (opts.nod ?? 1); p.tailYaw = 0.12 * Math.sin(ph);
  }
  p.gait = g;
  return p;
}
