import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HOLIDAY_DATA } from "../data/holidays.js";
import {
  createPrng, durationBounds, fixedRateEstimate, formatFinancialYear, fyBounds, generate, holidaysFor,
  nthWeekdayOfMonth, optionalHolidayRows, parseIsoDate, toCsv, validateConfig, ValidationError,
} from "../src/core.js";

const base = overrides => ({
  state: "SA", fy: "2025", excludedWeekdays: [], minHours: "8.5", maxHours: "9",
  earliestStart: "08:50", latestStart: "09:10", seed: "123", filename: "work.csv",
  extraExcluded: [], workedDates: [], optionalHolidays: [], nonWorkingPeriods: [], ...overrides,
});
function config(overrides = {}) { return validateConfig(base(overrides), HOLIDAY_DATA); }
function rowDates(result) { return result.rows.map(row => row[0]); }

test("FY start-year boundaries are exact", () => assert.deepEqual(fyBounds(2025), ["2025-07-01", "2026-06-30"]));
test("financial years use ATO-style labels without ambiguous unsupported centuries", () => {
  assert.equal(formatFinancialYear(2025), "2025–26");
  assert.equal(formatFinancialYear(2035), "2035–36");
  assert.equal(formatFinancialYear(2099), "2099–2100");
});
test("strict ISO dates reject impossible days", () => { assert.ok(parseIsoDate("2024-02-29")); assert.equal(parseIsoDate("2025-02-29"), null); });
test("first Monday in August rule is deterministic", () => {
  assert.equal(nthWeekdayOfMonth(2025, 8, 1, 1), "2025-08-04");
  assert.equal(nthWeekdayOfMonth(2026, 8, 1, 1), "2026-08-03");
});
test("all eight subdivisions have bundled holidays", () => {
  assert.deepEqual(Object.keys(HOLIDAY_DATA.states).sort(), ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"]);
  for (const state of Object.keys(HOLIDAY_DATA.states)) assert.ok(Object.keys(HOLIDAY_DATA.states[state]).length >= 150, state);
});
test("representative state holidays and observed substitutions are present", () => {
  assert.equal(HOLIDAY_DATA.states.SA["2025-03-10"], "Adelaide Cup Day");
  assert.equal(HOLIDAY_DATA.states.SA["2025-12-26"], "Proclamation Day");
  assert.equal(HOLIDAY_DATA.states.SA["2026-12-28"], "Proclamation Day (observed)");
  assert.equal(HOLIDAY_DATA.states.VIC["2025-11-04"], "Melbourne Cup Day");
  assert.equal(Object.values(HOLIDAY_DATA.states.NSW).some(name => /bank holiday/i.test(name)), false);
});
test("holiday selection is bounded to the chosen FY", () => {
  const rows = holidaysFor(config(), HOLIDAY_DATA);
  assert.ok(rows.length > 5);
  assert.ok(rows.every(([date]) => date >= "2025-07-01" && date <= "2026-06-30"));
});
test("NSW Bank Holiday is scoped, optional, and off by default", () => {
  assert.deepEqual(optionalHolidayRows(config({ state: "NSW" })), []);
  const enabled = config({ state: "NSW", optionalHolidays: ["nsw-bank-holiday"] });
  assert.deepEqual(optionalHolidayRows(enabled), [["2025-08-04", "NSW Bank Holiday (banks and certain financial institutions only)", "nsw-bank-holiday"]]);
  assert.ok(!rowDates(generate(enabled, HOLIDAY_DATA)).includes("2025-08-04"));
  assert.throws(() => config({ state: "SA", optionalHolidays: ["nsw-bank-holiday"] }), /available only when NSW/);
});
test("date adjustments must be strict dates inside the FY", () => {
  assert.throws(() => config({ extraExcluded: ["2025-02-30"] }), ValidationError);
  assert.throws(() => config({ extraExcluded: ["2025-06-30"] }), /outside the selected financial year/);
  assert.throws(() => config({ workedDates: ["2026-07-01"] }), /outside the selected financial year/);
});
test("non-working periods require strict bounds and ordered endpoints", () => {
  assert.throws(() => config({ nonWorkingPeriods: [{ start: "2025-08-10", end: "2025-08-09" }] }), /start date must be on or before/);
  assert.throws(() => config({ nonWorkingPeriods: [{ start: "2025-06-30", end: "2025-07-01" }] }), /outside the selected financial year/);
  assert.throws(() => config({ nonWorkingPeriods: [{ start: "", end: "2025-07-01" }] }), /valid start date/);
});
test("overlapping non-working periods de-duplicate eligible excluded dates", () => {
  const result = generate(config({ nonWorkingPeriods: [
    { start: "2025-12-24", end: "2025-12-29" },
    { start: "2025-12-29", end: "2025-12-30" },
  ] }), HOLIDAY_DATA);
  assert.deepEqual(result.nonWorkingExcludedDates, ["2025-12-24", "2025-12-29", "2025-12-30"]);
  for (const date of result.nonWorkingExcludedDates) assert.ok(!rowDates(result).includes(date));
});
test("non-working period summary does not count dates already excluded another way", () => {
  const result = generate(config({
    excludedWeekdays: [3], extraExcluded: ["2025-12-29"],
    nonWorkingPeriods: [{ start: "2025-12-24", end: "2025-12-30" }],
  }), HOLIDAY_DATA);
  assert.deepEqual(result.nonWorkingExcludedDates, ["2025-12-30"]);
});
test("worked date includes a weekend", () => {
  const result = generate(config({ workedDates: ["2025-07-05"] }), HOLIDAY_DATA);
  assert.equal(rowDates(result).filter(date => date === "2025-07-05").length, 1);
  assert.equal(result.rows.find(row => row[0] === "2025-07-05")[1], "Saturday");
});
test("worked date includes a bundled public holiday", () => {
  const result = generate(config({ workedDates: ["2025-12-25"] }), HOLIDAY_DATA);
  assert.equal(rowDates(result).filter(date => date === "2025-12-25").length, 1);
  assert.ok(result.workedOverrideDates.includes("2025-12-25"));
});
test("worked date overrides every exclusion mechanism", () => {
  const date = "2025-08-04";
  const result = generate(config({
    state: "NSW", excludedWeekdays: [1], extraExcluded: [date], workedDates: [date, date],
    optionalHolidays: ["nsw-bank-holiday"], nonWorkingPeriods: [{ start: date, end: date }],
  }), HOLIDAY_DATA);
  assert.equal(rowDates(result).filter(value => value === date).length, 1);
  assert.deepEqual(result.workedOverrideDates, [date]);
  assert.deepEqual(result.nonWorkingExcludedDates, []);
  assert.equal(result.optionalHolidayCount, 0);
});
test("worked dates are de-duplicated and output remains date-sorted", () => {
  const c = config({ workedDates: ["2025-12-25", "2025-07-05", "2025-12-25"] });
  assert.deepEqual([...c.workedDates], ["2025-07-05", "2025-12-25"]);
  const result = generate(c, HOLIDAY_DATA);
  assert.equal(rowDates(result).filter(date => date === "2025-12-25").length, 1);
  assert.deepEqual(rowDates(result), [...rowDates(result)].sort());
});
test("worked dates contribute to generated minutes and the tax estimate", () => {
  const fixed = { minHours: "8.5", maxHours: "8.5", earliestStart: "09:00", latestStart: "09:00" };
  const ordinary = generate(config(fixed), HOLIDAY_DATA);
  const included = generate(config({ ...fixed, workedDates: ["2025-07-05"] }), HOLIDAY_DATA);
  assert.equal(included.totalMinutes, ordinary.totalMinutes + 510);
  assert.equal(fixedRateEstimate(included.totalMinutes, 2025).amountCents, fixedRateEstimate(ordinary.totalMinutes, 2025).amountCents + 595);
});
test("duration minute bounds use decimal ceil and floor", () => {
  assert.deepEqual(durationBounds("8.501", "8.519", []), [511, 511]);
  const errors = []; assert.equal(durationBounds("8.501", "8.502", errors), null); assert.ok(errors.length);
});
test("PRNG is stable", () => {
  const rng = createPrng(123n);
  assert.deepEqual([rng(), rng(), rng(), rng()], [3381219976, 766838775, 2127363934, 993692063]);
});
test("same web seed creates identical rows; weekends and holidays are skipped by default", () => {
  const c = config();
  const a = generate(c, HOLIDAY_DATA);
  const b = generate(c, HOLIDAY_DATA);
  assert.deepEqual(a.rows, b.rows);
  assert.ok(a.rows.length > 200);
  for (const row of a.rows) {
    assert.ok(![0, 6].includes(parseIsoDate(row[0]).getUTCDay()));
    assert.equal(Object.hasOwn(HOLIDAY_DATA.states.SA, row[0]), false);
  }
});
test("generation fails closed when no seed reaches the core", () => {
  assert.throws(() => generate(config({ seed: "" }), HOLIDAY_DATA), /seed is required/i);
});
test("fixed-rate estimate uses exact generated minutes and FY start-year rates", () => {
  assert.deepEqual(fixedRateEstimate(511, 2025), { rateCents: 70, amountCents: 596 });
  assert.deepEqual(fixedRateEstimate(60, 2020), { rateCents: 52, amountCents: 52 });
  assert.equal(fixedRateEstimate(600, 2026), null);
});
test("CSV bytes are exactly five columns and contain no adjustment, seed, or tax metadata", () => {
  const csv = toCsv([["2025-07-01","Tuesday","08:50","17:21","8.52"]]);
  assert.equal(csv, "Date,Day of Week,Start Time,End Time,Total Hours\n2025-07-01,Tuesday,08:50,17:21,8.52\n");
  assert.doesNotMatch(csv, /non-working|worked date|excluded|seed|deduction|rate|tax/i);
});
test("validation rejects unsafe file names, midnight crossing, and out-of-range FY", () => {
  assert.throws(() => config({ filename: "../bad.csv" }), ValidationError);
  assert.throws(() => config({ latestStart: "16:00" }), /before midnight/);
  assert.throws(() => config({ fy: "2036" }), /2020 to 2035/);
});
test("static app has strict privacy controls, local assets, secure entropy, and no persistence APIs", async () => {
  const paths = ["index.html","src/app.js","src/core.js","assets/styles.css","README.md"];
  const files = await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  const joined = files.join("\n");
  const runtime = files.slice(0, 4).join("\n");
  assert.match(files[0], /connect-src 'none'/);
  assert.match(files[0], /noindex,nofollow,noarchive/);
  assert.match(files[0], /There are no analytics, cookies/);
  assert.match(files[1], /crypto\?\.getRandomValues/);
  assert.doesNotMatch(runtime, /Math\.random|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML/);
  assert.doesNotMatch(files[0], /<(?:script|link)[^>]+https?:\/\//i);
  const urls = [...joined.matchAll(/https?:\/\/[^\s"')>]+/g)].map(match => match[0].replace(/[.,]$/, ""));
  assert.ok(urls.every(url => url.startsWith("https://www.nsw.gov.au/") || url.startsWith("https://www.ato.gov.au/") || url.startsWith("https://augusdn.github.io/") || url.startsWith("https://github.com/") || url === "http://127.0.0.1:4173"), urls.join("\n"));
});
test("visible app source and README are English", async () => {
  const files = await Promise.all(["index.html","src/app.js","src/core.js","README.md"].map(path => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  assert.match(files[0], /<html lang="en">/);
  assert.doesNotMatch(files.join("\n"), /[가-힣]/);
});
