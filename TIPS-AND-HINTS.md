# Bullet Chart Pro — Tips & Hints (v1.3.0.0)

## Getting started

1. Drag a category (region, product, KPI name) into **Category**.
2. Drag your measure into **Actual (Real)**. The bullets render straight away.
3. Drag the goal into **Target**. Variance — absolute and % — is calculated by the visual. No DAX.
4. Qualitative bands (poor / OK / good) are on by default. Set their thresholds in **Format → Qualitative Bands**.

## Field wells

| Well | Type | What it does |
|---|---|---|
| Category | Grouping | One bullet per value. Supports hierarchies and drilldown. |
| Actual (Real) | Measure | The bar. Respects the measure's format string. |
| Target | Measure | Vertical marker; drives the variance label and colour. |
| Forecast [Pro] | Measure | Triangle marker for the expected end-of-period value. |
| Small Multiples By [Pro] | Grouping | One panel per value of this field. |
| Tooltips | Measure | Up to 10 extra measures in the tooltip. |

## Free vs Pro

- **Free:** actual vs target with automatic variance, qualitative bands, IBCS mode, horizontal orientation, two reference lines, a colour per category, tooltips, drilldown, cross-filtering, bookmarks, keyboard navigation, high contrast.
- **Pro:** Small Multiples, the Forecast marker and vertical orientation.
- Without a licence, using a Pro feature leaves the chart as it is and Power BI shows its own notice with the option to buy.

## Format pane — quick reference

| Card | Settings |
|---|---|
| General | Orientation (Vertical is Pro), IBCS mode |
| Colors | Actual, target, forecast, positive / negative variance, three band colours, one colour per category |
| Qualitative Bands | Show, band 1 and band 2 thresholds (% of the data maximum) |
| Variance | Show label, show %, green / red threshold |
| Labels | Category, actual value, target value, font size and family |
| Layout | Category column width %, values panel width %, scale axis |
| Legend | Show, top or bottom |
| Reference Lines | Two lines: show, value, label, colour |
| Small Multiples [Pro] | Enable, columns, synced scale, panel titles, panel background and border |

## Tips & best practices

- **Variance threshold:** set it to 0 for a plain above/below target colour, or to a tolerance (e.g. -5) to only flag real misses.
- **Bands** are a percentage of the largest value in the data, not of the target. Use them for "how good is this", and the target marker for "did we hit it".
- **IBCS mode** replaces your colours with the standard monochrome palette — switch it on for finance packs that follow IBCS.
- **Reference lines** work well for a company-wide benchmark or last year's average; in Small Multiples they appear in every panel.
- **Small Multiples:** use **Sync scale** on to compare magnitudes across panels, off to compare shapes within each panel. Two or three columns read best.
- **Negative values** switch the scale to bipolar automatically, with a zero baseline.
- **Keyboard:** click the visual, then arrow keys move between bars, Enter selects, Escape clears.

## Troubleshooting

- **The values on the right disappeared** — the visual is too narrow. The bar always keeps at least 40% of the width, so the values column hides first. Widen the visual or reduce *Category column width %*.
- **Small Multiples By does nothing** — Small Multiples is a Pro feature; without a licence Power BI shows its notice. With a licence, check *Enable small multiples* is on.
- **No forecast triangle** — Forecast is Pro. With a licence, check the Forecast field is not blank for that category.
- **Vertical orientation shows horizontal bars** — vertical is Pro.
- **Only part of the categories** — the visual receives up to 2,000 categories. Filter or aggregate larger lists.
- **Panels scroll instead of fitting** — each panel needs room for its rows; on a short visual the chart scrolls rather than overlapping. Make the visual taller or use fewer categories per panel.
