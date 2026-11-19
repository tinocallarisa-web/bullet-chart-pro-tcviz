/*
 * Reparto de colores de serie de los estilos de la colección, común a todos los visuales de TCViz.
 *
 * FUENTE ÚNICA: C:\tcviz\utillaje\comun\paleta.ts. Cada repo lleva una copia idéntica en src/comun/, puesta por
 * utillaje/sincronizar_comun.py. No se edita en el repo del visual: auditar-envio.py falla si la copia no coincide.
 *
 * Por qué (18-11-2026, Marimekko con 6 series en Terrace): cada estilo trae 5 colores y los visuales admiten hasta 12
 * series, así que la sexta repetía el color de la primera. A partir de la vuelta 2 se usa el mismo color de la
 * paleta aclarado u oscurecido (hacia blanco si el color es oscuro, hacia negro si es claro), un 32 % más por vuelta:
 * cada serie es distinta y todas siguen siendo del estilo.
 *
 * Uso:  import { styleSeriesColor } from "./comun/paleta";
 *       const color = styleSeriesColor(look.series, k);
 */

export const PALETA_VERSION = "1.0.0";

function rgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const f = h.length === 3 ? h.split("").map(c => c + c).join("") : h.slice(0, 6);
    const n = parseInt(f, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

function hex(c: [number, number, number]): string {
    return "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Luminancia relativa (0 negro … 1 blanco). */
function lum(c: [number, number, number]): number {
    const l = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

/** Color de la serie k (0, 1, 2…) con la paleta de un estilo, sin repetir colores hasta 3 vueltas. */
export function styleSeriesColor(palette: string[], k: number): string {
    if (!palette.length) return "#2B6CB0";
    const n = palette.length;
    const i = ((k % n) + n) % n;
    const vuelta = Math.floor(Math.max(0, k) / n);
    if (vuelta === 0) return palette[i];
    const c = rgb(palette[i]);
    const hacia: [number, number, number] = lum(c) > 0.35 ? [0, 0, 0] : [255, 255, 255];
    const t = Math.min(0.75, 0.32 * vuelta);
    return hex([c[0] + (hacia[0] - c[0]) * t, c[1] + (hacia[1] - c[1]) * t, c[2] + (hacia[2] - c[2]) * t]);
}
