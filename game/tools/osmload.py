"""Parser OSM -> coordonate locale metrice (x = est, y = nord) centrate pe pin."""
import xml.etree.ElementTree as ET, math

LAT0, LON0 = 45.13403, 25.71109
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110540

def to_xy(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)

def load(path):
    r = ET.parse(path).getroot()
    nodes, ntags = {}, {}
    for n in r.findall('node'):
        nodes[n.get('id')] = to_xy(float(n.get('lat')), float(n.get('lon')))
        t = {x.get('k'): x.get('v') for x in n.findall('tag')}
        if t: ntags[n.get('id')] = t
    ways = {}
    for w in r.findall('way'):
        tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
        refs = [nd.get('ref') for nd in w.findall('nd')]
        pts = [nodes[x] for x in refs if x in nodes]
        ways[w.get('id')] = {'tags': tags, 'refs': refs, 'pts': pts}
    rels = {}
    for rel in r.findall('relation'):
        tags = {t.get('k'): t.get('v') for t in rel.findall('tag')}
        mem = [(m.get('type'), m.get('ref'), m.get('role')) for m in rel.findall('member')]
        rels[rel.get('id')] = {'tags': tags, 'members': mem}
    return nodes, ntags, ways, rels

def assemble_rings(way_list):
    """Uneste segmente de contur (multipoligon) in inele inchise."""
    segs = [list(w) for w in way_list if len(w) >= 2]
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[-1]: ring += s[::-1][1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[0]: ring = s + ring[1:]; segs.pop(i); changed = True; break
                if s[0] == ring[0]: ring = s[::-1] + ring[1:]; segs.pop(i); changed = True; break
        rings.append(ring)
    return rings
