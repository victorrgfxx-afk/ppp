import { buildGrip } from './handgeo.js';
import { buildArm } from './armgeo.js';

// Sculpts the driver's hand and arm off the main thread (hand.js): { kind: 'hand', tube, pose, key } (a rim's thickness:
// the right hand round a straight bar, in a pose of its own if given) or { kind: 'arm' } (the right arm) in, its typed
// arrays out (moved, not copied).
self.onmessage = (e) => {
  const it = e.data.kind === 'arm' ? buildArm() : buildGrip(e.data.tube, e.data.pose);
  let r;
  while (!(r = it.next()).done);
  const b = r.value;
  b.kind = e.data.kind; b.key = e.data.key;
  self.postMessage(b, Object.values(b).filter(v => ArrayBuffer.isView(v)).map(v => v.buffer));
};
