# -*- coding: utf-8 -*-
"""Simulador Playwright de Bullet Chart Pro 1.6: estilos de la colección, Accesibilidad, fx, orden, alto de filas, eje,
líneas de referencia, small multiples y marca de agua común.

Carga el bundle de una build de prueba con un host simulado y un dataView categorical sintético (Begudes Nord, empresa
ficticia de bebidas: ventas frente a presupuesto por zona). No reproduce el motor de Power BI: el panel, los tooltips
y la licencia reales solo se ven en Desktop. Aquí se comprueba que el visual LEE lo que Power BI le manda.

Uso (las builds dejan el bundle en .tmp/drop; se copia a .tmp/sim_pro y .tmp/sim_free):
    node build-test.js --free && rm -rf .tmp/sim_free && cp -r .tmp/drop .tmp/sim_free
    node build-test.js        && rm -rf .tmp/sim_pro  && cp -r .tmp/drop .tmp/sim_pro
    python tools/simulador/harness.py        → tools/simulador/capturas/*.png y un OK/FALLO por comprobación
    python tools/simulador/harness.py ficha  → solo las imágenes de la ficha (60_* a 62_*), para tools/gen_infographic.py
"""
import asyncio, io, json, os, sys
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas")
FALLOS = []

STUB = r"""
window.__ev = [];
window.powerbi = { visuals: { plugins: {} }, extensibility: {} };
(function(){
 function mkId(k){ return { __k:k, getKey(){return k;}, getSelector(){return {k};}, equals(o){return !!o && o.__k===k;}, includes(o){ return !!o && o.__k===k; } }; }
 window.__persist = [];
 window.__host = {
  eventService: { renderingStarted(){ __ev.push('S'); }, renderingFinished(){ __ev.push('F'); }, renderingFailed(o,m){ __ev.push('X'); console.error('FAILED', m); } },
  createSelectionManager(){ return { select(){ return Promise.resolve([]); }, clear(){ return Promise.resolve(); }, getSelectionIds(){ return []; },
     hasSelection(){ return false; }, registerOnSelectCallback(){}, showContextMenu(){ return Promise.resolve(); } }; },
  createSelectionIdBuilder(){ const k=[]; return { withCategory(c,i){ k.push(c.source.queryName+'='+c.values[i]); return this; },
     withMeasure(m){ k.push(m); return this; }, withSeries(){ return this; }, createSelectionId(){ return mkId(k.join('|')); } }; },
  createLocalizationManager(){ return { getDisplayName(k){ return k; } }; },
  tooltipService: { enabled(){ return true; }, show(o){ window.__tip = o; }, move(){}, hide(){} },
  subSelectionService: { subSelect(){}, updateRegionOutlines(){} },
  hostCapabilities: { allowInteractions: true }, locale: 'en-US',
  colorPalette: { isHighContrast: !!window.__sysHC, foreground:{value: window.__sysHC ? '#FFFF00' : '#252423'}, background:{value: window.__sysHC ? '#000000' : '#FFFFFF'},
    foregroundNeutralSecondary:{value:'#605E5C'}, foregroundSelected:{value:'#1AEBFF'}, getColor(k){ return {value:'#118DFF'}; } },
  fetchMoreData(){ return false; }, persistProperties(p){ __persist.push(p); }, launchUrl(){}, displayWarningIcon(){}, hideWarningIcon(){},
 };
 if (window.__license) window.__host.licenseManager = {
   getAvailableServicePlans(){ return Promise.resolve({ plans: [], isLicenseUnsupportedEnv: false, isLicenseInfoAvailable: true }); },
   notifyFeatureBlocked(){ return Promise.resolve(true); }, notifyLicenseRequired(){ return Promise.resolve(true); }, clearLicenseNotification(){ return Promise.resolve(true); } };
})();
"""

# Begudes Nord (ficticia): ventas del año frente a presupuesto, por zona (miles de euros).
ZONAS = [  # zona, real, presupuesto, previsión cierre, objetivo ambicioso, canal
    ("Barcelona", 4210, 4000, 4380, 4400),
    ("Girona", 1530, 1650, 1590, 1800),
    ("Tarragona", 1985, 1900, 2060, 2100),
    ("Lleida", 1120, 1280, 1170, 1400),
    ("Andorra", 640, 600, 668, 660),
    ("Mallorca", 2280, 2450, 2350, 2600),
    ("València", 2640, 2500, 2710, 2750),
]
CANALES = {"Horeca": 0.58, "Retail": 0.42}
FMT = "€#,0K"   # cadena del modelo: miles de euros con K


def dv(objects=None, forecast=False, target2=False, bands=False, trellis=False, rule=None, zonas=None):
    zs = zonas or ZONAS
    cats, trl, act, tgt, fc, t2, b1, b2, bm = [], [], [], [], [], [], [], [], []
    filas = [(z, None, 1.0) for z in zs] if not trellis else [(z, c, f) for c, f in CANALES.items() for z in zs]
    for (z, a, t, f, s2), canal, k in filas:
        cats.append(z); trl.append(canal)
        act.append(round(a * k * (1.06 if canal == "Retail" and z in ("Girona", "Lleida") else 1), 1)); tgt.append(round(t * k, 1))
        fc.append(round(f * k, 1)); t2.append(round(s2 * k, 1))
        b1.append(round(t * k * 0.85, 1)); b2.append(round(t * k * 0.97, 1)); bm.append(round(t * k * 1.15, 1))
    def cat(nombre, q, rol, vals):
        return {"source": {"displayName": nombre, "queryName": q, "roles": {rol: True}}, "values": vals}
    def val(nombre, rol, vals):
        return {"source": {"displayName": nombre, "queryName": "Sum(V." + nombre + ")", "roles": {rol: True}, "isMeasure": True, "format": FMT}, "values": vals}
    c1 = cat("Zone", "V.Zone", "category", cats)
    if rule:
        c1["objects"] = [({"colors": rule[z]} if z in rule else None) for z in cats]
    categories = [c1] + ([cat("Channel", "V.Channel", "trellisBy", trl)] if trellis else [])
    values = [val("Sales", "actual", act), val("Budget", "target", tgt)]
    if forecast: values.append(val("Year-end forecast", "forecast", fc))
    if target2: values.append(val("Stretch goal", "target2", t2))
    if bands: values += [val("Band 1 limit", "band1Limit", b1), val("Band 2 limit", "band2Limit", b2), val("Band max", "bandMax", bm)]
    return {"metadata": {"columns": [c["source"] for c in categories + values], "objects": objects or {}},
            "categorical": {"categories": categories, "values": values}}


def check(name, ok, detail=""):
    print(f"  {'OK   ' if ok else 'FALLO'} {name}{'  — ' + detail if detail else ''}")
    if not ok: FALLOS.append(name)


async def page(browser, build, data, W=900, H=520, view=0, sys_hc=False, license=False, name=None, bg="#FFFFFF"):
    drop = os.path.join(ROOT, ".tmp", build)
    guid = json.load(io.open(os.path.join(drop, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    pg = await browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(f"<html><body style='margin:0;background:{bg}'><div id='host' style='position:relative;width:{W}px;height:{H}px;overflow:hidden'></div></body></html>")
    await pg.add_style_tag(path=os.path.join(drop, "visual.css"))
    await pg.add_script_tag(content=f"window.__sysHC = {json.dumps(sys_hc)}; window.__license = {json.dumps(license)};")
    await pg.add_script_tag(content=STUB)
    await pg.add_script_tag(path=os.path.join(drop, "visual.js"))
    await pg.evaluate("(g) => { window.__v = powerbi.visuals.plugins[g].create({ element: document.getElementById('host'), host: __host }); }", guid)
    await pg.evaluate("([dv, W, H, vm]) => __v.update({ dataViews: dv ? [dv] : [], viewport: {width: W, height: H}, type: 2, operationKind: 0, viewMode: vm })",
                      [data, W, H, view])
    await pg.wait_for_timeout(500)
    if name:
        await pg.screenshot(path=os.path.join(OUT, name + ".png"))
    ev = await pg.evaluate("() => __ev.join('')")
    check(f"{name or 'página'}: sin errores y eventos de render 1:1", not errs and ev.count("S") == ev.count("F") and "X" not in ev, f"eventos {ev} {errs[:2]}")
    return pg


ROWS = "() => Array.from(document.querySelectorAll('g[role=listitem]')).map(g => g.getAttribute('aria-label').split(',')[0])"
LOOK = """() => { const r = document.querySelector('rect[data-o=actual]'); const t = document.querySelector('rect[data-o=target]');
    const c = document.querySelector('.bullet-chart-pro');
    return { bg: c.style.background, fill: r && r.getAttribute('fill'), target: t && t.getAttribute('fill'),
             axis: document.querySelectorAll('[data-o=axis]').length,
             grid: Array.from(document.querySelectorAll('line')).filter(l => l.getAttribute('stroke-dasharray') === '3,3').length,
             label: (document.querySelector('text[data-o=labels]') || {getAttribute(){return null;}}).getAttribute('fill') }; }"""


async def ficha(b):
    """Imágenes de la ficha (1.6): build de prueba con Pro forzado (sin marca de agua)."""
    async def shot(name, data, W, H):
        pg = await page(b, "sim_pro", data, W, H, name=name)
        await pg.close()
    base = {"labels": {"showTargetValue": True}}
    await shot("60_central", dv(base), 852, 354)
    await shot("60_free", dv(base), 760, 500)
    await shot("60_pro", dv({"labels": {"showTargetValue": False}, "trellis": {"columns": 2}}, forecast=True, target2=True, trellis=True), 760, 500)
    await shot("60_hero", dv({"sort": {"by": "variancePct", "descending": False}, "labels": {"showTargetValue": True},
                              "layout": {"showAxisTitle": True, "axisTitle": "Sales vs budget, € thousands"},
                              "referenceLines": {"refLine1Show": True, "refLine1Value": 1500, "refLine1Label": "Minimum per zone", "refLine1Color": {"solid": {"color": "#B7791F"}}}},
                             forecast=True), 900, 600)
    for k, (w, h) in {"l": (900, 520), "m": (520, 330), "s": (300, 170)}.items():
        await shot("61_size_" + k, dv(base), w, h)
    for k in ("boardroom", "ledger", "editorial", "signal", "aurora", "terrace"):
        await shot("62_style_" + k, dv({"style": {"template": k}, "labels": {"showTargetValue": True}}, forecast=True), 760, 480)


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        if "ficha" in sys.argv:
            await ficha(b); await b.close(); print(f"{len(FALLOS)} fallos"); return

        print("Estilos de la colección")
        TOK = {"clean": (None, "#2196F3"), "boardroom": ("#16263D", "#C9A45C"), "ledger": ("#FBF8EF", "#7A1F1F"),
               "editorial": ("#FFFFFF", "#D7263D"), "signal": ("#FFFFFF", "#1F7A4D"), "aurora": ("#10395E", "#7CE7D0"), "terrace": ("#FBF5EC", "#B5532A")}
        def rgb(h):
            n = int(h[1:], 16); return f"rgb({(n >> 16) & 255}, {(n >> 8) & 255}, {n & 255})"
        for i, (st, (bg, fill)) in enumerate(TOK.items()):
            pg = await page(b, "sim_pro", dv({"style": {"template": st}}), name=f"{10 + i:02d}_estilo_{st}")
            lk = await pg.evaluate(LOOK)
            ok = lk["fill"] == fill and ((bg is None and lk["bg"] in ("", "transparent")) or (bg and (rgb(bg) in lk["bg"] or "gradient" in lk["bg"])))
            check(f"estilo {st}: fondo y barra con los tokens", ok, str(lk))
            await pg.close()
        for old, exp in (("ibcs", "#1F7A4D"), ("contrast", "#C9A45C"), ("soft", "#2196F3"), ("minimal", "#2196F3")):
            pg = await page(b, "sim_pro", dv({"style": {"template": old}}), name=f"20_antigua_{old}")
            lk = await pg.evaluate(LOOK)
            check(f"plantilla 1.5 '{old}' → su estilo nuevo", lk["fill"] == exp and (old != "minimal" or lk["axis"] == 0), str(lk))
            await pg.close()
        pg = await page(b, "sim_pro", dv({"general": {"ibcsMode": True}}), name="21_ibcs_mode_antiguo")
        lk = await pg.evaluate(LOOK)
        fm = await pg.evaluate("() => { const v = __v.getFormattingModel().cards.find(c => c.uid.startsWith('style')).groups[0].slices[0].control.properties.value; return (v && v.value) || v; }")
        check("IBCS Mode activo sin plantilla → Signal", lk["fill"] == "#1F7A4D", str(lk))
        check("el panel muestra Signal", fm == "signal", str(fm))
        await pg.close()
        pg = await page(b, "sim_pro", dv({"style": {"template": "boardroom"}, "colors": {"actualColor": {"solid": {"color": "#7030A0"}}}}))
        lk = await pg.evaluate(LOOK)
        check("Boardroom con color de barra a mano: gana el del usuario", lk["fill"] == "#7030A0" and rgb("#16263D") in lk["bg"], str(lk))
        await pg.close()

        print("fx")
        pg = await page(b, "sim_pro", dv(rule={"Girona": {"actualColor": {"solid": {"color": "#C00000"}}, "targetColor": {"solid": {"color": "#00A000"}}}}), name="30_fx_regla")
        fills = await pg.evaluate("""() => Array.from(document.querySelectorAll('g[role=listitem]')).map(g => g.getAttribute('aria-label').split(',')[0] + '=' +
            g.querySelector('rect[data-o=actual]').getAttribute('fill') + '/' + g.querySelector('rect[data-o=target]').getAttribute('fill'))""")
        check("fx por regla en barra y objetivo", "Girona=#C00000/#00A000" in fills and any(f.startswith("Barcelona=#2196F3") for f in fills), str(fills))
        fm = await pg.evaluate("""() => { const m = __v.getFormattingModel(); const col = m.cards.find(c => c.uid.startsWith('colors')).groups[0].slices;
            const d = s => s.control.properties.descriptor;
            return col.slice(0, 2).map(s => ({ p: d(s).propertyName, k: d(s).instanceKind, sel: JSON.stringify(d(s).selector), alt: 'altConstantValueSelector' in d(s) ? d(s).altConstantValueSelector : 'falta' })); }""")
        check("panel: actualColor y targetColor con ConstantOrRule, comodín y altConstantValueSelector null",
              all(x["k"] == 3 and "dataViewWildcard" in x["sel"] and x["alt"] is None for x in fm), str(fm))
        await pg.close()

        print("Panel de formato")
        pg = await page(b, "sim_pro", dv())
        fm = await pg.evaluate("""() => { const m = __v.getFormattingModel();
            return { cards: m.cards.map(c => c.uid), revert: m.cards.every(c => Array.isArray(c.revertToDefaultDescriptors) && c.revertToDefaultDescriptors.length),
                     acc: m.cards.find(c => c.uid.startsWith('accessibility')).groups[0].slices.map(s => s.control.properties.descriptor.propertyName),
                     gen: m.cards.find(c => c.uid.startsWith('general')).groups[0].slices.map(s => s.control.properties.descriptor.propertyName) }; }""")
        check("tarjetas en el orden común, con Sort y Accessibility", fm["cards"][0].startswith("style") and fm["cards"][-1].startswith("accessibility")
              and any(c.startswith("sort") for c in fm["cards"]), str(fm["cards"]))
        check("Accessibility: alto contraste, foco, grosor, texto mínimo", fm["acc"] == ["highContrast", "focusColor", "focusWidth", "minTextSize"], str(fm["acc"]))
        check("General sin IBCS Mode", fm["gen"] == ["orientation"], str(fm["gen"]))
        check("Reset to default en todas las tarjetas", fm["revert"])
        await pg.close()

        print("Orden")
        pg = await page(b, "sim_pro", dv({"sort": {"by": "variancePct", "descending": False}}), name="31_orden_desviacion")
        rows = await pg.evaluate(ROWS)
        check("orden por desviación % ascendente: Lleida primero, Andorra último", rows[0] == "Lleida" and rows[-1] == "Andorra", str(rows))
        await pg.close()
        pg = await page(b, "sim_pro", dv({"sort": {"by": "category", "descending": False}}))
        rows = await pg.evaluate(ROWS)
        check("orden por nombre", rows == sorted(rows), str(rows))
        await pg.close()

        print("Alto de filas, eje y líneas de referencia")
        pg = await page(b, "sim_pro", dv(), 900, 520, name="32_ajustar_al_visual")
        hs = await pg.evaluate("() => { const r = Array.from(document.querySelectorAll('g[role=listitem]')).map(g => g.getBBox()); return { n: r.length, last: r.length ? (r[r.length-1].y + r[r.length-1].height) : 0, h: r.map(x => x.height) }; }")
        tr = await pg.evaluate("() => Array.from(document.querySelectorAll('g[role=listitem]')).map(g => g.getAttribute('transform'))")
        ys = [float(t.split(",")[1].rstrip(")")) for t in tr]
        check("Ajustar al visual: las filas llenan el alto (paso > 60 px con 7 filas en 520)", len(ys) > 1 and ys[1] - ys[0] > 60, str(ys))
        await pg.close()
        pg = await page(b, "sim_pro", dv({"layout": {"rowHeightMode": "fixed", "rowHeight": 40, "barHeightPct": 70}}), name="33_alto_fijo_40")
        tr = await pg.evaluate("() => Array.from(document.querySelectorAll('g[role=listitem]')).map(g => g.getAttribute('transform'))")
        ys = [float(t.split(",")[1].rstrip(")")) for t in tr]
        bh = await pg.evaluate("() => parseFloat(document.querySelector('rect[data-o=bands]').getAttribute('height'))")
        check("Fijo 40 px: paso de 40", len(ys) > 1 and abs((ys[1] - ys[0]) - 40) < 0.5, str(ys[:3]))
        check("grosor 70 %: banda de 28 px", abs(bh - 28) < 1, str(bh))
        await pg.close()
        pg = await page(b, "sim_pro", dv({"layout": {"showAxisTitle": True, "showGridlines": False},
                                         "referenceLines": {"refLine1Show": True, "refLine1Value": 1500, "refLine2Show": True, "refLine2Value": 4300}}), name="34_eje_y_referencias")
        lk = await pg.evaluate(LOOK)
        refs = await pg.evaluate("""() => Array.from(document.querySelectorAll('text[data-o=refs]')).map(t => ({ y: parseFloat(t.getAttribute('y')),
            fs: parseFloat(t.getAttribute('font-size')), a: t.getAttribute('text-anchor'), x: parseFloat(t.getAttribute('x')) }))""")
        first = await pg.evaluate("() => document.querySelector('g[role=listitem]').getBoundingClientRect().top")
        title = await pg.evaluate("() => Array.from(document.querySelectorAll('text[data-o=axis]')).map(t => t.textContent).filter(t => t === 'Sales')")
        check("cuadrícula apagada", lk["grid"] == 0, str(lk))
        check("título del eje = nombre de la medida", title == ["Sales"], str(title))
        check("etiquetas de referencia en su franja, por encima de la primera fila y sin cortarse", refs and all(r["y"] >= r["fs"] and r["y"] < first for r in refs), f"{refs} primera fila {first}")
        check("la etiqueta cerca del borde derecho se alinea a la izquierda", any(r["a"] == "end" for r in refs), str(refs))
        await pg.close()

        print("Accesibilidad")
        pg = await page(b, "sim_pro", dv({"accessibility": {"highContrast": "on"}, "style": {"template": "aurora"}}), name="40_alto_contraste_forzado")
        lk = await pg.evaluate(LOOK)
        check("alto contraste 'On' manda sobre Aurora: negro sobre blanco", lk["fill"] == "#000000" and "255, 255, 255" in lk["bg"], str(lk))
        await pg.close()
        pg = await page(b, "sim_pro", dv(), sys_hc=True, name="41_alto_contraste_windows")
        lk = await pg.evaluate(LOOK)
        check("alto contraste de Windows: colores del tema", lk["fill"].upper() == "#FFFF00", str(lk))
        await pg.close()
        pg = await page(b, "sim_pro", dv({"accessibility": {"minTextSize": 14}, "referenceLines": {"refLine1Show": True, "refLine1Value": 1500}}), name="42_texto_minimo_14")
        sizes = await pg.evaluate("() => Array.from(document.querySelectorAll('svg text')).map(t => parseFloat(t.getAttribute('font-size')))")
        check("tamaño mínimo 14: ningún texto por debajo", sizes and min(sizes) >= 14, f"mín {min(sizes) if sizes else '-'}")
        await pg.close()
        pg = await page(b, "sim_pro", dv({"accessibility": {"focusColor": {"solid": {"color": "#D00000"}}, "focusWidth": 5}}))
        await pg.focus(".bullet-chart-pro")
        await pg.keyboard.press("ArrowDown")
        await pg.wait_for_timeout(150)
        await pg.screenshot(path=os.path.join(OUT, "43_foco_rojo_5px.png"))
        ring = await pg.evaluate("() => { const r = document.getElementById('kb-focus-ring'); return r ? r.getAttribute('stroke') + ' ' + r.getAttribute('stroke-width') : null; }")
        check("foco de teclado con color y grosor de la tarjeta", ring == "#D00000 5", str(ring))
        await pg.close()

        print("Small multiples y marca de agua")
        pg = await page(b, "sim_pro", dv({"trellis": {"columns": 0, "titleAlign": "left", "border": False}}, trellis=True), name="50_small_multiples_auto")
        tt = await pg.evaluate("() => Array.from(document.querySelectorAll('text[data-o=trellis]')).map(t => t.getAttribute('text-anchor'))")
        check("small multiples: dos paneles, títulos a la izquierda", tt == ["start", "start"], str(tt))
        await pg.close()
        pg = await page(b, "sim_free", dv(trellis=True, forecast=True), view=1, license=True, name="51_marca_vista_previa")
        await pg.wait_for_timeout(300)
        wm = await pg.evaluate("() => { const w = document.querySelector('.tcviz-wm'); return w ? { d: getComputedStyle(w).display, t: w.textContent } : null; }")
        check("vista previa sin licencia: marca común con las funciones", wm and wm["d"] == "flex" and "Pro preview" in wm["t"], str(wm))
        await pg.close()
        pg = await page(b, "sim_free", dv(trellis=True), view=0, license=True, name="52_lectura_sin_marca")
        wm = await pg.evaluate("() => { const w = document.querySelector('.tcviz-wm'); return w ? getComputedStyle(w).display : null; }")
        check("vista de lectura: sin marca", wm == "none", str(wm))
        await pg.close()
        pg = await page(b, "sim_free", dv({"style": {"template": "aurora"}}), view=1, license=True, name="53_estilo_gratis")
        wm = await pg.evaluate("() => { const w = document.querySelector('.tcviz-wm'); return w ? getComputedStyle(w).display : 'none'; }")
        check("estilo en la build gratuita, editando: sin marca (los estilos son gratis)", wm == "none", str(wm))
        await pg.close()
        pg = await page(b, "sim_pro", None, 640, 400, name="59_landing_sin_datos")
        await pg.close()
        await b.close()
    print(f"\n{len(FALLOS)} fallos" + (": " + ", ".join(FALLOS) if FALLOS else ""))
    sys.exit(1 if FALLOS else 0)


if __name__ == "__main__":
    asyncio.run(main())
