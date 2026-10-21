"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
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
 * panel enseña el color real también cuando lo pone el modo IBCS o el alto contraste no, porque eso no se guarda.
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
export const COLOR_FIXED_SLICES = 8;

export function buildFormattingCards(s: BulletSettings, cats: CategoryColor[]): Model {
    const general = card("general", "Visual_General", "General", [
        new AutoDropdown({ name: "orientation", displayName: "Orientation", displayNameKey: "Visual_General_Orientation", value: s.orientation }),
        new ToggleSwitch({ name: "ibcsMode", displayName: "IBCS Mode", displayNameKey: "Visual_General_IbcsMode", value: s.ibcsMode }),
    ]);

    const colors = card("colors", "Visual_Colors", "Colors", [
        // Formato condicional (fx): selector comodín para que Power BI resuelva la regla por categoría, y
        // altConstantSelector null para que el color FIJO se guarde una sola vez a nivel general.
        // instanceKind 3 = ConstantOrRule (const enum, no existe en runtime).
        new ColorPicker({
            name: "actualColor", displayName: "Actual bar", displayNameKey: "Visual_Colors_ActualColor",
            value: col(s.actualColor),
            selector: { data: [{ dataViewWildcard: { matchingOption: 0 } }] } as any,
            instanceKind: 3,
            altConstantSelector: null as any,
        }),
        new ColorPicker({ name: "targetColor",   displayName: "Target marker",     displayNameKey: "Visual_Colors_TargetColor",   value: col(s.targetColor) }),
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

    const layout = card("layout", "Visual_Layout", "Layout", [
        new NumUpDown({ name: "labelWidthPct",      displayName: "Category column width % (5-40)", displayNameKey: "Visual_Layout_LabelWidthPct",      value: s.labelWidthPct }),
        new NumUpDown({ name: "rightPanelWidthPct", displayName: "Values panel width % (10-45)",    displayNameKey: "Visual_Layout_RightPanelWidthPct", value: s.rightPanelWidthPct }),
        new ToggleSwitch({ name: "showAxis",        displayName: "Show scale axis",                displayNameKey: "Visual_Layout_ShowAxis",           value: s.showAxis }),
    ]);

    const legend = card("legend", "Visual_Legend", "Legend", [
        new ToggleSwitch({ name: "showLegend",     displayName: "Show legend", displayNameKey: "Visual_Legend_ShowLegend",     value: s.showLegend }),
        new AutoDropdown({ name: "legendPosition", displayName: "Position",    displayNameKey: "Visual_Legend_LegendPosition", value: s.legendPosition }),
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
    const trellis = card("trellis", "Visual_Trellis", "Small Multiples [Pro]", [
        new ToggleSwitch({ name: "enabled",          displayName: "Enable small multiples",   displayNameKey: "Visual_Trellis_Enabled",          value: s.trellisEnabled }),
        new NumUpDown({    name: "columns",          displayName: "Columns",                  displayNameKey: "Visual_Trellis_Columns",          value: s.trellisColumns }),
        new ToggleSwitch({ name: "syncScale",        displayName: "Sync scale across panels", displayNameKey: "Visual_Trellis_SyncScale",        value: s.trellisSyncScale }),
        new ToggleSwitch({ name: "trellisShowTitle", displayName: "Show panel titles",        displayNameKey: "Visual_Trellis_TrellisShowTitle", value: s.trellisShowTitle }),
        new ColorPicker({  name: "trellisPanelColor",  displayName: "Panel background color", displayNameKey: "Visual_Trellis_TrellisPanelColor",  value: col(s.trellisPanelColor) }),
        new ColorPicker({  name: "trellisBorderColor", displayName: "Panel border color",     displayNameKey: "Visual_Trellis_TrellisBorderColor", value: col(s.trellisBorderColor) }),
        new ColorPicker({  name: "trellisTitleColor",  displayName: "Panel title color",      displayNameKey: "Visual_Trellis_TrellisTitleColor",  value: col(s.trellisTitleColor) }),
    ]);

    const m = new Model();
    m.cards = [general, colors, bands, variance, labels, layout, legend, ref, trellis];
    return m;
}
