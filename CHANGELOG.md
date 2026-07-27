# Changelog — Bullet Chart Pro

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows `MAJOR.MINOR.PATCH.BUILD`.

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
