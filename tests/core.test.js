import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HOLIDAY_DATA } from "../data/holidays.js";
import { createPrng, durationBounds, fyBounds, generate, holidaysFor, parseIsoDate, toCsv, validateConfig, ValidationError } from "../src/core.js";

const base = overrides => ({ state: "SA", fy: "2025", excludedWeekdays: [], minHours: "8.5", maxHours: "9", earliestStart: "08:50", latestStart: "09:10", seed: "123", filename: "work.csv", extraExcluded: [], includedOverrides: [], ...overrides });

function config(overrides = {}) { return validateConfig(base(overrides), HOLIDAY_DATA); }

test("FY start-year boundaries are exact", () => assert.deepEqual(fyBounds(2025), ["2025-07-01", "2026-06-30"]));
test("strict ISO dates reject impossible days", () => { assert.ok(parseIsoDate("2024-02-29")); assert.equal(parseIsoDate("2025-02-29"), null); });
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
test("included date must be a bundled holiday and cannot conflict", () => {
  assert.throws(() => config({ includedOverrides: ["2025-08-01"] }), ValidationError);
  assert.throws(() => config({ includedOverrides: ["2025-12-25"], extraExcluded: ["2025-12-25"] }), /같은 날짜/);
  assert.doesNotThrow(() => config({ includedOverrides: ["2025-12-25"] }));
});
test("date exceptions must be valid and inside FY", () => {
  assert.throws(() => config({ extraExcluded: ["2025-02-30"] }), ValidationError);
  assert.throws(() => config({ extraExcluded: ["2025-06-30"] }), /회계연도 밖/);
});
test("duration minute bounds use decimal ceil and floor", () => {
  assert.deepEqual(durationBounds("8.501", "8.519", []), [511, 511]);
  const errors = []; assert.equal(durationBounds("8.501", "8.502", errors), null); assert.ok(errors.length);
});
test("PRNG is stable", () => {
  const rng = createPrng(123n);
  assert.deepEqual([rng(), rng(), rng(), rng()], [3381219976, 766838775, 2127363934, 993692063]);
});
test("same web seed creates identical rows; weekends and holidays are skipped", () => {
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
test("holiday override restores the holiday date", () => {
  const result = generate(config({ includedOverrides: ["2025-12-25"] }), HOLIDAY_DATA);
  assert.ok(result.rows.some(row => row[0] === "2025-12-25"));
});
test("CSV bytes and half-up minute formatting are exact", () => {
  const csv = toCsv([["2025-07-01","Tuesday","08:50","17:21","8.52"]]);
  assert.equal(csv, "Date,Day of Week,Start Time,End Time,Total Hours\n2025-07-01,Tuesday,08:50,17:21,8.52\n");
});
test("validation rejects unsafe file names, midnight crossing, and out-of-range FY", () => {
  assert.throws(() => config({ filename: "../bad.csv" }), ValidationError);
  assert.throws(() => config({ latestStart: "16:00" }), /자정/);
  assert.throws(() => config({ fy: "2036" }), /2020~2035/);
});
test("static app has privacy policy controls and no remote assets/network code", async () => {
  const files = await Promise.all(["index.html","src/app.js","src/core.js","assets/styles.css"].map(path => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  const joined = files.join("\n");
  assert.match(files[0], /connect-src 'none'/);
  assert.match(files[0], /noindex,nofollow,noarchive/);
  assert.doesNotMatch(joined, /https?:\/\//);
  assert.doesNotMatch(joined, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|innerHTML/);
});
