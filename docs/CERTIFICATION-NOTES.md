# Bullet Chart Pro — Certification notes

> The short version that fits Partner Center's 2,500-character field is
> [`CERTIFICATION-NOTES-SHORT.txt`](CERTIFICATION-NOTES-SHORT.txt). That field is cleared on
> every resubmission, so it has to be pasted again each time. This file is the full reference
> and is reachable from the `certification` branch.

| | |
|---|---|
| Visual | Bullet Chart Pro |
| Version | 1.6.0.0 |
| GUID | `bulletChartProTCViz20260001` |
| Plan ID | `bullet-chart-pro-tcviz` |
| Repository | https://github.com/tinocallarisa-web/bullet-chart-pro-tcviz — branch `certification` |
| Pages | https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/ |
| Video | https://www.youtube.com/watch?v=PdmOWIAKYho |

## What changed in 1.6.0.0

**Collection styles.** The `style.template` enumeration now offers the seven styles of the
TCViz collection: *Report theme* (`clean`, default: colours and text follow the report theme),
Boardroom, Ledger, Editorial, Signal, Aurora and Terrace. All free. A style only fills what the
user has not set (saved `metadata.objects` always win). Picking one removes, with a single
`persistProperties({ remove })`, the colours any style defines, so switching back to Report theme
also clears the previous style's colours. Saved 1.5 template values are read, never rewritten:
Clean/Minimal/Soft/Compact → Report theme (Minimal keeps the axis off, Compact its 9/8 px
sizes), Contrast → Boardroom, IBCS style → Signal.

**IBCS Mode switch removed** from the General card (the property stays readable for saved
reports: on, with no template chosen, it opens in Signal).

**Conditional formatting (fx)** on `colors.actualColor` and, new, `colors.targetColor`: wildcard
selector, `altConstantSelector: null` (the fixed colour is stored once for the visual) and
`ConstantOrRule`. The rule is evaluated per category.

**New cards.** *Sort* (Data order — Power BI *Sort axis* still applies —, Actual, Target,
Variance, Variance %, Category name; Descending; blanks last; per panel in small multiples).
*Accessibility* (High contrast Automatic/On, Focus color, Focus width, Minimum text size [6]).

**Layout and axis** (former Layout card): row height *Fit to visual* (default; before 1.6 rows
were capped at 72 px) or *Fixed* (16–200 px, scrolls if needed), bar thickness % of row [44],
gridlines [On], axis title [Off] and its text. Reference line labels have their own strip.

**Small multiples [Pro]:** the nine common options of the collection (columns with 0 =
automatic, spacing, title size/colour/bold/alignment, panel background, border on/off, border
colour). Defaults keep the 1.5 look.

**Pro preview watermark** is the common TCViz piece (`src/comun/watermark.ts`, `textContent`
only): "Pro preview" plus the names of the Pro features in use, centred, never over the data.

**On-object:** axis toggles for scale axis, gridlines and axis title; panel border on the
small-multiple titles. New texts in the 12 languages. Free/Pro split unchanged.

## What changed in 1.5.0.0

**Format pane on `getFormattingModel`.** The known gap of 1.4 is closed: the pane is built with
`powerbi-visuals-utils-formattingmodel` (`src/formatting.ts`). Object and property names are
unchanged from `capabilities.json`, so saved reports keep their settings. The *fx* entry on
*Actual bar* keeps a wildcard selector, `altConstantSelector: null` and `ConstantOrRule`.

**New Pro features.** Data roles `target2` (*Second target [Pro]*: hollow marker, legend,
tooltip with its own variance) and `band1Limit`, `band2Limit`, `bandMax` (*Band 1 limit /
Band 2 limit / Band maximum [Pro]*: per-row bands from DAX measures). Without a licence these
columns are not read (`readExtraCols`), the bands fall back to percentages as in Free, and the
Pro preview / purchase notice apply as for the other Pro features. New colour
`colors.target2Color`.

**Setup guide and style templates.** New object `style` (`template`, `guide`). The guide is an
HTML overlay shown only while editing, with data, when interactions are allowed and in tiles of
at least 360 x 220 px. Six templates (replaced by the collection styles in 1.6).

**`persistProperties`** is called only (a) from a click in the guide (Try vertical, a template,
Finish / X) and (b) once when the template value changes while editing, to remove the saved
settings that template defines. It is never called from the selection callback or on report
open, so bookmarks are not affected.

**On-object formatting** (`supportsOnObjectFormatting`, `enablePointerEventsFormatMode`) with
`powerbi-visuals-utils-onobjectutils`: bar, target, second target, forecast, bands, labels,
variance, legend, axis, reference lines and panel titles. In format mode clicks do not filter and
tooltips are not shown.

**Localization.** 12 `stringResources` (en-US, es-ES, pt-BR, pt-PT, fr-FR, de-DE, it-IT,
nl-NL, pl-PL, ja-JP, zh-CN, ko-KR). Runtime texts also travel in the bundle (`src/strings.ts`),
because Desktop only translates keys declared in capabilities.

**Number formats** through `powerbi-visuals-utils-formattingutils` with the report locale;
dynamic format strings are read per row via `general.formatString`.

**Selection and interactions.** The visual keeps its own selection, dims the other bars and
repaints from the `registerOnSelectCallback` ids (bookmarks). `allowInteractions` is read from
`host.hostCapabilities`.

**Rendering events 1:1.** One `renderingStarted` and one `renderingFinished` /
`renderingFailed` per `update()`. Repaints outside `update()` (licence resolved, selection,
guide steps) go through `redraw()` and raise no events.

**Start screen** in three sizes. Its links (support page, tcviz.com, YouTube) open only on a
click, through `host.launchUrl`.

**Fixes:** vertical font size and value axis, *Values panel width %* ignored, small multiples
overflowing, small tiles, the 1.4 package missing its stylesheet, full per-row screen reader
text. Tools 7.2.1, API 5.11.1.

## What changed in 1.4.0.0

**Conditional formatting on the bar colour.** `colors.actualColor` is emitted in its own
instance with `createDataViewWildcardSelector(InstancesAndTotals)`,
`altConstantValueSelector: null` and `propertyInstanceKind: ConstantOrRule`, which gives a
single *fx* entry for the whole series rather than one per category. Precedence: the rule
applies to every bar and a colour set by hand on a category overrides the rule for that
category. Free tier — the per-category colour pickers already were.

**Panel title colour** for Small Multiples. The title is drawn over the panel border colour,
which the user can change, while the title text had been hard-coded to `#333`; a dark border
made it unreadable with no way to fix it. In high contrast the title follows the theme
foreground.

**Purchase notice fixed.** `notifyLicenseRequired` and `notifyFeatureBlocked` were being
called back to back. Power BI shows one notification at a time and the later call replaces
the earlier, so the banner naming the blocked feature was never seen. The sequence is now:
`clearLicenseNotification()` → `notifyFeatureBlocked()` with the newly used features →
after ~10.5 s `notifyLicenseRequired(0)` for the persistent Upgrade bar.

**Pro preview.** See the section below — please read it before testing.

**Certification hygiene.** `npm audit` went from 19 findings (9 high) to 0, using
`overrides` for `uuid`; `npm audit fix --force` was rejected because it downgrades
`powerbi-visuals-tools` to 1.7.2. ESLint was not wired up at all: `eslint-plugin-powerbi-visuals`,
`eslint.config.mjs` and the `eslint` script were added, and it returns no errors. Localization
was declared but dead — `stringResources` was `{}` and no entry carried a `displayNameKey`
even though 57 strings existed; all 55 entries are now linked and the visual calls
`createLocalizationManager()`.

**New brand icon** (`assets/icon.png`, 36×36), part of a portfolio-wide icon system.

## Pro preview — why Pro features render without a licence

Without a licence, **in edit mode only**, Pro features render working under a *Pro preview*
watermark. Microsoft's publishing guidelines allow watermarking paid features, and the intent
is that the report author can see what they would get before paying.

The four conditions, all required:

```ts
proPreview = !isPro && editing && licenseResolved && licenseEnvSupported && licenseInfoAvailable
```

- `editing` is `viewMode !== 0`. A report in reading view never uses a Pro feature.
- `licenseResolved` — the licence is requested after the first render so it never blocks
  rendering; until it answers, the free result is drawn.
- `licenseEnvSupported` / `licenseInfoAvailable` — in Publish to Web, embedding and export the
  licence cannot be read, and a paying customer would look like Free there. No watermark and
  no purchase prompt in those environments.

The watermark is `aria-hidden`, does not intercept pointer events, and its size follows the
visual width.

## Licensing

`IVisualLicenseManager` only, four methods: `getAvailableServicePlans`, `notifyFeatureBlocked`,
`notifyLicenseRequired`, `clearLicenseNotification`. Pro is granted when a returned plan's
`spIdentifier` — the full Service ID, `publisher.offer.plan` — ends in
`.bullet-chart-pro-tcviz` and its state is `Active` (1) or `Warning` (2); Warning is the
payment grace period, where the customer has paid and keeps Pro.

Resolution is asynchronous and never on the render path. Any failure leaves the visual on
Free **without** prompting, because an unreadable licence does not mean the user has not paid.
The visual draws no licensing UI of its own.

## Free vs Pro

**Free** — actual vs target with automatic variance, qualitative bands (percentages), the seven
collection styles, sorting, the Accessibility card, horizontal orientation, two reference lines,
a colour per category, conditional formatting on the bar and the target, axis title, gridlines,
row height, legend, tooltips, drilldown, cross-filtering, bookmarks, keyboard navigation, high
contrast, on-object formatting, setup guide, 12 languages.

**Pro** — Small Multiples, the Forecast marker, vertical orientation, a second target and
bands from measures.

## Privacy and network

No network calls of any kind: no `fetch`, no `XMLHttpRequest`, no WebSocket, no telemetry, no
cookies, no external fonts or CDNs. `privileges` is `[]`. Nothing is persisted outside the
report. The DOM is built with `createElement` and `textContent`; there is no `innerHTML` and no
dynamic code evaluation. Verified with `pbiviz package --certification-audit`, which reports no
unsafe calls.

## Accessibility

Keyboard: arrows move the focus ring across bars, Enter selects, Escape clears, and the focus
ring is restored after a re-render. High contrast is honoured through `host.colorPalette`
(`isHighContrast`), including the panel title colour, or forced with Format → Accessibility →
High contrast = On. Focus colour/width and a minimum text size are user settings (1.6). Rendering events are raised on every exit
path of `update()`, including early returns.

## Known gap

None open. The `enumerateObjectInstances` gap listed for 1.4.0.0 was closed in 1.5.0.0
(`getFormattingModel`).
