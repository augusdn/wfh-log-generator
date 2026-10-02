# Australian WFH Log Generator v2

A static, client-only English web app that creates synthetic work-from-home CSV files for Australian financial years.

Live site: https://augusdn.github.io/wfh-log-generator/

> **Synthetic planning data only.** Generated records are not verified employment, payroll, legal or tax evidence. Compare every entry with actual contemporaneous employment and tax records before any use or submission.

## Privacy model

- Form values, date adjustments, generated seeds and CSV bytes stay in current-tab memory only.
- No backend, account, cookies, analytics, telemetry, persistence, local storage or session storage.
- No runtime network requests after the local static files load.
- Content Security Policy sets `connect-src 'none'`; scripts, styles and holiday data are local.
- The repository, source code and deployed URL are public. `noindex` and `robots.txt` reduce search discovery but do **not** make the site private.

Cloudflare Web Analytics was considered and remains disabled. No Google Analytics or fallback provider is present.

Do not enter personal information. The app needs only bounded configuration values and has no free-text CSV fields.

## Behavior

- Financial years use ATO-style labels: `2025–26` means 1 July 2025 through 30 June 2026, inclusive. The selector shows the full date range and supports only `2020–21` through `2035–36`; the internal value remains the numeric start year.
- Monday–Friday are candidates; weekends are excluded unless explicitly added as a Worked date.
- CSV columns remain exactly `Date, Day of Week, Start Time, End Time, Total Hours`. Seed, date-adjustment and tax metadata never enter the CSV.
- For each eligible WFH day independently, duration is selected uniformly at whole-minute precision between the inclusive minimum and maximum. Decimal-hour limits become that whole-minute range using `ceil(min × 60)` and `floor(max × 60)`.
- Start time is generated independently for each eligible day between the inclusive earliest and latest start times.
- `Total Hours` is minute duration divided by 60, rounded to two decimals with half-up semantics.
- A supplied integer seed is deterministic within this web app. If the seed is blank, Generate uses browser `crypto.getRandomValues` to create a uint32, fills the field and shows it in the result summary. Reset clears it, and the next generation obtains a new secure seed. Generation fails clearly if secure browser entropy is unavailable; there is no `Math.random` fallback.
- The same chosen seed and settings produce byte-identical CSV output. The compact Mulberry32-based generator is intentionally not byte-identical to Python's Mersenne Twister.
- The bundled public-holiday range is `2020–21` through `2035–36`. Requests outside it fail closed.

## Date adjustments and precedence

The single **Date adjustments** section contains:

- **Non-working period** — any number of generic start/end ranges. Both dates must be valid and inside the selected financial year, and start must be on or before end. Overlapping, adjacent and duplicate ranges are accepted; excluded dates are de-duplicated.
- **Extra excluded date** — optional individual dates for local holidays, employer shutdowns or another day not worked.
- **Worked date** — repeatable explicit dates inside the selected financial year. A Worked date may be a Saturday, Sunday, bundled public holiday, optional NSW Bank Holiday, date in a non-working period, selected excluded weekday or extra excluded date.

**Worked date has precedence over every exclusion mechanism.** Each de-duplicated Worked date generates exactly one normal work row. All output rows remain date-sorted. Date adjustments are held only in current-tab memory and disappear on reset, reload or tab close.

## Optional scoped holiday

The app has one optional scoped closure and does not invent any others:

- **NSW Bank Holiday (banks and certain financial institutions only)** — shown and enabled only when NSW is selected, off by default, and calculated as the first Monday in August within the selected financial year.

The NSW Government states that retail bank branches and certain financial institutions are required to close on the first Monday in August unless exempt, and that this Bank Holiday is **not a declared public holiday**. Source: https://www.nsw.gov.au/about-nsw/public-holidays

A Worked date can explicitly include this date, following the precedence rule above.

## Estimated WFH fixed-rate deduction

The result view, but never the CSV, shows `Estimated WFH fixed-rate deduction` using exact generated minutes divided by 60 and the verified ATO rate for the financial year's internal start year. Explicit Worked dates contribute their generated minutes in the same way as ordinary rows.

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

Browser coverage runs in desktop Chromium and mobile WebKit. It covers English rendering, no external requests or persistence, FY and daily-hours clarity, generic non-working periods, strict validation, date-adjustment reset, Worked date precedence and de-duplication, weekend/public/scoped-holiday inclusion, sorted output, secure blank-seed generation and failure behavior, deterministic download bytes, exact CSV privacy, tax states, keyboard operation, mobile bounds and screenshots.

The Node suite covers financial-year and date math, all subdivisions, representative and observed holidays, scoped closures, non-working-period validation and de-duplication, every Worked date precedence case, sorted deterministic output, exact minute and tax calculations, exact five-column CSV bytes, English copy, CSP and static privacy controls.

## Deployment

The site deploys directly from the repository's default `main` branch and root folder on GitHub Pages. It intentionally has no Actions workflow and no service worker.

## Security notes

- Strict meta CSP permits local assets only and sets `connect-src 'none'`.
- No `innerHTML`; dynamic content uses DOM nodes and `textContent`.
- CSV cells have formula-prefix hardening even though generated rows contain no user free text.
- Safe output filenames use a short ASCII allowlist and must end in `.csv`.
- No generated CSV, form value, date adjustment, seed, token, local path or actual work-date set belongs in this repository.

See [SECURITY.md](SECURITY.md) for responsible reporting.

## Rollback or teardown

To roll back this Date adjustments release after deployment, reset `main` to the previously deployed commit `4788a65848f84e234f896f9adc91c5ca27fb13b7` and push it as a reviewed rollback commit. To remove the public deployment, disable GitHub Pages in repository settings (Settings → Pages). To remove both source and page, delete the GitHub repository under Settings → General → Danger Zone. Browser-generated CSV files remain only wherever a user explicitly downloaded them.

## License

MIT — see [LICENSE](LICENSE).
