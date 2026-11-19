"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { BulletSettings } from "./settings";

import SimpleCard   = formattingSettings.SimpleCard;
import ColorPicker  = formattingSettings.ColorPicker;
import ToggleSwitch = formattingSettings.ToggleSwitch;
import NumUpDown    = formattingSettings.NumUpDown;
import TextInput    = formattingSettings.TextInput;
import AutoDropdown = formattingSettings.AutoDropdown;
import FontPicker   = formattingSettings.FontPicker;
import Model        = formattingSettings.Model;

/**
 * Panel de formato con getFormattingModel (1.5). Los valores salen de BulletSettings, que es lo que se pinta: así el
 * panel enseña el color real también cuando lo pone un estilo de la colección; el alto contraste no, porque no se guarda.
 * Orden común de la cartera (1.6): Style template, tarjetas propias, ejes, leyenda, small multiples, accesibilidad.
 * Nombres de tarjeta y propiedad = capabilities.json (informes publicados); claves de texto = stringResources.
 */

export interface CategoryColor { name: string; selector: powerbi.data.Selector; color: string; }

const col = (v: string) => ({ value: v });

function card(name: string, key: string, displayName: string, slices: formattingSettings.Slice[]): SimpleCard {
    const c = new SimpleCard();
    c.name = name;
    c.displayName = displayName;
    c.displayNameKey = key;
    c.slices = slices;
    return c;
}

/** Porciones fijas de la tarjeta Colors antes de las de cada categoría. */
export const COLOR_FIXED_SLICES = 9;

export function buildFormattingCards(s: BulletSettings, cats: CategoryColor[]): Model {
    // Plantilla y guía (1.5): la primera tarjeta, para que se vea.
    const style = card("style", "Obj_style", "Style template", [
        new AutoDropdown({ name: "template", displayName: "Template",    displayNameKey: "Prop_style_template", value: s.template }),
        new ToggleSwitch({ name: "guide",    displayName: "Setup guide", displayNameKey: "Prop_style_guide",    value: s.guide }),
    ]);

    // 1.6: el interruptor "IBCS Mode" sale del panel. La propiedad general.ibcsMode se sigue leyendo (informes
    // guardados): un informe con ella activa y sin estilo elegido se dibuja con Signal.
    const general = card("general", "Visual_General", "General", [
        new AutoDropdown({ name: "orientation", displayName: "Orientation", displayNameKey: "Visual_General_Orientation", value: s.orientation }),
    ]);

    // Formato condicional (fx) en la barra real y en el marcador de objetivo. El selector se crea con
    // createDataViewWildcardSelector (no escrito a mano): Power BI resuelve la regla por categoría y lo devuelve en
    // categories[0].objects[i]. altConstantSelector null: el color FIJO se guarda una sola vez, a nivel general.
    // instanceKind 3 = ConstantOrRule (const enum, no existe en runtime).
    const fx = (name: string, displayName: string, displayNameKey: string, value: string) => new ColorPicker({
        name, displayName, displayNameKey, value: col(value),
        selector: dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals),
        instanceKind: 3,
        altConstantSelector: null as any,
    });
    const colors = card("colors", "Visual_Colors", "Colors", [
        fx("actualColor", "Actual bar", "Visual_Colors_ActualColor", s.actualColor),
        fx("targetColor", "Target marker", "Visual_Colors_TargetColor", s.targetColor),
        new ColorPicker({ name: "target2Color",  displayName: "Second target marker (Pro)", displayNameKey: "Visual_Colors_Target2Color", value: col(s.target2Color) }),
        new ColorPicker({ name: "forecastColor", displayName: "Forecast marker",   displayNameKey: "Visual_Colors_ForecastColor", value: col(s.forecastColor) }),
        new ColorPicker({ name: "positiveColor", displayName: "Positive variance", displayNameKey: "Visual_Colors_PositiveColor", value: col(s.positiveColor) }),
        new ColorPicker({ name: "negativeColor", displayName: "Negative variance", displayNameKey: "Visual_Colors_NegativeColor", value: col(s.negativeColor) }),
        new ColorPicker({ name: "band1Color",    displayName: "Band 1 (worst)",    displayNameKey: "Visual_Colors_Band1Color",    value: col(s.band1Color) }),
        new ColorPicker({ name: "band2Color",    displayName: "Band 2 (mid)",      displayNameKey: "Visual_Colors_Band2Color",    value: col(s.band2Color) }),
        new ColorPicker({ name: "band3Color",    displayName: "Band 3 (best)",     displayNameKey: "Visual_Colors_Band3Color",    value: col(s.band3Color) }),
        // Un color fijo por categoría (sin fx: la regla vive en la fila general).
        ...cats.map(c => new ColorPicker({
            name: "actualColor", displayName: c.name, value: col(c.color), selector: c.selector,
        }) as formattingSettings.Slice),
    ]);

    const bands = card("bands", "Visual_Bands", "Qualitative Bands", [
        new ToggleSwitch({ name: "showBands", displayName: "Show bands", displayNameKey: "Visual_Bands_ShowBands", value: s.showBands }),
        new NumUpDown({ name: "band1Pct", displayName: "Band 1 threshold %", displayNameKey: "Visual_Bands_Band1Pct", value: s.band1Pct }),
        new NumUpDown({ name: "band2Pct", displayName: "Band 2 threshold %", displayNameKey: "Visual_Bands_Band2Pct", value: s.band2Pct }),
    ]);

    const variance = card("variance", "Visual_Variance", "Variance", [
        new ToggleSwitch({ name: "showVariance",    displayName: "Show variance label",   displayNameKey: "Visual_Variance_ShowVariance",    value: s.showVariance }),
        new ToggleSwitch({ name: "showVariancePct", displayName: "Show variance %",       displayNameKey: "Visual_Variance_ShowVariancePct", value: s.showVariancePct }),
        new NumUpDown({ name: "varianceThreshold",  displayName: "Green/red threshold",   displayNameKey: "Visual_Variance_VarianceThreshold", value: s.varianceThreshold }),
    ]);

    const labels = card("labels", "Visual_Labels", "Labels", [
        new ToggleSwitch({ name: "showCategoryLabel", displayName: "Show category",     displayNameKey: "Visual_Labels_ShowCategoryLabel", value: s.showCategoryLabel }),
        new ToggleSwitch({ name: "showActualValue",   displayName: "Show actual value", displayNameKey: "Visual_Labels_ShowActualValue",   value: s.showActualValue }),
        new ToggleSwitch({ name: "showTargetValue",   displayName: "Show target value", displayNameKey: "Visual_Labels_ShowTargetValue",   value: s.showTargetValue }),
        new NumUpDown({ name: "fontSize",   displayName: "Font size",   displayNameKey: "Visual_Labels_FontSize",   value: s.fontSize }),
        new FontPicker({ name: "fontFamily", displayName: "Font family", displayNameKey: "Visual_Labels_FontFamily", value: s.fontFamily }),
    ]);

    const sort = card("sort", "Obj_sort", "Sort", [
        new AutoDropdown({ name: "by",         displayName: "Sort bars by", displayNameKey: "Prop_sort_by",         value: s.sortBy }),
        new ToggleSwitch({ name: "descending", displayName: "Descending",   displayNameKey: "Prop_sort_descending", value: s.sortDescending, visible: s.sortBy !== "none" }),
    ]);

    const layout = card("layout", "Visual_Layout", "Layout and axis", [
        // Los dos anchos solo existen en horizontal: en vertical no se ofrecen.
        new NumUpDown({ name: "labelWidthPct",      displayName: "Category column width % (5-40)", displayNameKey: "Visual_Layout_LabelWidthPct",      value: s.labelWidthPct, visible: s.orientation !== "vertical" }),
        new NumUpDown({ name: "rightPanelWidthPct", displayName: "Values panel width % (10-45)",    displayNameKey: "Visual_Layout_RightPanelWidthPct", value: s.rightPanelWidthPct, visible: s.orientation !== "vertical" }),
        new AutoDropdown({ name: "rowHeightMode",   displayName: "Row height",                     displayNameKey: "Visual_Layout_RowHeightMode",      value: s.rowHeightMode }),
        new NumUpDown({    name: "rowHeight",       displayName: "Fixed row height (px)",          displayNameKey: "Visual_Layout_RowHeight",          value: s.rowHeight, visible: s.rowHeightMode === "fixed" }),
        new NumUpDown({    name: "barHeightPct",    displayName: "Bar thickness % of row (10-90)", displayNameKey: "Visual_Layout_BarHeightPct",       value: s.barHeightPct }),
        new ToggleSwitch({ name: "showAxis",        displayName: "Show scale axis",                displayNameKey: "Visual_Layout_ShowAxis",           value: s.showAxis }),
        new ToggleSwitch({ name: "showGridlines",   displayName: "Gridlines",                      displayNameKey: "Visual_Layout_ShowGridlines",      value: s.showGridlines, visible: s.showAxis }),
        new ToggleSwitch({ name: "showAxisTitle",   displayName: "Axis title",                     displayNameKey: "Visual_Layout_ShowAxisTitle",      value: s.showAxisTitle, visible: s.showAxis }),
        new TextInput({    name: "axisTitle",       displayName: "Axis title text (empty = measure name)", displayNameKey: "Visual_Layout_AxisTitle", value: s.axisTitle, placeholder: "", visible: s.showAxis && s.showAxisTitle }),
    ]);

    const legend = card("legend", "Visual_Legend", "Legend", [
        new ToggleSwitch({ name: "showLegend",     displayName: "Show legend", displayNameKey: "Visual_Legend_ShowLegend",     value: s.showLegend }),
        new AutoDropdown({ name: "legendPosition", displayName: "Position",    displayNameKey: "Visual_Legend_LegendPosition", value: s.legendPosition }),
        new NumUpDown({    name: "fontSize",       displayName: "Font size",   displayNameKey: "Visual_Legend_FontSize",       value: s.legendFontSize }),
        new FontPicker({   name: "fontFamily",     displayName: "Font family", displayNameKey: "Visual_Legend_FontFamily",     value: s.legendFontFamily }),
        new ColorPicker({  name: "color",          displayName: "Text color",  displayNameKey: "Visual_Legend_Color",          value: col(s.legendColor) }),
    ]);

    const ref = card("referenceLines", "Visual_ReferenceLines", "Reference Lines", [
        new ToggleSwitch({ name: "refLine1Show",  displayName: "Line 1 — Show",  displayNameKey: "Visual_ReferenceLines_RefLine1Show",  value: s.refLine1Show }),
        new NumUpDown({    name: "refLine1Value", displayName: "Line 1 — Value", displayNameKey: "Visual_ReferenceLines_RefLine1Value", value: s.refLine1Value }),
        new TextInput({    name: "refLine1Label", displayName: "Line 1 — Label", displayNameKey: "Visual_ReferenceLines_RefLine1Label", value: s.refLine1Label, placeholder: "" }),
        new ColorPicker({  name: "refLine1Color", displayName: "Line 1 — Color", displayNameKey: "Visual_ReferenceLines_RefLine1Color", value: col(s.refLine1Color) }),
        new ToggleSwitch({ name: "refLine2Show",  displayName: "Line 2 — Show",  displayNameKey: "Visual_ReferenceLines_RefLine2Show",  value: s.refLine2Show }),
        new NumUpDown({    name: "refLine2Value", displayName: "Line 2 — Value", displayNameKey: "Visual_ReferenceLines_RefLine2Value", value: s.refLine2Value }),
        new TextInput({    name: "refLine2Label", displayName: "Line 2 — Label", displayNameKey: "Visual_ReferenceLines_RefLine2Label", value: s.refLine2Label, placeholder: "" }),
        new ColorPicker({  name: "refLine2Color", displayName: "Line 2 — Color", displayNameKey: "Visual_ReferenceLines_RefLine2Color", value: col(s.refLine2Color) }),
    ]);

    // Visible también en Free: si no, nadie descubre que Pro existe. El nombre ya lleva "[Pro]".
    // Las 9 opciones comunes de la cartera (1.6), con los nombres internos que ya tenía el Bullet.
    const trellis = card("trellis", "Visual_Trellis", "Small Multiples [Pro]", [
        new ToggleSwitch({ name: "enabled",          displayName: "Enable small multiples",   displayNameKey: "Visual_Trellis_Enabled",          value: s.trellisEnabled }),
        new NumUpDown({    name: "columns",          displayName: "Columns (0 = automatic)",  displayNameKey: "Visual_Trellis_Columns",          value: s.trellisColumns }),
        new NumUpDown({    name: "gap",              displayName: "Space between panels",     displayNameKey: "Visual_Trellis_Gap",              value: s.trellisGap }),
        new ToggleSwitch({ name: "syncScale",        displayName: "Sync scale across panels", displayNameKey: "Visual_Trellis_SyncScale",        value: s.trellisSyncScale }),
        new ToggleSwitch({ name: "trellisShowTitle", displayName: "Show panel titles",        displayNameKey: "Visual_Trellis_TrellisShowTitle", value: s.trellisShowTitle }),
        new NumUpDown({    name: "titleSize",        displayName: "Title size",               displayNameKey: "Visual_Trellis_TitleSize",        value: s.trellisTitleSize, visible: s.trellisShowTitle }),
        new ColorPicker({  name: "trellisTitleColor",  displayName: "Panel title color",      displayNameKey: "Visual_Trellis_TrellisTitleColor",  value: col(s.trellisTitleColor), visible: s.trellisShowTitle }),
        new ToggleSwitch({ name: "titleBold",        displayName: "Bold title",               displayNameKey: "Visual_Trellis_TitleBold",        value: s.trellisTitleBold, visible: s.trellisShowTitle }),
        new AutoDropdown({ name: "titleAlign",       displayName: "Title alignment",          displayNameKey: "Visual_Trellis_TitleAlign",       value: s.trellisTitleAlign, visible: s.trellisShowTitle }),
        new ColorPicker({  name: "trellisPanelColor",  displayName: "Panel background color", displayNameKey: "Visual_Trellis_TrellisPanelColor",  value: col(s.trellisPanelColor) }),
        new ToggleSwitch({ name: "border",           displayName: "Panel border",             displayNameKey: "Visual_Trellis_Border",           value: s.trellisBorder }),
        new ColorPicker({  name: "trellisBorderColor", displayName: "Panel border color",     displayNameKey: "Visual_Trellis_TrellisBorderColor", value: col(s.trellisBorderColor), visible: s.trellisBorder }),
    ]);

    // Accesibilidad (1.6): la misma tarjeta que Box & Whisker y Radar.
    const accessibility = card("accessibility", "Obj_accessibility", "Accessibility", [
        new AutoDropdown({ name: "highContrast", displayName: "High contrast",     displayNameKey: "Prop_accessibility_highContrast", value: s.hcMode }),
        new ColorPicker({  name: "focusColor",   displayName: "Focus color",       displayNameKey: "Prop_accessibility_focusColor",   value: col(s.focusColor) }),
        new NumUpDown({    name: "focusWidth",   displayName: "Focus width",       displayNameKey: "Prop_accessibility_focusWidth",   value: s.focusWidth }),
        new NumUpDown({    name: "minTextSize",  displayName: "Minimum text size", displayNameKey: "Prop_accessibility_minTextSize",  value: s.minTextSize }),
    ]);

    const m = new Model();
    m.cards = [style, general, colors, bands, variance, labels, sort, ref, layout, legend, trellis, accessibility];
    return m;
}
