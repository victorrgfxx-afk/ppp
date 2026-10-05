import { buildBody } from './castgeo.js';

// Builds the forest scene's bodies off the main thread (cast.js makeCast): a kind in, its typed arrays out (moved, not
// copied).
self.onmessage = (e) => {
  const it = buildBody(e.data);
  let r;
  while (!(r = it.next()).done);
  const b = r.value;
  self.postMessage(b, [b.pos.buffer, b.nrm.buffer, b.idx.buffer, b.col.buffer, b.mat.buffer, b.si.buffer, b.sw.buffer]);
};
