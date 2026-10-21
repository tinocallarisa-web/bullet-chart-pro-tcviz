# Changelog — Bullet Chart Pro

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows `MAJOR.MINOR.PATCH.BUILD`.

---

## [1.5.0.0] — 2026-10

### Added
- **Second target [Pro].** New *Second target [Pro]* field well: a hollow marker next to the
  main target, for a stretch goal, last year or a forecast commitment. It appears in the legend
  and in the tooltip with its own variance (*Variance vs* followed by the measure name, absolute and %).
  Colour in Format → Colors → *Second target marker (Pro)*.
- **Bands from measures [Pro].** New *Band 1 limit [Pro]*, *Band 2 limit [Pro]* and
  *Band maximum [Pro]* wells: each row draws its own qualitative bands from thresholds you
  calculate in DAX (e.g. `SUM(T[Target]) * 0.9`). The limits are listed in the tooltip. Without
  these fields the bands are percentages of the data maximum, exactly as in Free.
- **Setup guide inside the visual** (edit mode only; not shown in tiles smaller than 360×220 px).
  Step 1 checks the fields, step 2 lets you try Pro on your own data (a *Try* button for vertical
  bars; for the rest it names the well to use and ticks it once filled), step 3 picks a style.
  Close it with ✕ or *Finish*; reopen it in Format → Style template → *Setup guide*.
- **Style templates.** Format → Style template → *Template*: Clean (the usual look), Minimal,
  Contrast, Soft, Compact and IBCS style. Picking one replaces the settings that template
  defines; everything else stays as you set it. *IBCS style* is a monochrome style inspired by
  IBCS notation, not a claim of compliance with the standard.
- **New start screen** in three sizes, with links to the guide, the product page on tcviz.com
  and the video. Links open only when clicked, through Power BI (`host.launchUrl`).
- **On-object formatting.** Bar, target, second target, forecast, bands, labels, variance,
  legend, axis, reference lines and panel titles can be selected on the canvas and formatted
  from the on-object menu, with shortcuts to their card. In Desktop the first click selects the
  visual and the second selects the element.
- **Legend font, size and colour** of its own (Format → Legend).
- **12 languages:** English, Spanish, Portuguese (Brazil), Portuguese (Portugal), French,
  German, Italian, Dutch, Polish, Japanese, Chinese (Simplified) and Korean — format pane and
  the visual's own texts. Previously English only.

### Changed
- **Number formats** come from the model, including **dynamic format strings**, and are
  rendered in the report language (decimal and thousands separators). The variance % follows
  the report language too.
- **Selection:** clicking a bar dims the others, also when the selection is restored by a
  bookmark. Ctrl+click adds or removes bars.
- **Format pane migrated to `getFormattingModel`**, with the same objects and properties: saved
  reports keep their settings.
- Free/Pro: Pro is small multiples, forecast, vertical orientation, second target and bands
  from measures. Everything else is free. The watermarked Pro preview (edit mode only) works as
  in 1.4.

### Fixed
- **Vertical:** the font size was capped at 10/11 px and the value axis was drawn outside the
  canvas.
- ***Values panel width %* was ignored.** It is now applied when you set it; otherwise the
  width is still calculated from the text. In vertical orientation the two width settings are
  not offered.
- **Small multiples overflowed the visual.** Rows shrink down to 16 px so the panels fit, and
  the legend stays visible.
- **Small tiles:** the values column decides once for the whole column what fits (value,
  variance %, full variance, target), long category names end in “…”, axis labels no longer
  overlap and the legend fits. Whatever is dropped is still in the tooltip.
- **Interactions turned off by Power BI are respected**: clicks and keys no longer select or
  filter when the host disallows them (`allowInteractions` is now read from `hostCapabilities`;
  the old `host.allowInteractions` was almost always undefined).
- **Rendering events 1:1:** exactly one `renderingStarted` and one `renderingFinished` /
  `renderingFailed` per `update()`; internal repaints raise none.
- The 1.4 package did not include the stylesheet.
- **Screen readers** read each row in full: category, actual, target, variance and second
  target, with their formats.

---

## [1.4.0.0] — 2026-09-20

### Added
- **Conditional formatting on the bar colour.** Format pane → Colors → *Actual bar* now has
  the *fx* button: the bar colour can be driven by a rule over the Actual measure instead of
  picking a colour per category. The rule is defined once for the whole series (one *fx*, not
  one per category) and applies to every bar; a colour set by hand on a category overrides the
  rule for that category, so the general rule and the exceptions coexist. The per-category
  pickers keep working exactly as before. Free tier.
- **Panel title colour** for Small Multiples. The title is drawn on top of the panel border
  colour, which the user can already change, while the title text was hard-coded to `#333`:
  a dark border made the title unreadable with no way to fix it. In high contrast the title
  now follows the theme foreground.

## [1.3.2.0] — 2026-09-20

### Added
- **Pro preview while editing.** Without a licence, in edit mode, the Pro features
  (Small Multiples, the Forecast marker and vertical orientation) now render working under a
  "Pro preview" watermark, as Microsoft's publishing guidelines allow for paid features.
  In reading view, before the licence resolves, or where Power BI cannot check licences
  (Publish to Web, embedding, export), the free result is shown with no watermark.
- `build-test.js --free` already existed; it is the only mode that shows the preview,
  the watermark and the purchase notices.

### Certification
- `npm audit`: **0 vulnerabilities** (was 9 high + 10 moderate). Fixed with `npm audit fix`
  plus an `overrides` entry pinning `uuid` to ^11.1.1 — `npm audit fix --force` would have
  downgraded `powerbi-visuals-tools` to 1.7.2.
- **ESLint wired up as certification requires**: `eslint-plugin-powerbi-visuals` installed,
  `eslint.config.mjs` added, and the `"eslint": "npx eslint . --ext .js,.jsx,.ts,.tsx"`
  script. Returns no errors.
- **Localization now actually works.** `stringResources` was declared as `{}` and no entry
  carried a `displayNameKey`, so the 57 strings already written in `resources.resjson` were
  dead weight. All 55 entries (6 data roles, 9 objects, 40 properties) now carry their key,
  the resource file is declared, and the visual calls `createLocalizationManager()` for its
  runtime notice text.
- `pbiviz package --certification-audit` reports no unsafe `fetch`, `XMLHttpRequest` or
  `eval` calls.

### Fixed
- **Only one purchase notice reached the user.** `notifyLicenseRequired` and
  `notifyFeatureBlocked` were called back to back, and Power BI shows a single notification
  at a time, so the second replaced the first. The previous notice is now cleared first, the
  banner names only the newly activated features, and the persistent Upgrade bar follows once
  the banner ends (~10.5 s). Pattern verified in Risk Matrix Pro in the Power BI service.
- Turning a Pro feature off no longer re-triggers a banner.

---

## [1.3.1.0] — 2026-09-14

### Fixed
- **A paying customer could stay on Free.** `getAvailableServicePlans()` returns each plan's
  `spIdentifier` as the full Partner Center **Service ID** (`publisher.offer.plan`), as the licensing API
  documentation states. The visual compared it with the bare plan ID `bullet-chart-pro-tcviz`, which never
  matches the full Service ID. It now accepts a Service ID ending in `.bullet-chart-pro-tcviz`, and the bare
  plan ID as well.

---

## [1.3.0.0] — 2026-09-14

### Changed
- **Forecast marker is a Pro feature**, as the Terms of Use already stated. In 1.2.0.0 the marker was drawn
  for every user; it is now drawn — and included in tooltips, legend and scale — only with an active licence.
- **Vertical orientation is a Pro feature**, as the Terms of Use already stated. Without a licence the chart
  renders horizontally; the format pane keeps the chosen value and Power BI shows its licence notice.
- **Free users can see what Pro offers.** The *Small Multiples [Pro]* card is visible in the format pane for
  everyone. Previously it was hidden without a licence, so the only Pro feature could not be discovered.
- **Small Multiples split as soon as a field is added** to *Small Multiples By*. "Enable small multiples"
  now defaults to on; before, a licensed user had to find and switch it on or nothing happened.

### Added
- **Power BI's own purchase notifications.** When a Free user adds a field to *Small Multiples By* or
  *Forecast*, or switches small multiples on, the visual calls `notifyFeatureBlocked` and
  `notifyLicenseRequired`, which carry the purchase path. They fire only once the licence is resolved, and
  are cleared as soon as it resolves to Pro or the Pro fields are removed.
- `build-test.js` to produce test builds (`_test` Pro, `_testfree` Free) without editing the source by hand.

### Fixed
- **A licence in the `Warning` state was treated as Free.** Warning is the grace period of a failed payment;
  the customer has paid and now keeps Pro through it.
- **Publish to Web, embedding and export no longer ask anyone to buy.** `isLicenseUnsupportedEnv` and
  `isLicenseInfoAvailable` are honoured: where the licence cannot be read, the free experience renders
  without purchase prompts.
- **Bars disappeared when the visual was narrow.** The values column is sized in pixels from the longest
  label, so on a narrow visual the category and values columns took the whole width. The bar now keeps at
  least 40% of the width: the values column shrinks first, then hides, then the category column shrinks.
- **Small Multiples panels overlapped each other and the legend** when the visual was short. Panel height
  came only from dividing the viewport, while rows never go below 28 px. Each panel is now at least as tall
  as its rows (the visual scrolls instead), and panels narrower than 220 px reduce the column count.
- **Removed `supportsOnObjectFormatting`** from capabilities: it was declared but not implemented.

### Documentation
- Corrected the 1.2.0.0 entry below: per-category bar colour is a colour picker per category, not
  rule-based (fx) conditional formatting, and `supportsConditionalFormatting` / `supportsBookmarkActions`
  were never declared in `capabilities.json` (neither is a valid capability flag).

---

## [1.2.0.0] — 2026-07-27

### Added
- **Small Multiples / Trellis** (Pro): split any field into side-by-side panels with independent or synchronized scales
- **Reference Lines**: up to 2 configurable vertical reference lines with custom labels and colors
- **Negative value support**: bipolar scale with automatic zero-baseline when data contains negative values
- **Keyboard navigation**: Arrow keys cycle through bars; Enter selects; Escape clears — full `supportsKeyboardFocus` compliance
- **High Contrast mode**: all colors derived from `host.colorPalette` when HC is active (axis, legend, labels, bands)
- **Trellis panel colors**: configurable panel background and border colors
- **Conditional Formatting**: per-category `actualColor` override via the format pane "fx" button
- **Dynamic Format Strings**: actual, target and forecast values respect the measure's format string (supports Calculation Groups)
- **Bookmark support**: selection state is persisted and restored via `supportsBookmarkActions`
- **Report Tooltips**: canvas tooltip support declared in capabilities (`tooltips.supportedTypes.canvas: true`)
- **`supportsConditionalFormatting: true`** and **`supportsBookmarkActions: true`** declared in capabilities

### Improved
- Band thresholds now relative to data max (not padded domain) — bands align correctly with actual values
- Trellis panel title height increased for better readability
- Values column width auto-calculated from the longest formatted number — no manual tuning needed
- Legend correctly offsets trellis panels so it never overlaps content
- Reference lines propagate to all trellis panels in absolute SVG coordinates

### Fixed
- `checkLicense()` async no longer overrides `isPro` in test builds
- `drillLabel` only shown when user has actively drilled into a hierarchy (not on initial load)
- Trellis CF colors now propagate to all panels via canonical row index
- `actualColor` from "Recent colors" picker no longer renders as white (empty string guard)

---

## [1.1.0.0] — 2026-06-15

### Added
- **Tooltips**: standard Power BI tooltip service with actual, target, forecast and variance fields
- **Drilldown**: category role supports hierarchy drill-navigation (`drilldown.roles: ["category"]`)
- **Legend**: shows Actual, Target, Forecast and Bands items; positions top or bottom
- **Axis / Scale**: auto-scaled horizontal tick marks with formatted labels
- **Scroll**: vertical scroll indicator when categories overflow the viewport
- **Sorting**: `sorting.default` declared so Power BI's sort controls work natively
- **Target value label**: optional display of target value in the right panel
- **Font family**: exposed in format pane (was hardcoded previously)

### Fixed
- `showTargetValue` setting was dead code — wired to actual rendering
- `fontFamily` missing from format pane enumeration

---

## [1.0.0.0] — 2026-05-01

### Initial release
- Horizontal and vertical bullet chart orientations
- Actual vs Target comparison with automatic variance (no DAX required)
- Variance label: absolute value + percentage, color-coded green/red
- Qualitative performance bands (3 zones: poor / satisfactory / good)
- IBCS-compliant mode (monochrome palette)
- Conditional formatting per category for bar color
- `supportsHighlight`, `supportsSynchronizingFilterState`, `supportsLandingPage`, `supportsKeyboardFocus`, `supportsMultiVisualSelection` declared
- Rendering events: `renderingStarted / renderingFinished / renderingFailed`
- Free / Pro tier via `IVisualLicenseManager`
