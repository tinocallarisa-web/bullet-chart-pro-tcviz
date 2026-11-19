# -*- coding: utf-8 -*-
"""Infografías y capturas de la ficha de Bullet Chart Pro 1.6 (1366x768, assets/) con la plantilla común de la web.

Plantilla: C:/tcviz/datos/demo_rtm/infografias.py (la misma de Box & Whisker, Radar, Treemap y Marimekko). La ficha web
del Bullet (C:/tcviz/web/src/data.js) sigue en 1.5 y además dice cosas falsas (la previsión y la orientación vertical
como gratis, el modo IBCS): aquí se sustituyen el subtítulo, los pozos, los pasos y el reparto Free/Pro por los de la 1.6,
sacados de capabilities.json y de attemptedPro() en src/visual.ts.
Las imágenes son del simulador (tools/simulador/capturas/60_* a 62_*), que carga el visual real con datos de Begudes Nord
(ficticios); ninguna lleva la marca "Pro preview" (la build de prueba fuerza Pro). Ningún pie dice "Power BI Desktop".
Cinco imágenes: es lo que admite la ficha contando las infografías.

    node build-test.js && rm -rf .tmp/sim_pro && cp -r .tmp/drop .tmp/sim_pro && python tools/simulador/harness.py ficha && python tools/gen_infographic.py
Salida: assets/infographic.png, infographic-pro.png, Screenshot_1..3.png; docs/infographic.html e infographic-pro.html.
"""
import base64, html, mimetypes, os, re, shutil, subprocess, sys, tempfile, urllib.parse
sys.path.insert(0, r"C:\tcviz\datos\demo_rtm")
import infografias as I
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "tools", "simulador", "capturas")
ASSETS = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, ".tmp", "ficha")
os.makedirs(OUT, exist_ok=True)
e = html.escape
CSS = I.CSS % {"pop": I.uri(os.path.join(I.BASE, "tema", "Poppins"))}
LOGO = I.uri(os.path.join(I.WEB, "logos", "tcviz-logo-light.svg"))
cap = lambda n: I.uri(os.path.join(CAP, n + ".png")).replace(" ", "%20")   # la carpeta del repo lleva un espacio

P = {p["id"]: p for p in I.productos()}["bullet-chart-pro"]
P["tagline"] = "Actual against target on one line: the gap, its sign and how far it is from good."
P["dataRoles"] = [   # cinco: es lo que cabe en la plantilla con esta imagen
    {"role": "Category", "required": True, "desc": "Regions, products or teams: one bar each. Drilldown on hierarchies."},
    {"role": "Actual (Real)", "required": True, "desc": "The measure you track; its dynamic format string row by row."},
    {"role": "Target", "required": False, "desc": "Budget, plan or last year: the variance is calculated for you."},
    {"role": "More measures (Pro)", "required": False, "desc": "Second target, year-end forecast and band limits from your own measures."},
    {"role": "Small Multiples By (Pro)", "required": False, "desc": "One panel per channel, region or year."},
]
P["quickStart"] = [
    "Category and Actual: one bar per item, scaled to fit the visual.",
    "Add Target: the marker, the variance and its % appear by themselves.",
    "Sort by variance % and pick the Report theme or a collection style.",
    "Pro: second target, forecast, bands from measures, small multiples.",
]
P["features"] = [{"name": n, "free": True} for n in (
    "Actual vs target, variance and % calculated for you",
    "Three qualitative bands, two reference lines",
    "Conditional formatting (fx) on bar and target",
    "Sort by actual, target, variance or variance %",
    "Report theme or 6 collection styles",
    "Accessibility card: high contrast, focus, minimum text",
    "Axis title, gridlines, row height and bar thickness",
    "Dynamic format strings, drilldown, bookmarks, 12 languages",
)]
P["freemium"] = {"free": "", "pro": ["Second target (stretch goal or last year)", "Year-end forecast marker", "Bands from your own measures",
                                     "Small multiples with the 9 common options", "Vertical orientation"]}
DATOS = "Sample data: Begudes Nord, a fictitious drinks company"


def autocontenido(h_html, destino):
    """Copia el HTML con cada file:/// incrustado como data URI, para que docs/ no apunte a C:/."""
    t = open(h_html, encoding="utf-8").read()

    def incrusta(m):
        ruta = urllib.parse.unquote(m.group(1).replace("file:///", "")).replace("/", os.sep)
        tipo = mimetypes.guess_type(ruta)[0] or ("font/ttf" if ruta.endswith(".ttf") else "application/octet-stream")
        return "data:%s;base64,%s" % (tipo, base64.b64encode(open(ruta, "rb").read()).decode())
    t = re.sub(r"(file:///[^'\")\s]+)", incrusta, t)
    open(destino, "w", encoding="utf-8", newline="\n").write(t)


def render(h_html, nombre):
    png2x = os.path.join(OUT, nombre + "@2x.png")
    png1x = os.path.join(ASSETS, nombre + ".png")
    subprocess.run([I.EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    "--allow-file-access-from-files", f"--screenshot={png2x}", "--window-size=1366,768", I.uri(h_html).replace(" ", "%20")],
                   capture_output=True, timeout=90)
    Image.open(png2x).convert("RGB").resize((1366, 768), Image.LANCZOS).save(png1x, optimize=True)
    print("  ", os.path.relpath(png1x, ROOT))


def cabecera(titulo, sub, tier='<span class="pill free">Free</span><span class="pill pro">Pro</span>'):
    return (f'<div class="cab"><img class="logo" src="{LOGO}"><div class="sep"></div>'
            f'<div><h1>{e(titulo)}</h1><p>{e(sub)}</p></div><div class="tier">{tier}</div></div><div class="raya"></div>')


PIE = (f'<div class="fin"><span>tcviz.com · Power BI custom visual · {e(P["name"])}</span>'
       f'<span>{e(DATOS)} · drawn by the visual, Report theme</span></div>')


def pagina(nombre, cuerpo, extra_css=""):
    h = os.path.join(OUT, nombre + ".html")
    open(h, "w", encoding="utf-8").write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head><body>{cuerpo}</body></html>')
    return h


# 1. Infografía general: plantilla común de la web, con la imagen principal en el centro
tmp = tempfile.mkdtemp()
try:
    shutil.copy(os.path.join(CAP, "60_central.png"), os.path.join(tmp, "central_99.png"))
    exp, I.EXP = I.EXP, tmp
    ficha = I.ficha(P, 99, "Which zones are behind budget, and by how much?")
    I.EXP = exp
    viejo = "Sample report on Begudes Nord, a fictitious drinks company — Power BI Desktop, TCViz theme"
    assert viejo in ficha   # la imagen es del simulador: el pie de la plantilla mentiría
    ficha = ficha.replace(viejo, DATOS + " — drawn by the visual, Report theme, free tier")
    assert "IBCS" not in ficha
    h1 = os.path.join(OUT, "infographic.html")
    open(h1, "w", encoding="utf-8").write(ficha)
    render(h1, "infographic")
    autocontenido(h1, os.path.join(ROOT, "docs", "infographic.html"))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# 2. Free frente a Pro con el mismo dato
DOS = """.dos{position:absolute;left:24px;right:24px;top:115px;bottom:40px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dos .card{padding:14px 16px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.dos .im{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.dos img{max-width:100%;max-height:100%;border-radius:4px;display:block;border:1px solid #EEE}
.dos h2{font-size:16px} .dos .f h2{color:#3E9C5B} .dos .p h2{color:#2B6CB0}
.dos ul{list-style:none;margin-top:10px;columns:2;column-gap:18px}
.dos li{font-size:12.5px;line-height:1.35;padding-left:16px;position:relative;margin-bottom:6px;break-inside:avoid}
.dos .f li:before{content:'✓';color:#3E9C5B;position:absolute;left:0;font-weight:700}
.dos .p li:before{content:'+';color:#2B6CB0;position:absolute;left:0;font-weight:700}
.sub{font-size:12.5px;color:#666;margin:-4px 0 8px}"""
free_items = ["Actual, target, variance and %", "Three bands, two reference lines", "fx on bar and target", "Sort by variance %",
              "Report theme or 6 collection styles", "Accessibility card, 12 languages"]
li = lambda xs: "".join(f"<li>{e(x)}</li>" for x in xs)
h2 = pagina("infographic-pro", cabecera("Free compares with budget. Pro adds the year ahead.",
                                        f'{P["name"]} — the same seven zones, without and with a licence.') + f"""
<div class="dos">
<div class="card f"><h2>Free — the complete bullet chart</h2><div class="sub">Each zone against its budget: bar, target, bands and the variance in € and %.</div>
<div class="im"><img src="{cap('60_free')}"></div><ul>{li(free_items)}</ul></div>
<div class="card p"><h2>Pro — by channel, with forecast and stretch goal</h2><div class="sub">Small multiples per channel; the year-end forecast and a stretch goal next to the budget.</div>
<div class="im"><img src="{cap('60_pro')}"></div><ul>{li(P["freemium"]["pro"])}</ul></div>
</div>
<div class="fin"><span>tcviz.com · Power BI custom visual · {e(P["name"])}</span><span>Without a licence, Pro features are drawn working under a "Pro preview" watermark while you edit.</span></div>""", DOS)
render(h2, "infographic-pro")
autocontenido(h2, os.path.join(ROOT, "docs", "infographic-pro.html"))

# 3. Capturas de la ficha: una idea por imagen
UNA = """.una{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:flex;gap:16px}
.una .card{padding:14px;display:flex;align-items:center;justify-content:center;flex:1;min-width:0}
.una img{max-width:100%;max-height:100%;display:block}
.una .lado{flex:0 0 330px;flex-direction:column;align-items:flex-start;justify-content:flex-start}
.una .lado h2{font-size:17px;margin-bottom:8px} .una .lado p{font-size:13.5px;line-height:1.45;color:#444;margin-bottom:10px}
.tres{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:grid;grid-template-columns:1.55fr 1fr;grid-template-rows:322px 1fr;gap:14px}
.tres .card{padding:10px;display:flex;flex-direction:column;align-items:flex-start;min-height:0;overflow:hidden}
.tres .l{grid-row:1 / span 2}
.tres img{display:block;border:1px solid #EEE}
.tres b{font-size:12.5px;margin-bottom:6px;color:#555}
.est{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:12px}
.est .card{padding:8px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.est img{flex:1 1 auto;min-height:0;width:100%;object-fit:contain;display:block;border-radius:3px} .est b{font-size:12.5px;margin-top:5px;color:#555}"""


def una(n, titulo, sub, img, lado_h, lado_p):
    ps = "".join(f"<p>{e(x)}</p>" for x in lado_p)
    h = pagina(f"Screenshot_{n}", cabecera(titulo, sub) + f"""<div class="una"><div class="card"><img src="{cap(img)}"></div>
<div class="card lado"><h2>{e(lado_h)}</h2>{ps}</div></div>""" + PIE, UNA)
    render(h, f"Screenshot_{n}")


una(1, "Which zones are behind budget?", "Seven zones sorted by variance %, with the year-end forecast (Pro), an axis title and a minimum-per-zone line.",
    "60_hero", "Worst first, at a glance",
    ["Sorted by variance %, the zones that need a conversation come first: Lleida is €160K under budget (−12.5 %), then Girona (−7.3 %) and Mallorca (−6.9 %).",
     "Andorra is the furthest ahead (+6.7 %); Barcelona and València beat budget by more than 5 %.",
     "The triangle is where each zone is forecast to close the year: Lleida stays below its budget, Girona gets close.",
     "Sorting, the axis title and reference lines are free; the forecast marker is Pro."])
w = lambda px: f"{px * 0.82:.0f}px"   # las tres a la misma escala: 0,82 px de imagen por px del visual
h3 = pagina("Screenshot_2", cabecera("Readable at any size", "The same visual and settings in a large, medium and small slot, at the same scale: the rows share the height and the values keep what fits.") + f"""
<div class="tres"><div class="card l"><b>Large · 900 × 520</b><img src="{cap('61_size_l')}" style="width:{w(900)}"></div>
<div class="card"><b>Medium · 520 × 330</b><img src="{cap('61_size_m')}" style="width:{w(520)}"></div>
<div class="card"><b>Small · 300 × 170</b><img src="{cap('61_size_s')}" style="width:{w(300)}"></div></div>""" + PIE, UNA)
render(h3, "Screenshot_2")
est = "".join(f'<div class="card"><img src="{cap("62_style_" + s)}"><b>{s.title()}</b></div>'
              for s in ("boardroom", "ledger", "editorial", "signal", "aurora", "terrace"))
h4 = pagina("Screenshot_3", cabecera("Six collection styles, free", "The same looks as the rest of TCViz, so a page with other TCViz visuals reads as one report. Or keep the Report theme.") +
            f'<div class="est">{est}</div>' + PIE.replace(", Report theme", ""), UNA)
render(h4, "Screenshot_3")
print("ok")
