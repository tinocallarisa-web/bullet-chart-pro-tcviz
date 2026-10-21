# -*- coding: utf-8 -*-
"""stringResources (12 idiomas), la lista de pbiviz.json y src/strings.ts para Bullet Chart Pro.

Inglés: stringResources/en-US (claves de capabilities) + los this.t/tf("Clave", "inglés") de src/visual.ts.
Español: 10.ª columna de la tabla (Bullet no tenía es-ES publicado).
Resto: tools/i18n_bullet.py, por TEXTO inglés. Ejecutar desde la raíz:  python tools/i18n.py
Power BI Desktop solo traduce con getDisplayName las claves declaradas en capabilities.json: los textos propios del
visual (avisos, asistente, pantalla de inicio) viajan además en src/strings.ts, que t() consulta primero.
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from i18n_bullet import P

L = ["pt-BR", "fr-FR", "de-DE", "it-IT", "nl-NL", "pl-PL", "ja-JP", "zh-CN", "ko-KR"]   # orden de las columnas
TODOS = ["en-US", "es-ES"] + L[:1] + ["pt-PT"] + L[1:]


def leer(lang):
    p = os.path.join(ROOT, "stringResources", lang, "resources.resjson")
    return json.load(io.open(p, encoding="utf-8")) if os.path.exists(p) else {}


def escribir(lang, d):
    p = os.path.join(ROOT, "stringResources", lang, "resources.resjson")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


def main():
    en = leer("en-US")
    es_pub = leer("es-ES")
    src = io.open(os.path.join(ROOT, "src", "visual.ts"), encoding="utf-8").read()
    caps = io.open(os.path.join(ROOT, "capabilities.json"), encoding="utf-8").read()
    rt = dict(re.findall(r'this\.tf?\(\s*"([A-Za-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"', src))
    for k, v in rt.items():
        if k not in en:
            en[k] = json.loads('"' + v + '"')
    faltan = sorted({v for v in en.values() if v not in P})
    if faltan:
        print("SIN TRADUCIR (quedan en inglés):", faltan)
    out = {"en-US": en}
    es = {}
    for k, v in en.items():
        fila = P.get(v, [])
        col = fila[9] if len(fila) > 9 else None
        # El es-ES publicado manda, salvo donde se quedó en inglés y la tabla ya trae la traducción.
        es[k] = col if col and es_pub.get(k) in (None, v) else (es_pub.get(k) or col or v)
    out["es-ES"] = es
    for i, lg in enumerate(L):
        out[lg] = {k: (P[v][i] if v in P else v) for k, v in en.items()}
    out["pt-PT"] = dict(out["pt-BR"])
    for lg, d in out.items():
        escribir(lg, d)
    pj = os.path.join(ROOT, "pbiviz.json")
    pb = json.load(io.open(pj, encoding="utf-8"))
    pb["stringResources"] = [f"stringResources/{lg}/resources.resjson" for lg in TODOS]
    io.open(pj, "w", encoding="utf-8", newline="\n").write(json.dumps(pb, indent=4, ensure_ascii=False) + "\n")
    runtime = sorted(k for k in en if k in rt and f'"{k}"' not in caps)
    tabla = {lg: {k: out[lg][k] for k in runtime if out[lg].get(k) and out[lg][k] != en[k]} for lg in TODOS if lg != "en-US"}
    ts = ["/**",
          " * Textos que escribe el propio visual, por idioma. Power BI Desktop solo traduce con getDisplayName las claves",
          " * declaradas en capabilities.json; estas viajan en el bundle. Generado por tools/i18n.py: no editar a mano.",
          " */",
          "export const STRINGS: Record<string, Record<string, string>> = " + json.dumps(tabla, ensure_ascii=False, indent=4) + ";", ""]
    io.open(os.path.join(ROOT, "src", "strings.ts"), "w", encoding="utf-8", newline="\n").write("\n".join(ts))
    print(len(en), "claves ·", len(TODOS), "idiomas ·", len(runtime), "en el bundle")


if __name__ == "__main__":
    main()
