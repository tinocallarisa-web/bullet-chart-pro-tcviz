/*
 * Marca de agua "Pro preview", común a todos los visuales de TCViz.
 *
 * FUENTE ÚNICA: C:\tcviz\utillaje\comun\watermark.ts (+ watermark.less).
 * Cada repo lleva una copia idéntica en src/comun/ y style/comun/, puesta por utillaje/sincronizar_comun.py.
 * No se edita en el repo del visual: auditar-envio.py falla si la copia no coincide con la fuente.
 *
 * Qué hace: un aviso centrado, encima del gráfico y sin capturar el puntero, con el título ("Pro preview", traducido
 * por el visual) y las funciones Pro que el informe está usando. Tamaño proporcional al visual (14-64 px; la línea de
 * funciones nunca baja de 12 px) y una banda clara semiopaca detrás, para que se lea sobre gráficos que llenan todo el
 * lienzo (treemap, mapas, matrices) sin tapar los datos. En alto contraste usa los colores del tema.
 *
 * Reglas de la cartera que esto respeta:
 *  - Solo se muestra en edición y sin licencia; la vista de lectura enseña el resultado gratuito (lo decide el visual).
 *  - La marca limita la función, nunca el dato: no recorta ni cambia nada del gráfico.
 *  - Sin innerHTML: solo textContent.
 *
 * Uso:
 *   import { createProWatermark, renderProWatermark } from "./comun/watermark";
 *   this.wm = createProWatermark(this.root);                 // una vez, en el constructor
 *   renderProWatermark(this.wm, { width, height, title: t("UI_ProPreview", "Pro preview"),
 *                                 features: ["color by measure", "small multiples"], highContrast });
 *   renderProWatermark(this.wm, null);                      // ocultarla
 * y en style/visual.less:  @import (less) "comun/watermark.less";
 */

export interface ProWatermarkOptions {
    width: number;
    height: number;
    /** Ya traducido por el visual: "Pro preview". */
    title: string;
    /** Nombres ya traducidos de las funciones Pro en uso. Se muestran 2 y "+N". */
    features: string[];
    /** Colores del tema de alto contraste, si está activo. */
    highContrast?: { foreground: string; background: string } | null;
}

export const WATERMARK_VERSION = "1.0.0";

/** Crea el contenedor (oculto) y lo añade al elemento raíz del visual, que debe tener position relative/absolute. */
export function createProWatermark(parent: HTMLElement): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "tcviz-wm";
    el.setAttribute("aria-hidden", "true");
    el.style.display = "none";
    parent.appendChild(el);
    return el;
}

/** Dibuja la marca, o la oculta con null / sin funciones. No toca nada más del visual. */
export function renderProWatermark(el: HTMLDivElement, o: ProWatermarkOptions | null): void {
    if (!o || !o.features.length) { el.style.display = "none"; return; }
    while (el.firstChild) el.removeChild(el.firstChild);
    el.style.display = "flex";

    const title = document.createElement("div");
    title.className = "tcviz-wm-title";
    title.textContent = o.title;
    const why = document.createElement("div");
    why.className = "tcviz-wm-why";
    why.textContent = o.features.slice(0, 2).join(" · ") + (o.features.length > 2 ? " +" + (o.features.length - 2) : "");
    el.appendChild(title);
    el.appendChild(why);

    const fs = Math.max(14, Math.min(64, o.width / 18, o.height / 7));
    el.style.fontSize = fs + "px";
    why.style.fontSize = Math.max(12, fs * 0.3) + "px";

    const hc = o.highContrast;
    el.classList.toggle("tcviz-wm-hc", !!hc);
    for (const part of [title, why]) {
        part.style.color = hc ? hc.foreground : "";
        part.style.background = hc ? hc.background : "";
        part.style.outline = hc ? "1px solid " + hc.foreground : "";
    }
}
