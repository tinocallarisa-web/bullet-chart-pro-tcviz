# Bullet Chart Pro — Certification notes

> The short version that fits Partner Center's 2,500-character field is
> [`CERTIFICATION-NOTES-SHORT.txt`](CERTIFICATION-NOTES-SHORT.txt). That field is cleared on
> every resubmission, so it has to be pasted again each time. This file is the full reference
> and is reachable from the `certification` branch.

| | |
|---|---|
| Visual | Bullet Chart Pro |
| Version | 1.4.0.0 |
| GUID | `bulletChartProTCViz20260001` |
| Plan ID | `bullet-chart-pro-tcviz` |
| Repository | https://github.com/tinocallarisa-web/bullet-chart-pro-tcviz — branch `certification` |
| Pages | https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/ |
| Video | https://www.youtube.com/watch?v=bDW7qly8Mdo |

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

**Free** — actual vs target with automatic variance, qualitative bands, IBCS mode, horizontal
orientation, two reference lines, a colour per category, conditional formatting on the bar,
tooltips, drilldown, cross-filtering, bookmarks, keyboard navigation, high contrast.

**Pro** — Small Multiples, the Forecast marker, vertical orientation.

## Privacy and network

No network calls of any kind: no `fetch`, no `XMLHttpRequest`, no WebSocket, no telemetry, no
cookies, no external fonts or CDNs. `privileges` is `[]`. Nothing is persisted outside the
report. The DOM is built with `createElement` and `textContent`; there is no `innerHTML` and no
dynamic code evaluation. Verified with `pbiviz package --certification-audit`, which reports no
unsafe calls.

## Accessibility

Keyboard: arrows move the focus ring across bars, Enter selects, Escape clears, and the focus
ring is restored after a re-render. High contrast is honoured through `host.colorPalette`
(`isHighContrast`), including the panel title colour. Rendering events are raised on every exit
path of `update()`, including early returns.

## Known gap

The format pane still uses `enumerateObjectInstances`. `pbiviz` flags
`getFormattingModel` as *required soon* (severity: deprecation). The migration touches all 9
objects and 40 properties at once, so it is planned as its own release rather than bundled
with a licensing change.
