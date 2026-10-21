"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions        = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions             = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                         = powerbi.extensibility.visual.IVisual;
import IVisualHost                     = powerbi.extensibility.visual.IVisualHost;
import DataView                        = powerbi.DataView;
import ISelectionManager               = powerbi.extensibility.ISelectionManager;
import ISelectionId                    = powerbi.visuals.ISelectionId;
import ITooltipService                 = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem           = powerbi.extensibility.VisualTooltipDataItem;

import { BulletSettings, getDefaultSettings } from "./settings";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { STRINGS } from "./strings";
import { LANDING_ICON } from "./landingIcon";
import {
    HtmlSubSelectableClass, HtmlSubSelectionHelper, SubSelectableDisplayNameAttribute,
    SubSelectableObjectNameAttribute, SubSelectableTypeAttribute,
} from "powerbi-visuals-utils-onobjectutils";
import { buildFormattingCards, CategoryColor, COLOR_FIXED_SLICES } from "./formatting";
import "./../style/visual.less";

// ═══════════════════════════════════════════════════════════════════
//  Data models
// ═══════════════════════════════════════════════════════════════════

interface BulletDataPoint {
    category:      string;
    actual:        number | null;
    target:        number | null;
    forecast:      number | null;
    variance:      number | null;
    variancePct:   number | null;
    selectionId:   ISelectionId;
    isHighlighted: boolean;
    tooltipFields:   VisualTooltipDataItem[];
    colorActual?:    string;    // per-data-point override from conditional formatting
    colorTarget?:    string;    // per-data-point override from conditional formatting
    formatActual?:   string;    // format string from the Actual measure (supports calc groups)
    formatTarget?:   string;
    formatForecast?: string;
    // Pro (1.5): bandas por medida y segundo objetivo. null si no hay campo o sin Pro.
    band1Limit:      number | null;
    band2Limit:      number | null;
    bandMax:         number | null;
    target2:         number | null;
    formatTarget2?:  string;
}

interface TrellisPanel { title: string; data: BulletDataPoint[]; }

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

const TARGET_W        = 3;
const TARGET_H_RATIO  = 0.80;
const FORECAST_SIZE   = 5;
const CHART_PAD_R     = 8;
const TRELLIS_GAP     = 10;
const TRELLIS_TITLE_H = 28;
const MIN_PANEL_W     = 220;  // below this a small-multiples panel is unreadable: use fewer columns
const VERT_PAD_TOP    = 8;
const VERT_PAD_BOT    = 20;
const VERT_PAD_LR     = 6;
const LEGEND_H        = 22;
const AXIS_H          = 16;   // height reserved below chart rows for H-axis labels
const MAX_ROW_H       = 72;   // cap row height so tall visuals don't look odd
const MIN_COL_W       = 32;   // minimum column width in vertical mode before H-scroll kicks in

const URL_GUIDE   = "https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/support.html";
const URL_PRODUCT = "https://tcviz.com/product/bullet-chart-pro/?ref=visual-bullet";
const URL_VIDEO   = "https://www.youtube.com/watch?v=bDW7qly8Mdo";

/**
 * Plantillas de estilo (1.5). Un punto de partida: solo rellenan lo que el usuario no ha tocado (lo guardado en
 * metadata.objects gana siempre) y, al ELEGIR una, se borran los ajustes que ella define (aplicarPlantilla).
 * "clean" no cambia nada: es el aspecto de siempre. "ibcs" usa el modo IBCS que ya existía; es un estilo inspirado en
 * la notación IBCS, no afirma cumplir el estándar.
 */
const TEMPLATES: Record<string, Record<string, Record<string, any>>> = {
    clean: {},
    minimal: { colors: { targetColor: "#605E5C", band1Color: "#F3F2F1", band2Color: "#EDEBE9", band3Color: "#E1DFDD" },
        layout: { showAxis: false }, legend: { color: "#8A8886" } },
    contrast: { colors: { actualColor: "#1F3864", targetColor: "#000000", band1Color: "#D9D9D9", band2Color: "#BFBFBF",
        band3Color: "#A6A6A6", positiveColor: "#107C10", negativeColor: "#C00000" } },
    soft: { colors: { actualColor: "#5B9BD5", targetColor: "#404040", band1Color: "#EEF4FA", band2Color: "#DCE8F4",
        band3Color: "#C9DCEF", positiveColor: "#70AD47", negativeColor: "#ED7D31" } },
    compact: { labels: { fontSize: 9 }, legend: { fontSize: 8 } },
    ibcs: { general: { ibcsMode: true }, colors: { positiveColor: "#8CB400", negativeColor: "#FF0000" } },
};
const PLAN_ID         = "bullet-chart-pro-tcviz";   // Plan ID: última parte del Service ID de Partner Center

/**
 * spIdentifier es el Service ID completo de Partner Center ("editor.oferta.plan", p.ej.
 * "tino_callarisa.bullet-chart-pro-tcviz.bullet-chart-pro-tcviz"), no el Plan ID corto:
 * lo dice la documentación de la licensing API. Comparar solo con el Plan ID dejaba en
 * Free a quien pagaba. Se acepta el Service ID que termina en ".<plan>" y también el Plan ID.
 */
function matchesPlan(spIdentifier: unknown, planId: string): boolean {
    const sp = String(spIdentifier ?? "");
    return sp === planId || sp.endsWith("." + planId);
}

// ═══════════════════════════════════════════════════════════════════
//  Visual
// ═══════════════════════════════════════════════════════════════════

export class BulletChartPro implements IVisual {

    private host:             IVisualHost;
    /** Localización de los textos que muestra el visual en tiempo de ejecución */
    private localization:     powerbi.extensibility.ILocalizationManager;
    private container:        HTMLElement;
    private rootSvg:          SVGSVGElement;   // NEVER reassigned
    private events:           powerbi.extensibility.IVisualEventService;
    private selectionManager: ISelectionManager;
    private tooltipService:   ITooltipService;
    private settings:         BulletSettings;
    private formattingService: FormattingSettingsService;
    private isPro:            boolean = false; // ISPRO_MARKER — build-test.js lo parchea; nunca a mano
    private licenseResolved      = false;  // no se avisa de compra hasta conocer la licencia
    private licenseEnvSupported  = true;   // false en Publish to Web, embebido, exportación
    private licenseInfoAvailable = true;   // false si la licencia no se pudo leer
    private licenseIconShown     = false;
    private lastBlockedNotice    = "";
    /** Funciones Pro de las que ya se avisó en esta sesión de edición */
    private notifiedPro: string[] = [];
    /** Temporizador que deja la barra de Upgrade cuando termina el banner */
    private licenseIconTimer: number | null = null;
    /** Vista previa Pro: Free, editando, con la licencia ya resuelta y legible */
    private proPreview = false;
    private watermarkEl: HTMLDivElement;
    private lastOptions:      VisualUpdateOptions | null = null;
    private lastDataPoints:   BulletDataPoint[] = [];
    /** Margen izquierdo del modo vertical: VERT_PAD_LR más el ancho de las etiquetas del eje (antes salían fuera). */
    private vPadL = VERT_PAD_LR;
    /** Qué entra en la columna de valores, igual para todas las filas: un mosaico estrecho no mezcla filas con y sin texto. */
    private rp: { value: boolean; target: boolean; variance: "full" | "pct" | "none" } = { value: true, target: true, variance: "full" };
    private formatMode = false;
    private editing = false;
    /** Última plantilla vista: al cambiarla editando se aplica de verdad (aplicarPlantilla). */
    private tplVisto: string | null = null;
    private guideStep = 1;
    private guideEl: HTMLDivElement | null = null;
    private landingEl: HTMLDivElement | null = null;
    /** Qué pozos tienen campo: los lee la guía. */
    private wells = { target: false, target2: false, bands: false, trellis: false, forecast: false };
    private subSelectionHelper: HtmlSubSelectionHelper;
    public visualOnObjectFormatting: powerbi.extensibility.visual.VisualOnObjectFormatting;
    /** Selección propia, llevada aquí: se repinta al momento sin esperar a la promesa del host. */
    private sel:              ISelectionId[] = [];
    /** Nombres de las medidas en los pozos: leyenda y tooltip hablan como el modelo, en su idioma. */
    private names = { actual: "Actual", target: "Target", forecast: "Forecast", target2: "Second target" };
    private focusedIndex:     number = -1;
    private isDrilled:        boolean = false;

    constructor(options: VisualConstructorOptions) {
        this.host             = options.host;
        this.events           = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService   = options.host.tooltipService;
        this.localization     = options.host.createLocalizationManager();
        this.formattingService = new FormattingSettingsService(this.localization);
        this.settings         = getDefaultSettings();
        this.container        = options.element;
        this.container.classList.add("bullet-chart-pro");

        this.container.style.overflow = "auto";
        this.container.addEventListener("scroll", () => this.stickLegend());
        this.container.style.position = "relative";
        this.container.tabIndex       = 0;

        this.subSelectionHelper = HtmlSubSelectionHelper.createHtmlSubselectionHelper({
            hostElement: options.element,
            subSelectionService: options.host.subSelectionService,
            selectionIdCallback: () => undefined,
        });
        this.visualOnObjectFormatting = {
            getSubSelectionStyles: (subs) => this.getSubSelectionStyles(subs),
            getSubSelectionShortcuts: (subs) => this.getSubSelectionShortcuts(subs),
            getSubSelectables: (filter) => this.subSelectionHelper.getAllSubSelectables(filter),
        };

        this.rootSvg               = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.rootSvg.style.display = "block";
        // El lector de pantalla recorre las filas como una lista; cada fila dice su lectura completa (ariaOf).
        this.rootSvg.setAttribute("role", "list");
        this.rootSvg.setAttribute("aria-label", "Bullet Chart Pro");
        this.container.appendChild(this.rootSvg);

        // Marca de agua de la vista previa Pro. Blanca con contorno oscuro y opacidad 0.55:
        // un gris translúcido desaparece sobre fondos saturados u oscuros. No intercepta
        // clics ni entra en el recorrido del lector de pantalla.
        this.watermarkEl = document.createElement("div");
        this.watermarkEl.setAttribute("aria-hidden", "true");
        this.watermarkEl.textContent = this.t("UI_ProPreview", "Pro preview");
        this.watermarkEl.style.cssText =
            "position:absolute;left:0;top:0;right:0;bottom:0;display:none;align-items:center;" +
            "justify-content:center;pointer-events:none;z-index:5;font:700 32px 'Segoe UI',sans-serif;" +
            "color:#FFFFFF;opacity:0.55;transform:rotate(-20deg);" +
            "text-shadow:0 0 2px rgba(51,51,51,0.85),0 1px 3px rgba(51,51,51,0.65);";
        this.container.appendChild(this.watermarkEl);

        // Background context menu (required for Microsoft certification)
        this.rootSvg.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        // Bookmark support: Power BI calls this when restoring a saved selection state.
        // Re-rendering with lastOptions is enough because the dataView already contains
        // the correct highlights for the restored bookmark at that point.
        // Se repinta sin pasar por update(): los eventos de render van uno a uno con cada update().
        // Un marcador restaura la selección por aquí; los ids llegan en el callback (getSelectionIds puede no tenerlos).
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => { this.sel = ids ?? []; this.redraw(); });

        // Keyboard navigation (supportsKeyboardFocus declared in capabilities.json)
        this.container.addEventListener("keydown", (e: KeyboardEvent) => {
            if (!this.lastDataPoints.length || !this.canInteract()) return;
            const n = this.lastDataPoints.length;
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                this.focusedIndex = (this.focusedIndex + 1) % n;
                this.updateFocusRing();
            } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                this.focusedIndex = (this.focusedIndex - 1 + n) % n;
                this.updateFocusRing();
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (this.focusedIndex >= 0 && this.focusedIndex < n) {
                    const d = this.lastDataPoints[this.focusedIndex];
                    this.selectPoint(d, false);
                }
            } else if (e.key === "Escape") {
                this.focusedIndex = -1;
                this.removeFocusRing();
                this.clearSelection();
            }
        });

        this.checkLicense();
    }

    // ── Textos ───────────────────────────────────────────────────────

    /** Texto del visual: primero la tabla del bundle (Desktop solo traduce con getDisplayName las claves de capabilities). */
    private t(key: string, fallback: string): string {
        const loc = String(this.host?.locale || "");
        const tabla = STRINGS[loc] || STRINGS[Object.keys(STRINGS).find(l => l.slice(0, 2) === loc.slice(0, 2)) || ""];
        if (tabla && tabla[key]) return tabla[key];
        try {
            const s = this.localization?.getDisplayName(key);
            return s && s !== key ? s : fallback;
        } catch { return fallback; }
    }

    /** Plantillas con "{0}". */
    private tf(key: string, fallback: string, ...args: string[]): string {
        return this.t(key, fallback).replace(/\{(\d+)\}/g, (_m, i) => args[Number(i)] ?? "");
    }

    // ── License ──────────────────────────────────────────────────────

    private async checkLicense(): Promise<void> {
        if (this.isPro) { this.licenseResolved = true; return; } // build de test con Pro forzado
        try {
            const lm = (this.host as any).licenseManager;
            if (!lm) { this.licenseResolved = true; return; }
            const r = await lm.getAvailableServicePlans();
            // Donde la licencia no se puede consultar, un cliente de pago también se ve Free.
            this.licenseEnvSupported  = !r?.isLicenseUnsupportedEnv;
            this.licenseInfoAvailable = r?.isLicenseInfoAvailable !== false;
            // ServicePlanState: Active = 1, Warning = 2. Warning es el periodo de gracia de un
            // cobro fallido: el cliente ya pagó y conserva Pro mientras se resuelve.
            const pro = !!(r?.plans?.some(
                (p: any) => matchesPlan(p.spIdentifier, PLAN_ID) && (p.state === 1 || p.state === 2)));
            this.licenseResolved = true;
            if (pro && !this.isPro) {
                this.isPro = true;
                this.clearLicenseNotice();
                this.redraw();
            } else if (!pro) {
                // La licencia responde despues del primer render, cuando proPreview todavia
                // era false y las funciones Pro se resolvieron como Free. Repintar es lo que
                // enciende la vista previa; sin esto el autor ve el resultado gratuito hasta
                // que toca cualquier ajuste.
                if (this.lastOptions) this.redraw();
                else this.notifyProBlocked(undefined);
            }
        } catch {
            // Free, sin avisos: si no se pudo leer la licencia no sabemos si ya pagó.
            this.isPro = false;
            this.licenseInfoAvailable = false;
            this.licenseResolved = true;
        }
    }

    /** Funciones Pro que el usuario ha intentado usar en este informe. */
    private attemptedPro(dv: DataView | undefined): string[] {
        const wanted: string[] = [];
        const cat = dv?.categorical;
        const trellisOn = (dv?.metadata?.objects as any)?.trellis?.enabled === true;
        if (trellisOn || cat?.categories?.some(c => c.source.roles?.["trellisBy"])) wanted.push(this.t("Feat_trellis", "small multiples"));
        if (cat?.values?.some(v => v.source.roles?.["forecast"])) wanted.push(this.t("Feat_forecast", "the Forecast marker"));
        if ((dv?.metadata?.objects as any)?.general?.orientation === "vertical") wanted.push(this.t("Feat_vertical", "vertical orientation"));
        if (cat?.values?.some(v => ["band1Limit", "band2Limit", "bandMax"].some(r => v.source.roles?.[r]))) wanted.push(this.t("Feat_bands", "bands from measures"));
        if (cat?.values?.some(v => v.source.roles?.["target2"])) wanted.push(this.t("Feat_target2", "a second target"));
        return wanted;
    }

    /**
     * Aviso de compra con las notificaciones de Power BI, que llevan la ruta de compra.
     * Microsoft pide no dibujar UI de licencias propia. Solo cuando el usuario ha intentado
     * algo Pro, y solo con la licencia ya resuelta.
     */
    private notifyProBlocked(dv: DataView | undefined): void {
        if (this.isPro) { this.clearLicenseNotice(); return; }
        if (!this.licenseResolved) return;
        const wanted = this.attemptedPro(dv);
        if (!wanted.length) { this.clearLicenseNotice(); return; }
        if (!this.licenseEnvSupported || !this.licenseInfoAvailable) return;

        const lm = (this.host as any).licenseManager;

        // Power BI muestra UNA notificación a la vez y la última sustituye a la anterior
        // (verificado en Risk Matrix, en el servicio, 2026-09-16). Llamar a
        // notifyFeatureBlocked y notifyLicenseRequired seguidos dejaba solo una visible.
        // Secuencia correcta: retirar lo anterior, banner con la función concreta, y al
        // terminar el banner (~10 s) la barra de Upgrade persistente.
        const added = wanted.filter(w => this.notifiedPro.indexOf(w) === -1);
        this.notifiedPro = wanted.slice();
        if (added.length === 0) return;   // quitar una función no vuelve a avisar
        this.licenseIconShown = true;
        this.lastBlockedNotice = wanted.join("|");
        const one = added.length === 1;
        // El texto sale de stringResources; el literal queda como respaldo si falta la clave.
        const list = added.join(this.t("UI_And", " and "));
        const msg  = one
            ? this.tf("LicenceNotice_One",  "Bullet Chart Pro: {0} is part of the Pro plan, shown as a watermarked preview.", list)
            : this.tf("LicenceNotice_Many", "Bullet Chart Pro: {0} are part of the Pro plan, shown as a watermarked preview.", list);

        const show = () => {
            try { lm?.notifyFeatureBlocked?.(msg.slice(0, 500)); } catch { /* best effort */ }
            this.cancelLicenseIcon();
            this.licenseIconTimer = window.setTimeout(() => {
                this.licenseIconTimer = null;
                if (this.isPro || this.notifiedPro.length === 0) return;
                // LicenseNotificationType.General es const enum: 0 en runtime
                try { lm?.notifyLicenseRequired?.(0); } catch { /* best effort */ }
            }, 10500);
        };
        try {
            const cleared = lm?.clearLicenseNotification?.();
            if (cleared && typeof cleared.then === "function") { cleared.then(show, show); }
            else { show(); }
        } catch { show(); }
    }

    /**
     * La marca solo sale si el usuario ha pedido de verdad algo de pago, y su tamaño sigue
     * al ancho del visual: un font-size fijo se queda ridículo a pantalla completa, que es
     * justo donde lo mira el revisor.
     */
    private updateWatermark(wantsPro: boolean): void {
        const show = this.proPreview && wantsPro;
        this.watermarkEl.style.display = show ? "flex" : "none";
        if (!show) { return; }
        const width = this.container.clientWidth || 0;
        const size  = Math.max(20, Math.min(72, Math.round(width * 0.09)));
        this.watermarkEl.style.fontSize = `${size}px`;
    }

    private cancelLicenseIcon(): void {
        if (this.licenseIconTimer !== null) {
            window.clearTimeout(this.licenseIconTimer);
            this.licenseIconTimer = null;
        }
    }

    private clearLicenseNotice(): void {
        this.lastBlockedNotice = "";
        this.notifiedPro = [];
        this.cancelLicenseIcon();
        if (!this.licenseIconShown) return;
        this.licenseIconShown = false;
        try { (this.host as any).licenseManager?.clearLicenseNotification?.(); } catch { /* best effort */ }
    }

    // ── Settings ─────────────────────────────────────────────────────

    private parseSettings(dv: DataView): BulletSettings {
        const d = getDefaultSettings();
        if (!dv?.metadata?.objects) return d;
        const obj = dv.metadata.objects;

        const tpl  = TEMPLATES[String((obj as any)?.style?.template ?? "clean")] ?? {};
        const tv   = (g: string, p: string): any => tpl[g]?.[p];
        const col  = (g: string, p: string, def: string)  => { const v = obj?.[g]?.[p]; return (v && typeof v === "object" && "solid" in v) ? (v as any).solid.color ?? def : (tv(g, p) ?? def); };
        const num  = (g: string, p: string, def: number)  => { const v = obj?.[g]?.[p]; return typeof v === "number"  ? v : (tv(g, p) ?? def); };
        const bool = (g: string, p: string, def: boolean) => { const v = obj?.[g]?.[p]; return typeof v === "boolean" ? v : (tv(g, p) ?? def); };
        const str  = (g: string, p: string, def: string)  => { const v = obj?.[g]?.[p]; return typeof v === "string"  ? v : def; };

        const s: BulletSettings = {
            orientation:        str( "general","orientation",       d.orientation) as any,
            ibcsMode:           bool("general","ibcsMode",           d.ibcsMode),
            actualColor:        col( "colors", "actualColor",        d.actualColor),
            targetColor:        col( "colors", "targetColor",        d.targetColor),
            target2Color:       col( "colors", "target2Color",       d.target2Color),
            forecastColor:      col( "colors", "forecastColor",      d.forecastColor),
            positiveColor:      col( "colors", "positiveColor",      d.positiveColor),
            negativeColor:      col( "colors", "negativeColor",      d.negativeColor),
            band1Color:         col( "colors", "band1Color",         d.band1Color),
            band2Color:         col( "colors", "band2Color",         d.band2Color),
            band3Color:         col( "colors", "band3Color",         d.band3Color),
            showBands:          bool("bands",  "showBands",          d.showBands),
            band1Pct:           num( "bands",  "band1Pct",           d.band1Pct),
            band2Pct:           num( "bands",  "band2Pct",           d.band2Pct),
            showVariance:       bool("variance","showVariance",      d.showVariance),
            showVariancePct:    bool("variance","showVariancePct",   d.showVariancePct),
            varianceThreshold:  num( "variance","varianceThreshold", d.varianceThreshold),
            showCategoryLabel:  bool("labels", "showCategoryLabel",  d.showCategoryLabel),
            showActualValue:    bool("labels", "showActualValue",    d.showActualValue),
            showTargetValue:    bool("labels", "showTargetValue",    d.showTargetValue),
            fontSize:           num( "labels", "fontSize",           d.fontSize),
            fontFamily:         str( "labels", "fontFamily",         d.fontFamily),
            labelWidthPct:      Math.min(40, Math.max(5,  num("layout","labelWidthPct",      d.labelWidthPct))),
            rightPanelWidthPct: Math.min(45, Math.max(10, num("layout","rightPanelWidthPct", d.rightPanelWidthPct))),
            rightPanelWidthSet: typeof obj?.["layout"]?.["rightPanelWidthPct"] === "number",
            showAxis:           bool("layout", "showAxis",           d.showAxis),
            showLegend:         bool("legend", "showLegend",         d.showLegend),
            legendPosition:     str( "legend", "legendPosition",     d.legendPosition) as any,
            legendFontSize:     Math.max(6, num("legend", "fontSize", d.legendFontSize)),
            legendFontFamily:   str( "legend", "fontFamily",         d.legendFontFamily),
            legendColor:        col( "legend", "color",              d.legendColor),
            template:           str( "style",  "template",           d.template),
            guide:              bool("style",  "guide",              d.guide),
            refLine1Show:       bool("referenceLines","refLine1Show",  d.refLine1Show),
            refLine1Value:      num( "referenceLines","refLine1Value", d.refLine1Value),
            refLine1Label:      str( "referenceLines","refLine1Label", d.refLine1Label),
            refLine1Color:      col( "referenceLines","refLine1Color", d.refLine1Color),
            refLine2Show:       bool("referenceLines","refLine2Show",  d.refLine2Show),
            refLine2Value:      num( "referenceLines","refLine2Value", d.refLine2Value),
            refLine2Label:      str( "referenceLines","refLine2Label", d.refLine2Label),
            refLine2Color:      col( "referenceLines","refLine2Color", d.refLine2Color),
            trellisEnabled:     bool("trellis","enabled",             d.trellisEnabled),
            trellisColumns:     Math.max(1,   num("trellis","columns",           d.trellisColumns)),
            trellisSyncScale:   bool("trellis","syncScale",           d.trellisSyncScale),
            trellisShowTitle:   bool("trellis","trellisShowTitle",    d.trellisShowTitle),
            trellisPanelColor:  col( "trellis","trellisPanelColor",   d.trellisPanelColor),
            trellisBorderColor: col( "trellis","trellisBorderColor",  d.trellisBorderColor),
            trellisTitleColor:  col( "trellis","trellisTitleColor",   d.trellisTitleColor),
        };

        if (s.ibcsMode) {
            s.actualColor = "#333333"; s.targetColor = "#000000";
            s.band1Color  = "#E8E8E8"; s.band2Color  = "#D0D0D0"; s.band3Color = "#B8B8B8";
        }
        const pal = this.host.colorPalette as any;
        if (pal?.isHighContrast) {
            s.actualColor = s.targetColor = s.target2Color = s.positiveColor = s.negativeColor = pal.foreground?.value ?? "#FFF";
            s.band1Color  = pal.background?.value ?? "#000";
            s.band2Color  = pal.backgroundLight?.value ?? "#111";
            s.band3Color  = pal.backgroundDark?.value  ?? "#222";
            // El titulo del panel se pinta sobre el color de borde: en alto contraste
            // ambos vienen del tema, asi que el texto tiene que seguir al primer plano.
            s.trellisTitleColor = pal.foreground?.value ?? "#FFF";
        }
        return s;
    }

    // Returns HC-aware foreground/background for UI chrome (axis, legend, scroll hint, drill label).
    // Falls back to standard dark-on-light defaults when not in high-contrast mode.
    private hcColors(): { fg: string; bg: string; isHC: boolean } {
        const pal = this.host.colorPalette as any;
        if (pal?.isHighContrast) {
            return {
                fg:   pal.foreground?.value       ?? "#FFFFFF",
                bg:   pal.background?.value       ?? "#000000",
                isHC: true,
            };
        }
        return { fg: "#333333", bg: "#FFFFFF", isHC: false };
    }

    // ── Data parsing ─────────────────────────────────────────────────

    private parseData(dv: DataView): BulletDataPoint[] {
        const cat = dv?.categorical; if (!cat?.values?.length) return [];
        const mainCat  = cat.categories?.find(c => c.source.roles?.["category"]);
        const actCol   = cat.values.find(v => v.source.roles?.["actual"]);
        const tgtCol   = cat.values.find(v => v.source.roles?.["target"]);
        const fstCol   = cat.values.find(v => v.source.roles?.["forecast"]);
        const ttipCols = cat.values.filter(v => v.source.roles?.["tooltips"]);
        if (!actCol) return [];
        this.readExtraCols(cat.values);
        const n   = mainCat ? mainCat.values.length : actCol.values.length;
        const hl  = actCol.highlights != null;
        return Array.from({length: n}, (_, i) => this.buildPoint(i, mainCat, actCol, tgtCol, fstCol, ttipCols, hl));
    }

    private parseTrellis(dv: DataView): TrellisPanel[] {
        const cat = dv?.categorical; if (!cat?.values?.length) return [];
        const mainCat  = cat.categories?.find(c => c.source.roles?.["category"]);
        const trlCat   = cat.categories?.find(c => c.source.roles?.["trellisBy"]);
        const actCol   = cat.values.find(v => v.source.roles?.["actual"]);
        const tgtCol   = cat.values.find(v => v.source.roles?.["target"]);
        const fstCol   = cat.values.find(v => v.source.roles?.["forecast"]);
        const ttipCols = cat.values.filter(v => v.source.roles?.["tooltips"]);
        if (!actCol) return [];
        this.readExtraCols(cat.values);
        const n  = mainCat ? mainCat.values.length : actCol.values.length;
        const hl = actCol.highlights != null;

        // Build canonical index per category name: the first row index where each category
        // appears. CF colors are stored/read via this index so all trellis panels share them.
        const categoryFirstIndex = new Map<string, number>();
        for (let i = 0; i < n; i++) {
            const catName = mainCat ? String(mainCat.values[i] ?? "") : String(actCol.source.displayName ?? i);
            if (!categoryFirstIndex.has(catName)) categoryFirstIndex.set(catName, i);
        }

        const map = new Map<string, BulletDataPoint[]>(); const order: string[] = [];
        for (let i = 0; i < n; i++) {
            const key = trlCat ? String(trlCat.values[i] ?? "—") : this.t("UI_All", "(All)");
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            const catName = mainCat ? String(mainCat.values[i] ?? "") : String(actCol.source.displayName ?? i);
            const cfIndex = categoryFirstIndex.get(catName) ?? i;
            map.get(key)!.push(this.buildPoint(i, mainCat, actCol, tgtCol, fstCol, ttipCols, hl, cfIndex));
        }
        return order.map(title => ({ title, data: map.get(title)! }));
    }

    /** Bandas por medida y segundo objetivo (Pro). Fuera de Pro y de la vista previa no se leen. */
    private xc: { b1?: powerbi.DataViewValueColumn; b2?: powerbi.DataViewValueColumn; bm?: powerbi.DataViewValueColumn; t2?: powerbi.DataViewValueColumn } = {};

    private readExtraCols(vals: powerbi.DataViewValueColumns): void {
        const pro = this.isPro || this.proPreview;
        const f = (r: string) => pro ? vals.find(v => v.source.roles?.[r]) : undefined;
        this.xc = { b1: f("band1Limit"), b2: f("band2Limit"), bm: f("bandMax"), t2: f("target2") };
    }

    private buildPoint(
        i: number,
        mc:      powerbi.DataViewCategoryColumn | undefined,
        ac:      powerbi.DataViewValueColumn,
        tc:      powerbi.DataViewValueColumn | undefined,
        fc:      powerbi.DataViewValueColumn | undefined,
        ttip:    powerbi.DataViewValueColumn[],
        hl:      boolean,
        cfIndex?: number   // canonical row index for reading mc.objects (trellis: first-panel index)
    ): BulletDataPoint {
        const actual   = ac.values[i] as number | null;
        const num = (c?: powerbi.DataViewValueColumn): number | null => {
            const v = c?.values?.[i];
            return typeof v === "number" && isFinite(v) ? v : null;
        };
        const target   = tc ? tc.values[i] as number | null : null;
        // Forecast es Pro: en Free no se dibuja, ni entra en tooltip, leyenda o escala
        const forecast = (fc && (this.isPro || this.proPreview)) ? fc.values[i] as number | null : null;
        const variance    = (actual != null && target != null) ? actual - target : null;
        const variancePct = (variance != null && target != null && target !== 0)
            ? (variance / Math.abs(target)) * 100 : null;
        const selId = mc
            ? this.host.createSelectionIdBuilder().withCategory(mc, i).createSelectionId()
            : this.host.createSelectionIdBuilder().createSelectionId();

        // Extra tooltip fields dragged by the user into the Tooltips well
        const tooltipFields: VisualTooltipDataItem[] = ttip.map(col => ({
            displayName: col.source.displayName,
            value:       col.values[i] != null ? String(col.values[i]) : "–",
        }));

        // Per-data-point colors from conditional formatting rules.
        // Use cfIndex (first-panel row) so CF stored in panel-1 propagates to all panels.
        const ci = cfIndex ?? i;
        const cfActual = mc?.objects?.[ci]?.["colors"]?.["actualColor"] as powerbi.Fill | undefined;
        // Use || not ?? so that empty string "" (sent by PBI "Recent colors" picker) also
        // falls back to undefined, preventing fill="" which renders as white in SVG.
        const colorActual = cfActual?.solid?.color || undefined;
        const cfTarget = mc?.objects?.[ci]?.["colors"]?.["targetColor"] as powerbi.Fill | undefined;
        const colorTarget = cfTarget?.solid?.color || undefined;

        return {
            category:      mc ? String(mc.values[i] ?? "") : String(ac.source.displayName ?? i),
            actual, target, forecast, variance, variancePct,
            selectionId:   selId,
            isHighlighted: !hl || (ac.highlights![i] != null),
            tooltipFields,
            colorActual,
            colorTarget,
            formatActual:   this.fmtOf(ac, i),
            formatTarget:   this.fmtOf(tc, i),
            formatForecast: this.fmtOf(fc, i),
            band1Limit:     num(this.xc.b1),
            band2Limit:     num(this.xc.b2),
            bandMax:        num(this.xc.bm),
            target2:        num(this.xc.t2),
            formatTarget2:  this.fmtOf(this.xc.t2, i),
        };
    }

    // ── Update ───────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.lastOptions = options;
        this.events.renderingStarted(options);
        try {
            this.formatMode = !!(options as any).formatMode;
            this.subSelectionHelper.setFormatMode(this.formatMode);
            this.container.classList.toggle("fmt", this.formatMode);
            this.render(options);
            this.renderGuide();
            this.markSubSelectables();
            if (this.formatMode) this.subSelectionHelper.updateOutlinesFromSubSelections((options as any).subSelections ?? [], true);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
            console.error("[BulletChartPro]", e);
        }
    }

    /**
     * Repintado fuera de update() (licencia resuelta, selección restaurada por un marcador). No emite
     * eventos de render: Microsoft exige un renderingStarted y un Finished/Failed por cada update().
     */
    private redraw(): void {
        if (!this.lastOptions) return;
        try {
            this.render(this.lastOptions);
            this.renderGuide();
            this.markSubSelectables();
            if (this.focusedIndex >= 0) this.updateFocusRing();
        } catch (e) { console.error("[BulletChartPro]", e); }
    }

    private render(options: VisualUpdateOptions): void {
        const dv = options.dataViews?.[0];
        const vp = options.viewport;
        if (!dv) {
            this.updateWatermark(false);   // nada que pintar: tampoco marca
            this.renderLanding(vp);
            return;
        }

        // Vista previa Pro: solo en edición (ViewMode View=0), con la licencia ya
        // resuelta y en un entorno donde se puede leer. En lectura, antes de resolver,
        // o donde no se puede leer (Publish to Web, export), se pinta el resultado
        // gratuito sin marca: ahí un cliente que paga se leería como Free.
        const viewMode = (options as any).viewMode;
        const editing  = typeof viewMode === "number" && viewMode !== 0;
        this.editing   = editing;
        this.proPreview = !this.isPro && editing && this.licenseResolved
            && this.licenseEnvSupported && this.licenseInfoAvailable;
        if (this.landingEl) { this.landingEl.remove(); this.landingEl = null; }

        // Elegir una plantilla (panel o guía) la aplica de verdad: se borran los ajustes que define, porque un ajuste
        // guardado manda sobre ella. Solo al CAMBIARLA y editando; nunca al abrir el informe.
        const tplAhora = String(((dv.metadata?.objects as any)?.style?.template) ?? "clean");
        if (editing && this.tplVisto !== null && this.tplVisto !== tplAhora) this.aplicarPlantilla(tplAhora);
        this.tplVisto = tplAhora;
        const has = (r: string) => !!(dv.categorical?.values?.some(v => v.source.roles?.[r]) || dv.categorical?.categories?.some(c => c.source.roles?.[r]));
        this.wells = { target: has("target"), target2: has("target2"), bands: has("band1Limit") || has("band2Limit") || has("bandMax"),
            trellis: has("trellisBy"), forecast: has("forecast") };

        this.settings = this.parseSettings(dv);
        const s = this.settings;
        const vcols = dv.categorical?.values ?? [];
        const nameOf = (role: string, def: string) => vcols.find(v => v.source.roles?.[role])?.source.displayName || def;
        this.names = {
            actual:   nameOf("actual",   this.t("UI_Actual", "Actual")),
            target:   nameOf("target",   this.t("UI_Target", "Target")),
            forecast: nameOf("forecast", this.t("UI_Forecast", "Forecast")),
            target2:  nameOf("target2",  this.t("UI_Target2", "Second target")),
        };
        this.notifyProBlocked(dv);
        this.updateWatermark(this.attemptedPro(dv).length > 0);

        // Small multiples: basta con poner un campo en su pozo (enabled viene true por defecto)
        const hasTrellisField = !!dv.categorical?.categories?.some(c => c.source.roles?.["trellisBy"]);
        if ((this.isPro || this.proPreview) && s.trellisEnabled && hasTrellisField) {
            const panels = this.parseTrellis(dv);
            this.lastDataPoints = panels.flatMap(p => p.data);
            if (!panels.length) { this.renderLanding(vp); }
            else { this.renderTrellis(panels, vp.width, vp.height); }
            return;
        }

        const data = this.parseData(dv);
        this.lastDataPoints = data;
        if (!data.length) { this.renderLanding(vp); return; }

        // Show drill label only when user has actually drilled into a hierarchy level.
        // options.type is a bitmask; bit 4 (value 4) = Resize, bit 2 = Data refresh.
        // Power BI sets the Drilldown flag (64) when a drill action triggered the update.
        const isDrillUpdate = !!(options.type & 64);
        if (isDrillUpdate) this.isDrilled = true;
        const catCol = dv.categorical?.categories?.find(c => c.source.roles?.["category"]);
        const drillLabel = this.isDrilled ? (catCol?.source.displayName ?? "") : "";

        // Vertical es Pro: en Free se dibuja en horizontal (el panel conserva lo elegido y
        // notifyProBlocked lanza el aviso de Power BI)
        if (s.orientation === "vertical" && (this.isPro || this.proPreview)) this.renderVertical(data, vp.width, vp.height, drillLabel);
        else                              this.renderHorizontal(data, vp.width, vp.height, drillLabel);
    }

    // ── Landing ───────────────────────────────────────────────────────

    /** Pantalla de inicio de la serie TCViz, en tres tamaños. Los enlaces solo se abren con un clic (host.launchUrl). */
    private renderLanding(vp: powerbi.IViewport): void {
        this.clearSvg(vp.width, vp.height);
        if (this.guideEl) this.guideEl.style.display = "none";
        if (this.landingEl) this.landingEl.remove();
        const w = vp.width || 0, h = vp.height || 0;
        const size = (w >= 600 && h >= 340) ? "l" : (w >= 360 && h >= 220) ? "m" : "s";
        const pal: any = this.host.colorPalette;
        const hc = !!pal?.isHighContrast;
        const fg = hc ? (pal.foreground?.value || "#FFFFFF") : "";
        const bg = hc ? (pal.background?.value || "#000000") : "";
        const el = document.createElement("div");
        el.className = "bc-landing bc-landing-" + size;
        if (hc) el.style.background = bg;
        const mk = (tag: string, cls?: string, text?: string): HTMLElement => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text;
            if (fg) n.style.color = fg;
            return n;
        };
        const cat = this.t("Visual_Category", "Category"), act = this.t("Visual_Actual", "Actual (Real)"), tgt = this.t("Visual_Target", "Target");
        const head = mk("div", "bc-l-head");
        const img = document.createElement("img");
        img.src = LANDING_ICON; img.alt = ""; img.className = "bc-l-icon";
        head.appendChild(img);
        const titles = mk("div");
        titles.appendChild(mk("div", "bc-l-title", "Bullet Chart Pro"));
        if (size !== "s") {
            titles.appendChild(mk("div", "bc-l-tag", size === "l"
                ? this.t("Landing_Tagline", "Actual against target on one line: the gap, its sign and how far it is from good.")
                : this.t("Landing_TaglineShort", "Actual against target, at a glance.")));
        }
        head.appendChild(titles);
        el.appendChild(head);
        const link = (txt: string, url: string, cls: string): HTMLElement => {
            const a = mk("a", cls) as HTMLAnchorElement;
            a.href = url; a.tabIndex = 0; a.textContent = txt;
            if (hc) { a.style.background = "transparent"; a.style.borderColor = fg; }
            const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); if (this.canInteract()) this.host.launchUrl(url); };
            a.addEventListener("click", open);
            a.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") open(e); });
            return a;
        };
        const links: [string, string, string][] = [
            [this.t("Landing_Guide", "Guide"), this.t("Landing_GuideSub", "support page"), URL_GUIDE],
            [this.t("Landing_Product", "Product page"), "tcviz.com", URL_PRODUCT],
            [this.t("Landing_Video", "Video"), "YouTube", URL_VIDEO],
        ];
        const fin = () => { this.container.appendChild(el); this.landingEl = el; };
        if (size === "s") {
            el.appendChild(mk("p", "bc-l-do", this.tf("Landing_Small", "Add {0} and {1}.", cat, act)));
            const row = mk("div", "bc-l-inline");
            row.appendChild(link(links[0][0], links[0][2], "bc-l-a"));
            el.appendChild(row);
            fin();
            return;
        }
        const L = size === "l";
        const steps = mk("ol", "bc-l-steps");
        const step = (n: number, well: string, txt: string) => {
            const li = mk("li");
            const num = mk("b", "bc-l-n", String(n));
            if (hc) { num.style.background = fg; num.style.color = bg; }
            li.appendChild(num);
            const sp = mk("span");
            sp.appendChild(mk("strong", "bc-l-well", well));
            sp.appendChild(document.createTextNode(" · " + txt));
            li.appendChild(sp);
            steps.appendChild(li);
        };
        step(1, cat, L ? this.t("Landing_Step1", "regions, products or teams — one bar each") : this.t("Landing_Step1Short", "one bar per item"));
        step(2, act, L ? this.t("Landing_Step2", "the measure you track: sales, margin, tickets") : this.t("Landing_Step2Short", "the measure you track"));
        step(3, tgt, L ? this.t("Landing_Step3", "budget, plan or last year: the gap is calculated for you") : this.t("Landing_Step3Short", "budget or plan"));
        if (L) {
            const cols = mk("div", "bc-l-cols");
            const c1 = mk("div");
            c1.appendChild(mk("div", "bc-l-lbl", this.t("Landing_Start", "Start in 3 steps")));
            c1.appendChild(steps);
            const c2 = mk("div");
            c2.appendChild(mk("div", "bc-l-lbl", this.t("Landing_Help", "Help")));
            const list = mk("div", "bc-l-links");
            for (const [txt, sub, url] of links) {
                const a = link(txt, url, "bc-l-card");
                a.appendChild(mk("small", "bc-l-sub", sub));
                list.appendChild(a);
            }
            c2.appendChild(list);
            cols.appendChild(c1); cols.appendChild(c2);
            el.appendChild(cols);
        } else {
            el.appendChild(steps);
            const row = mk("div", "bc-l-inline");
            for (const l of links) row.appendChild(link(l[1] === "tcviz.com" ? "tcviz.com" : l[0], l[2], "bc-l-a"));
            el.appendChild(row);
        }
        if (!this.isPro) {
            const pro = mk("div", "bc-l-pro");
            const chip = mk("span", "bc-l-chip", "Pro");
            if (hc) { chip.style.background = "transparent"; chip.style.border = "1px solid " + fg; }
            pro.appendChild(chip);
            pro.appendChild(mk("span", undefined, L
                ? this.t("Landing_Pro", "Bands from your own measures, a second target, small multiples, forecast and vertical bars.")
                : this.t("Landing_ProShort", "Bands from measures, second target, small multiples.")));
            el.appendChild(pro);
        }
        fin();
    }

    // ═══════════════════════════════════════════════════════════════
    //  HORIZONTAL
    // ═══════════════════════════════════════════════════════════════

    private renderHorizontal(data: BulletDataPoint[], vpW: number, vpH: number, drillLabel: string = ""): void {
        this.container.style.overflowX = "hidden";   // la barra vertical restaba unos px y forzaba una horizontal inútil
        const s       = this.settings;
        const legendH = s.showLegend ? this.legendH() : 0;
        const axisH   = s.showAxis   ? AXIS_H   : 0;
        const isTop   = s.legendPosition === "top";
        const chartY  = isTop ? legendH : 0;
        const chartH  = vpH - legendH - axisH;
        const { min: rMin, max: rMax } = this.calcRange(data);
        const domainMin  = Math.min(0, rMin);
        const domainMax  = rMax * 1.1 || 1;
        const totalDomain = domainMax - domainMin;

        const targetRowH = Math.min(MAX_ROW_H, Math.floor(chartH / data.length));
        const autoRightW = this.estimateRightW(data, s, s.fontSize);
        const L       = this.hLayout(s, vpW, targetRowH, autoRightW);
        this.rp = this.rightPanelMode(data, s, L.rightW);
        const rowsH   = L.rowH * data.length;
        const totalH  = rowsH + legendH + axisH;

        this.clearSvg(vpW, Math.max(vpH, totalH));
        this.attachClearClick();

        // Rows group (offset for top legend)
        const g = this.mkEl("g");
        g.setAttribute("transform", `translate(0,${chartY})`);
        this.rootSvg.appendChild(g);
        const allow = this.canInteract();
        data.forEach((d, i) => this.renderHRow(d, i * L.rowH, L, totalDomain, domainMin, s, allow, g, `h${i}`, i, rMax));

        // Axis below rows — use full domain so negative ticks appear too
        if (s.showAxis) {
            const axisY = chartY + rowsH;
            this.renderHAxis(L.labelW, L.chartW, axisY, domainMax, data[0]?.formatActual, domainMin);
        }

        // Reference lines — drawn after rows so they appear on top of bars
        if (s.refLine1Show || s.refLine2Show) {
            this.renderRefLinesH(L.labelW, L.chartW, chartY, chartY + rowsH, totalDomain, domainMin, data[0]?.formatActual);
        }

        // Legend and drill label always on top
        if (s.showLegend) this.renderLegend(vpW, isTop ? 0 : vpH - legendH);
        this.renderDrillLabel(drillLabel, vpW);
        // Scroll indicator when rows overflow the viewport height
        if (totalH > vpH) this.renderScrollHint(vpW, vpH, "vertical");
    }

    // ═══════════════════════════════════════════════════════════════
    //  renderHRow
    // ═══════════════════════════════════════════════════════════════

    private renderHRow(
        d:           BulletDataPoint,
        gy:          number,
        L:           ReturnType<typeof BulletChartPro.prototype.hLayout>,
        totalDomain: number,
        domainMin:   number,
        s:           BulletSettings,
        allow:       boolean,
        appendTo:    SVGElement,
        idPrefix:    string,
        ki:          number = -1,
        rMax:        number = 0
    ): void {
        const { rowH, barH, barY, actualBarH, actualBarY, labelW, chartW, rightW } = L;
        const fs = s.fontSize; const ff = s.fontFamily;
        const { fg: hcFg, isHC } = this.hcColors();
        const textPrimary   = isHC ? hcFg : "#333";
        const textSecondary = isHC ? hcFg : "#666";

        const g = this.mkEl("g");
        g.setAttribute("transform", `translate(0,${gy})`);
        g.setAttribute("role",      "listitem");
        g.setAttribute("aria-label", this.ariaOf(d));
        if (ki >= 0) g.setAttribute("data-ki", String(ki));
        g.style.opacity = this.dimmed(d) ? "0.25" : "1";
        if (allow) g.style.cursor = "pointer";

        // 1. Category label
        if (s.showCategoryLabel && labelW > 0) {
            const cid = `${idPrefix}lc`;
            this.addClip(cid, 0, 0, labelW - 4, rowH);
            const t = this.mkEl("text");
            t.setAttribute("x",           String(labelW - 8));
            t.setAttribute("y",           String(rowH / 2 + fs * 0.38));
            t.setAttribute("text-anchor", "end");
            t.setAttribute("font-size",   String(fs));
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        textPrimary);
            t.setAttribute("clip-path",   `url(#${cid})`);
            t.textContent = this.ellipsis(d.category, labelW - 10, fs);
            t.setAttribute("data-o", "labels");
            g.appendChild(t);
        }

        const cx = labelW;
        // Helper: map a value to an x offset within chartW
        const xOf = (v: number): number => cx + ((v - domainMin) / totalDomain) * chartW;
        const zeroX = xOf(0);

        // 2. Bands — thresholds relative to rMax (data max, not padded domain)
        this.drawBands(g, s, cx, barY, chartW, barH, rMax, totalDomain, domainMin, d);

        // Zero baseline when we have negative values
        if (domainMin < 0) {
            const base = this.mkEl("line");
            base.setAttribute("x1",           String(zeroX));
            base.setAttribute("x2",           String(zeroX));
            base.setAttribute("y1",           String(barY - 1));
            base.setAttribute("y2",           String(barY + barH + 1));
            base.setAttribute("stroke",       "#555");
            base.setAttribute("stroke-width", "1.5");
            g.appendChild(base);
        }

        // 3. Actual bar — drawn from zero towards the value
        if (d.actual != null) {
            const valX  = xOf(d.actual);
            const barX  = Math.min(zeroX, valX);
            const barW  = Math.max(0, Math.abs(valX - zeroX));
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(barX));
            r.setAttribute("y",      String(actualBarY));
            r.setAttribute("width",  String(barW));
            r.setAttribute("height", String(actualBarH));
            r.setAttribute("fill",   d.colorActual ?? s.actualColor);
            r.setAttribute("data-o", "actual");
            r.setAttribute("rx",     "1");
            g.appendChild(r);
        }

        // 4. Target marker
        if (d.target != null) {
            const tx = xOf(d.target);
            const mH = barH * TARGET_H_RATIO; const mY = barY + (barH - mH) / 2;
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(tx - TARGET_W / 2));
            r.setAttribute("y",      String(mY));
            r.setAttribute("width",  String(TARGET_W));
            r.setAttribute("height", String(mH));
            r.setAttribute("fill",   d.colorTarget ?? s.targetColor);
            r.setAttribute("data-o", "target"); r.classList.add("bc-hit");
            g.appendChild(r);
        }

        // 4b. Segundo objetivo (Pro): marcador hueco, para no confundirlo con el primero.
        if (d.target2 != null) {
            const tx = xOf(d.target2);
            const mH = barH * TARGET_H_RATIO; const mY = barY + (barH - mH) / 2;
            const r = this.mkEl("rect");
            r.setAttribute("x",            String(tx - 2.5));
            r.setAttribute("y",            String(mY));
            r.setAttribute("width",        "5");
            r.setAttribute("height",       String(mH));
            r.setAttribute("fill",         "none");
            r.setAttribute("stroke",       s.target2Color);
            r.setAttribute("data-o", "target2");
            r.setAttribute("stroke-width", "1.5");
            g.appendChild(r);
        }

        // 5. Forecast marker
        if (d.forecast != null) {
            const fx = xOf(d.forecast);
            const fy = barY - 2;
            const tri = this.mkEl("polygon");
            tri.setAttribute("points",
                `${fx},${fy} ${fx-FORECAST_SIZE},${fy-FORECAST_SIZE*1.5} ${fx+FORECAST_SIZE},${fy-FORECAST_SIZE*1.5}`);
            tri.setAttribute("fill",    s.forecastColor);
            tri.setAttribute("data-o", "forecast"); tri.classList.add("bc-hit");
            tri.setAttribute("opacity", "0.85");
            g.appendChild(tri);
        }

        // 6. Right panel
        if (rightW > 0) {
            const rx0  = cx + chartW + CHART_PAD_R;
            const rcid = `${idPrefix}rc`;
            this.addClip(rcid, rx0, 0, rightW, rowH);
            let   rx   = rx0;
            const ry   = rowH / 2 + fs * 0.38;

            if (s.showActualValue && d.actual != null && this.rp.value) {
                const fmtd = this.formatValue(d.actual, d.formatActual);
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("font-weight", "600");
                t.setAttribute("fill",        textPrimary);
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = fmtd;
                t.setAttribute("data-o", "labels");
                g.appendChild(t);
                rx += Math.ceil(fmtd.length * fs * 0.62 + 8);
            }

            if (s.showTargetValue && d.target != null && this.rp.target) {
                const label = `${this.t("UI_TargetShort", "T:")} ${this.formatValue(d.target, d.formatTarget)}`;
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        textSecondary);
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = label;
                t.setAttribute("data-o", "labels");
                g.appendChild(t);
                rx += Math.ceil(label.length * fs * 0.62 + 8);
            }

            if (s.showVariance && d.variance != null) {
                const pos  = d.variance >= s.varianceThreshold;
                const absV = this.formatValue(Math.abs(d.variance), d.formatActual);
                let   txt  = (pos ? "▲ +" : "▼ ") + absV;
                // Sin sitio para el importe y el %, se queda el % (la lectura que importa en un mosaico); sin sitio
                // para nada, se omite: el tooltip lo sigue diciendo.
                if (this.rp.variance === "full" && s.showVariancePct && d.variancePct != null) txt += ` (${this.pctText(d.variancePct)})`;
                else if (this.rp.variance === "pct") txt = d.variancePct != null ? (pos ? "▲ " : "▼ ") + this.pctText(d.variancePct) : "";
                else if (this.rp.variance === "none") txt = "";
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        pos ? s.positiveColor : s.negativeColor);
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = txt;
                t.setAttribute("data-o", "variance");
                g.appendChild(t);
            }
        }

        // 7. Tooltip
        this.attachTooltipEvents(g, d);

        // 8. Context menu — ALWAYS registered (Microsoft cert requirement)
        g.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu(d.selectionId, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });
        if (allow) {
            g.addEventListener("click", (e: MouseEvent) => {
                e.stopPropagation();
                this.selectPoint(d, e.ctrlKey || e.metaKey);
            });
        }

        appendTo.appendChild(g);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VERTICAL
    // ═══════════════════════════════════════════════════════════════

    private renderVertical(data: BulletDataPoint[], vpW: number, vpH: number, drillLabel: string = ""): void {
        this.container.style.overflowX = "auto";
        const s       = this.settings;
        const legendH = s.showLegend ? this.legendH() : 0;
        const isTop   = s.legendPosition === "top";
        const chartY  = isTop ? legendH : 0;
        const chartH  = vpH - legendH;
        const { min: rMinV, max: rMaxV } = this.calcRange(data);
        const domainMinV  = Math.min(0, rMinV);
        const domainMaxV  = rMaxV * 1.1 || 1;
        const totalDomainV = domainMaxV - domainMinV;
        const allow   = this.canInteract();

        // Las etiquetas del eje se dibujan a la izquierda de vPadL: hay que medirlas antes de colocar las columnas.
        this.vPadL = VERT_PAD_LR;
        if (s.showAxis) {
            const longest = Math.max(...this.niceTicks(domainMaxV).map(v => this.formatValue(v, data[0]?.formatActual).length), 1);
            this.vPadL = VERT_PAD_LR + Math.ceil(longest * this.axisFs() * 0.6) + 8;
        }

        // Enforce minimum column width — if too many categories, widen SVG and let container H-scroll
        const minContentW = data.length * MIN_COL_W + this.vPadL + VERT_PAD_LR;
        const svgW        = Math.max(vpW, minContentW);
        const needsHScroll = svgW > vpW;

        this.clearSvg(svgW, vpH);
        this.attachClearClick();

        // Content group
        const g = this.mkEl("g");
        g.setAttribute("transform", `translate(0,${chartY})`);
        this.rootSvg.appendChild(g);
        this.drawVerticalContent(data, g, svgW, chartH, totalDomainV, domainMinV, s, allow, "v");

        // Y-axis (drawn into rootSvg so guide lines span full width)
        if (s.showAxis) {
            const varH   = s.showVariance ? s.fontSize * 2.0 : 0;
            const labH   = this.vLabH(s);
            const innerH = Math.max(20, chartH - VERT_PAD_TOP - labH - varH);
            const baseline = chartY + VERT_PAD_TOP + innerH;
            this.renderVAxis(this.vPadL, baseline, innerH, domainMaxV, data[0]?.formatActual, domainMinV);
        }

        // Reference lines for vertical mode
        if (s.refLine1Show || s.refLine2Show) {
            const varH2   = s.showVariance ? s.fontSize * 2.0 : 0;
            const labH2   = this.vLabH(s);
            const innerH2 = Math.max(20, chartH - VERT_PAD_TOP - labH2 - varH2);
            const topY    = chartY + VERT_PAD_TOP;
            const botY    = chartY + VERT_PAD_TOP + innerH2;
            this.renderRefLinesV(this.vPadL, svgW - VERT_PAD_LR, topY, botY, totalDomainV, domainMinV, data[0]?.formatActual);
        }

        if (s.showLegend) this.renderLegend(vpW, isTop ? 0 : vpH - legendH);
        this.renderDrillLabel(drillLabel, svgW);
        if (needsHScroll) this.renderScrollHint(vpW, vpH, "horizontal");
    }

    /** Alto bajo la línea base para el nombre de la categoría, según la fuente (antes fijo en 20 px). */
    private vLabH(s: BulletSettings): number {
        return s.showCategoryLabel ? Math.max(VERT_PAD_BOT, Math.ceil(s.fontSize * 1.6)) : 0;
    }

    /**
     * Qué cabe en la columna de valores, mirando la fila más larga: primero cae el importe de la desviación (queda el %),
     * luego la desviación, luego el objetivo. Lo omitido sigue en el tooltip.
     */
    private rightPanelMode(data: BulletDataPoint[], s: BulletSettings, rightW: number) {
        const fs = s.fontSize, w = (txt: string) => Math.ceil(txt.length * fs * 0.6 + 8);
        let wv = 0, wt = 0, wFull = 0, wPct = 0;
        data.forEach(d => {
            if (s.showActualValue && d.actual != null) wv = Math.max(wv, w(this.formatValue(d.actual, d.formatActual)));
            if (s.showTargetValue && d.target != null) wt = Math.max(wt, w(`${this.t("UI_TargetShort", "T:")} ${this.formatValue(d.target, d.formatTarget)}`));
            if (s.showVariance && d.variance != null) {
                const base = "▲ +" + this.formatValue(Math.abs(d.variance), d.formatActual);
                const pct = d.variancePct != null ? this.pctText(d.variancePct) : "";
                wFull = Math.max(wFull, w(s.showVariancePct && pct ? `${base} (${pct})` : base));
                wPct = Math.max(wPct, w("▲ " + pct));
            }
        });
        const value = wv <= rightW;
        let used = value ? wv : 0;
        const variance: "full" | "pct" | "none" = !s.showVariance ? "none"
            : used + wFull <= rightW ? "full" : (s.showVariancePct && used + wPct <= rightW) ? "pct" : "none";
        used += variance === "full" ? wFull : variance === "pct" ? wPct : 0;
        const target = used + wt <= rightW;
        return { value, target, variance };
    }

    /** Lo que el lector de pantalla dice de una fila: categoría, real, objetivo y desviación, con sus formatos. */
    private ariaOf(d: BulletDataPoint): string {
        const parts = [d.category];
        if (d.actual != null) parts.push(`${this.names.actual} ${this.formatValue(d.actual, d.formatActual)}`);
        if (d.target != null) parts.push(`${this.names.target} ${this.formatValue(d.target, d.formatTarget)}`);
        if (d.variance != null) parts.push(`${this.t("UI_Variance", "Variance")} ${d.variance >= 0 ? "+" : "−"}${this.formatValue(Math.abs(d.variance), d.formatActual)}` +
            (d.variancePct != null ? ` (${this.pctText(d.variancePct)})` : ""));
        if (d.target2 != null) parts.push(`${this.names.target2} ${this.formatValue(d.target2, d.formatTarget2)}`);
        return parts.join(", ");
    }

    /** Recorta con "…" lo que no cabe en el ancho dado (estimación por carácter). */
    private ellipsis(text: string, maxW: number, fs: number): string {
        const max = Math.floor(maxW / (fs * 0.58));
        if (text.length <= max) return text;
        return max <= 1 ? "" : text.slice(0, max - 1).trimEnd() + "…";
    }

    /** Fuente que hace caber el texto en el ancho dado (estimación por carácter), sin pasar de la elegida ni bajar de 8. */
    private fitFs(text: string, maxW: number, fs: number): number {
        const need = text.length * 0.6;
        return need <= 0 ? fs : Math.max(8, Math.min(fs, Math.floor(maxW / need)));
    }

    /** Alto de la franja de la leyenda: crece con su fuente (antes fijo en 22 px). */
    private legendH(): number {
        return Math.max(LEGEND_H, Math.ceil((this.settings?.legendFontSize ?? 10) * 2.2));
    }

    /** Fuente de las etiquetas de los ejes: dos puntos menos que la de las etiquetas, nunca menos de 9. */
    private axisFs(): number {
        return Math.max(9, (this.settings?.fontSize ?? 11) - 2);
    }

    private drawVerticalContent(
        data:        BulletDataPoint[],
        appendTo:    SVGElement,
        panelW:      number,
        panelH:      number,
        totalDomain: number,
        domainMin:   number,
        s:           BulletSettings,
        allow:       boolean,
        idPrefix:    string
    ): void {
        const fs = s.fontSize; const ff = s.fontFamily;
        const n  = data.length;
        if (n === 0) return;
        const { fg: hcFgV, isHC: isHCV } = this.hcColors();
        const textPrimaryV   = isHCV ? hcFgV : "#333";
        const textSecondaryV = isHCV ? hcFgV : "#555";

        const varH   = s.showVariance ? fs * 2.0 : 0;
        const labH   = this.vLabH(s);
        const chartH = Math.max(20, panelH - VERT_PAD_TOP - labH - varH);
        const colW   = Math.max(16, (panelW - this.vPadL - VERT_PAD_LR) / n);
        // baseline = y position corresponding to domain's max (top) and min (bottom)
        // zeroY = y position of value 0
        const topY     = VERT_PAD_TOP;
        const botY     = VERT_PAD_TOP + chartH;
        const zeroY    = botY - ((-domainMin) / totalDomain) * chartH; // y for value=0
        const yOf      = (v: number) => botY - ((v - domainMin) / totalDomain) * chartH;
        const baseline = zeroY; // baseline drawn at zero
        const barW   = Math.max(4, colW * 0.55);
        const barXOff = (colW - barW) / 2;

        // Zero baseline
        const axis = this.mkEl("line");
        axis.setAttribute("x1",           String(this.vPadL));
        axis.setAttribute("x2",           String(this.vPadL + colW * n));
        axis.setAttribute("y1",           String(baseline));
        axis.setAttribute("y2",           String(baseline));
        axis.setAttribute("stroke",       "#CCC");
        axis.setAttribute("stroke-width", "1");
        appendTo.appendChild(axis);

        data.forEach((d, i) => {
            const colX = this.vPadL + i * colW;
            const g = this.mkEl("g");
            g.setAttribute("transform", `translate(${colX},0)`);
            g.setAttribute("data-ki", String(i));
            g.setAttribute("role", "listitem");
            g.setAttribute("aria-label", this.ariaOf(d));
            g.style.opacity = this.dimmed(d) ? "0.25" : "1";
            if (allow) g.style.cursor = "pointer";

            if (s.showBands && (d.band1Limit != null || d.band2Limit != null || d.bandMax != null)) {
                // Pro: límites de banda de la columna, desde cero.
                const top = d.bandMax ?? Math.max(0, domainMin + totalDomain / 1.1);
                [[top, s.band3Color], [d.band2Limit, s.band2Color], [d.band1Limit, s.band1Color]].forEach(([v, c]) => {
                    if (v == null) return;
                    const yv = yOf(Math.max(0, v as number));
                    const r = this.mkEl("rect");
                    r.setAttribute("x", String(barXOff)); r.setAttribute("y", String(yv));
                    r.setAttribute("width", String(barW)); r.setAttribute("height", String(Math.max(0, baseline - yv)));
                    r.setAttribute("fill", c as string); r.setAttribute("rx", "2");
                    r.setAttribute("data-o", "bands");
                    g.appendChild(r);
                });
            } else if (s.showBands) {
                // Bands span from zero upward (positive region only)
                const posH = baseline - topY;
                [[posH, s.band3Color],[posH * Math.min(s.band2Pct,100)/100, s.band2Color],[posH * Math.min(s.band1Pct,100)/100, s.band1Color]]
                    .forEach(([h, c]) => {
                        const r = this.mkEl("rect");
                        r.setAttribute("x",      String(barXOff));
                        r.setAttribute("y",      String(baseline - (h as number)));
                        r.setAttribute("width",  String(barW));
                        r.setAttribute("height", String(h as number));
                        r.setAttribute("fill",   c as string); r.setAttribute("rx","2");
                        r.setAttribute("data-o", "bands");
                        g.appendChild(r);
                    });
            } else {
                const bg = this.mkEl("rect");
                bg.setAttribute("x",String(barXOff)); bg.setAttribute("y",String(topY));
                bg.setAttribute("width",String(barW)); bg.setAttribute("height",String(chartH));
                bg.setAttribute("fill","#E8E8E8"); bg.setAttribute("rx","2");
                bg.setAttribute("data-o", "bands");
                g.appendChild(bg);
            }

            if (d.actual != null) {
                const valY = yOf(d.actual);
                const aY   = Math.min(baseline, valY);
                const aH   = Math.max(0, Math.abs(baseline - valY));
                const aW   = barW * 0.55; const aX = barXOff + (barW - aW) / 2;
                const r = this.mkEl("rect");
                r.setAttribute("x",String(aX)); r.setAttribute("y",String(aY));
                r.setAttribute("width",String(aW)); r.setAttribute("height",String(aH));
                r.setAttribute("fill", d.colorActual ?? s.actualColor); r.setAttribute("rx","1");
                r.setAttribute("data-o", "actual");
                g.appendChild(r);

                if (s.showActualValue) {
                    const t = this.mkEl("text");
                    const labelY = d.actual >= 0 ? Math.max(topY + fs, valY - 3) : valY + fs + 3;
                    t.setAttribute("x",String(colW / 2)); t.setAttribute("y",String(labelY));
                    const vtxt = this.formatValue(d.actual, d.formatActual);
                    t.setAttribute("text-anchor","middle"); t.setAttribute("font-size",String(this.fitFs(vtxt, colW - 2, fs)));
                    t.setAttribute("font-family",ff); t.setAttribute("font-weight","600"); t.setAttribute("fill",textPrimaryV);
                    // Halo del fondo: la etiqueta cae sobre las bandas y los marcadores de objetivo.
                    t.setAttribute("paint-order","stroke"); t.setAttribute("stroke", isHCV ? this.hcColors().bg : "#FFFFFF");
                    t.setAttribute("stroke-width","3"); t.setAttribute("stroke-linejoin","round");
                    t.textContent = vtxt; g.appendChild(t);
                    t.setAttribute("data-o", "labels");
                }
            }

            if (d.target != null) {
                const ty = yOf(d.target);
                const mW = barW * TARGET_H_RATIO; const mX = barXOff + (barW - mW) / 2;
                const r = this.mkEl("rect");
                r.setAttribute("x",String(mX)); r.setAttribute("y",String(ty - TARGET_W / 2));
                r.setAttribute("width",String(mW)); r.setAttribute("height",String(TARGET_W));
                r.setAttribute("fill", d.colorTarget ?? s.targetColor); g.appendChild(r);
                r.setAttribute("data-o", "target"); r.classList.add("bc-hit");

                if (s.showTargetValue) {
                    const tv = this.mkEl("text");
                    tv.setAttribute("x",           String(colW / 2));
                    tv.setAttribute("y",           String(Math.max(topY + fs, ty - TARGET_W - 2)));
                    tv.setAttribute("text-anchor", "middle");
                    tv.setAttribute("font-size",   String(fs));
                    tv.setAttribute("font-family", ff);
                    tv.setAttribute("fill",        textSecondaryV);
                    tv.textContent = this.formatValue(d.target, d.formatTarget);
                    tv.setAttribute("data-o", "labels");
                    g.appendChild(tv);
                }
            }

            if (d.target2 != null) {
                const ty2 = yOf(d.target2);
                const mW2 = barW * TARGET_H_RATIO; const mX2 = barXOff + (barW - mW2) / 2;
                const r2 = this.mkEl("rect");
                r2.setAttribute("x", String(mX2)); r2.setAttribute("y", String(ty2 - 2.5));
                r2.setAttribute("width", String(mW2)); r2.setAttribute("height", "5");
                r2.setAttribute("fill", "none"); r2.setAttribute("stroke", s.target2Color); r2.setAttribute("stroke-width", "1.5");
                r2.setAttribute("data-o", "target2");
                g.appendChild(r2);
            }

            if (d.forecast != null) {
                const fy = yOf(d.forecast);
                const fc = barXOff + barW / 2; const sz = FORECAST_SIZE;
                const dia = this.mkEl("polygon");
                dia.setAttribute("points",`${fc},${fy-sz} ${fc+sz},${fy} ${fc},${fy+sz} ${fc-sz},${fy}`);
                dia.setAttribute("fill",s.forecastColor); dia.setAttribute("opacity","0.85");
                dia.setAttribute("data-o", "forecast"); dia.classList.add("bc-hit");
                g.appendChild(dia);
            }

            if (s.showCategoryLabel) {
                const t = this.mkEl("text");
                t.setAttribute("x",           String(colW / 2));
                t.setAttribute("y",           String(baseline + fs * 1.1));
                t.setAttribute("text-anchor", "middle");
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        textSecondaryV);
                t.textContent = d.category;
                t.setAttribute("data-o", "labels");
                g.appendChild(t);
            }

            if (s.showVariance && d.variance != null) {
                const pos = d.variance >= s.varianceThreshold;
                let txt = (pos ? "▲+" : "▼") + this.formatValue(Math.abs(d.variance), d.formatActual);
                // Importe y porcentaje en dos líneas: en una sola, con columnas estrechas, se montaban sobre las vecinas.
                const lines = [txt];
                if (s.showVariancePct && d.variancePct != null) lines.push(this.pctText(d.variancePct));
                const vfs = Math.min(...lines.map(l => this.fitFs(l, colW - 4, fs)));
                lines.forEach((l, k) => {
                    const t = this.mkEl("text");
                    t.setAttribute("x",           String(colW / 2));
                    t.setAttribute("y",           String(baseline + labH + vfs * (0.9 + k * 1.05)));
                    t.setAttribute("text-anchor", "middle");
                    t.setAttribute("font-size",   String(vfs));
                    t.setAttribute("font-family", ff);
                    t.setAttribute("fill",        pos ? s.positiveColor : s.negativeColor);
                    t.textContent = l; g.appendChild(t);
                    t.setAttribute("data-o", "variance");
                });
            }

            this.attachTooltipEvents(g, d);
            // Context menu — ALWAYS registered (Microsoft cert requirement)
            g.addEventListener("contextmenu", (e: MouseEvent) => {
                this.selectionManager.showContextMenu(d.selectionId, { x: e.clientX, y: e.clientY });
                e.preventDefault();
            });
            if (allow) {
                g.addEventListener("click", (e: MouseEvent) => {
                    e.stopPropagation();
                    this.selectPoint(d, e.ctrlKey || e.metaKey);
                });
            }
            appendTo.appendChild(g);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  TRELLIS
    // ═══════════════════════════════════════════════════════════════

    private renderTrellis(panels: TrellisPanel[], vpW: number, vpH: number): void {
        this.container.style.overflowX = "hidden";
        const s      = this.settings;
        const titleH = s.trellisShowTitle ? TRELLIS_TITLE_H : 0;

        // Reserve space for legend before computing panel heights
        const legendH    = s.showLegend ? this.legendH() : 0;
        const isTop      = s.legendPosition === "top";
        const availH     = Math.max(0, vpH - legendH);
        const panelOffY  = isTop ? legendH : 0; // panels shift down when legend is on top

        // Columnas: nunca paneles más estrechos que MIN_PANEL_W. Si no caben, menos columnas.
        const fitCols    = Math.max(1, Math.floor((vpW - TRELLIS_GAP) / (MIN_PANEL_W + TRELLIS_GAP)));
        const cols       = Math.max(1, Math.min(s.trellisColumns, fitCols, panels.length));
        const nRows      = Math.ceil(panels.length / cols);
        const panelW     = Math.floor((vpW - TRELLIS_GAP * (cols  + 1)) / cols);
        const maxRows    = Math.max(1, ...panels.map(p => p.data.length));
        const fitH       = Math.floor((availH - TRELLIS_GAP * (nRows + 1)) / nRows);
        // Las filas se encogen hasta 16 px para que los paneles quepan en el visual (antes, 28 px fijos: los paneles
        // se salían, salían barras de desplazamiento y la leyenda quedaba fuera de la vista).
        const targetRowH  = Math.max(16, Math.floor((fitH - titleH - 4) / maxRows));
        const allData     = panels.flatMap(p => p.data);
        const autoRightW  = this.estimateRightW(allData, s, s.fontSize);
        const L           = this.hLayout(s, panelW, targetRowH, autoRightW, 16);
        this.rp = this.rightPanelMode(allData, s, L.rightW);
        // Cada panel mide al menos lo que ocupan sus filas (rowH nunca baja de 28). Antes el alto
        // salía solo del reparto del viewport y las filas se dibujaban encima del panel siguiente
        // y de la leyenda. Si no caben, el SVG crece y el contenedor hace scroll.
        const minPanelH  = s.orientation === "vertical" ? titleH + 120 : titleH + maxRows * L.rowH + 4;
        const panelH     = Math.max(fitH, minPanelH);
        const contentH   = Math.max(20, panelH - titleH);
        const allow      = this.canInteract();
        const { min: gRMin, max: gRMax } = this.calcRange(allData);
        const globalDomainMin = Math.min(0, gRMin);
        const globalDomainMax = gRMax * 1.1 || 1;
        const globalTotalDomain = globalDomainMax - globalDomainMin;

        const totalTrellisH = legendH + TRELLIS_GAP + nRows * (panelH + TRELLIS_GAP);
        this.clearSvg(vpW, Math.max(vpH, totalTrellisH));
        this.attachClearClick();

        panels.forEach((panel, pi) => {
            const col  = pi % cols;
            const row  = Math.floor(pi / cols);
            const px   = TRELLIS_GAP + col * (panelW + TRELLIS_GAP);
            const py   = panelOffY + TRELLIS_GAP + row * (panelH + TRELLIS_GAP);
            const { min: pRMin, max: pRMax } = this.calcRange(panel.data);
            const pDomainMin   = s.trellisSyncScale ? globalDomainMin   : Math.min(0, pRMin);
            const pDomainMax   = s.trellisSyncScale ? globalDomainMax   : pRMax * 1.1 || 1;
            const pTotalDomain = s.trellisSyncScale ? globalTotalDomain : pDomainMax - pDomainMin;
            const pBandMax     = s.trellisSyncScale ? gRMax              : pRMax; // raw max for band thresholds

            const bg = this.mkEl("rect");
            bg.setAttribute("x",      String(px));    bg.setAttribute("y",      String(py));
            bg.setAttribute("width",  String(panelW)); bg.setAttribute("height", String(panelH));
            bg.setAttribute("fill",   s.trellisPanelColor);
            bg.setAttribute("stroke", s.trellisBorderColor);
            bg.setAttribute("rx",     "4");
            this.rootSvg.appendChild(bg);

            if (s.trellisShowTitle) {
                const tbg = this.mkEl("rect");
                tbg.setAttribute("x",String(px)); tbg.setAttribute("y",String(py));
                tbg.setAttribute("width",String(panelW)); tbg.setAttribute("height",String(titleH));
                tbg.setAttribute("fill", s.trellisBorderColor); tbg.setAttribute("rx","4");
                this.rootSvg.appendChild(tbg);

                const tt = this.mkEl("text");
                tt.setAttribute("x",           String(px + panelW / 2));
                tt.setAttribute("y",           String(py + titleH / 2 + s.fontSize * 0.38));
                tt.setAttribute("text-anchor", "middle");
                tt.setAttribute("font-size",   String(Math.min(s.fontSize + 1, 13)));
                tt.setAttribute("font-family", s.fontFamily);
                tt.setAttribute("font-weight", "600");
                tt.setAttribute("fill",        s.trellisTitleColor);
                tt.textContent = panel.title;
                tt.setAttribute("data-o", "trellis");
                this.rootSvg.appendChild(tt);
            }

            const panelG = this.mkEl("g");
            panelG.setAttribute("transform", `translate(${px},${py + titleH})`);
            this.rootSvg.appendChild(panelG);

            if (s.orientation === "vertical") {
                this.vPadL = VERT_PAD_LR;
                this.drawVerticalContent(panel.data, panelG, panelW, contentH, pTotalDomain, pDomainMin, s, allow, `tv${pi}`);
                // Reference lines — absolute coords within rootSvg
                if (s.refLine1Show || s.refLine2Show) {
                    const varH2 = s.showVariance ? s.fontSize * 2.0 : 0;
                    const labH2 = this.vLabH(s);
                    const innerH2 = Math.max(20, contentH - VERT_PAD_TOP - labH2 - varH2);
                    this.renderRefLinesV(
                        px + VERT_PAD_LR, px + panelW - VERT_PAD_LR,
                        py + titleH + VERT_PAD_TOP, py + titleH + VERT_PAD_TOP + innerH2,
                        pTotalDomain, pDomainMin, panel.data[0]?.formatActual);
                }
            } else {
                panel.data.forEach((d, di) =>
                    this.renderHRow(d, di * L.rowH, L, pTotalDomain, pDomainMin, s, allow, panelG, `th${pi}-${di}`, -1, pBandMax));
                // Reference lines — absolute coords within rootSvg
                if (s.refLine1Show || s.refLine2Show) {
                    this.renderRefLinesH(
                        px + L.labelW, L.chartW,
                        py + titleH, py + titleH + panel.data.length * L.rowH,
                        pTotalDomain, pDomainMin, panel.data[0]?.formatActual);
                }
            }
        });
        if (s.showLegend) this.renderLegend(vpW, isTop ? 0 : vpH - legendH);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Layout helper
    // ═══════════════════════════════════════════════════════════════

    // Estimate the pixel width needed for the right panel (values + variance text).
    // Uses the same formula as renderHRow so the column fits without manual tuning.
    private estimateRightW(data: BulletDataPoint[], s: BulletSettings, fs: number): number {
        if (!s.showActualValue && !s.showVariance && !s.showTargetValue) return 0;
        let maxW = 0;
        data.forEach(d => {
            let w = 0;
            if (s.showActualValue && d.actual != null)
                w += Math.ceil(this.formatValue(d.actual, d.formatActual).length * fs * 0.62 + 10);
            if (s.showTargetValue && d.target != null)
                w += Math.ceil((`${this.t("UI_TargetShort", "T:")} ${this.formatValue(d.target, d.formatTarget)}`).length * fs * 0.62 + 10);
            if (s.showVariance && d.variance != null) {
                const absV = this.formatValue(Math.abs(d.variance), d.formatActual);
                let txt    = (d.variance >= 0 ? "▲ +" : "▼ ") + absV;
                if (s.showVariancePct && d.variancePct != null)
                    txt   += ` (${this.pctText(d.variancePct)})`;
                w += Math.ceil(txt.length * fs * 0.62 + 6);
            }
            maxW = Math.max(maxW, w);
        });
        return maxW + 8; // small safety margin
    }

    private hLayout(s: BulletSettings, vpW: number, targetRowH?: number, autoRightW?: number, minRowH = 28) {
        const fs      = s.fontSize;
        const rowH    = Math.max(minRowH, Math.ceil(targetRowH ?? fs * 3.4));
        const barH    = Math.max(6,  Math.floor(rowH * 0.44));
        const barY    = Math.floor((rowH - barH) / 2);
        const aBarH   = Math.max(3, Math.floor(barH * 0.55));
        const aBarY   = barY + Math.floor((barH - aBarH) / 2);
        let labelW    = s.showCategoryLabel ? Math.round(vpW * s.labelWidthPct / 100) : 0;
        // autoRightW sale del texto más largo. "Values panel width %" no se aplicaba nunca (hasta la 1.4 se ignoraba):
        // desde la 1.5 manda si el usuario lo fija; si no, se sigue calculando solo y los informes no cambian.
        const anyValue = s.showActualValue || s.showVariance || s.showTargetValue;
        let rightW    = !anyValue ? 0
            : s.rightPanelWidthSet || autoRightW == null
                ? Math.round(vpW * s.rightPanelWidthPct / 100)
                : autoRightW;
        // La barra es lo esencial. rightW va en píxeles fijos (sale del texto más largo), así que
        // en un visual estrecho etiqueta + valores se comían todo el ancho y la barra desaparecía.
        // Se garantiza un mínimo para la barra: primero se estrecha la columna de valores, si
        // queda inservible se oculta, y solo después se estrecha la de categorías.
        const avail    = Math.max(0, vpW - CHART_PAD_R);
        const minChart = Math.min(avail, Math.max(60, Math.round(vpW * 0.4)));
        if (labelW + rightW > avail - minChart) {
            rightW = Math.max(0, avail - minChart - labelW);
            if (rightW < 50) rightW = 0;
            if (labelW + rightW > avail - minChart) {
                labelW = Math.max(0, avail - minChart - rightW);
                if (labelW < 40) labelW = 0;
            }
        }
        const chartW  = Math.max(20, vpW - labelW - rightW - CHART_PAD_R);
        return { rowH, barH, barY, actualBarH: aBarH, actualBarY: aBarY, labelW, rightW, chartW };
    }

    // ═══════════════════════════════════════════════════════════════
    //  Shared helpers
    // ═══════════════════════════════════════════════════════════════

    // Renders the legend bar at top or bottom of the visual.
    // Shows items for: Actual bar, Target marker, Forecast marker (if data present),
    // and qualitative bands (if enabled). Items are drawn left-to-right.
    private renderLegend(vpW: number, yPos: number): void {
        const n0 = this.rootSvg.childNodes.length;
        const s   = this.settings;
        const ff  = s.legendFontFamily;
        const fs  = s.legendFontSize;
        const mid = yPos + this.legendH() / 2;

        const hasTarget   = this.lastDataPoints.some(d => d.target   != null);
        const hasForecast = this.lastDataPoints.some(d => d.forecast != null);
        const hasTarget2  = this.lastDataPoints.some(d => d.target2  != null);

        // Legend items: [icon-draw-fn, label]
        type Item = { label: string; draw: (x: number) => number /* returns icon width */ };
        const items: Item[] = [];

        // Actual — filled rectangle
        items.push({ label: this.names.actual, draw: (x) => {
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(x));  r.setAttribute("y",      String(mid - 5));
            r.setAttribute("width",  "14");        r.setAttribute("height", "10");
            r.setAttribute("fill",   s.actualColor); r.setAttribute("rx", "1");
            this.rootSvg.appendChild(r);
            return 14;
        }});

        // Target — thin vertical bar
        if (hasTarget) items.push({ label: this.names.target, draw: (x) => {
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(x + 5)); r.setAttribute("y",      String(mid - 7));
            r.setAttribute("width",  String(TARGET_W)); r.setAttribute("height", "14");
            r.setAttribute("fill",   s.targetColor);
            this.rootSvg.appendChild(r);
            return 14;
        }});

        // Segundo objetivo — marcador hueco
        if (hasTarget2) items.push({ label: this.names.target2, draw: (x) => {
            const r = this.mkEl("rect");
            r.setAttribute("x", String(x + 4)); r.setAttribute("y", String(mid - 7));
            r.setAttribute("width", "5"); r.setAttribute("height", "14");
            r.setAttribute("fill", "none"); r.setAttribute("stroke", s.target2Color); r.setAttribute("stroke-width", "1.5");
            this.rootSvg.appendChild(r);
            return 14;
        }});

        // Forecast — diamond
        if (hasForecast) items.push({ label: this.names.forecast, draw: (x) => {
            const cx = x + 7; const sz = 5;
            const poly = this.mkEl("polygon");
            poly.setAttribute("points", `${cx},${mid-sz} ${cx+sz},${mid} ${cx},${mid+sz} ${cx-sz},${mid}`);
            poly.setAttribute("fill",    s.forecastColor);
            poly.setAttribute("opacity", "0.85");
            this.rootSvg.appendChild(poly);
            return 14;
        }});

        // Qualitative bands (3 stacked squares)
        if (s.showBands) items.push({ label: this.t("UI_Bands", "Bands"), draw: (x) => {
            [[s.band3Color, 0],[s.band2Color, 3],[s.band1Color, 6]].forEach(([c, off]) => {
                const r = this.mkEl("rect");
                r.setAttribute("x",      String(x + (off as number)));
                r.setAttribute("y",      String(mid - 5));
                r.setAttribute("width",  "8"); r.setAttribute("height", "10");
                r.setAttribute("fill",   c as string); r.setAttribute("rx", "1");
                this.rootSvg.appendChild(r);
            });
            return 18;
        }});

        // Measure total width to center the legend
        const ITEM_GAP   = 16;
        const LABEL_PX   = fs * 0.62;
        const totalW = items.reduce((sum, it) => sum + 14 + 4 + it.label.length * LABEL_PX + ITEM_GAP, 0);
        let x = Math.max(4, (vpW - totalW) / 2);

        items.forEach(it => {
            if (x + 18 + it.label.length * LABEL_PX > vpW) return;   // no cabe: fuera, mejor que cortado
            const iconW = it.draw(x);
            x += iconW + 4;

            const { fg, isHC } = this.hcColors();
            const t = this.mkEl("text");
            t.setAttribute("x",           String(x));
            t.setAttribute("y",           String(mid + fs * 0.38));
            t.setAttribute("font-size",   String(fs));
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        isHC ? fg : s.legendColor);
            t.setAttribute("pointer-events", "none");
            t.textContent = it.label;
            this.rootSvg.appendChild(t);
            x += it.label.length * LABEL_PX + ITEM_GAP;
        });
        this.tagFrom(n0, "legend", false);

        // Se agrupa y se fija a la vista: con más filas de las que caben, el contenedor se desplaza y la leyenda tiene
        // que seguir visible. yPos es relativo a la vista; stickLegend la mueve con el scroll.
        const lg = this.mkEl("g");
        lg.setAttribute("class", "bc-legend-g");
        const svgH = Number(this.rootSvg.getAttribute("height")) || 0;
        if (svgH > (this.lastOptions?.viewport?.height ?? svgH)) {
            const bgr = this.mkEl("rect");
            bgr.setAttribute("x", "0"); bgr.setAttribute("y", String(yPos));
            bgr.setAttribute("width", String(vpW)); bgr.setAttribute("height", String(this.legendH()));
            bgr.setAttribute("fill", this.hcColors().isHC ? this.hcColors().bg : "#FFFFFF");
            lg.appendChild(bgr);
        }
        const nodes = Array.prototype.slice.call(this.rootSvg.childNodes, n0) as Node[];
        nodes.forEach(nd => { if ((nd as Element).tagName !== "clipPath") lg.appendChild(nd); });
        this.rootSvg.appendChild(lg);
        this.stickLegend();
    }

    /** La leyenda sigue al desplazamiento del contenedor. */
    private stickLegend(): void {
        const lg = this.rootSvg.querySelector(".bc-legend-g");
        if (lg) lg.setAttribute("transform", `translate(${this.container.scrollLeft},${this.container.scrollTop})`);
    }

    // Returns nicely-rounded tick values for a 0-to-maxValue scale.
    private niceTicks(maxValue: number, count: number = 4): number[] {
        if (maxValue <= 0) return [0];
        const rawStep = maxValue / count;
        const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const norm = rawStep / mag;
        const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
        const ticks: number[] = [];
        for (let v = 0; v <= maxValue * 1.001; v += step)
            ticks.push(parseFloat((Math.round(v / step) * step).toPrecision(10)));
        return ticks;
    }

    // Horizontal axis: baseline + vertical guide lines + tick labels below bars.
    // Drawn after rows so guide lines appear above bars (light dashed, pointer-events:none).
    private renderHAxis(labelW: number, chartW: number, yBase: number, maxV: number, formatStr?: string, minV: number = 0): void {
        const n0 = this.rootSvg.childNodes.length;
        const ff          = this.settings.fontFamily;
        const totalDomain = maxV - minV;
        const xOf         = (v: number) => labelW + ((v - minV) / totalDomain) * chartW;
        const { fg, isHC } = this.hcColors();
        const lineColor   = isHC ? fg : "#D0D0D0";
        const guideColor  = isHC ? fg : "#E0E0E0";
        const tickColor   = isHC ? fg : "#B0B0B0";
        const labelColor  = isHC ? fg : "#AAA";

        // Baseline
        const bl = this.mkEl("line");
        bl.setAttribute("x1", String(labelW)); bl.setAttribute("x2", String(labelW + chartW));
        bl.setAttribute("y1", String(yBase));   bl.setAttribute("y2", String(yBase));
        bl.setAttribute("stroke", lineColor);   bl.setAttribute("stroke-width", "1");
        this.rootSvg.appendChild(bl);

        // Build tick set: positive ticks + mirrored negative ticks when minV < 0
        const positiveTicks = this.niceTicks(maxV, Math.max(1, Math.min(4, Math.floor(chartW / 70))));
        const allTicks: number[] = [...positiveTicks];
        if (minV < 0) {
            positiveTicks.forEach(v => { if (v > 0) allTicks.push(-v); });
        }

        allTicks.forEach(v => {
            if (v < minV || v > maxV) return;
            const x = xOf(v);

            const gl = this.mkEl("line");
            gl.setAttribute("x1", String(x)); gl.setAttribute("x2", String(x));
            gl.setAttribute("y1", "0");        gl.setAttribute("y2", String(yBase));
            gl.setAttribute("stroke", guideColor); gl.setAttribute("stroke-width", "1");
            gl.setAttribute("stroke-dasharray", "3,3");
            gl.setAttribute("pointer-events", "none");
            this.rootSvg.appendChild(gl);

            const tk = this.mkEl("line");
            tk.setAttribute("x1", String(x)); tk.setAttribute("x2", String(x));
            tk.setAttribute("y1", String(yBase)); tk.setAttribute("y2", String(yBase + 4));
            tk.setAttribute("stroke", tickColor); tk.setAttribute("stroke-width", "1");
            this.rootSvg.appendChild(tk);

            const t = this.mkEl("text");
            t.setAttribute("x",           String(x));
            t.setAttribute("y",           String(yBase + 13));
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("font-size",   String(this.axisFs()));
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        labelColor);
            t.setAttribute("pointer-events", "none");
            t.textContent = this.formatValue(v, formatStr);
            this.rootSvg.appendChild(t);
        });
        this.tagFrom(n0, "axis", true);
    }

    // Vertical axis: Y-axis line + horizontal guide lines + labels on the left.
    private renderVAxis(xLeft: number, baseline: number, chartH: number, maxV: number, formatStr?: string, minV: number = 0): void {
        const n0 = this.rootSvg.childNodes.length;
        const ff          = this.settings.fontFamily;
        const totalDomain = maxV - minV;
        // baseline = y position for value=0 (passed in)
        const yOf = (v: number) => baseline - ((v - minV) / totalDomain) * chartH;
        const { fg, isHC } = this.hcColors();
        const lineColor  = isHC ? fg : "#D0D0D0";
        const guideColor = isHC ? fg : "#E0E0E0";
        const tickColor  = isHC ? fg : "#B0B0B0";
        const labelColor = isHC ? fg : "#AAA";

        // Y-axis line spans from bottom of negative region to top
        const topY = yOf(maxV);
        const botY = yOf(minV);
        const vl = this.mkEl("line");
        vl.setAttribute("x1", String(xLeft)); vl.setAttribute("x2", String(xLeft));
        vl.setAttribute("y1", String(topY));  vl.setAttribute("y2", String(botY));
        vl.setAttribute("stroke", lineColor); vl.setAttribute("stroke-width", "1");
        this.rootSvg.appendChild(vl);

        // Ticks: positive + mirrored negatives when minV < 0
        const posTicks = this.niceTicks(maxV, Math.max(1, Math.min(4, Math.floor(chartH / 28))));
        const allTicks: number[] = [...posTicks];
        if (minV < 0) {
            posTicks.forEach(v => { if (v > 0) allTicks.push(-v); });
        }

        allTicks.forEach(v => {
            if (v < minV || v > maxV) return;
            const y = yOf(v);

            const gl = this.mkEl("line");
            gl.setAttribute("x1", String(xLeft)); gl.setAttribute("x2", String(xLeft + 2000));
            gl.setAttribute("y1", String(y));      gl.setAttribute("y2", String(y));
            gl.setAttribute("stroke", guideColor); gl.setAttribute("stroke-width", "1");
            gl.setAttribute("stroke-dasharray", "3,3");
            gl.setAttribute("pointer-events", "none");
            this.rootSvg.appendChild(gl);

            const tk = this.mkEl("line");
            tk.setAttribute("x1", String(xLeft - 3)); tk.setAttribute("x2", String(xLeft));
            tk.setAttribute("y1", String(y));           tk.setAttribute("y2", String(y));
            tk.setAttribute("stroke", tickColor); tk.setAttribute("stroke-width", "1");
            this.rootSvg.appendChild(tk);

            const t = this.mkEl("text");
            t.setAttribute("x",           String(xLeft - 5));
            t.setAttribute("y",           String(y + 3));
            t.setAttribute("text-anchor", "end");
            t.setAttribute("font-size",   String(this.axisFs()));
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        labelColor);
            t.setAttribute("pointer-events", "none");
            t.textContent = this.formatValue(v, formatStr);
            this.rootSvg.appendChild(t);
        });
        this.tagFrom(n0, "axis", true);
    }

    // Draws a subtle scroll indicator badge when content overflows the viewport.
    // "vertical" = more rows below (H-mode); "horizontal" = more columns to the right (V-mode).
    private renderScrollHint(vpW: number, vpH: number, direction: "vertical" | "horizontal"): void {
        const label = (direction === "vertical" ? "▼ " : "▶ ") + this.t("UI_Scroll", "scroll");
        const bW = 52; const bH = 14; const bR = 4;
        const bX = vpW - bW - 4; const bY = vpH - bH - 4;
        const { fg, bg: bgCol, isHC } = this.hcColors();

        const bg = this.mkEl("rect");
        bg.setAttribute("x",      String(bX)); bg.setAttribute("y",      String(bY));
        bg.setAttribute("width",  String(bW)); bg.setAttribute("height", String(bH));
        bg.setAttribute("fill",   isHC ? bgCol : "rgba(0,0,0,0.12)");
        bg.setAttribute("stroke", isHC ? fg : "none");
        bg.setAttribute("rx",     String(bR));
        bg.setAttribute("pointer-events", "none");
        this.rootSvg.appendChild(bg);

        const t = this.mkEl("text");
        t.setAttribute("x",           String(bX + bW / 2));
        t.setAttribute("y",           String(bY + bH - 3));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size",   "9");
        t.setAttribute("font-family", this.settings.fontFamily);
        t.setAttribute("fill",        isHC ? fg : "#666");
        t.setAttribute("pointer-events", "none");
        t.textContent = label;
        this.rootSvg.appendChild(t);
    }

    // Shows the current hierarchy level name in the top-right corner.
    // Helps users track their position when drilling through a hierarchy.
    private renderDrillLabel(label: string, vpW: number): void {
        if (!label) return;
        const { fg, isHC } = this.hcColors();
        const t = this.mkEl("text");
        t.setAttribute("x",           String(vpW - 4));
        t.setAttribute("y",           "11");
        t.setAttribute("text-anchor", "end");
        t.setAttribute("font-size",   "10");
        t.setAttribute("font-family", this.settings.fontFamily);
        t.setAttribute("fill",        isHC ? fg : "#AAAAAA");
        t.setAttribute("pointer-events", "none");
        t.textContent = label;
        this.rootSvg.appendChild(t);
    }

    // Draws reference lines into rootSvg.
    // For H-mode: vertical lines crossing all rows, given the same coord system as the axis.
    // For V-mode: horizontal lines crossing all columns.
    // chartTop/chartBot = SVG y coordinates bounding the chart area (rows group already offset by chartY).
    // labelW / chartW  = used only in H-mode. zeroX / totalDomain + domainMin derive the x position.
    private renderRefLinesH(
        labelW: number, chartW: number, chartTop: number, chartBot: number,
        totalDomain: number, domainMin: number, formatStr?: string
    ): void {
        const n0 = this.rootSvg.childNodes.length;
        const s   = this.settings;
        const ff  = s.fontFamily;
        const xOf = (v: number) => labelW + ((v - domainMin) / totalDomain) * chartW;
        const lines = [
            { show: s.refLine1Show, value: s.refLine1Value, label: s.refLine1Label, color: s.refLine1Color },
            { show: s.refLine2Show, value: s.refLine2Value, label: s.refLine2Label, color: s.refLine2Color },
        ];
        lines.forEach(rl => {
            if (!rl.show) return;
            const x = xOf(rl.value);
            if (x < labelW || x > labelW + chartW) return; // clip to chart area

            const ln = this.mkEl("line");
            ln.setAttribute("x1", String(x)); ln.setAttribute("x2", String(x));
            ln.setAttribute("y1", String(chartTop)); ln.setAttribute("y2", String(chartBot));
            ln.setAttribute("stroke",           rl.color);
            ln.setAttribute("stroke-width",     "1.5");
            ln.setAttribute("stroke-dasharray", "5,3");
            ln.setAttribute("pointer-events",   "none");
            this.rootSvg.appendChild(ln);

            const displayLabel = rl.label || this.formatValue(rl.value, formatStr);
            if (displayLabel) {
                const t = this.mkEl("text");
                t.setAttribute("x",           String(x + 3));
                t.setAttribute("y",           String(chartTop + 9));
                t.setAttribute("font-size",   "9");
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        rl.color);
                t.setAttribute("pointer-events", "none");
                t.textContent = displayLabel;
                this.rootSvg.appendChild(t);
            }
        });
        this.tagFrom(n0, "refs", false);
    }

    private renderRefLinesV(
        xLeft: number, xRight: number, chartTop: number, chartBot: number,
        totalDomain: number, domainMin: number, formatStr?: string
    ): void {
        const n0 = this.rootSvg.childNodes.length;
        const s   = this.settings;
        const ff  = s.fontFamily;
        // In vertical mode baseline is at zeroY, top is chartTop
        // yOf maps value → y: lower values = lower y (higher on screen is higher value)
        const yOf = (v: number) => chartBot - ((v - domainMin) / totalDomain) * (chartBot - chartTop);
        const lines = [
            { show: s.refLine1Show, value: s.refLine1Value, label: s.refLine1Label, color: s.refLine1Color },
            { show: s.refLine2Show, value: s.refLine2Value, label: s.refLine2Label, color: s.refLine2Color },
        ];
        lines.forEach(rl => {
            if (!rl.show) return;
            const y = yOf(rl.value);
            if (y < chartTop || y > chartBot) return;

            const ln = this.mkEl("line");
            ln.setAttribute("x1", String(xLeft)); ln.setAttribute("x2", String(xRight));
            ln.setAttribute("y1", String(y));      ln.setAttribute("y2", String(y));
            ln.setAttribute("stroke",           rl.color);
            ln.setAttribute("stroke-width",     "1.5");
            ln.setAttribute("stroke-dasharray", "5,3");
            ln.setAttribute("pointer-events",   "none");
            this.rootSvg.appendChild(ln);

            const displayLabel = rl.label || this.formatValue(rl.value, formatStr);
            if (displayLabel) {
                const t = this.mkEl("text");
                t.setAttribute("x",           String(xLeft + 2));
                t.setAttribute("y",           String(y - 2));
                t.setAttribute("font-size",   "9");
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        rl.color);
                t.setAttribute("pointer-events", "none");
                t.textContent = displayLabel;
                this.rootSvg.appendChild(t);
            }
        });
        this.tagFrom(n0, "refs", false);
    }

    private drawBands(
        g: SVGElement, s: BulletSettings,
        cx: number, y: number, chartW: number, h: number,
        rMax: number, totalDomain: number, domainMin: number, d?: BulletDataPoint
    ): void {
        // Map a data value to a pixel width from cx
        const xOf = (v: number) => cx + Math.max(0, ((v - domainMin) / totalDomain) * chartW);
        const bMax = Math.max(rMax, 0);

        // Pro: límites de banda de la fila, calculados en el modelo. Sin el máximo, la banda 3 llega al máximo de los datos.
        if (s.showBands && d && (d.band1Limit != null || d.band2Limit != null || d.bandMax != null)) {
            const top = d.bandMax ?? bMax;
            [[top, s.band3Color], [d.band2Limit, s.band2Color], [d.band1Limit, s.band1Color]].forEach(([v, c]) => {
                if (v == null) return;
                const r = this.mkEl("rect");
                r.setAttribute("x",      String(cx));
                r.setAttribute("y",      String(y));
                r.setAttribute("width",  String(Math.max(0, xOf(Math.max(0, v as number)) - cx)));
                r.setAttribute("height", String(h));
                r.setAttribute("fill",   c as string);
                r.setAttribute("data-o", "bands");
                r.setAttribute("rx",     "2");
                g.appendChild(r);
            });
            return;
        }

        if (s.showBands) {
            // Band widths are thresholds of the actual data max (rMax), NOT chartW.
            // This prevents the 1.1 domain padding from making bands appear wider than intended.
            const b3w = xOf(bMax)                                       - cx; // 100% of data max
            const b2w = xOf(bMax * Math.min(s.band2Pct, 100) / 100)    - cx;
            const b1w = xOf(bMax * Math.min(s.band1Pct, 100) / 100)    - cx;
            [[b3w, s.band3Color],[b2w, s.band2Color],[b1w, s.band1Color]]
                .forEach(([bw, c]) => {
                    const r = this.mkEl("rect");
                    r.setAttribute("x",      String(cx));
                    r.setAttribute("y",      String(y));
                    r.setAttribute("width",  String(Math.max(0, bw as number)));
                    r.setAttribute("height", String(h));
                    r.setAttribute("fill",   c as string);
                    r.setAttribute("data-o", "bands");
                    r.setAttribute("rx",     "2");
                    g.appendChild(r);
                });
        } else {
            const r = this.mkEl("rect");
            r.setAttribute("x",String(cx)); r.setAttribute("y",String(y));
            r.setAttribute("width",String(chartW)); r.setAttribute("height",String(h));
            r.setAttribute("fill","#E8E8E8"); r.setAttribute("rx","2");
            r.setAttribute("data-o", "bands");
            g.appendChild(r);
        }
    }

    private buildTooltipItems(d: BulletDataPoint): VisualTooltipDataItem[] {
        const items: VisualTooltipDataItem[] = [];
        if (d.actual != null)
            items.push({ displayName: this.names.actual,   value: this.formatValue(d.actual, d.formatActual) });
        if (d.target != null)
            items.push({ displayName: this.names.target,   value: this.formatValue(d.target, d.formatTarget) });
        if (d.variance != null) {
            const sign = d.variance >= 0 ? "+" : "";
            let varStr = `${sign}${this.formatValue(Math.abs(d.variance), d.formatActual)}`;
            if (d.variancePct != null)
                varStr += ` (${this.pctText(d.variancePct)})`;
            items.push({ displayName: this.t("UI_Variance", "Variance"), value: varStr });
        }
        if (d.target2 != null) {
            items.push({ displayName: this.names.target2, value: this.formatValue(d.target2, d.formatTarget2) });
            if (d.actual != null) {
                const v2 = d.actual - d.target2;
                let s2 = `${v2 >= 0 ? "+" : "−"}${this.formatValue(Math.abs(v2), d.formatActual)}`;
                if (d.target2 !== 0) s2 += ` (${this.pctText(v2 / Math.abs(d.target2) * 100)})`;
                items.push({ displayName: this.tf("UI_VarianceVs", "Variance vs {0}", this.names.target2), value: s2 });
            }
        }
        if (d.band1Limit != null || d.band2Limit != null || d.bandMax != null) {
            const lims = [d.band1Limit, d.band2Limit, d.bandMax].filter(v => v != null).map(v => this.formatValue(v as number, d.formatActual));
            items.push({ displayName: this.t("UI_Bands", "Bands"), value: lims.join(" · ") });
        }
        if (d.forecast != null)
            items.push({ displayName: this.names.forecast, value: this.formatValue(d.forecast, d.formatForecast) });
        // Extra user-defined tooltip fields
        items.push(...d.tooltipFields);
        return items;
    }

    private attachTooltipEvents(el: SVGElement, d: BulletDataPoint): void {
        const svc = this.tooltipService;
        el.addEventListener("mouseenter", (e: MouseEvent) => {
            if (!svc.enabled()) return;
            svc.show({
                dataItems:    this.buildTooltipItems(d),
                identities:   [d.selectionId],
                coordinates:  [e.clientX, e.clientY],
                isTouchEvent: false,
            });
        });
        el.addEventListener("mousemove", (e: MouseEvent) => {
            if (!svc.enabled()) return;
            svc.move({
                dataItems:    this.buildTooltipItems(d),
                identities:   [d.selectionId],
                coordinates:  [e.clientX, e.clientY],
                isTouchEvent: false,
            });
        });
        el.addEventListener("mouseleave", () => {
            svc.hide({ isTouchEvent: false, immediately: false });
        });
    }

    private addClip(id: string, x: number, y: number, w: number, h: number): void {
        const cp = this.mkEl("clipPath");
        cp.setAttribute("id", id);
        const r = this.mkEl("rect");
        r.setAttribute("x", String(x)); r.setAttribute("y", String(y));
        r.setAttribute("width",  String(Math.max(0, w)));
        r.setAttribute("height", String(Math.max(0, h)));
        cp.appendChild(r);
        this.rootSvg.appendChild(cp);
    }

    private attachClearClick(): void {
        this.rootSvg.onclick = () => {
            if (this.formatMode) return;
            this.clearSelection();
            this.focusedIndex = -1;
            this.removeFocusRing();
        };
    }

    private removeFocusRing(): void {
        const old = this.rootSvg.querySelector("#kb-focus-ring");
        if (old) old.parentNode?.removeChild(old);
    }

    // Draws an SVG focus ring around the currently focused data-point row/column.
    // Uses the `data-ki` attribute stamped on each row <g> to find the element.
    private updateFocusRing(): void {
        this.removeFocusRing();
        const idx = this.focusedIndex;
        if (idx < 0 || idx >= this.lastDataPoints.length) return;
        // Find the group via data attribute
        const el = this.rootSvg.querySelector<SVGGElement>(`[data-ki="${idx}"]`);
        if (!el) return;
        try {
            const bb = el.getBBox();
            const ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            ring.setAttribute("id",           "kb-focus-ring");
            ring.setAttribute("x",            String(bb.x - 2));
            ring.setAttribute("y",            String(bb.y - 2));
            ring.setAttribute("width",        String(bb.width  + 4));
            ring.setAttribute("height",       String(bb.height + 4));
            ring.setAttribute("rx",           "2");
            ring.setAttribute("fill",         "none");
            ring.setAttribute("stroke",       "#1A73E8");
            ring.setAttribute("stroke-width", "2");
            ring.setAttribute("pointer-events", "none");
            // Insert before end of SVG so it appears on top
            this.rootSvg.appendChild(ring);
        } catch { /* getBBox may fail if SVG not in DOM */ }
    }

    private calcRange(data: BulletDataPoint[]): { min: number; max: number } {
        let lo = 0; let hi = 0;
        data.forEach(d => {
            if (d.actual   != null) { lo = Math.min(lo, d.actual);   hi = Math.max(hi, d.actual); }
            if (d.target   != null) { hi = Math.max(hi, d.target);  }
            if (d.forecast != null) { hi = Math.max(hi, d.forecast); }
            for (const v of [d.target2, d.bandMax, d.band2Limit, d.band1Limit]) {
                if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
            }
        });
        return { min: lo, max: hi };
    }

    // Kept for trellis / backward-compat call sites that only need the positive max
    private calcMax(data: BulletDataPoint[]): number {
        return this.calcRange(data).max;
    }

    // allowInteractions vive en hostCapabilities; host.allowInteractions solo existe en APIs antiguas
    // (casi siempre undefined, y el clic filtraba aunque el autor apagara las interacciones).
    /** Clic en una barra: misma lógica que Power BI (un clic sobre la única seleccionada la quita; Ctrl alterna). */
    private selectPoint(d: BulletDataPoint, multi: boolean): void {
        const has = this.sel.some(id => id.equals(d.selectionId));
        if (multi) this.sel = has ? this.sel.filter(id => !id.equals(d.selectionId)) : [...this.sel, d.selectionId];
        else       this.sel = (has && this.sel.length === 1) ? [] : [d.selectionId];
        this.redraw();
        this.selectionManager.select(d.selectionId, multi)
            .then((ids: ISelectionId[]) => { if (Array.isArray(ids)) { this.sel = ids; this.redraw(); } }, () => { /* sin cambio */ });
    }

    private clearSelection(): void {
        this.sel = [];
        this.redraw();
        this.selectionManager.clear();
    }

    /**
     * Atenuada si otro visual resalta y esta fila no entra, o si hay barras seleccionadas en este visual y esta no
     * es una de ellas. Una categoría repetida en small multiples comparte identidad: se marcan todas sus barras.
     */
    private dimmed(d: BulletDataPoint): boolean {
        if (!d.isHighlighted) return true;
        if (!this.sel.length) return false;
        return !this.sel.some(id => id.equals(d.selectionId));
    }

    /** Etiqueta (data-o) los nodos añadidos al SVG desde n0. Las guías discontinuas no: tapan las barras. */
    private tagFrom(n0: number, obj: string, skipDashed: boolean): void {
        const nodes = this.rootSvg.childNodes;
        for (let i = n0; i < nodes.length; i++) {
            const el = nodes[i] as SVGElement;
            if (el.nodeType !== 1 || el.tagName === "clipPath") continue;
            if (skipDashed && el.getAttribute("stroke-dasharray")) continue;
            el.setAttribute("data-o", obj);
        }
    }

    private canInteract(): boolean {
        if (this.formatMode) return false;   // en modo formato el clic elige qué formatear, no filtra
        const h = this.host as any;
        return (h?.hostCapabilities?.allowInteractions ?? h?.allowInteractions) !== false;
    }

    /**
     * Formato de una medida en una fila: la cadena DINÁMICA si el DAX la decide (con general.formatString
     * declarado en capabilities, Power BI la manda en los objetos de cada fila), si no la de la columna.
     */
    private fmtOf(col: powerbi.DataViewValueColumn | undefined, i: number): string | undefined {
        if (!col) return undefined;
        const dyn = (col as any).objects?.[i]?.general?.formatString;
        if (typeof dyn === "string" && dyn) return dyn;
        try { return valueFormatter.getFormatStringByColumn(col.source as any) || col.source?.format || undefined; }
        catch { return col.source?.format ?? undefined; }
    }

    private fmtCache = new Map<string, valueFormatter.IValueFormatter>();

    /** Un valor con el formato del modelo, en el idioma del informe (formattingutils, como las visuales nativas). */
    private formatValue(value: number | null, formatStr?: string): string {
        if (value == null) return "–";
        if (!formatStr)    return this.fmt(value);
        let f = this.fmtCache.get(formatStr);
        if (!f) {
            try { f = valueFormatter.create({ format: formatStr, cultureSelector: this.host.locale }); }
            catch { return this.fmt(value); }
            this.fmtCache.set(formatStr, f);
        }
        return f.format(value);
    }

    /** Un porcentaje calculado por el visual (desviación), con la coma o el punto del idioma del informe. */
    private pctText(v: number, signed = true): string {
        const s = this.formatValue(v / 100, "0.0%");
        return signed && v >= 0 ? "+" + s : s;
    }

    private fmt(v: number | null): string {
        if (v == null) return "–";
        // Medida sin formato en el modelo: K/M con el separador decimal del idioma del informe.
        const a = Math.abs(v);
        if (a >= 1_000_000) return this.formatValue(v / 1_000_000, "#,0.0") + "M";
        if (a >= 1_000)     return this.formatValue(v / 1_000,     "#,0.0") + "K";
        return this.formatValue(v, "#,0.#");
    }

    private mkEl(tag: string): SVGElement {
        return document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement;
    }

    private clearSvg(w: number, h: number): void {
        while (this.rootSvg.firstChild) this.rootSvg.removeChild(this.rootSvg.firstChild);
        this.rootSvg.setAttribute("width",  String(w));
        this.rootSvg.setAttribute("height", String(h));
    }

    // ── Plantillas y guía (1.5) ──────────────────────────────────────

    /** Quita los ajustes guardados que la plantilla define, para que se vea. Lo demás se queda como estaba. */
    private aplicarPlantilla(nombre: string): void {
        const tp = TEMPLATES[nombre] ?? {};
        const remove: any[] = Object.keys(tp).map(obj => ({
            objectName: obj, selector: null,
            properties: Object.keys(tp[obj]).reduce((acc: any, p) => { acc[p] = null; return acc; }, {})
        }));
        if (remove.length) this.host.persistProperties({ remove });
    }

    private persistir(objectName: string, properties: any): void {
        this.host.persistProperties({ merge: [{ objectName, selector: null as any, properties }] });
    }

    /**
     * Guía, solo editando y con datos: (1) los campos, (2) el Pro con tus datos: la orientación vertical se prueba con un
     * clic y el resto dice en qué pozo poner la medida (sin licencia se ve bajo la marca de agua y con el aviso de Power
     * BI), (3) las plantillas. persistProperties solo desde un clic. ✕ o Terminar la cierran (style.guide = false); se
     * reabre en Formato → Plantilla de estilo.
     */
    private renderGuide(): void {
        if (!this.guideEl) {
            this.guideEl = document.createElement("div");
            this.guideEl.className = "bc-guide";
            this.container.appendChild(this.guideEl);
        }
        const el = this.guideEl;
        while (el.firstChild) el.removeChild(el.firstChild);
        el.style.display = "none";
        const s = this.settings;
        if (!this.editing || this.formatMode || !s?.guide || this.landingEl || !this.lastDataPoints.length || !this.canInteract()) return;
        // En un mosaico pequeño la guía taparía el gráfico entero: Bullet vive a menudo en mosaicos de tarjeta.
        const vp = this.lastOptions?.viewport;
        if (vp && (vp.width < 360 || vp.height < 220)) return;
        const objs: any = this.lastOptions?.dataViews?.[0]?.metadata?.objects ?? {};
        const pal: any = this.host.colorPalette;
        const hc = !!pal?.isHighContrast;
        const azul = hc ? (pal.foregroundSelected?.value || "#FFFF00") : "#2B6CB0";
        const fg = hc ? (pal.foreground?.value || "#FFFFFF") : "#252423";
        const muted = hc ? fg : "#605E5C";
        el.style.display = "block";
        el.style.background = hc ? (pal.background?.value || "#000000") : "#FFFFFF";
        el.style.borderColor = azul;
        el.style.color = fg;
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", this.t("Guide_Title", "Setup guide"));
        el.onclick = e => e.stopPropagation();
        el.onkeydown = e => e.stopPropagation();
        const mk = (tag: string, cls: string, text?: string): HTMLElement => {
            const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n;
        };
        const boton = (texto: string, principal: boolean, accion: () => void): HTMLButtonElement => {
            const b = mk("button", "bc-g-btn", texto) as HTMLButtonElement;
            b.type = "button";
            b.style.borderColor = azul;
            b.style.background = principal ? azul : "transparent";
            b.style.color = principal ? (hc ? (pal.background?.value || "#000000") : "#FFFFFF") : azul;
            b.addEventListener("click", accion);
            return b;
        };
        const terminar = () => { this.guideStep = 1; this.persistir("style", { guide: false }); };
        const cab = mk("div", "bc-g-head");
        const paso = mk("div", "", this.tf("Guide_Step", "Setup · step {0} of 3", String(this.guideStep)));
        paso.style.color = azul;
        const cerrar = mk("button", "bc-g-close", "✕") as HTMLButtonElement;
        cerrar.type = "button";
        cerrar.title = this.t("Guide_Close", "Close the guide");
        cerrar.setAttribute("aria-label", cerrar.title);
        cerrar.style.color = muted;
        cerrar.addEventListener("click", terminar);
        cab.appendChild(paso); cab.appendChild(cerrar);
        el.appendChild(cab);
        const titulo = mk("div", "bc-g-title");
        el.appendChild(titulo);
        const pie = mk("div", "bc-g-foot");
        const chipPro = (txt: HTMLElement) => {
            if (this.isPro) return;
            const chip = mk("span", "bc-g-chip", "Pro");
            if (hc) { chip.style.background = "transparent"; chip.style.border = "1px solid " + fg; chip.style.color = fg; }
            txt.appendChild(chip);
        };
        const fila = (hecho: boolean, nombre: string, porque: string, pro = false) => {
            const f = mk("div", "bc-g-item");
            const marca = mk("span", "", hecho ? "✓" : "○");
            marca.setAttribute("aria-label", hecho ? this.t("Guide_Done", "added") : this.t("Guide_Todo", "not added"));
            marca.style.color = hecho ? (hc ? fg : "#107C10") : muted;
            const txt = mk("span", "");
            txt.appendChild(mk("b", "", nombre));
            if (pro) chipPro(txt);
            txt.appendChild(document.createTextNode(" — " + porque));
            txt.style.color = hecho ? muted : fg;
            f.appendChild(marca); f.appendChild(txt);
            el.appendChild(f);
        };
        if (this.guideStep === 1) {
            titulo.textContent = this.t("Guide_Fields", "Your data");
            fila(true, this.t("Visual_Category", "Category"), this.t("Guide_CatWhy", "regions, products or teams — one bar each"));
            fila(true, this.t("Visual_Actual", "Actual (Real)"), this.t("Guide_ActWhy", "the measure you track"));
            fila(this.wells.target, this.t("Visual_Target", "Target"), this.t("Guide_TgtWhy", "budget, plan or last year: the gap and its sign"));
            const nota = mk("div", "bc-g-note", this.t("Guide_Wells", "Drag the fields into the field wells; this list updates by itself."));
            nota.style.color = muted;
            el.appendChild(nota);
            pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 2; this.renderGuide(); }));
        } else if (this.guideStep === 2) {
            titulo.textContent = this.isPro ? this.t("Guide_TryPro2", "Pro features on your data") : this.t("Guide_TryPro", "Try Pro on your data");
            // La orientación se prueba con un clic; lo demás necesita una medida en su pozo.
            const vert = objs?.general?.orientation === "vertical";
            const f = mk("div", "bc-g-try");
            const txt = mk("span", "");
            txt.appendChild(mk("b", "", this.t("Guide_TryVertical", "Vertical bars")));
            chipPro(txt);
            txt.appendChild(document.createTextNode(" — " + this.t("Guide_TryVerticalWhy", "for months or long category names")));
            const b = boton(vert ? this.t("Guide_On", "On") : this.t("Guide_Try", "Try"), vert,
                () => this.persistir("general", { orientation: vert ? "horizontal" : "vertical" }));
            b.setAttribute("aria-pressed", String(vert));
            f.appendChild(txt); f.appendChild(b);
            el.appendChild(f);
            fila(this.wells.bands, this.t("Guide_Bands", "Bands from measures"), this.t("Guide_BandsWhy", "measures in Band 1 limit, Band 2 limit, Band maximum: each row its own thresholds"), true);
            fila(this.wells.target2, this.t("Visual_Target2", "Second target [Pro]").replace(" [Pro]", ""), this.t("Guide_T2Why", "a stretch goal or last year, next to the target"), true);
            fila(this.wells.trellis, this.t("Feat_trellisTitle", "Small multiples"), this.t("Guide_TrellisWhy", "a field in Small Multiples By: one panel per region or year"), true);
            if (!this.isPro) {
                const nota = mk("div", "bc-g-note", this.t("Guide_TryNote", "Without a licence they show under a watermark while you edit; reading view shows the free chart."));
                nota.style.color = muted;
                el.appendChild(nota);
            }
            pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 1; this.renderGuide(); }));
            pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 3; this.renderGuide(); }));
        } else {
            titulo.textContent = this.t("Guide_Style", "Pick a style");
            const actual = String(objs?.style?.template ?? "clean");
            const rejilla = mk("div", "bc-g-grid");
            const nombres: [string, string, string][] = [["clean", "Enum_tpl_clean", "Clean"], ["minimal", "Enum_tpl_minimal", "Minimal"],
                ["contrast", "Enum_tpl_contrast", "Contrast"], ["soft", "Enum_tpl_soft", "Soft"], ["compact", "Enum_tpl_compact", "Compact"],
                ["ibcs", "Enum_tpl_ibcs", "IBCS style"]];
            for (const [nombre, clave, def] of nombres) {
                const chip = mk("button", "bc-g-tpl") as HTMLButtonElement;
                chip.type = "button";
                chip.setAttribute("aria-pressed", String(nombre === actual));
                chip.style.borderColor = nombre === actual ? azul : "#C8C6C4";
                chip.style.borderWidth = nombre === actual ? "2px" : "1px";
                chip.appendChild(this.miniBullet(nombre, hc));
                chip.appendChild(mk("div", "", this.t(clave, def)));
                chip.addEventListener("click", () => this.persistir("style", { template: nombre }));
                rejilla.appendChild(chip);
            }
            el.appendChild(rejilla);
            pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 2; this.renderGuide(); }));
            pie.appendChild(boton(this.t("Guide_Finish", "Finish"), true, terminar));
        }
        el.appendChild(pie);
    }

    /** Miniatura de una plantilla: dos bullets con las bandas, la barra y el objetivo en sus colores. */
    private miniBullet(nombre: string, hc: boolean): SVGSVGElement {
        const tp: any = TEMPLATES[nombre] ?? {};
        const d = getDefaultSettings();
        const ibcs = tp.general?.ibcsMode === true;
        const c = (p: string, def: string) => hc ? "#FFFFFF" : (ibcs && p === "actualColor" ? "#333333" : ibcs && p === "targetColor" ? "#000000" : (tp.colors?.[p] ?? def));
        const bands = ibcs ? ["#B8B8B8", "#D0D0D0", "#E8E8E8"] : [c("band3Color", d.band3Color), c("band2Color", d.band2Color), c("band1Color", d.band1Color)];
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", "64"); svg.setAttribute("height", "40"); svg.setAttribute("aria-hidden", "true");
        [[8, 44, 38], [24, 34, 46]].forEach(([y, act, tgt]) => {
            [60, 46, 30].forEach((w, k) => {
                const r = document.createElementNS(NS, "rect");
                r.setAttribute("x", "2"); r.setAttribute("y", String(y)); r.setAttribute("width", String(w)); r.setAttribute("height", "10");
                r.setAttribute("fill", hc ? "none" : bands[k]); if (hc) r.setAttribute("stroke", "#FFFFFF");
                svg.appendChild(r);
            });
            const a = document.createElementNS(NS, "rect");
            a.setAttribute("x", "2"); a.setAttribute("y", String(y + 3)); a.setAttribute("width", String(act)); a.setAttribute("height", "4");
            a.setAttribute("fill", c("actualColor", d.actualColor));
            svg.appendChild(a);
            const tg = document.createElementNS(NS, "rect");
            tg.setAttribute("x", String(tgt)); tg.setAttribute("y", String(y + 1)); tg.setAttribute("width", "2"); tg.setAttribute("height", "8");
            tg.setAttribute("fill", c("targetColor", d.targetColor));
            svg.appendChild(tg);
        });
        return svg;
    }

    // ── Formato sobre el lienzo ─────────────────────────────────────

    /** Pieza → [tarjeta del panel, clave del nombre, nombre en inglés]. */
    private static readonly SUB: Record<string, [string, string, string]> = {
        actual:   ["colors",         "Visual_Colors_ActualColor",   "Actual bar"],
        target:   ["colors",         "Visual_Colors_TargetColor",   "Target marker"],
        target2:  ["colors",         "Visual_Colors_Target2Color",  "Second target marker (Pro)"],
        forecast: ["colors",         "Visual_Colors_ForecastColor", "Forecast marker"],
        bands:    ["bands",          "Visual_Bands",                "Qualitative Bands"],
        labels:   ["labels",         "Visual_Labels",               "Labels"],
        variance: ["variance",       "Visual_Variance",             "Variance"],
        legend:   ["legend",         "Visual_Legend",               "Legend"],
        axis:     ["layout",         "Visual_Layout_ShowAxis",      "Show scale axis"],
        refs:     ["referenceLines", "Visual_ReferenceLines",       "Reference Lines"],
        trellis:  ["trellis",        "Visual_Trellis",              "Small Multiples [Pro]"],
    };

    /** Marca lo que se puede elegir en modo formato. Fuera de él, no deja rastro. */
    private markSubSelectables(): void {
        this.rootSvg.querySelectorAll("[data-o]").forEach(el => {
            if (!this.formatMode) { el.classList.remove(HtmlSubSelectableClass); return; }
            const o = el.getAttribute("data-o");
            const info = BulletChartPro.SUB[o];
            if (!info) return;
            const shape = ["actual", "target", "target2", "forecast", "bands", "refs"].indexOf(o) >= 0;
            el.classList.add(HtmlSubSelectableClass);
            el.setAttribute(SubSelectableObjectNameAttribute, o);
            el.setAttribute(SubSelectableDisplayNameAttribute, this.t(info[1], info[2]));
            el.setAttribute(SubSelectableTypeAttribute, String(shape ? powerbi.visuals.SubSelectionStylesType.Shape : powerbi.visuals.SubSelectionStylesType.Text));
        });
    }

    private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
        const o = subs[0]?.customVisualObjects[0]?.objectName;
        const ref = (obj: string, prop: string, key: string, def: string) => ({ reference: { objectName: obj, propertyName: prop }, label: this.t(key, def) });
        const Shape = powerbi.visuals.SubSelectionStylesType.Shape, Text = powerbi.visuals.SubSelectionStylesType.Text;
        switch (o) {
            case "actual":   return { type: Shape, fill: ref("colors", "actualColor",   "Visual_Colors_ActualColor",   "Actual bar") } as any;
            case "target":   return { type: Shape, fill: ref("colors", "targetColor",   "Visual_Colors_TargetColor",   "Target marker") } as any;
            case "target2":  return { type: Shape, fill: ref("colors", "target2Color",  "Visual_Colors_Target2Color",  "Second target marker (Pro)") } as any;
            case "forecast": return { type: Shape, fill: ref("colors", "forecastColor", "Visual_Colors_ForecastColor", "Forecast marker") } as any;
            case "bands":    return { type: Shape, fill: ref("colors", "band3Color",    "Visual_Colors_Band3Color",    "Band 3 (best)") } as any;
            case "refs":     return { type: Shape, stroke: ref("referenceLines", "refLine1Color", "Visual_ReferenceLines_RefLine1Color", "Line 1 – Color") } as any;
            case "labels":
            case "axis":     return { type: Text, fontSize: ref("labels", "fontSize", "Visual_Labels_FontSize", "Font size"),
                                      fontFamily: ref("labels", "fontFamily", "Visual_Labels_FontFamily", "Font family") } as any;
            case "variance": return { type: Text, fontColor: ref("colors", "positiveColor", "Visual_Colors_PositiveColor", "Positive variance") } as any;
            case "legend":   return { type: Text, fontSize: ref("legend", "fontSize", "Visual_Legend_FontSize", "Font size"),
                                      fontFamily: ref("legend", "fontFamily", "Visual_Legend_FontFamily", "Font family"),
                                      fontColor: ref("legend", "color", "Visual_Legend_Color", "Text color") } as any;
            case "trellis":  return { type: Text, fontColor: ref("trellis", "trellisTitleColor", "Visual_Trellis_TrellisTitleColor", "Panel title color") } as any;
        }
        return undefined;
    }

    private getSubSelectionShortcuts(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.VisualSubSelectionShortcuts | undefined {
        const o = subs[0]?.customVisualObjects[0]?.objectName;
        const info = BulletChartPro.SUB[o];
        if (!info) return undefined;
        const id = (obj: string, prop: string) => ({ objectName: obj, propertyName: prop });
        const toggle = (obj: string, prop: string, key: string, def: string) => ({ type: powerbi.visuals.VisualShortcutType.Toggle, ...id(obj, prop),
            relatedToggledFormattingIds: [id(obj, prop)], disabledLabel: this.t(key, def), enabledLabel: this.t(key, def) });
        const reset = (obj: string, props: string[]) => ({ type: powerbi.visuals.VisualShortcutType.Reset, relatedResetFormattingIds: props.map(p => id(obj, p)) });
        // FormattingSettingsService forma el uid "<objeto>-card" y Power BI lo publica como "Visual-<objeto>-card"
        // (comprobado en KPI Card 2.2): el atajo tiene que usar el segundo.
        const nav = { type: powerbi.visuals.VisualShortcutType.Navigate, destinationInfo: { cardUid: "Visual-" + info[0] + "-card" }, label: this.t(info[1], info[2]) };
        const div = { type: powerbi.visuals.VisualShortcutType.Divider };
        switch (o) {
            case "actual": case "target": case "target2": case "forecast":
                return [reset("colors", [{ actual: "actualColor", target: "targetColor", target2: "target2Color", forecast: "forecastColor" }[o]]), nav] as any;
            case "bands":
                return [toggle("bands", "showBands", "Visual_Bands_ShowBands", "Show bands"), div, reset("colors", ["band1Color", "band2Color", "band3Color"]), nav] as any;
            case "labels":
                return [toggle("labels", "showCategoryLabel", "Visual_Labels_ShowCategoryLabel", "Show category"),
                    toggle("labels", "showActualValue", "Visual_Labels_ShowActualValue", "Show actual value"),
                    toggle("labels", "showTargetValue", "Visual_Labels_ShowTargetValue", "Show target value"), div,
                    reset("labels", ["fontSize", "fontFamily"]), nav] as any;
            case "variance":
                return [toggle("variance", "showVariance", "Visual_Variance_ShowVariance", "Show variance label"),
                    toggle("variance", "showVariancePct", "Visual_Variance_ShowVariancePct", "Show variance %"), div,
                    reset("colors", ["positiveColor", "negativeColor"]), nav] as any;
            case "legend":
                return [{ type: powerbi.visuals.VisualShortcutType.Picker, ...id("legend", "legendPosition"), label: this.t("Visual_Legend_LegendPosition", "Position") },
                    toggle("legend", "showLegend", "Visual_Legend_ShowLegend", "Show legend"), div,
                    reset("legend", ["fontSize", "fontFamily", "color"]), nav] as any;
            case "axis":
                return [toggle("layout", "showAxis", "Visual_Layout_ShowAxis", "Show scale axis"), div, nav] as any;
            case "refs":
                return [toggle("referenceLines", "refLine1Show", "Visual_ReferenceLines_RefLine1Show", "Line 1 – Show"),
                    toggle("referenceLines", "refLine2Show", "Visual_ReferenceLines_RefLine2Show", "Line 2 – Show"), div, nav] as any;
            case "trellis":
                return [toggle("trellis", "trellisShowTitle", "Visual_Trellis_TrellisShowTitle", "Show panel titles"), div,
                    reset("trellis", ["trellisPanelColor", "trellisBorderColor", "trellisTitleColor"]), nav] as any;
        }
        return undefined;
    }

    // ── Format panel ─────────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const s = this.settings ?? getDefaultSettings();
        // Un color fijo por categoría (una fila por nombre, sin repetir en small multiples).
        const cats: CategoryColor[] = [];
        const seen = new Set<string>();
        this.lastDataPoints.forEach(d => {
            if (seen.has(d.category)) return;
            seen.add(d.category);
            cats.push({ name: d.category, selector: d.selectionId.getSelector(), color: d.colorActual ?? s.actualColor });
        });
        const fm = this.formattingService.buildFormattingModel(buildFormattingCards(s, cats));
        // La librería forma el uid con objeto-propiedad: todas las filas por categoría saldrían con
        // "colors-actualColor" repetido. Cada una necesita el suyo.
        const colors: any = fm.cards.find((c: any) => c.uid?.startsWith("colors"));
        colors?.groups?.forEach((g: any) => (g as any).slices?.forEach((sl: any, k: number) => {
            if (k >= COLOR_FIXED_SLICES) sl.uid = `colors-actualColor-cat${k - COLOR_FIXED_SLICES}`;
        }));
        return fm;
    }
}
