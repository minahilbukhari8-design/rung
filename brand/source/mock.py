"""Builds social + packaging concept HTML (rendered to PNG by render.js)."""
import base64, json, os, sys
sys.path.insert(0, '/tmp/claude-0/work')
import gen
C = gen.C
OUT = '/mnt/project-files/RUNG/brand/'
FD = '/tmp/claude-0/fonts/'

def mark_svg(r=100, **kw):
    return gen.svg(2*r+8, 2*r+8, gen.mark(r+4, r+4, r, **kw))
def uri(svgtxt):
    return 'data:image/svg+xml;base64,' + base64.b64encode(svgtxt.encode()).decode()
def logo(rel):
    return uri(open(OUT + rel).read())

pattern = uri(gen.svg(120, 120, gen.mark(60, 60, 26, mono='rgba(201,160,78,.22)', centre='rgba(201,160,78,.22)')))
pattern_light = uri(gen.svg(120, 120, gen.mark(60, 60, 26, mono='rgba(43,18,54,.06)', centre='rgba(43,18,54,.06)')))

HEAD = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Fraunces;src:url(file://{FD}fraunces-600.ttf);font-weight:600}}
@font-face{{font-family:Fraunces;src:url(file://{FD}fraunces-400.ttf);font-weight:400}}
@font-face{{font-family:Jakarta;src:url(file://{FD}jakarta-500.ttf);font-weight:500}}
@font-face{{font-family:Jakarta;src:url(file://{FD}jakarta-700.ttf);font-weight:700}}
@font-face{{font-family:Nastaliq;src:url(file://{FD}nastaliq-700.ttf);font-weight:700}}
@font-face{{font-family:Nastaliq;src:url(file://{FD}nastaliq-400.ttf);font-weight:400}}
*{{box-sizing:border-box;margin:0}} body{{width:%W%px;height:%H%px;overflow:hidden;font-family:Jakarta}}
.ur{{font-family:Nastaliq;direction:rtl;line-height:2.1}}
.fr{{font-family:Fraunces}}
.eyebrow{{letter-spacing:.22em;text-transform:uppercase;font-weight:700}}
.pill{{display:inline-block;padding:14px 30px;border-radius:999px;font-weight:700}}
</style></head><body>'''

def page(name, w, h, body):
    html = HEAD.replace('%W%', str(w)).replace('%H%', str(h)) + body + '</body></html>'
    p = f'/tmp/claude-0/work/{name}.html'; open(p, 'w').write(html)
    return [p, OUT + name + '.png', w, h, 1]

jobs = []
dark = f"background:{C['shab']} url({pattern});"
light = f"background:{C['dupatta']} url({pattern_light});"
stripe = ''.join(f'<div style="flex:1;background:{C[k]}"></div>' for k in gen.PETALS)
STRIPE = f'<div style="display:flex;height:14px">{stripe}</div>'

# 1. Launch announcement (Instagram post 1080x1080)
jobs.append(page('social/ig-post-launch', 1080, 1080, f'''
<div style="{dark}width:1080px;height:1080px;color:{C['dupatta']};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative">
 <img src="{uri(mark_svg(150, centre=C['dupatta'], dots=C['zari']))}" width="300">
 <div class="eyebrow" style="color:{C['genda']};font-size:26px;margin-top:40px">Coming soon to Lahore</div>
 <div class="fr" style="font-size:96px;font-weight:600;line-height:1.05;margin-top:20px">Har Khushi,<br>Har Rang</div>
 <div class="ur" style="font-size:54px;color:{C['genda']};margin-top:6px">ہر خوشی، ہر رنگ</div>
 <div style="font-size:28px;opacity:.85;margin-top:14px;max-width:760px">Cakes, flowers, gifts, decor, catering, mehndi, photography: every celebration, one place.</div>
 <div style="position:absolute;bottom:0;left:0;right:0">{STRIPE}</div>
</div>'''))

# 2. Occasion carousel cover
occ = [('Birthday', 'سالگرہ', 'rani'), ('Mehndi', 'مہندی', 'mehndi'), ('Eid', 'عید', 'genda'), ('Aqeeqa', 'عقیقہ', 'firozi'), ('Anniversary', 'شادی کی سالگرہ', 'kesar'), ('Dholki', 'ڈھولکی', 'zari')]
tiles = ''.join(f'''<div style="background:{C[k]};border-radius:28px;padding:26px 28px;color:{'#2B1236' if k in ('genda','zari') else C['dupatta']};display:flex;flex-direction:column;justify-content:space-between;height:220px">
 <div class="fr" style="font-size:44px;font-weight:600">{e}</div><div class="ur" style="font-size:36px;text-align:right">{u}</div></div>''' for e, u, k in occ)
jobs.append(page('social/ig-post-occasions', 1080, 1080, f'''
<div style="{light}width:1080px;height:1080px;padding:80px;color:{C['shab']}">
 <div class="eyebrow" style="color:{C['rani']};font-size:24px">Browse by occasion</div>
 <div class="fr" style="font-size:68px;font-weight:600;line-height:1.1;margin:18px 0 44px">Kya mauqa hai?<br><span style="color:{C['rani']}">What are we celebrating?</span></div>
 <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">{tiles}</div>
 <img src="{logo('logos/rung-logo-bilingual.svg')}" style="height:70px;margin-top:40px">
</div>'''))

# 3. Instagram story — Urdu-first
jobs.append(page('social/ig-story-urdu', 1080, 1920, f'''
<div style="{dark}width:1080px;height:1920px;color:{C['dupatta']};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;padding:90px">
 <img src="{logo('logos/rung-logo-ur-on-dark.svg')}" style="width:760px">
 <div class="ur" style="font-size:72px;margin-top:80px;line-height:2.2">کیک، پھول، تحفے، سجاوٹ<br>سب کچھ ایک جگہ</div>
 <div style="font-size:34px;opacity:.85;margin-top:30px">Cakes, flowers, gifts and decor, all in one place.</div>
 <div class="pill" style="background:{C['rani']};color:#fff;font-size:34px;margin-top:70px">Lahore · Launching soon</div>
 <div style="position:absolute;bottom:0;left:0;right:0">{STRIPE}</div>
</div>'''))

# 4. Vendor recruitment
jobs.append(page('social/ig-post-vendors', 1080, 1080, f'''
<div style="background:{C['rani']};width:1080px;height:1080px;padding:90px;color:#fff;position:relative;overflow:hidden">
 <img src="{uri(mark_svg(300, mono='rgba(255,255,255,.12)', centre='rgba(255,255,255,.12)'))}" style="position:absolute;right:-180px;bottom:-180px;width:720px">
 <div class="eyebrow" style="font-size:24px;color:{C['genda']}">For bakers, florists, decorators, caterers, artists</div>
 <div class="fr" style="font-size:92px;font-weight:600;line-height:1.05;margin-top:30px">Grow your<br>business<br>with RUNG</div>
 <div class="ur" style="font-size:52px;margin-top:20px;text-align:left;direction:rtl;width:fit-content">اپنا کاروبار رنگ کے ساتھ بڑھائیں</div>
 <div style="font-size:30px;margin-top:26px;max-width:640px;opacity:.95">Orders, bookings and payments in one dashboard. Early vendor sign-ups now open in Lahore.</div>
 <div class="pill" style="background:{C['shab']};color:{C['dupatta']};font-size:30px;margin-top:46px">Join as a vendor</div>
</div>'''))

# ---------- Packaging concepts ----------
# A. Cake box lid (top view) 1200x1200
jobs.append(page('packaging/cake-box-lid', 1200, 1200, f'''
<div style="background:#d9d2c7;width:1200px;height:1200px;display:flex;align-items:center;justify-content:center">
 <div style="{light}width:960px;height:960px;border-radius:18px;box-shadow:0 30px 60px rgba(0,0,0,.25);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="position:absolute;inset:36px;border:3px solid {C['zari']};border-radius:10px"></div>
  <div style="position:absolute;left:0;right:0;top:50%;height:70px;margin-top:-35px;background:{C['rani']}"></div>
  <div style="position:absolute;top:0;bottom:0;left:50%;width:70px;margin-left:-35px;background:{C['rani']}"></div>
  <div style="width:360px;height:360px;border-radius:50%;background:{C['shab']};display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 0 10px {C['zari']}">
   <img src="{uri(mark_svg(120, centre=C['dupatta'], dots=C['zari']))}" width="240"></div>
  <div class="fr" style="position:absolute;bottom:70px;right:90px;font-size:38px;color:{C['shab']};letter-spacing:.18em;font-weight:600">RUNG</div>
  <div class="ur" style="position:absolute;top:56px;font-size:40px;color:{C['shab']}">ہر خوشی، ہر رنگ</div>
 </div></div>'''))

# B. Gift bag front 1200x1400
jobs.append(page('packaging/gift-bag', 1200, 1400, f'''
<div style="background:#e7e1d8;width:1200px;height:1400px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:120px">
 <div style="position:relative">
  <div style="position:absolute;left:190px;top:-150px;width:340px;height:220px;border:16px solid {C['zari']};border-bottom:none;border-radius:170px 170px 0 0"></div>
  <div style="{dark}width:720px;height:900px;border-radius:8px 8px 14px 14px;box-shadow:0 40px 70px rgba(0,0,0,.3);display:flex;flex-direction:column;align-items:center;justify-content:center;color:{C['dupatta']};position:relative;overflow:hidden">
   <img src="{logo('logos/rung-logo-en-stacked-on-dark.svg')}" style="width:480px">
   <div class="ur" style="font-size:46px;color:{C['genda']};margin-top:20px">آپ کی خوشی، ہمارا رنگ</div>
   <div style="position:absolute;bottom:0;left:0;right:0">{STRIPE}</div>
  </div></div></div>'''))

# C. Flower sleeve tag + thank-you card + seal sticker, flat lay 1600x1000
jobs.append(page('packaging/cards-and-stickers', 1600, 1000, f'''
<div style="background:#d8cfc3;width:1600px;height:1000px;position:relative">
 <div style="{light}position:absolute;left:90px;top:110px;width:720px;height:480px;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.2);padding:56px;transform:rotate(-3deg);color:{C['shab']}">
  <img src="{logo('logos/rung-logo-bilingual.svg')}" style="height:70px">
  <div class="fr" style="font-size:52px;font-weight:600;margin-top:44px">Made with love,<br>for your khushi.</div>
  <div style="font-size:24px;margin-top:20px;color:#6b5a70">A note from the sender goes here. Printed per order.</div>
  <div style="position:absolute;left:0;right:0;bottom:0;border-radius:0 0 12px 12px;overflow:hidden">{STRIPE}</div>
 </div>
 <div style="position:absolute;left:900px;top:90px;width:300px;height:640px;background:{C['shab']};border-radius:150px 150px 16px 16px;box-shadow:0 20px 40px rgba(0,0,0,.25);transform:rotate(6deg);display:flex;flex-direction:column;align-items:center;padding-top:60px;color:{C['dupatta']}">
  <div style="width:34px;height:34px;border-radius:50%;background:#d8cfc3"></div>
  <img src="{uri(mark_svg(90, centre=C['dupatta'], dots=C['zari']))}" width="190" style="margin-top:50px">
  <div class="ur" style="font-size:40px;color:{C['genda']};margin-top:30px">مبارک ہو</div>
  <div class="fr" style="font-size:30px;margin-top:6px;letter-spacing:.14em">RUNG</div>
 </div>
 <div style="position:absolute;left:1280px;top:600px;width:240px;height:240px;border-radius:50%;background:{C['rani']};box-shadow:0 10px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:8px solid {C['zari']}">
  <img src="{uri(mark_svg(80, mono=C['dupatta'], centre=C['rani']))}" width="150"></div>
 <div style="position:absolute;left:300px;top:700px;width:760px;height:120px;border-radius:12px;background:{C['dupatta']};box-shadow:0 10px 24px rgba(0,0,0,.18);display:flex;align-items:center;padding:0 34px;gap:26px;transform:rotate(1.5deg)">
  <img src="{uri(mark_svg(40))}" width="80"><div style="font-weight:700;color:{C['shab']};font-size:26px">DELIVERY LABEL · Order # · Recipient · Slot</div></div>
</div>'''))

json.dump(jobs, open('/tmp/claude-0/work/jobs.json', 'w'))
