"""RUNG brand asset generator: builds outlined (font-free) SVG logos and app icons."""
import math, os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FD = '/tmp/claude-0/fonts/'
OUT = '/mnt/project-files/RUNG/brand/'

C = dict(
    shab='#2B1236',    # Shab — deep aubergine night (primary dark)
    rani='#D6246E',    # Rani pink (primary)
    genda='#F4A21D',   # Genda marigold
    firozi='#0E8C8C',  # Firozi Multani-tile turquoise
    kesar='#E8572A',   # Kesar saffron
    mehndi='#5B8A3A',  # Mehndi green
    zari='#C9A04E',    # Zari gold
    dupatta='#FBF4EA', # Dupatta ivory (background)
)

_fonts = {}
def font(name):
    if name not in _fonts:
        path = FD + name + '.ttf'
        tt = TTFont(path)
        blob = hb.Blob.from_file_path(path)
        _fonts[name] = (tt, hb.Font(hb.Face(blob)), tt['head'].unitsPerEm)
    return _fonts[name]

def text_path(fname, text, size, x=0, y=0, tracking=0, rtl=False):
    """Shape text with HarfBuzz and return (svg path d, width, (xmin,ymin,xmax,ymax))."""
    tt, hfont, upem = font(fname)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hfont, buf, {'kern': True, 'liga': True})
    s = size / upem
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    pen = SVGPathPen(gs); bpen = BoundsPen(gs)
    cx = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        g = order[info.codepoint]
        gx = x + (cx + pos.x_offset) * s
        gy = y - pos.y_offset * s
        t = (s, 0, 0, -s, gx, gy)
        gs[g].draw(TransformPen(pen, t)); gs[g].draw(TransformPen(bpen, t))
        cx += pos.x_advance + (tracking * upem / size if not rtl else 0)
    return pen.getCommands(), cx * s, bpen.bounds

def svg(w, h, body, bg=None, title='RUNG'):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'<title>{title}</title>{b}{body}</svg>\n')

def save(rel, content):
    p = OUT + rel; os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(content); print('wrote', rel)

# ---------- The mark: "Rang Phool" — six petals, one per colour of celebration ----------
PETALS = ['rani', 'genda', 'firozi', 'kesar', 'mehndi', 'zari']
def petal_d(r):
    # almond/teardrop from centre outward, length r
    return (f'M0,{-0.16*r:.2f} C{0.30*r:.2f},{-0.36*r:.2f} {0.26*r:.2f},{-0.86*r:.2f} 0,{-r:.2f} '
            f'C{-0.26*r:.2f},{-0.86*r:.2f} {-0.30*r:.2f},{-0.36*r:.2f} 0,{-0.16*r:.2f} Z')

def mark(cx, cy, r, mono=None, centre=None, dots=None):
    parts = []
    for i, k in enumerate(PETALS):
        fill = mono or C[k]
        parts.append(f'<path d="{petal_d(r)}" fill="{fill}" transform="translate({cx},{cy}) rotate({i*60})"/>')
    cfill = centre or (mono or C['shab'])
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{0.11*r:.2f}" fill="{cfill}"/>')
    # small dots between petals: like a rangoli / Multani tile star
    for i in range(6):
        a = math.radians(i*60 + 30 - 90)
        parts.append(f'<circle cx="{cx+0.62*r*math.cos(a):.2f}" cy="{cy+0.62*r*math.sin(a):.2f}" r="{0.045*r:.2f}" fill="{dots or mono or C["shab"]}"/>')
    return ''.join(parts)

def path(d, fill): return f'<path d="{d}" fill="{fill}"/>'

def build():
    ink, light = C['shab'], C['dupatta']

    # Mark alone (colour, mono dark, mono light)
    save('logos/rung-mark.svg', svg(512, 512, mark(256, 256, 236)))
    save('logos/rung-mark-mono-dark.svg', svg(512, 512, mark(256, 256, 236, mono=ink, centre=ink)))
    save('logos/rung-mark-mono-light.svg', svg(512, 512, mark(256, 256, 236, mono=light, centre=light)))

    def en_horizontal(fg, dot, bg=None, name=''):
        d, w, bb = text_path('fraunces-600', 'RUNG', 150, x=300, y=205, tracking=10)
        tag, tw, _ = text_path('jakarta-500', 'HAR KHUSHI, HAR RANG', 30, x=304, y=262, tracking=5.5)
        W = int(300 + w + 40)
        body = mark(140, 150, 128, centre=dot, dots=C['zari'] if bg else None) + path(d, fg) + path(tag, C['rani'] if not bg else C['genda'])
        save(f'logos/rung-logo-en-horizontal{name}.svg', svg(W, 300, body, bg))
    en_horizontal(ink, ink)
    en_horizontal(light, light, bg=ink, name='-on-dark')

    def en_stacked(fg, bg=None, name=''):
        d, w, bb = text_path('fraunces-600', 'RUNG', 150, tracking=10)
        x = (600 - w) / 2
        d, w, bb = text_path('fraunces-600', 'RUNG', 150, x=x, y=470, tracking=10)
        tag, tw, _ = text_path('jakarta-500', 'HAR KHUSHI, HAR RANG', 28, tracking=5)
        tag, tw, _ = text_path('jakarta-500', 'HAR KHUSHI, HAR RANG', 28, x=(600-tw)/2, y=530, tracking=5)
        body = mark(300, 175, 150, centre=fg, dots=C['zari'] if bg else None) + path(d, fg) + path(tag, C['rani'] if not bg else C['genda'])
        save(f'logos/rung-logo-en-stacked{name}.svg', svg(600, 580, body, bg))
    en_stacked(ink); en_stacked(light, bg=ink, name='-on-dark')

    def ur_logo(fg, bg=None, name=''):
        # Urdu: mark sits on the RIGHT (reading start for RTL); text right-aligned to x=560
        _, _, bb = text_path('nastaliq-700', 'رنگ', 210, rtl=True)
        y = 40 - bb[1]
        d, w, b2 = text_path('nastaliq-700', 'رنگ', 210, x=560 - bb[2], y=y, rtl=True)
        _, _, tbb = text_path('nastaliq-400', 'ہر خوشی، ہر رنگ', 46, rtl=True)
        ty = b2[3] + 30 - tbb[1]
        tg, tw, t2 = text_path('nastaliq-400', 'ہر خوشی، ہر رنگ', 46, x=560 - tbb[2], y=ty, rtl=True)
        H = int(t2[3] + 40); my = (b2[1] + t2[3]) / 2
        body = mark(720, my, 128, centre=fg, dots=C['zari'] if bg else None) + path(d, fg) + path(tg, C['rani'] if not bg else C['genda'])
        save(f'logos/rung-logo-ur{name}.svg', svg(880, H, body, bg))
    ur_logo(ink); ur_logo(light, bg=ink, name='-on-dark')

    def bilingual(fg, bg=None, name=''):
        en, ew, ebb = text_path('fraunces-600', 'RUNG', 120, x=290, y=200, tracking=8)
        ur, uw, ubb = text_path('nastaliq-700', 'رنگ', 120, rtl=True)
        ux = 290 + ew + 40 - ubb[0]
        ur, uw, ubb = text_path('nastaliq-700', 'رنگ', 120, x=ux, y=205, rtl=True)
        sep = f'<rect x="{290+ew+16}" y="105" width="3" height="110" rx="1.5" fill="{C["zari"]}"/>'
        tag, tw, _ = text_path('jakarta-500', 'HAR KHUSHI, HAR RANG', 26, x=294, y=270, tracking=5)
        W = int(max(ubb[2], 294 + tw) + 40)
        body = mark(130, 175, 112, centre=fg, dots=C['zari'] if bg else None) + path(en, fg) + sep + path(ur, fg) + path(tag, C['rani'] if not bg else C['genda'])
        save(f'logos/rung-logo-bilingual{name}.svg', svg(W, 320, body, bg))
    bilingual(ink); bilingual(light, bg=ink, name='-on-dark')

    # Wordmarks only
    d, w, bb = text_path('fraunces-600', 'RUNG', 200, x=20, y=180, tracking=12)
    save('logos/rung-wordmark-en.svg', svg(int(w + 40), 220, path(d, ink)))
    d, w, bb = text_path('nastaliq-700', 'رنگ', 240, rtl=True)
    d, w, bb2 = text_path('nastaliq-700', 'رنگ', 240, x=30 - bb[0], y=30 - bb[1] + 0, rtl=True)
    save('logos/rung-wordmark-ur.svg', svg(int(bb[2]-bb[0] + 60), int(bb[3]-bb[1] + 60), path(d, ink)))

    # App icon: 1024 master, aubergine ground, colour mark; plus adaptive foreground/background for Android
    def icon(name, bg, rounded):
        r = '<rect width="1024" height="1024" rx="224" fill="%s"/>' % bg if rounded else f'<rect width="1024" height="1024" fill="{bg}"/>'
        glow = '<defs><radialGradient id="g" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#4A1E5C"/><stop offset="1" stop-color="#2B1236"/></radialGradient></defs>'
        ground = r.replace(bg, 'url(#g)') if bg == C['shab'] else r
        save(f'app-icon/{name}.svg', svg(1024, 1024, glow + ground + mark(512, 512, 380, centre=C['dupatta'], dots=C['zari'])))
    icon('rung-app-icon-ios', C['shab'], False)          # iOS masks corners itself; ship square
    icon('rung-app-icon-rounded-preview', C['shab'], True)
    save('app-icon/android-adaptive-foreground.svg', svg(1024, 1024, mark(512, 512, 300, centre=C['dupatta'], dots=C['zari'])))
    save('app-icon/android-adaptive-background.svg', svg(1024, 1024, '', bg=C['shab']))
    save('app-icon/android-monochrome.svg', svg(1024, 1024, mark(512, 512, 300, mono='#000000', centre='#000000')))
    save('app-icon/favicon.svg', svg(64, 64, '<rect width="64" height="64" rx="14" fill="%s"/>' % C['shab'] + mark(32, 32, 27, centre=C['dupatta'], dots=C['zari'])))

    # Export outlined Urdu/English strings for HTML social/packaging templates
    import json
    snippets = {}
    for key, (f, t, s, rtl) in {
        'ur_tag': ('nastaliq-400', 'ہر خوشی، ہر رنگ', 100, True),
        'ur_name': ('nastaliq-700', 'رنگ', 100, True),
    }.items():
        d, w, bb = text_path(f, t, s, rtl=rtl)
        snippets[key] = dict(d=d, bbox=bb)
    json.dump(snippets, open('/tmp/claude-0/work/snippets.json', 'w'))

if __name__ == '__main__':
    build()
