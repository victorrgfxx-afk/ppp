"""Copy the OVERRIDES of build_geo.py (the photographed buildings' looks) into assets/geo/geo.json without rebuilding it.

A rebuild needs the raw OSM / DEM downloads (fetch_raw.py); the looks alone (walls, roof, eaves, pitch...) are read by
the game at run time from each building's `o`. What the build itself bakes in (the footprint moved by `dx`, the kind `b`,
the roof `shape`) cannot change here: the script stops if one of those differs from what geo.json was built with.

  python3 geo/sync_overrides.py          (from the game folder)
"""
import ast
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'build_geo.py')
OUT = os.path.join(HERE, '..', 'assets', 'geo', 'geo.json')
BAKED = ('dx', 'b', 'shape')


def overrides():
    tree = ast.parse(open(SRC, encoding='utf8').read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, 'id', None) == 'OVERRIDES' for t in node.targets):
            return eval(compile(ast.Expression(node.value), SRC, 'eval'), {'dict': dict, '__builtins__': {}})
    raise SystemExit('OVERRIDES not found in build_geo.py')


def main():
    ov = overrides()
    raw = open(OUT, encoding='utf8').read()
    geo = json.loads(raw)
    if json.dumps(geo, separators=(',', ':'), ensure_ascii=False) != raw:
        raise SystemExit('geo.json does not round-trip: written by something else than build_geo.py?')
    seen, changed = set(), 0
    for b in geo['buildings']:
        wid = str(b['id'])
        if wid not in ov: continue
        seen.add(wid)
        old, new = b.get('o', {}), ov[wid]
        for k in BAKED:
            if old.get(k) != new.get(k):
                raise SystemExit(f'{wid}: {k} {old.get(k)!r} -> {new.get(k)!r} is baked into the footprint: rebuild with build_geo.py')
        if old != new:
            b['o'] = new
            changed += 1
    missing = sorted(set(ov) - seen)
    if missing: print('not in geo.json (split or out of the map):', ', '.join(missing))
    out = json.dumps(geo, separators=(',', ':'), ensure_ascii=False)
    if out != raw:
        open(OUT, 'w', encoding='utf8').write(out)
    print(f'{changed} buildings updated')


if __name__ == '__main__':
    sys.exit(main())
