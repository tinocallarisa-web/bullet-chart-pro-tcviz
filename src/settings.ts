"use strict";

export interface BulletSettings {
    // ── General ──────────────────────────────────────────────────────
    orientation:        "horizontal" | "vertical";
    ibcsMode:           boolean;

    // ── Colors ───────────────────────────────────────────────────────
    actualColor:        string;
    targetColor:        string;
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

    // ── Trellis / Small Multiples (Pro) ───────────────────────────────
    trellisEnabled:     boolean;
    trellisColumns:     number;
    trellisSyncScale:   boolean;
    trellisShowTitle:   boolean;
}

export function getDefaultSettings(): BulletSettings {
    return {
        orientation:        "horizontal",
        ibcsMode:           false,

        actualColor:        "#2196F3",
        targetColor:        "#212121",
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

        trellisEnabled:     false,
        trellisColumns:     2,
        trellisSyncScale:   true,
        trellisShowTitle:   true,
    };
}
