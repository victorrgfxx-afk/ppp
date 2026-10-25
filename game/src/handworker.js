import { buildGrip } from './handgeo.js';

// Sculpts the driver's hand off the main thread (hand.js prepareHands): a rim's thickness in, the right hand round a
// straight bar as typed arrays out (moved, not copied).
self.onmessage = (e) => {
  const it = buildGrip(e.data);
  let r;
  while (!(r = it.next()).done);
  const b = r.value;
  self.postMessage(b, [b.pos.buffer, b.nrm.buffer, b.idx.buffer, b.col.buffer, b.gloss.buffer]);
};
