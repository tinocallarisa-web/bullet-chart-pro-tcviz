# AppSource listing copy — Bullet Chart Pro v1.5.0.0

Copy ready to paste into Partner Center, English only. **The marketplace description is the
documentation most people read** — update it on every release.

Limits measured in Partner Center: *Search results summary* 100 characters, *Description*
5,000 (truncated silently), 3 keywords. **Editing this file does not change the offer**: the
fields Microsoft reviews live only in the console. For 1.5.0.0 the description changes (new Pro
features, guide, templates, languages), so the summary, description and keywords below have to
be pasted by hand in Partner Center → Offer listing, and the certification notes
(`docs/CERTIFICATION-NOTES-SHORT.txt`) again in the submission.

Video field (Offer listing → Videos), canonical form only:
`https://www.youtube.com/watch?v=bDW7qly8Mdo`

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

Discarded: `variance` (too generic, matches finance and statistics), `IBCS` (the visual has an
IBCS *style*, not compliance; it would attract buyers who expect a full notation toolkit),
`small multiples` (a feature, not a problem).

---

## Description

```
A number next to its target does not tell you whether it is good. 92 against 100 is a crisis in one KPI and a great month in another. A table makes the reader do the subtraction, a gauge spends half a page on one value, and a clustered bar chart puts actual and target side by side without ever saying how far apart they are.

Bullet Chart Pro puts each actual against its target on one line: the bar is the actual, the marker is the target, the grey bands behind say how far from good the value is, and the variance — amount and percentage — is calculated by the visual, coloured green or red. No DAX measure for the variance. One row per region, product or team, so twenty of them fit where a single gauge used to sit.

ACTUAL AGAINST TARGET, AT A GLANCE
• Automatic variance: Actual minus Target and the % of the target, with ▲ ▼ and your own green/red threshold
• Qualitative bands (poor, fair, good) as percentages of the data maximum
• Number formats from your model, including dynamic format strings and calculation groups, in the report language
• Six style templates: Clean, Minimal, Contrast, Soft, Compact and an IBCS-inspired monochrome style
• Two reference lines, a colour per category and conditional formatting (fx) on the bar colour
• Small tiles stay readable: the values column keeps what fits for every row, and the tooltip always has the full figures
• Cross-filtering, bookmarks, drill-down, keyboard navigation, full row reading for screen readers and high contrast
• On-object formatting: click the bar, the target, the bands or the legend and format it on the canvas
• A setup guide inside the visual while you edit, in 12 languages

PRO
• Bands from measures: each row draws its own thresholds, calculated in DAX — 90% of its target, a value from a thresholds table, whatever the business defines
• Second target: a stretch goal or last year as a hollow marker, with its own variance in the tooltip
• Small multiples: one panel per region or year, with a shared or independent scale
• Forecast marker for the expected end-of-period value
• Vertical bars, for months or long category names

Try them on your own data first: while you edit a report without a licence, a Pro feature is drawn working under a "Pro preview" watermark, and Power BI names it with its own purchase notice. You see your bullets with per-row bands, not a screenshot of someone else's. In reading view the free chart is shown.

FREE AND PRO
The free version is a complete and correct bullet chart: actual, target, variance and percentage bands for every row, with every interaction and format option above. Nothing in it is a demo or a truncated result. Pro adds the readings for more demanding reports: thresholds that differ per row, a second goal, panels and forecast.

PRIVACY
The visual makes no network calls, has no telemetry, sets no cookies and stores nothing outside your report: it declares no web access to Power BI, so it could not send your data anywhere even by mistake. The links on the start screen open only when you click them, through Power BI.

GETTING STARTED
1. Drag regions, products or teams into Category.
2. Drag the measure you track into Actual and your budget or plan into Target.
3. Follow the setup guide on the chart to try the Pro features on your data and pick a style.

Documentation, field reference and FAQ: https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/support.html
Support: support@tcviz.com — answered by the developer.

WHAT'S NEW IN 1.5.0.0
• Pro: bands from measures and a second target
• Setup guide inside the visual and six style templates
• On-object formatting and a legend with its own font, size and colour
• 12 languages: English, Spanish, Portuguese (Brazil and Portugal), French, German, Italian, Dutch, Polish, Japanese, Chinese (Simplified) and Korean
• Model number formats, including dynamic format strings, in the report language
• Clicking a bar dims the others, also when restored by a bookmark
• Fixes for vertical bars, small multiples, small tiles and the values panel width
```
