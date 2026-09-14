# Changelog — Bullet Chart Pro

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows `MAJOR.MINOR.PATCH.BUILD`.

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
