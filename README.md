# Australian WFH log generator

A static, client-only Korean-language web app that creates synthetic weekday work-log CSV files for Australian financial years.

> **Synthetic/planning data only.** Generated records are not verified employment, payroll, legal, or tax evidence. Compare them with real employment and tax records before any use or submission.

## Privacy model

- All form values and generated CSV bytes stay in the current browser tab.
- No backend, analytics, cookies, telemetry, account, or persistence.
- No runtime network requests after the local static files load.
- Content Security Policy sets `connect-src 'none'`; scripts, styles, and holiday data are local.
- The repository, source code, and deployed URL are public. `noindex` and `robots.txt` reduce search discovery but do **not** make the site private.

Do not enter personal information: the app needs only configuration values and includes no free-text CSV fields.

## Behavior

- `FY2025` means 2025-07-01 through 2026-06-30, inclusive.
- Monday–Friday are candidates; weekends are always skipped.
- CSV columns are exactly `Date, Day of Week, Start Time, End Time, Total Hours`.
- Decimal-hour limits become an inclusive whole-minute range using `ceil(min × 60)` and `floor(max × 60)`.
- `Total Hours` is minute duration divided by 60, rounded to two decimals with half-up semantics.
- A supplied integer seed is deterministic within this web app. The compact Mulberry32-based generator is intentionally not byte-identical to Python's Mersenne Twister.
- The bundled public-holiday range is FY2020 through FY2035. Requests outside it fail closed.
- Included-date overrides only accept a bundled holiday for the selected state and FY. Extra excluded dates support local/company closures.

## Holiday dataset

`data/holidays.js` and `data/holidays.json` were generated from `python-holidays==0.105` with observed/substitute dates for ACT, NSW, NT, QLD, SA, TAS, VIC, and WA. Dataset metadata records the version, UTC generation date, and exact range. NSW Bank Holiday is deliberately filtered because it is not a general NSW public holiday.

The generator is a development-only script; Python and `python-holidays` are not shipped to or executed by the web app:

```sh
python3 -m venv .venv
.venv/bin/pip install 'holidays==0.105'
.venv/bin/python scripts/generate_holidays.py
```

The library may omit local, municipal, regional/Show Day and employer shutdown dates. Future proclamations or legislation may change dates after this snapshot. Verify against the relevant government source and add exclusions where needed.

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

Browser coverage includes desktop Chromium and mobile WebKit: SA holiday display/exclusion, holiday override, deterministic downloads, validation/error focus, reset, keyboard navigation, mobile layout, and screenshots. The Node suite covers FY/date math, every subdivision, representative/observed holidays, overrides/conflicts, minute rounding, weekends, exact CSV, deterministic PRNG output, and static privacy controls.

## Deployment

The site is deployable directly from the repository's default branch and root folder on GitHub Pages. It intentionally has no Actions workflow and no service worker.

## Security notes

- Strict meta CSP: local assets only and no connections, frames, objects, forms, media, or workers.
- No `innerHTML`; dynamic text uses DOM `textContent`.
- CSV cells have formula-prefix hardening even though generated rows contain no user free text.
- Safe output filenames are restricted to a short ASCII allowlist and `.csv` suffix.
- No generated CSV, form value, token, local path, or actual work date set belongs in this repository.

See [SECURITY.md](SECURITY.md) for responsible reporting.

## Teardown

To remove the public deployment, disable GitHub Pages in repository settings (Settings → Pages). To remove both source and page, delete the GitHub repository under Settings → General → Danger Zone. Browser-generated CSV files remain only wherever the user explicitly downloaded them.

## License

MIT — see [LICENSE](LICENSE).
