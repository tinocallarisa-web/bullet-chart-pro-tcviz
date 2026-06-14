"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions        = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions             = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                         = powerbi.extensibility.visual.IVisual;
import IVisualHost                     = powerbi.extensibility.visual.IVisualHost;
import DataView                        = powerbi.DataView;
import ISelectionManager               = powerbi.extensibility.ISelectionManager;
import ISelectionId                    = powerbi.visuals.ISelectionId;
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
const TRELLIS_TITLE_H = 22;
const VERT_PAD_TOP    = 8;
const VERT_PAD_BOT    = 20;
const VERT_PAD_LR     = 6;

// ═══════════════════════════════════════════════════════════════════
//  Visual
// ═══════════════════════════════════════════════════════════════════

export class BulletChartPro implements IVisual {

    private host:             IVisualHost;
    private container:        HTMLElement;
    private rootSvg:          SVGSVGElement;   // NEVER reassigned
    private events:           powerbi.extensibility.IVisualEventService;
    private selectionManager: ISelectionManager;
    private settings:         BulletSettings;
    private isPro:            boolean = false; // set true locally to test Pro features

    constructor(options: VisualConstructorOptions) {
        this.host             = options.host;
        this.events           = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.settings         = getDefaultSettings();
        this.container        = options.element;

        this.container.style.overflow = "hidden";
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

        this.checkLicense();
    }

    // ── License ──────────────────────────────────────────────────────

    private async checkLicense(): Promise<void> {
        try {
            const lm = (this.host as any).licenseManager;
            if (!lm) return;
            const r = await lm.getAvailableServicePlans();
            this.isPro = !!(r?.plans?.some(
                (p: any) => p.spIdentifier === "bullet-chart-pro-tcviz" && p.state === 1));
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
            trellisEnabled:     bool("trellis","enabled",            d.trellisEnabled),
            trellisColumns:     Math.max(1,   num("trellis","columns",          d.trellisColumns)),
            trellisSyncScale:   bool("trellis","syncScale",          d.trellisSyncScale),
            trellisShowTitle:   bool("trellis","trellisShowTitle",   d.trellisShowTitle),
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

    // ── Data parsing ─────────────────────────────────────────────────

    private parseData(dv: DataView): BulletDataPoint[] {
        const cat = dv?.categorical; if (!cat?.values?.length) return [];
        const mainCat = cat.categories?.find(c => c.source.roles?.["category"]);
        const actCol  = cat.values.find(v => v.source.roles?.["actual"]);
        const tgtCol  = cat.values.find(v => v.source.roles?.["target"]);
        const fstCol  = cat.values.find(v => v.source.roles?.["forecast"]);
        if (!actCol) return [];
        const n   = mainCat ? mainCat.values.length : actCol.values.length;
        const hl  = actCol.highlights != null;
        return Array.from({length: n}, (_, i) => this.buildPoint(i, mainCat, actCol, tgtCol, fstCol, hl));
    }

    private parseTrellis(dv: DataView): TrellisPanel[] {
        const cat = dv?.categorical; if (!cat?.values?.length) return [];
        const mainCat = cat.categories?.find(c => c.source.roles?.["category"]);
        const trlCat  = cat.categories?.find(c => c.source.roles?.["trellisBy"]);
        const actCol  = cat.values.find(v => v.source.roles?.["actual"]);
        const tgtCol  = cat.values.find(v => v.source.roles?.["target"]);
        const fstCol  = cat.values.find(v => v.source.roles?.["forecast"]);
        if (!actCol) return [];
        const n  = mainCat ? mainCat.values.length : actCol.values.length;
        const hl = actCol.highlights != null;
        const map = new Map<string, BulletDataPoint[]>(); const order: string[] = [];
        for (let i = 0; i < n; i++) {
            const key = trlCat ? String(trlCat.values[i] ?? "—") : "(All)";
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            map.get(key)!.push(this.buildPoint(i, mainCat, actCol, tgtCol, fstCol, hl));
        }
        return order.map(title => ({ title, data: map.get(title)! }));
    }

    private buildPoint(
        i: number,
        mc:  powerbi.DataViewCategoryColumn | undefined,
        ac:  powerbi.DataViewValueColumn,
        tc:  powerbi.DataViewValueColumn | undefined,
        fc:  powerbi.DataViewValueColumn | undefined,
        hl:  boolean
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
        return {
            category:      mc ? String(mc.values[i] ?? "") : String(ac.source.displayName ?? i),
            actual, target, forecast, variance, variancePct,
            selectionId:   selId,
            isHighlighted: !hl || (ac.highlights![i] != null),
        };
    }

    // ── Update ───────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dv = options.dataViews?.[0];
            const vp = options.viewport;
            if (!dv) { this.renderLanding(vp); this.events.renderingFinished(options); return; }

            this.settings = this.parseSettings(dv);
            const s = this.settings;

            if (this.isPro && s.trellisEnabled) {
                const panels = this.parseTrellis(dv);
                if (!panels.length) { this.renderLanding(vp); }
                else { this.renderTrellis(panels, vp.width, vp.height); }
                this.events.renderingFinished(options); return;
            }

            const data = this.parseData(dv);
            if (!data.length) { this.renderLanding(vp); this.events.renderingFinished(options); return; }

            if (s.orientation === "vertical") this.renderVertical(data, vp.width, vp.height);
            else                              this.renderHorizontal(data, vp.width, vp.height);

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

    private renderHorizontal(data: BulletDataPoint[], vpW: number, vpH: number): void {
        const s   = this.settings;
        const max = this.calcMax(data) * 1.1 || 1;
        const L   = this.hLayout(s, vpW, Math.floor(vpH / data.length));
        this.clearSvg(vpW, vpH);
        this.attachClearClick();
        const allow = this.canInteract();
        data.forEach((d, i) => this.renderHRow(d, i * L.rowH, L, max, s, allow, this.rootSvg, `h${i}`));
    }

    // ═══════════════════════════════════════════════════════════════
    //  renderHRow
    // ═══════════════════════════════════════════════════════════════

    private renderHRow(
        d:        BulletDataPoint,
        gy:       number,
        L:        ReturnType<typeof BulletChartPro.prototype.hLayout>,
        maxValue: number,
        s:        BulletSettings,
        allow:    boolean,
        appendTo: SVGElement,
        idPrefix: string
    ): void {
        const { rowH, barH, barY, actualBarH, actualBarY, labelW, chartW, rightW } = L;
        const fs = s.fontSize; const ff = s.fontFamily;

        const g = this.mkEl("g");
        g.setAttribute("transform", `translate(0,${gy})`);
        g.setAttribute("role",      "listitem");
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
            t.setAttribute("fill",        "#333");
            t.setAttribute("clip-path",   `url(#${cid})`);
            t.textContent = d.category;
            g.appendChild(t);
        }

        const cx = labelW;

        // 2. Bands
        this.drawBands(g, s, cx, barY, chartW, barH);

        // 3. Actual bar
        if (d.actual != null) {
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(cx));
            r.setAttribute("y",      String(actualBarY));
            r.setAttribute("width",  String(Math.max(0, (Math.abs(d.actual) / maxValue) * chartW)));
            r.setAttribute("height", String(actualBarH));
            r.setAttribute("fill",   s.actualColor);
            r.setAttribute("rx",     "1");
            g.appendChild(r);
        }

        // 4. Target marker
        if (d.target != null) {
            const tx = cx + (Math.abs(d.target) / maxValue) * chartW;
            const mH = barH * TARGET_H_RATIO; const mY = barY + (barH - mH) / 2;
            const r = this.mkEl("rect");
            r.setAttribute("x",      String(tx - TARGET_W / 2));
            r.setAttribute("y",      String(mY));
            r.setAttribute("width",  String(TARGET_W));
            r.setAttribute("height", String(mH));
            r.setAttribute("fill",   s.targetColor);
            g.appendChild(r);
        }

        // 5. Forecast marker
        if (d.forecast != null) {
            const fx = cx + (Math.abs(d.forecast) / maxValue) * chartW;
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
                const t = this.mkEl("text");
                t.setAttribute("x",           String(rx));
                t.setAttribute("y",           String(ry));
                t.setAttribute("font-size",   String(fs));
                t.setAttribute("font-family", ff);
                t.setAttribute("font-weight", "600");
                t.setAttribute("fill",        "#333");
                t.setAttribute("clip-path",   `url(#${rcid})`);
                t.textContent = this.fmt(d.actual);
                g.appendChild(t);
                rx += Math.ceil(this.fmt(d.actual).length * fs * 0.62 + 8);
            }

            if (s.showVariance && d.variance != null) {
                const pos  = d.variance >= s.varianceThreshold;
                let   txt  = (pos ? "▲ +" : "▼ ") + this.fmt(d.variance);
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
        g.appendChild(this.buildTooltip(d));

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

    private renderVertical(data: BulletDataPoint[], vpW: number, vpH: number): void {
        const s   = this.settings;
        const max = this.calcMax(data) * 1.1 || 1;
        const allow = this.canInteract();
        this.clearSvg(vpW, vpH);
        this.attachClearClick();
        this.drawVerticalContent(data, this.rootSvg, vpW, vpH, max, s, allow, "v");
    }

    private drawVerticalContent(
        data:      BulletDataPoint[],
        appendTo:  SVGElement,
        panelW:    number,
        panelH:    number,
        maxValue:  number,
        s:         BulletSettings,
        allow:     boolean,
        idPrefix:  string
    ): void {
        const fs = s.fontSize; const ff = s.fontFamily;
        const n  = data.length;
        if (n === 0) return;

        const varH   = s.showVariance ? fs * 2.0 : 0;
        const labH   = s.showCategoryLabel ? VERT_PAD_BOT : 0;
        const chartH = Math.max(20, panelH - VERT_PAD_TOP - labH - varH);
        const colW   = Math.max(16, (panelW - VERT_PAD_LR * 2) / n);
        const baseline = VERT_PAD_TOP + chartH;
        const barW   = Math.max(4, colW * 0.55);
        const barXOff = (colW - barW) / 2;

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
            g.style.opacity = d.isHighlighted ? "1" : "0.25";
            if (allow) g.style.cursor = "pointer";

            if (s.showBands) {
                [[chartH, s.band3Color],[chartH * Math.min(s.band2Pct,100)/100, s.band2Color],[chartH * Math.min(s.band1Pct,100)/100, s.band1Color]]
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
                bg.setAttribute("x",String(barXOff)); bg.setAttribute("y",String(VERT_PAD_TOP));
                bg.setAttribute("width",String(barW)); bg.setAttribute("height",String(chartH));
                bg.setAttribute("fill","#E8E8E8"); bg.setAttribute("rx","2");
                g.appendChild(bg);
            }

            if (d.actual != null) {
                const aH = Math.max(0, (Math.abs(d.actual) / maxValue) * chartH);
                const aW = barW * 0.55; const aX = barXOff + (barW - aW) / 2;
                const r = this.mkEl("rect");
                r.setAttribute("x",String(aX)); r.setAttribute("y",String(baseline - aH));
                r.setAttribute("width",String(aW)); r.setAttribute("height",String(aH));
                r.setAttribute("fill",s.actualColor); r.setAttribute("rx","1");
                g.appendChild(r);

                if (s.showActualValue) {
                    const t = this.mkEl("text");
                    t.setAttribute("x",String(colW / 2)); t.setAttribute("y",String(Math.max(VERT_PAD_TOP + fs, baseline - aH - 3)));
                    t.setAttribute("text-anchor","middle"); t.setAttribute("font-size",String(Math.min(fs, 10)));
                    t.setAttribute("font-family",ff); t.setAttribute("font-weight","600"); t.setAttribute("fill","#333");
                    t.textContent = this.fmt(d.actual); g.appendChild(t);
                }
            }

            if (d.target != null) {
                const ty = baseline - (Math.abs(d.target) / maxValue) * chartH;
                const mW = barW * TARGET_H_RATIO; const mX = barXOff + (barW - mW) / 2;
                const r = this.mkEl("rect");
                r.setAttribute("x",String(mX)); r.setAttribute("y",String(ty - TARGET_W / 2));
                r.setAttribute("width",String(mW)); r.setAttribute("height",String(TARGET_W));
                r.setAttribute("fill",s.targetColor); g.appendChild(r);
            }

            if (d.forecast != null) {
                const fy = baseline - (Math.abs(d.forecast) / maxValue) * chartH;
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
                t.setAttribute("fill",        "#555");
                t.textContent = d.category;
                g.appendChild(t);
            }

            if (s.showVariance && d.variance != null) {
                const pos = d.variance >= s.varianceThreshold;
                let txt = (pos ? "▲" : "▼") + this.fmt(d.variance);
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

            g.appendChild(this.buildTooltip(d));
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

        const panelW     = Math.floor((vpW - TRELLIS_GAP * (cols  + 1)) / cols);
        const panelH     = Math.floor((vpH - TRELLIS_GAP * (nRows + 1)) / nRows);
        const contentH   = Math.max(20, panelH - titleH);
        const maxRows    = Math.max(...panels.map(p => p.data.length));
        const targetRowH = Math.max(24, Math.floor(contentH / maxRows));
        const L          = this.hLayout(s, panelW, targetRowH);
        const allow      = this.canInteract();
        const globalMax  = this.calcMax(panels.flatMap(p => p.data)) * 1.1 || 1;

        this.clearSvg(vpW, vpH);
        this.attachClearClick();

        panels.forEach((panel, pi) => {
            const col  = pi % cols;
            const row  = Math.floor(pi / cols);
            const px   = TRELLIS_GAP + col * (panelW + TRELLIS_GAP);
            const py   = TRELLIS_GAP + row * (panelH + TRELLIS_GAP);
            const maxV = s.trellisSyncScale ? globalMax : this.calcMax(panel.data) * 1.1 || 1;

            const bg = this.mkEl("rect");
            bg.setAttribute("x",      String(px));    bg.setAttribute("y",      String(py));
            bg.setAttribute("width",  String(panelW)); bg.setAttribute("height", String(panelH));
            bg.setAttribute("fill",   "#FAFAFA");      bg.setAttribute("stroke", "#E0E0E0");
            bg.setAttribute("rx",     "4");
            this.rootSvg.appendChild(bg);

            if (s.trellisShowTitle) {
                const tbg = this.mkEl("rect");
                tbg.setAttribute("x",String(px)); tbg.setAttribute("y",String(py));
                tbg.setAttribute("width",String(panelW)); tbg.setAttribute("height",String(titleH));
                tbg.setAttribute("fill","#F0F0F0"); tbg.setAttribute("rx","4");
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
                this.drawVerticalContent(panel.data, panelG, panelW, contentH, maxV, s, allow, `tv${pi}`);
            } else {
                panel.data.forEach((d, di) =>
                    this.renderHRow(d, di * L.rowH, L, maxV, s, allow, panelG, `th${pi}-${di}`));
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Layout helper
    // ═══════════════════════════════════════════════════════════════

    private hLayout(s: BulletSettings, vpW: number, targetRowH?: number) {
        const fs      = s.fontSize;
        const rowH    = Math.max(28, Math.ceil(targetRowH ?? fs * 3.4));
        const barH    = Math.max(6,  Math.floor(rowH * 0.44));
        const barY    = Math.floor((rowH - barH) / 2);
        const aBarH   = Math.max(3, Math.floor(barH * 0.55));
        const aBarY   = barY + Math.floor((barH - aBarH) / 2);
        const labelW  = s.showCategoryLabel ? Math.round(vpW * s.labelWidthPct / 100)      : 0;
        const rightW  = (s.showActualValue || s.showVariance) ? Math.round(vpW * s.rightPanelWidthPct / 100) : 0;
        const chartW  = Math.max(20, vpW - labelW - rightW - CHART_PAD_R);
        return { rowH, barH, barY, actualBarH: aBarH, actualBarY: aBarY, labelW, rightW, chartW };
    }

    // ═══════════════════════════════════════════════════════════════
    //  Shared helpers
    // ═══════════════════════════════════════════════════════════════

    private drawBands(g: SVGElement, s: BulletSettings, x: number, y: number, w: number, h: number): void {
        if (s.showBands) {
            [[w, s.band3Color],[w*Math.min(s.band2Pct,100)/100, s.band2Color],[w*Math.min(s.band1Pct,100)/100, s.band1Color]]
                .forEach(([bw, c]) => {
                    const r = this.mkEl("rect");
                    r.setAttribute("x",String(x)); r.setAttribute("y",String(y));
                    r.setAttribute("width",String(bw as number)); r.setAttribute("height",String(h));
                    r.setAttribute("fill",c as string); r.setAttribute("rx","2");
                    g.appendChild(r);
                });
        } else {
            const r = this.mkEl("rect");
            r.setAttribute("x",String(x)); r.setAttribute("y",String(y));
            r.setAttribute("width",String(w)); r.setAttribute("height",String(h));
            r.setAttribute("fill","#E8E8E8"); r.setAttribute("rx","2");
            g.appendChild(r);
        }
    }

    private buildTooltip(d: BulletDataPoint): SVGElement {
        const t = this.mkEl("title");
        let s = d.category;
        s += `\nActual: ${this.fmt(d.actual)}`;
        if (d.target   != null) s += `\nTarget: ${this.fmt(d.target)}`;
        if (d.variance != null) s += `\nVariance: ${d.variance >= 0 ? "+" : ""}${this.fmt(d.variance)}`;
        if (d.variancePct != null) s += ` (${d.variancePct.toFixed(1)}%)`;
        if (d.forecast != null) s += `\nForecast: ${this.fmt(d.forecast)}`;
        t.textContent = s; return t;
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
        this.rootSvg.onclick = () => { this.selectionManager.clear(); };
    }

    private calcMax(data: BulletDataPoint[]): number {
        let m = 0;
        data.forEach(d => {
            if (d.actual   != null) m = Math.max(m, Math.abs(d.actual));
            if (d.target   != null) m = Math.max(m, Math.abs(d.target));
            if (d.forecast != null) m = Math.max(m, Math.abs(d.forecast));
        });
        return m;
    }

    private canInteract(): boolean { return (this.host as any).allowInteractions !== false; }

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
            case "colors":
                inst.push({ objectName:n, selector:null, properties:{
                    actualColor:   {solid:{color:s.actualColor}},   targetColor:   {solid:{color:s.targetColor}},
                    forecastColor: {solid:{color:s.forecastColor}}, positiveColor: {solid:{color:s.positiveColor}},
                    negativeColor: {solid:{color:s.negativeColor}}, band1Color:    {solid:{color:s.band1Color}},
                    band2Color:    {solid:{color:s.band2Color}},    band3Color:    {solid:{color:s.band3Color}},
                }}); break;
            case "bands":
                inst.push({ objectName:n, selector:null, properties:{ showBands:s.showBands, band1Pct:s.band1Pct, band2Pct:s.band2Pct }}); break;
            case "variance":
                inst.push({ objectName:n, selector:null, properties:{ showVariance:s.showVariance, showVariancePct:s.showVariancePct, varianceThreshold:s.varianceThreshold }}); break;
            case "labels":
                inst.push({ objectName:n, selector:null, properties:{ showCategoryLabel:s.showCategoryLabel, showActualValue:s.showActualValue, showTargetValue:s.showTargetValue, fontSize:s.fontSize }}); break;
            case "layout":
                inst.push({ objectName:n, selector:null, properties:{ labelWidthPct:s.labelWidthPct, rightPanelWidthPct:s.rightPanelWidthPct }}); break;
            case "trellis":
                if (this.isPro) inst.push({ objectName:n, selector:null, properties:{ enabled:s.trellisEnabled, columns:s.trellisColumns, syncScale:s.trellisSyncScale, trellisShowTitle:s.trellisShowTitle }}); break;
        }
        return inst;
    }
}
