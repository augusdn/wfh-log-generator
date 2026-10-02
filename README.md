# Australian WFH Log Generator v2

A static, client-only English web app that creates synthetic weekday work-log CSV files for Australian financial years.

Live site: https://augusdn.github.io/wfh-log-generator/

> **Synthetic planning data only.** Generated records are not verified employment, payroll, legal or tax evidence. Compare every entry with actual contemporaneous employment and tax records before any use or submission.

## Privacy model

- Form values, leave dates and generated CSV bytes stay in current-tab memory only.
- No backend, account, cookies, analytics, telemetry, persistence, local storage or session storage.
- No runtime network requests after the local static files load.
- Content Security Policy sets `connect-src 'none'`; scripts, styles and holiday data are local.
- The repository, source code and deployed URL are public. `noindex` and `robots.txt` reduce search discovery but do **not** make the site private.

Cloudflare Web Analytics was considered for aggregate page views, timing, country, device and referrer data. It remains disabled because no existing authorized Cloudflare session or native CLI authorization was available during the v2 rollout. No Google Analytics or fallback provider was added.

Do not enter personal information. The app needs only bounded configuration values and has no free-text CSV fields.

## Behavior

- Financial years use ATO-style labels: `2025–26` means 1 July 2025 through 30 June 2026, inclusive. The selector shows the full date range and supports only `2020–21` through `2035–36`; the internal value remains the numeric start year.
- Monday–Friday are candidates; weekends are always skipped.
- CSV columns remain exactly `Date, Day of Week, Start Time, End Time, Total Hours`.
- For each eligible WFH day independently, duration is selected uniformly at whole-minute precision between the inclusive minimum and maximum. Decimal-hour limits become that whole-minute range using `ceil(min × 60)` and `floor(max × 60)`.
- Start time is generated independently for each eligible day between the inclusive earliest and latest start times. Supplying an integer seed makes both generated sequences deterministic.
- `Total Hours` is minute duration divided by 60, rounded to two decimals with half-up semantics.
- A supplied integer seed is deterministic within this web app. The compact Mulberry32-based generator is intentionally not byte-identical to Python's Mersenne Twister.
- The bundled public-holiday range is `2020–21` through `2035–36`. Requests outside it fail closed.
- Included-date overrides accept only a bundled holiday for the selected state and financial year. Extra excluded dates support local or employer closures.

## Optional scoped holiday

The app has one optional scoped closure and does not invent any others:

- **NSW Bank Holiday (banks and certain financial institutions only)** — shown and enabled only when NSW is selected, off by default, and calculated as the first Monday in August within the selected financial year.

The NSW Government states that retail bank branches and certain financial institutions are required to close on the first Monday in August unless exempt, and that this Bank Holiday is **not a declared public holiday**. Source: https://www.nsw.gov.au/about-nsw/public-holidays

The implementation keeps optional closures in a scoped definition registry so another jurisdiction-specific closure can be added later only with an authoritative rule and source.

## Leave periods

- Add any number of Annual leave or Sick/personal leave ranges.
- Start and end dates must be valid, inside the selected financial year, and start must be on or before end.
- Overlapping and adjacent ranges are accepted. Work-date exclusion is de-duplicated.
- Weekends, bundled public holidays, selected scoped holidays, excluded weekdays and extra excluded dates are not counted again as leave-excluded work dates.
- Results report unique excluded work dates and per-type unique counts. If the same work date appears in both leave types, it is counted once in the overall total and once under each applicable type.
- Leave ranges never appear in CSV output and are discarded on reset, reload or tab close.

## Estimated WFH fixed-rate deduction

The result view, but never the CSV, shows `Estimated WFH fixed-rate deduction` using exact generated minutes divided by 60 and the verified ATO rate for the financial year's internal start year:

- `2020–21` and `2021–22`: 52 cents/hour
- `2022–23` and `2023–24`: 67 cents/hour
- `2024–25` and `2025–26`: 70 cents/hour
- `2026–27` and later: no amount until an official rate is published and verified

The estimate is rounded to currency cents. A deduction is not a refund or tax saving, and no marginal-rate or refund estimate is made. Eligibility requires additional running expenses, actual contemporaneous records of every WFH hour, and at least one record for each included expense. Expenses covered by the fixed rate cannot also be claimed separately. Records generally need to be retained for five years. Synthetic data must be verified and may not satisfy ATO requirements.

Official source, checked 2026-10-02: https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/working-from-home-expenses/fixed-rate-method

## Holiday dataset

`data/holidays.js` and `data/holidays.json` were generated from `python-holidays==0.105` with observed or substitute dates for ACT, NSW, NT, QLD, SA, TAS, VIC and WA. Dataset metadata records the version, UTC generation date and exact range. NSW Bank Holiday is deliberately filtered from the general public-holiday bundle.

The development-only generator is not shipped to or executed by the web app:

```sh
python3 -m venv .venv
.venv/bin/pip install 'holidays==0.105'
.venv/bin/python scripts/generate_holidays.py
```

The library may omit local, municipal, regional or show days and employer shutdown dates. Future proclamations or legislation may change dates after this snapshot. Verify the relevant government source and add exclusions where needed.

## Local use and tests

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173
```

```sh
npm ci
npm test
npx playwright install chromium webkit
npm run test:e2e
```

Browser coverage runs in desktop Chromium and mobile WebKit. It includes English rendering, no external requests, state-scoped NSW Bank Holiday behavior, public-holiday overrides, repeatable leave add/remove/reset and overlap de-duplication, strict validation, deterministic download bytes, CSV privacy, tax-rate and unpublished-rate states, keyboard operation, mobile bounds and screenshots.

The Node suite covers financial-year and date math, all subdivisions, representative and observed holidays, scoped closures, leave validation and de-duplication, exact minute and tax calculations, deterministic output, exact CSV bytes, English copy and static privacy controls.

## Deployment

The site deploys directly from the repository's default `main` branch and root folder on GitHub Pages. It intentionally has no Actions workflow and no service worker.

## Security notes

- Strict meta CSP permits local assets only and sets `connect-src 'none'`.
- No `innerHTML`; dynamic content uses DOM nodes and `textContent`.
- CSV cells have formula-prefix hardening even though generated rows contain no user free text.
- Safe output filenames use a short ASCII allowlist and must end in `.csv`.
- No generated CSV, form value, leave date, token, local path or actual work-date set belongs in this repository.

See [SECURITY.md](SECURITY.md) for responsible reporting.

## Rollback or teardown

To roll back v2, redeploy the previous commit `bb75508329b7a642964a9be27d5996c61ff3d5f6` from `main`. To remove the public deployment, disable GitHub Pages in repository settings (Settings → Pages). To remove both source and page, delete the GitHub repository under Settings → General → Danger Zone. Browser-generated CSV files remain only wherever a user explicitly downloaded them.

## License

MIT — see [LICENSE](LICENSE).
