"""Sestaví TrueType písmo z pixelových glyfů (každý pixel = čtverec 100 jednotek)."""
import json
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PX = 100
TOP = 3          # řádky nad verzálkami
CAP = 7          # výška verzálek
ASC = (TOP + CAP) * PX
DESC = 2 * PX

src, target = sys.argv[1], sys.argv[2]
glyphs = json.load(open(src, encoding='utf-8'))

order = ['.notdef']
cmap = {}
metrics = {}
outlines = {}

def draw_glyph(pixels):
    pen = TTGlyphPen(None)
    rows = {}
    for x, y in pixels:
        rows.setdefault(y, set()).add(x)
    for y, xs in rows.items():
        xs = sorted(xs)
        start = prev = xs[0]
        runs = []
        for x in xs[1:]:
            if x == prev + 1:
                prev = x
                continue
            runs.append((start, prev))
            start = prev = x
        runs.append((start, prev))
        top = (CAP - y) * PX            # y=0 je horní hrana verzálek
        bottom = top - PX
        for a, b in runs:
            x0, x1 = a * PX, (b + 1) * PX
            pen.moveTo((x0, bottom))
            pen.lineTo((x0, top))
            pen.lineTo((x1, top))
            pen.lineTo((x1, bottom))
            pen.closePath()
    return pen.glyph()

empty = TTGlyphPen(None).glyph()
outlines['.notdef'] = empty
metrics['.notdef'] = (4 * PX, 0)
for ch, g in glyphs.items():
    name = 'uni%04X' % ord(ch)
    order.append(name)
    cmap[ord(ch)] = name
    outlines[name] = draw_glyph(g['px']) if g['px'] else empty
    metrics[name] = ((g['w'] + 1) * PX, 0)
if 0xA0 not in cmap:
    order.append('uni00A0'); cmap[0xA0] = 'uni00A0'
    outlines['uni00A0'] = empty; metrics['uni00A0'] = (4 * PX, 0)

fb = FontBuilder(unitsPerEm=ASC + DESC, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(outlines)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=ASC, descent=-DESC)
fb.setupNameTable({'familyName': 'Kancl Pixel', 'styleName': 'Regular',
                   'copyright': 'Kancelar agentu contributors, MIT License'})
fb.setupOS2(sTypoAscender=ASC, sTypoDescender=-DESC, sTypoLineGap=0,
            usWinAscent=ASC, usWinDescent=DESC, fsType=0)
fb.setupPost()
fb.save(target)
