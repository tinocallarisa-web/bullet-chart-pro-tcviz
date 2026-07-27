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
import VisualObjectInstance            = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;

import { BulletSettings, getDefaultSettings } from "./settings";

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
const VERT_PAD_TOP    = 8;
const VERT_PAD_BOT    = 20;
const VERT_PAD_LR     = 6;
const LEGEND_H        = 22;
const AXIS_H          = 16;   // height reserved below chart rows for H-axis labels
const MAX_ROW_H       = 72;   // cap row height so tall visuals don't look odd
const MIN_COL_W       = 32;   // minimum column width in vertical mode before H-scroll kicks in

// ═══════════════════════════════════════════════════════════════════
//  Visual
// ═══════════════════════════════════════════════════════════════════

export class BulletChartPro implements IVisual {

    private host:             IVisualHost;
    private container:        HTMLElement;
    private rootSvg:          SVGSVGElement;   // NEVER reassigned
    private events:           powerbi.extensibility.IVisualEventService;
    private selectionManager: ISelectionManager;
    private tooltipService:   ITooltipService;
    private settings:         BulletSettings;
    private isPro:            boolean = false; // set true locally to test Pro features
    private lastOptions:      VisualUpdateOptions | null = null;
    private lastDataPoints:   BulletDataPoint[] = [];
    private focusedIndex:     number = -1;
    private isDrilled:        boolean = false;

    constructor(options: VisualConstructorOptions) {
        this.host             = options.host;
        this.events           = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService   = options.host.tooltipService;
        this.settings         = getDefaultSettings();
        this.container        = options.element;

        this.container.style.overflow = "auto";
        this.container.style.position = "relative";
        this.container.tabIndex       = 0;

        this.rootSvg               = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.rootSvg.style.display = "block";
        this.container.appendChild(this.rootSvg);

        // Background context menu (required for Microsoft certification)
        this.rootSvg.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        // Bookmark support: Power BI calls this when restoring a saved selection state.
        // Re-rendering with lastOptions is enough because the dataView already contains
        // the correct highlights for the restored bookmark at that point.
        this.selectionManager.registerOnSelectCallback(() => {
            if (this.lastOptions) this.update(this.lastOptions);
        });

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
                    this.selectionManager.select(d.selectionId, false);
                }
            } else if (e.key === "Escape") {
                this.focusedIndex = -1;
                this.removeFocusRing();
                this.selectionManager.clear();
            }
        });

        this.checkLicense();
    }

    // ── License ──────────────────────────────────────────────────────

    private async checkLicense(): Promise<void> {
        if (this.isPro) return; // test mode: isPro hardcoded to true, skip license check
        try {
            const lm = (this.host as any).licenseManager;
            if (!lm) return;
            const r = await lm.getAvailableServicePlans();
            const wasNotPro = !this.isPro;
            this.isPro = !!(r?.plans?.some(
                (p: any) => p.spIdentifier === "bullet-chart-pro-tcviz" && p.state === 1));
            // Re-render if license state changed and we have pending options
            if (wasNotPro && this.isPro && this.lastOptions) {
                this.update(this.lastOptions);
            }
        } catch { this.isPro = false; }
    }

    // ── Settings ─────────────────────────────────────────────────────

    private parseSettings(dv: DataView): BulletSettings {
        const d = getDefaultSettings();
        if (!dv?.metadata?.objects) return d;
        const obj = dv.metadata.objects;

        const col  = (g: string, p: string, def: string)  => { const v = obj?.[g]?.[p]; return (v && typeof v === "object" && "solid" in v) ? (v as any).solid.color ?? def : def; };
        const num  = (g: string, p: string, def: number)  => { const v = obj?.[g]?.[p]; return typeof v === "number"  ? v : def; };
        const bool = (g: string, p: string, def: boolean) => { const v = obj?.[g]?.[p]; return typeof v === "boolean" ? v : def; };
        const str  = (g: string, p: string, def: string)  => { const v = obj?.[g]?.[p]; return typeof v === "string"  ? v : def; };

        const s: BulletSettings = {
            orientation:        str( "general","orientation",       d.orientation) as any,
            ibcsMode:           bool("general","ibcsMode",           d.ibcsMode),
            actualColor:        col( "colors", "actualColor",        d.actualColor),
            targetColor:        col( "colors", "targetColor",        d.targetColor),
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
            showAxis:           bool("layout", "showAxis",           d.showAxis),
            showLegend:         bool("legend", "showLegend",         d.showLegend),
            legendPosition:     str( "legend", "legendPosition",     d.legendPosition) as any,
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
        };

        if (s.ibcsMode) {
            s.actualColor = "#333333"; s.targetColor = "#000000";
            s.band1Color  = "#E8E8E8"; s.band2Color  = "#D0D0D0"; s.band3Color = "#B8B8B8";
        }
        const pal = this.host.colorPalette as any;
        if (pal?.isHighContrast) {
            s.actualColor = s.targetColor = s.positiveColor = s.negativeColor = pal.foreground?.value ?? "#FFF";
            s.band1Color  = pal.background?.value ?? "#000";
            s.band2Color  = pal.backgroundLight?.value ?? "#111";
            s.band3Color  = pal.backgroundDark?.value  ?? "#222";
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
            const key = trlCat ? String(trlCat.values[i] ?? "—") : "(All)";
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            const catName = mainCat ? String(mainCat.values[i] ?? "") : String(actCol.source.displayName ?? i);
            const cfIndex = categoryFirstIndex.get(catName) ?? i;
            map.get(key)!.push(this.buildPoint(i, mainCat, actCol, tgtCol, fstCol, ttipCols, hl, cfIndex));
        }
        return order.map(title => ({ title, data: map.get(title)! }));
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
        const target   = tc ? tc.values[i] as number | null : null;
        const forecast = fc ? fc.values[i] as number | null : null;
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
            formatActual:   ac.source.format   ?? undefined,
            formatTarget:   tc?.source.format  ?? undefined,
            formatForecast: fc?.source.format  ?? undefined,
        };
    }

    // ── Update ───────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.lastOptions = options;
        this.events.renderingStarted(options);
        try {
            const dv = options.dataViews?.[0];
            const vp = options.viewport;
            if (!dv) { this.renderLanding(vp); this.events.renderingFinished(options); return; }

            this.settings = this.parseSettings(dv);
            const s = this.settings;

            if (this.isPro && s.trellisEnabled) {
                const panels = this.parseTrellis(dv);
                this.lastDataPoints = panels.flatMap(p => p.data);
                if (!panels.length) { this.renderLanding(vp); }
                else { this.renderTrellis(panels, vp.width, vp.height); }
                this.events.renderingFinished(options); return;
            }

            const data = this.parseData(dv);
            this.lastDataPoints = data;
            if (!data.length) { this.renderLanding(vp); this.events.renderingFinished(options); return; }

            // Show drill label only when user has actually drilled into a hierarchy level.
            // options.type is a bitmask; bit 4 (value 4) = Resize, bit 2 = Data refresh.
            // Power BI sets the Drilldown flag (64) when a drill action triggered the update.
            const isDrillUpdate = !!(options.type & 64);
            if (isDrillUpdate) this.isDrilled = true;
            const catCol = dv.categorical?.categories?.find(c => c.source.roles?.["category"]);
            const drillLabel = this.isDrilled ? (catCol?.source.displayName ?? "") : "";

            if (s.orientation === "vertical") this.renderVertical(data, vp.width, vp.height, drillLabel);
            else                              this.renderHorizontal(data, vp.width, vp.height, drillLabel);

            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
            console.error("[BulletChartPro]", e);
        }
    }

    // ── Landing ───────────────────────────────────────────────────────

    private renderLanding(vp: powerbi.IViewport): void {
        this.clearSvg(vp.width, vp.height);
        const t = this.mkEl("text");
        t.setAttribute("x",           String(vp.width  / 2));
        t.setAttribute("y",           String(vp.height / 2));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size",   "13");
        t.setAttribute("fill",        "#888");
        t.setAttribute("font-family", this.settings.fontFamily);
        t.textContent = "Add a measure to 'Actual' to get started.";
        this.rootSvg.appendChild(t);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HORIZONTAL
    // ═══════════════════════════════════════════════════════════════

    private renderHorizontal(data: BulletDataPoint[], vpW: number, vpH: number, drillLabel: string = ""): void {
        const s       = this.settings;
        const legendH = s.showLegend ? LEGEND_H : 0;
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
        if (s.showLegend) this.renderLegend(vpW, isTop ? 0 : Math.max(vpH, totalH) - legendH);
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
        if (ki >= 0) g.setAttribute("data-ki", String(ki));
        g.style.opacity = d.isHighlighted ? "1" : "0.25";
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
            t.textContent = d.category;
            g.appendChild(t);
        }

        const cx = labelW;
        // Helper: map a value to an x offset within chartW
        const xOf = (v: number): number => cx + ((v - domainMin) / totalDomain) * chartW;
        const zeroX = xOf(0);

        // 2. Bands — thresholds relative to rMax (data max, not padded domain)
        this.drawBands(g, s, cx, barY, chartW, barH, rMax, totalDomain, domainMin);

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

            if (s.showActualValue && d.actual != null) {
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
                g.appendChild(t);
                rx += Math.ceil(fmtd.length * fs * 0.62 + 8);
            }

            if (s.showTargetValue && d.target != null) {
                const label = `T: ${this.formatValue(d.target, d.formatTarget)}`;
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        textSecondary);
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = label;
                g.appendChild(t);
                rx += Math.ceil(label.length * fs * 0.62 + 8);
            }

            if (s.showVariance && d.variance != null) {
                const pos  = d.variance >= s.varianceThreshold;
                const absV = this.formatValue(Math.abs(d.variance), d.formatActual);
                let   txt  = (pos ? "▲ +" : "▼ ") + absV;
                if (s.showVariancePct && d.variancePct != null)
                    txt += ` (${d.variancePct >= 0 ? "+" : ""}${d.variancePct.toFixed(1)}%)`;
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        pos ? s.positiveColor : s.negativeColor);
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = txt;
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
                this.selectionManager.select(d.selectionId, e.ctrlKey || e.metaKey);
            });
        }

        appendTo.appendChild(g);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VERTICAL
    // ═══════════════════════════════════════════════════════════════

    private renderVertical(data: BulletDataPoint[], vpW: number, vpH: number, drillLabel: string = ""): void {
        const s       = this.settings;
        const legendH = s.showLegend ? LEGEND_H : 0;
        const isTop   = s.legendPosition === "top";
        const chartY  = isTop ? legendH : 0;
        const chartH  = vpH - legendH;
        const { min: rMinV, max: rMaxV } = this.calcRange(data);
        const domainMinV  = Math.min(0, rMinV);
        const domainMaxV  = rMaxV * 1.1 || 1;
        const totalDomainV = domainMaxV - domainMinV;
        const allow   = this.canInteract();

        // Enforce minimum column width — if too many categories, widen SVG and let container H-scroll
        const minContentW = data.length * MIN_COL_W + VERT_PAD_LR * 2;
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
            const labH   = s.showCategoryLabel ? VERT_PAD_BOT : 0;
            const innerH = Math.max(20, chartH - VERT_PAD_TOP - labH - varH);
            const baseline = chartY + VERT_PAD_TOP + innerH;
            this.renderVAxis(VERT_PAD_LR, baseline, innerH, domainMaxV, data[0]?.formatActual, domainMinV);
        }

        // Reference lines for vertical mode
        if (s.refLine1Show || s.refLine2Show) {
            const varH2   = s.showVariance ? s.fontSize * 2.0 : 0;
            const labH2   = s.showCategoryLabel ? VERT_PAD_BOT : 0;
            const innerH2 = Math.max(20, chartH - VERT_PAD_TOP - labH2 - varH2);
            const topY    = chartY + VERT_PAD_TOP;
            const botY    = chartY + VERT_PAD_TOP + innerH2;
            this.renderRefLinesV(VERT_PAD_LR, svgW - VERT_PAD_LR, topY, botY, totalDomainV, domainMinV, data[0]?.formatActual);
        }

        if (s.showLegend) this.renderLegend(svgW, isTop ? 0 : vpH - legendH);
        this.renderDrillLabel(drillLabel, svgW);
        if (needsHScroll) this.renderScrollHint(vpW, vpH, "horizontal");
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
        const labH   = s.showCategoryLabel ? VERT_PAD_BOT : 0;
        const chartH = Math.max(20, panelH - VERT_PAD_TOP - labH - varH);
        const colW   = Math.max(16, (panelW - VERT_PAD_LR * 2) / n);
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
        axis.setAttribute("x1",           String(VERT_PAD_LR));
        axis.setAttribute("x2",           String(VERT_PAD_LR + colW * n));
        axis.setAttribute("y1",           String(baseline));
        axis.setAttribute("y2",           String(baseline));
        axis.setAttribute("stroke",       "#CCC");
        axis.setAttribute("stroke-width", "1");
        appendTo.appendChild(axis);

        data.forEach((d, i) => {
            const colX = VERT_PAD_LR + i * colW;
            const g = this.mkEl("g");
            g.setAttribute("transform", `translate(${colX},0)`);
            g.setAttribute("data-ki", String(i));
            g.style.opacity = d.isHighlighted ? "1" : "0.25";
            if (allow) g.style.cursor = "pointer";

            if (s.showBands) {
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
                        g.appendChild(r);
                    });
            } else {
                const bg = this.mkEl("rect");
                bg.setAttribute("x",String(barXOff)); bg.setAttribute("y",String(topY));
                bg.setAttribute("width",String(barW)); bg.setAttribute("height",String(chartH));
                bg.setAttribute("fill","#E8E8E8"); bg.setAttribute("rx","2");
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
                g.appendChild(r);

                if (s.showActualValue) {
                    const t = this.mkEl("text");
                    const labelY = d.actual >= 0 ? Math.max(topY + fs, valY - 3) : valY + fs + 3;
                    t.setAttribute("x",String(colW / 2)); t.setAttribute("y",String(labelY));
                    t.setAttribute("text-anchor","middle"); t.setAttribute("font-size",String(Math.min(fs, 10)));
                    t.setAttribute("font-family",ff); t.setAttribute("font-weight","600"); t.setAttribute("fill",textPrimaryV);
                    t.textContent = this.formatValue(d.actual, d.formatActual); g.appendChild(t);
                }
            }

            if (d.target != null) {
                const ty = yOf(d.target);
                const mW = barW * TARGET_H_RATIO; const mX = barXOff + (barW - mW) / 2;
                const r = this.mkEl("rect");
                r.setAttribute("x",String(mX)); r.setAttribute("y",String(ty - TARGET_W / 2));
                r.setAttribute("width",String(mW)); r.setAttribute("height",String(TARGET_W));
                r.setAttribute("fill", d.colorTarget ?? s.targetColor); g.appendChild(r);

                if (s.showTargetValue) {
                    const tv = this.mkEl("text");
                    tv.setAttribute("x",           String(colW / 2));
                    tv.setAttribute("y",           String(Math.max(topY + fs, ty - TARGET_W - 2)));
                    tv.setAttribute("text-anchor", "middle");
                    tv.setAttribute("font-size",   String(Math.min(fs, 10)));
                    tv.setAttribute("font-family", ff);
                    tv.setAttribute("fill",        textSecondaryV);
                    tv.textContent = this.formatValue(d.target, d.formatTarget);
                    g.appendChild(tv);
                }
            }

            if (d.forecast != null) {
                const fy = yOf(d.forecast);
                const fc = barXOff + barW / 2; const sz = FORECAST_SIZE;
                const dia = this.mkEl("polygon");
                dia.setAttribute("points",`${fc},${fy-sz} ${fc+sz},${fy} ${fc},${fy+sz} ${fc-sz},${fy}`);
                dia.setAttribute("fill",s.forecastColor); dia.setAttribute("opacity","0.85");
                g.appendChild(dia);
            }

            if (s.showCategoryLabel) {
                const t = this.mkEl("text");
                t.setAttribute("x",           String(colW / 2));
                t.setAttribute("y",           String(baseline + fs * 1.1));
                t.setAttribute("text-anchor", "middle");
                t.setAttribute("font-size",   String(Math.min(fs, 11)));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        textSecondaryV);
                t.textContent = d.category;
                g.appendChild(t);
            }

            if (s.showVariance && d.variance != null) {
                const pos = d.variance >= s.varianceThreshold;
                let txt = (pos ? "▲+" : "▼") + this.formatValue(Math.abs(d.variance), d.formatActual);
                if (s.showVariancePct && d.variancePct != null)
                    txt += ` ${d.variancePct.toFixed(1)}%`;
                const t = this.mkEl("text");
                t.setAttribute("x",           String(colW / 2));
                t.setAttribute("y",           String(baseline + labH + fs * 0.9));
                t.setAttribute("text-anchor", "middle");
                t.setAttribute("font-size",   String(Math.min(fs, 10)));
                t.setAttribute("font-family", ff);
                t.setAttribute("fill",        pos ? s.positiveColor : s.negativeColor);
                t.textContent = txt; g.appendChild(t);
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
                    this.selectionManager.select(d.selectionId, e.ctrlKey || e.metaKey);
                });
            }
            appendTo.appendChild(g);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  TRELLIS
    // ═══════════════════════════════════════════════════════════════

    private renderTrellis(panels: TrellisPanel[], vpW: number, vpH: number): void {
        const s      = this.settings;
        const cols   = Math.max(1, s.trellisColumns);
        const nRows  = Math.ceil(panels.length / cols);
        const titleH = s.trellisShowTitle ? TRELLIS_TITLE_H : 0;

        // Reserve space for legend before computing panel heights
        const legendH    = s.showLegend ? LEGEND_H : 0;
        const isTop      = s.legendPosition === "top";
        const availH     = vpH - legendH;
        const panelOffY  = isTop ? legendH : 0; // panels shift down when legend is on top

        const panelW     = Math.floor((vpW - TRELLIS_GAP * (cols  + 1)) / cols);
        const panelH     = Math.floor((availH - TRELLIS_GAP * (nRows + 1)) / nRows);
        const contentH   = Math.max(20, panelH - titleH);
        const maxRows    = Math.max(...panels.map(p => p.data.length));
        const targetRowH  = Math.max(24, Math.floor(contentH / maxRows));
        const allData     = panels.flatMap(p => p.data);
        const autoRightW  = this.estimateRightW(allData, s, s.fontSize);
        const L           = this.hLayout(s, panelW, targetRowH, autoRightW);
        const allow      = this.canInteract();
        const { min: gRMin, max: gRMax } = this.calcRange(allData);
        const globalDomainMin = Math.min(0, gRMin);
        const globalDomainMax = gRMax * 1.1 || 1;
        const globalTotalDomain = globalDomainMax - globalDomainMin;

        const totalTrellisH = legendH + TRELLIS_GAP + nRows * (panelH + TRELLIS_GAP);
        this.clearSvg(vpW, Math.max(vpH, totalTrellisH));
        this.attachClearClick();
        if (s.showLegend) this.renderLegend(vpW, isTop ? 0 : Math.max(vpH, totalTrellisH) - legendH);

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
                tt.setAttribute("fill",        "#333");
                tt.textContent = panel.title;
                this.rootSvg.appendChild(tt);
            }

            const panelG = this.mkEl("g");
            panelG.setAttribute("transform", `translate(${px},${py + titleH})`);
            this.rootSvg.appendChild(panelG);

            if (s.orientation === "vertical") {
                this.drawVerticalContent(panel.data, panelG, panelW, contentH, pTotalDomain, pDomainMin, s, allow, `tv${pi}`);
                // Reference lines — absolute coords within rootSvg
                if (s.refLine1Show || s.refLine2Show) {
                    const varH2 = s.showVariance ? s.fontSize * 2.0 : 0;
                    const labH2 = s.showCategoryLabel ? VERT_PAD_BOT : 0;
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
                w += Math.ceil((`T: ${this.formatValue(d.target, d.formatTarget)}`).length * fs * 0.62 + 10);
            if (s.showVariance && d.variance != null) {
                const absV = this.formatValue(Math.abs(d.variance), d.formatActual);
                let txt    = (d.variance >= 0 ? "▲ +" : "▼ ") + absV;
                if (s.showVariancePct && d.variancePct != null)
                    txt   += ` (${d.variancePct >= 0 ? "+" : ""}${d.variancePct.toFixed(1)}%)`;
                w += Math.ceil(txt.length * fs * 0.62 + 6);
            }
            maxW = Math.max(maxW, w);
        });
        return maxW + 8; // small safety margin
    }

    private hLayout(s: BulletSettings, vpW: number, targetRowH?: number, autoRightW?: number) {
        const fs      = s.fontSize;
        const rowH    = Math.max(28, Math.ceil(targetRowH ?? fs * 3.4));
        const barH    = Math.max(6,  Math.floor(rowH * 0.44));
        const barY    = Math.floor((rowH - barH) / 2);
        const aBarH   = Math.max(3, Math.floor(barH * 0.55));
        const aBarY   = barY + Math.floor((barH - aBarH) / 2);
        const labelW  = s.showCategoryLabel ? Math.round(vpW * s.labelWidthPct / 100) : 0;
        // autoRightW: computed from actual data so column always fits the longest number.
        // Falls back to rightPanelWidthPct when no data is available yet.
        const rightW  = autoRightW != null
            ? autoRightW
            : (s.showActualValue || s.showVariance || s.showTargetValue)
                ? Math.round(vpW * s.rightPanelWidthPct / 100) : 0;
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
        const s   = this.settings;
        const ff  = s.fontFamily;
        const fs  = 10;
        const mid = yPos + LEGEND_H / 2;

        const hasTarget   = this.lastDataPoints.some(d => d.target   != null);
        const hasForecast = this.lastDataPoints.some(d => d.forecast != null);

        // Legend items: [icon-draw-fn, label]
        type Item = { label: string; draw: (x: number) => number /* returns icon width */ };
        const items: Item[] = [];

        // Actual — filled rectangle
        items.push({ label: "Actual", draw: (x) => {
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(x));  r.setAttribute("y",      String(mid - 5));
            r.setAttribute("width",  "14");        r.setAttribute("height", "10");
            r.setAttribute("fill",   s.actualColor); r.setAttribute("rx", "1");
            this.rootSvg.appendChild(r);
            return 14;
        }});

        // Target — thin vertical bar
        if (hasTarget) items.push({ label: "Target", draw: (x) => {
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(x + 5)); r.setAttribute("y",      String(mid - 7));
            r.setAttribute("width",  String(TARGET_W)); r.setAttribute("height", "14");
            r.setAttribute("fill",   s.targetColor);
            this.rootSvg.appendChild(r);
            return 14;
        }});

        // Forecast — diamond
        if (hasForecast) items.push({ label: "Forecast", draw: (x) => {
            const cx = x + 7; const sz = 5;
            const poly = this.mkEl("polygon");
            poly.setAttribute("points", `${cx},${mid-sz} ${cx+sz},${mid} ${cx},${mid+sz} ${cx-sz},${mid}`);
            poly.setAttribute("fill",    s.forecastColor);
            poly.setAttribute("opacity", "0.85");
            this.rootSvg.appendChild(poly);
            return 14;
        }});

        // Qualitative bands (3 stacked squares)
        if (s.showBands) items.push({ label: "Bands", draw: (x) => {
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
            const iconW = it.draw(x);
            x += iconW + 4;

            const { fg } = this.hcColors();
            const t = this.mkEl("text");
            t.setAttribute("x",           String(x));
            t.setAttribute("y",           String(mid + fs * 0.38));
            t.setAttribute("font-size",   String(fs));
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        fg);
            t.setAttribute("pointer-events", "none");
            t.textContent = it.label;
            this.rootSvg.appendChild(t);
            x += it.label.length * LABEL_PX + ITEM_GAP;
        });
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
        const positiveTicks = this.niceTicks(maxV);
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
            t.setAttribute("font-size",   "9");
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        labelColor);
            t.setAttribute("pointer-events", "none");
            t.textContent = this.formatValue(v, formatStr);
            this.rootSvg.appendChild(t);
        });
    }

    // Vertical axis: Y-axis line + horizontal guide lines + labels on the left.
    private renderVAxis(xLeft: number, baseline: number, chartH: number, maxV: number, formatStr?: string, minV: number = 0): void {
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
        const posTicks = this.niceTicks(maxV);
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
            t.setAttribute("font-size",   "9");
            t.setAttribute("font-family", ff);
            t.setAttribute("fill",        labelColor);
            t.setAttribute("pointer-events", "none");
            t.textContent = this.formatValue(v, formatStr);
            this.rootSvg.appendChild(t);
        });
    }

    // Draws a subtle scroll indicator badge when content overflows the viewport.
    // "vertical" = more rows below (H-mode); "horizontal" = more columns to the right (V-mode).
    private renderScrollHint(vpW: number, vpH: number, direction: "vertical" | "horizontal"): void {
        const label = direction === "vertical" ? "▼ scroll" : "▶ scroll";
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
    }

    private renderRefLinesV(
        xLeft: number, xRight: number, chartTop: number, chartBot: number,
        totalDomain: number, domainMin: number, formatStr?: string
    ): void {
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
    }

    private drawBands(
        g: SVGElement, s: BulletSettings,
        cx: number, y: number, chartW: number, h: number,
        rMax: number, totalDomain: number, domainMin: number
    ): void {
        // Map a data value to a pixel width from cx
        const xOf = (v: number) => cx + Math.max(0, ((v - domainMin) / totalDomain) * chartW);
        const bMax = Math.max(rMax, 0);

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
                    r.setAttribute("rx",     "2");
                    g.appendChild(r);
                });
        } else {
            const r = this.mkEl("rect");
            r.setAttribute("x",String(cx)); r.setAttribute("y",String(y));
            r.setAttribute("width",String(chartW)); r.setAttribute("height",String(h));
            r.setAttribute("fill","#E8E8E8"); r.setAttribute("rx","2");
            g.appendChild(r);
        }
    }

    private buildTooltipItems(d: BulletDataPoint): VisualTooltipDataItem[] {
        const items: VisualTooltipDataItem[] = [];
        if (d.actual != null)
            items.push({ displayName: "Actual",   value: this.formatValue(d.actual, d.formatActual) });
        if (d.target != null)
            items.push({ displayName: "Target",   value: this.formatValue(d.target, d.formatTarget) });
        if (d.variance != null) {
            const sign = d.variance >= 0 ? "+" : "";
            let varStr = `${sign}${this.formatValue(Math.abs(d.variance), d.formatActual)}`;
            if (d.variancePct != null)
                varStr += ` (${d.variancePct >= 0 ? "+" : ""}${d.variancePct.toFixed(1)}%)`;
            items.push({ displayName: "Variance", value: varStr });
        }
        if (d.forecast != null)
            items.push({ displayName: "Forecast", value: this.formatValue(d.forecast, d.formatForecast) });
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
            this.selectionManager.clear();
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
        });
        return { min: lo, max: hi };
    }

    // Kept for trellis / backward-compat call sites that only need the positive max
    private calcMax(data: BulletDataPoint[]): number {
        return this.calcRange(data).max;
    }

    private canInteract(): boolean { return (this.host as any).allowInteractions !== false; }

    // Applies a Power BI format string (from the measure's metadata) to a value.
    // Handles: percentages, currency symbols, K/M/B/T scale suffixes, decimal precision,
    // and thousands grouping. Falls back to fmt() for unknown or missing formats.
    // This enables dynamic format strings from calculation groups.
    private formatValue(value: number | null, formatStr?: string): string {
        if (value == null) return "–";
        if (!formatStr)    return this.fmt(value);
        const locale = (this.host as any).locale as string || "en-US";
        try {
            // Percentage: contains % outside of quoted strings
            if (/(?<!")%/.test(formatStr)) {
                const dec = (formatStr.match(/\.(0+)%/) || [])[1]?.length ?? 0;
                return new Intl.NumberFormat(locale, {
                    style: "percent",
                    minimumFractionDigits: dec,
                    maximumFractionDigits: dec,
                }).format(value);
            }
            // Scale suffix: "K", "M", "B", "T" inside quotes
            const scaleM = formatStr.match(/"([KkMmBbTt])"/);
            if (scaleM) {
                const scales: Record<string, number> = { k:1e3, m:1e6, b:1e9, t:1e12 };
                const scale = scales[scaleM[1].toLowerCase()] ?? 1;
                const dec   = (formatStr.match(/\.(0+)/) || [])[1]?.length ?? 1;
                const curr  = (formatStr.match(/[$€£¥₹₩₽]/) || [])[0] ?? "";
                return curr + new Intl.NumberFormat(locale, {
                    minimumFractionDigits: dec,
                    maximumFractionDigits: dec,
                    useGrouping: formatStr.includes(","),
                }).format(value / scale) + scaleM[1].toUpperCase();
            }
            // Currency symbol
            const curr = (formatStr.match(/[$€£¥₹₩₽]/) || [])[0] ?? "";
            // Decimal precision
            const dec  = (formatStr.match(/\.(0+)/) || [])[1]?.length ?? 0;
            return curr + new Intl.NumberFormat(locale, {
                minimumFractionDigits: dec,
                maximumFractionDigits: dec,
                useGrouping: formatStr.includes(","),
            }).format(value);
        } catch {
            return this.fmt(value);
        }
    }

    private fmt(v: number | null): string {
        if (v == null) return "–";
        const a = Math.abs(v); const sg = v < 0 ? "-" : "";
        if (a >= 1_000_000) return `${sg}${(a/1_000_000).toFixed(1)}M`;
        if (a >= 1_000)     return `${sg}${(a/1_000).toFixed(1)}K`;
        return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }

    private mkEl(tag: string): SVGElement {
        return document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement;
    }

    private clearSvg(w: number, h: number): void {
        while (this.rootSvg.firstChild) this.rootSvg.removeChild(this.rootSvg.firstChild);
        this.rootSvg.setAttribute("width",  String(w));
        this.rootSvg.setAttribute("height", String(h));
    }

    // ── Format panel ─────────────────────────────────────────────────

    public enumerateObjectInstances(opts: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        const s = this.settings ?? getDefaultSettings();
        const n = opts.objectName;
        const inst: VisualObjectInstance[] = [];
        switch (n) {
            case "general":
                inst.push({ objectName:n, selector:null, properties:{ orientation:s.orientation, ibcsMode:s.ibcsMode }}); break;
            case "colors": {
                // Global block — defines the default color AND tells Power BI which picker
                // type to use (full picker with "More colors"). Must include actualColor here
                // even though per-category overrides live below, otherwise PBI falls back to
                // a simplified picker without hex input / "More colors".
                inst.push({ objectName:n, selector:null, properties:{
                    actualColor:   {solid:{color:s.actualColor}},
                    targetColor:   {solid:{color:s.targetColor}},
                    forecastColor: {solid:{color:s.forecastColor}},
                    positiveColor: {solid:{color:s.positiveColor}},
                    negativeColor: {solid:{color:s.negativeColor}},
                    band1Color:    {solid:{color:s.band1Color}},
                    band2Color:    {solid:{color:s.band2Color}},
                    band3Color:    {solid:{color:s.band3Color}},
                }});
                // Per-category actualColor only (one row per category, no duplicates).
                // targetColor stays global — putting it here too causes Power BI to render
                // two separate rows per category making it look duplicated.
                const seen = new Set<string>();
                this.lastDataPoints.forEach(d => {
                    if (seen.has(d.category)) return;
                    seen.add(d.category);
                    inst.push({
                        objectName:  n,
                        displayName: d.category,
                        selector:    d.selectionId.getSelector(),
                        properties:  { actualColor: {solid:{color: d.colorActual ?? s.actualColor}} },
                    });
                });
                break;
            }
            case "bands":
                inst.push({ objectName:n, selector:null, properties:{ showBands:s.showBands, band1Pct:s.band1Pct, band2Pct:s.band2Pct }}); break;
            case "variance":
                inst.push({ objectName:n, selector:null, properties:{ showVariance:s.showVariance, showVariancePct:s.showVariancePct, varianceThreshold:s.varianceThreshold }}); break;
            case "labels":
                inst.push({ objectName:n, selector:null, properties:{ showCategoryLabel:s.showCategoryLabel, showActualValue:s.showActualValue, showTargetValue:s.showTargetValue, fontSize:s.fontSize, fontFamily:s.fontFamily }}); break;
            case "layout":
                inst.push({ objectName:n, selector:null, properties:{ labelWidthPct:s.labelWidthPct, rightPanelWidthPct:s.rightPanelWidthPct, showAxis:s.showAxis }}); break;
            case "legend":
                inst.push({ objectName:n, selector:null, properties:{ showLegend:s.showLegend, legendPosition:s.legendPosition }}); break;
            case "referenceLines":
                inst.push({ objectName:n, selector:null, properties:{
                    refLine1Show:s.refLine1Show, refLine1Value:s.refLine1Value, refLine1Label:s.refLine1Label, refLine1Color:{solid:{color:s.refLine1Color}},
                    refLine2Show:s.refLine2Show, refLine2Value:s.refLine2Value, refLine2Label:s.refLine2Label, refLine2Color:{solid:{color:s.refLine2Color}},
                }}); break;
            case "trellis":
                if (this.isPro) inst.push({ objectName:n, selector:null, properties:{
                    enabled:s.trellisEnabled, columns:s.trellisColumns, syncScale:s.trellisSyncScale,
                    trellisShowTitle:s.trellisShowTitle,
                    trellisPanelColor:{solid:{color:s.trellisPanelColor}},
                    trellisBorderColor:{solid:{color:s.trellisBorderColor}},
                }}); break;
        }
        return inst;
    }
}
