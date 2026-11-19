"use strict";

export interface BulletSettings {
    // ── General ──────────────────────────────────────────────────────
    orientation:        "horizontal" | "vertical";
    ibcsMode:           boolean;

    // ── Colors ───────────────────────────────────────────────────────
    actualColor:        string;
    targetColor:        string;
    target2Color:       string;
    forecastColor:      string;
    positiveColor:      string;
    negativeColor:      string;
    band1Color:         string;
    band2Color:         string;
    band3Color:         string;

    // ── Qualitative Bands ─────────────────────────────────────────────
    showBands:          boolean;
    band1Pct:           number;   // % of axis max where band 1 ends
    band2Pct:           number;   // % of axis max where band 2 ends

    // ── Variance (no DAX) ─────────────────────────────────────────────
    showVariance:       boolean;
    showVariancePct:    boolean;
    varianceThreshold:  number;   // values above → green; below → red

    // ── Labels & Layout ───────────────────────────────────────────────
    showCategoryLabel:  boolean;
    showActualValue:    boolean;
    showTargetValue:    boolean;
    fontSize:           number;
    fontFamily:         string;
    labelWidthPct:      number;   // % of viewport width for category column (5-40)
    rightPanelWidthPct: number;   // % of viewport width for values/variance column (10-45)
    rightPanelWidthSet: boolean;  // true si el usuario lo fijó (si no, el ancho se calcula del texto)

    // ── Axis / Scale ──────────────────────────────────────────────────
    showAxis:           boolean;
    showAxisTitle:      boolean;  // 1.6: título del eje de escala
    axisTitle:          string;   // vacío = nombre de la medida Actual
    showGridlines:      boolean;  // 1.6: líneas de cuadrícula del eje (antes siempre)

    // ── Sort (1.6) ────────────────────────────────────────────────────
    sortBy:             "none" | "actual" | "target" | "variance" | "variancePct" | "category";
    sortDescending:     boolean;

    // ── Legend ────────────────────────────────────────────────────────
    showLegend:         boolean;
    legendPosition:     "top" | "bottom";
    legendFontSize:     number;
    legendFontFamily:   string;
    legendColor:        string;
    template:           string;
    guide:              boolean;

    // ── Reference Lines ───────────────────────────────────────────────
    refLine1Show:       boolean;
    refLine1Value:      number;
    refLine1Label:      string;
    refLine1Color:      string;
    refLine2Show:       boolean;
    refLine2Value:      number;
    refLine2Label:      string;
    refLine2Color:      string;

    // ── Trellis / Small Multiples (Pro) ───────────────────────────────
    trellisEnabled:     boolean;
    trellisColumns:     number;
    trellisSyncScale:   boolean;
    trellisShowTitle:   boolean;
    trellisPanelColor:  string;
    trellisBorderColor: string;
    trellisTitleColor: string;
    trellisGap:         number;   // 1.6: las 9 opciones comunes de small multiples
    trellisTitleSize:   number;
    trellisTitleBold:   boolean;
    trellisTitleAlign:  "left" | "center";
    trellisBorder:      boolean;

    // ── Accessibility (1.6) ───────────────────────────────────────────
    hcMode:             "auto" | "on";
    focusColor:         string;
    focusWidth:         number;
    minTextSize:        number;
}

export function getDefaultSettings(): BulletSettings {
    return {
        orientation:        "horizontal",
        ibcsMode:           false,

        actualColor:        "#2196F3",
        targetColor:        "#212121",
        target2Color:       "#6D6D6D",
        forecastColor:      "#FF9800",
        positiveColor:      "#4CAF50",
        negativeColor:      "#F44336",
        band1Color:         "#E0E0E0",
        band2Color:         "#C8C8C8",
        band3Color:         "#B0B0B0",

        showBands:          true,
        band1Pct:           60,
        band2Pct:           80,

        showVariance:       true,
        showVariancePct:    true,
        varianceThreshold:  0,

        showCategoryLabel:  true,
        showActualValue:    true,
        showTargetValue:    false,
        fontSize:           11,
        fontFamily:         "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif",
        labelWidthPct:      22,
        rightPanelWidthPct: 34,
        rightPanelWidthSet: false,

        showAxis:           true,
        showAxisTitle:      false,
        axisTitle:          "",
        showGridlines:      true,

        sortBy:             "none",
        sortDescending:     true,

        showLegend:         true,
        legendPosition:     "bottom",
        legendFontSize:     10,
        legendFontFamily:   "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif",
        legendColor:        "#333333",
        template:           "clean",   // Report theme
        guide:              true,

        refLine1Show:       false,
        refLine1Value:      0,
        refLine1Label:      "",
        refLine1Color:      "#E53935",
        refLine2Show:       false,
        refLine2Value:      0,
        refLine2Label:      "",
        refLine2Color:      "#FB8C00",

        trellisEnabled:     true,    // con licencia, poner un campo en Small Multiples By ya divide
        trellisColumns:     2,
        trellisSyncScale:   true,
        trellisShowTitle:   true,
        trellisPanelColor:  "#FAFAFA",
        trellisBorderColor: "#E0E0E0",
        trellisTitleColor: "#333333",
        // Valores de la 1.5 como defecto, para que los informes guardados no cambien de aspecto.
        trellisGap:         10,
        trellisTitleSize:   12,
        trellisTitleBold:   true,
        trellisTitleAlign:  "center",
        trellisBorder:      true,

        hcMode:             "auto",
        focusColor:         "#1A73E8",
        focusWidth:         2,
        minTextSize:        6,
    };
}
