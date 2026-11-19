# AppSource listing copy — Bullet Chart Pro v1.6.0.0

Copy ready to paste into Partner Center, English only. **The marketplace description is the
documentation most people read** — update it on every release.

Limits measured in Partner Center: *Search results summary* 100 characters, *Description*
5,000 (truncated silently), 3 keywords. **Editing this file does not change the offer**: the
fields Microsoft reviews live only in the console. For 1.6.0.0 the description changes (collection
styles instead of the 1.5 templates, no IBCS mode, sort, accessibility, fx on the target), so the
description below has to be pasted by hand in Partner Center → Offer listing, and the
certification notes (`docs/CERTIFICATION-NOTES-SHORT.txt`) again in the submission. Summary and
keywords are unchanged.

Video field (Offer listing → Videos), canonical form only:
`https://www.youtube.com/watch?v=PdmOWIAKYho`

---

## Offer name

```
Bullet Chart Pro
```

---

## Search results summary

```
Actual vs target on one line in Power BI: variance and % calculated for you, no DAX, bands.
```

---

## Keywords (3)

```
budget vs actual
bullet chart
KPI target
```

- `budget vs actual` — the problem: someone with a review meeting who has to show each line
  against its budget. Highest intent of the three.
- `bullet chart` — the name of the chart. Power BI has no native bullet chart, so whoever types
  it already knows what they want and is choosing which one to install.
- `KPI target` — the operational side: KPIs measured against a goal, where per-row thresholds
  (bands from measures) are the Pro argument.

Discarded: `variance` (too generic, matches finance and statistics), `small multiples` (a
feature, not a problem). The former IBCS style no longer exists (1.6), so that keyword is out
for good.

---

## Description

```
A number next to its target does not tell you whether it is good. 92 against 100 is a crisis in one KPI and a great month in another. A table makes the reader do the subtraction, a gauge spends half a page on one value, and a clustered bar chart puts actual and target side by side without ever saying how far apart they are.

Bullet Chart Pro puts each actual against its target on one line: the bar is the actual, the marker is the target, the bands behind say how far from good the value is, and the variance — amount and percentage — is calculated by the visual, coloured green or red. No DAX measure for the variance. One row per region, product or team, so twenty of them fit where a single gauge used to sit.

ACTUAL AGAINST TARGET, AT A GLANCE
• Automatic variance: Actual minus Target and the % of the target, with ▲ ▼ and your own green/red threshold
• Qualitative bands (poor, fair, good) as percentages of the data maximum
• Sort by actual, target, variance, variance % or name — the worst misses at the top in one click
• Seven styles shared with the TCViz collection: Report theme, Boardroom, Ledger, Editorial, Signal, Aurora and Terrace
• Conditional formatting (fx) on the bar and on the target marker, a colour per category, two reference lines
• Dynamic format strings: each row uses the dynamic format of its measure, in the report language
• Axis titles, gridlines, rows that fit the visual or a fixed row height, and bar thickness
• Small tiles stay readable: the values column keeps what fits for every row, and the tooltip always has the full figures
• Cross-filtering, bookmarks, Drilldown and Report page tooltips
• On-object formatting: click the bar, the target, the bands, the axis or the legend and format it on the canvas
• A setup guide inside the visual while you edit, in 12 languages

ACCESSIBILITY
• Keyboard: arrows move between bars, Enter selects, Esc clears, with a focus ring whose colour and width you set
• Screen readers read each row in full: category, actual, target and variance
• High contrast: follows the Windows theme, or force it On (black on white) without it
• Minimum text size: no text of the visual is drawn smaller than the size you choose

PRO
• Bands from measures: each row draws its own thresholds, calculated in DAX — 90% of its target, a value from a thresholds table, whatever the business defines
• Second target: a stretch goal or last year as a hollow marker, with its own variance in the tooltip
• Small multiples: one panel per region or year, with a shared or independent scale, automatic columns and the panel options of the TCViz collection
• Forecast marker for the expected end-of-period value
• Vertical bars, for months or long category names

Try them on your own data first: while you edit a report without a licence, a Pro feature is drawn working under a "Pro preview" watermark that names it, and Power BI shows its own purchase notice. You see your bullets with per-row bands, not a screenshot of someone else's. In reading view the free chart is shown.

FREE AND PRO
The free version is a complete and correct bullet chart: actual, target, variance and percentage bands for every row, with every style, sort, accessibility and format option above. Nothing in it is a demo or a truncated result. Pro adds the readings for more demanding reports: thresholds that differ per row, a second goal, panels and forecast.

PRIVACY
The visual makes no network calls, has no telemetry, sets no cookies and stores nothing outside your report: it declares no web access to Power BI, so it could not send your data anywhere even by mistake. The links on the start screen open only when you click them, through Power BI.

GETTING STARTED
1. Drag regions, products or teams into Category.
2. Drag the measure you track into Actual and your budget or plan into Target.
3. Follow the setup guide on the chart to try the Pro features on your data and pick a style.

Documentation, field reference and FAQ: https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/support.html
Support: support@tcviz.com — every message is answered by a person.

WHAT'S NEW IN 1.6.0.0
• Seven collection styles, all free; reports saved with the 1.5 templates open with the closest one
• Sort card: actual, target, variance, variance % or category name
• Accessibility card: high contrast On, focus colour and width, minimum text size
• Conditional formatting (fx) on the target marker
• Rows that fit the visual or a fixed row height, bar thickness, gridlines and axis title
• Reference line labels in their own strip above the rows
• Small multiples: automatic columns, spacing, title size, colour, bold and alignment, panel border
```
