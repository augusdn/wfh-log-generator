export const CSV_COLUMNS = ["Date", "Day of Week", "Start Time", "End Time", "Total Hours"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
export const FIXED_RATE_CENTS = new Map([[2020, 52], [2021, 52], [2022, 67], [2023, 67], [2024, 70], [2025, 70]]);

// Optional, narrowly scoped closures belong here. They are never enabled by default.
export const OPTIONAL_SCOPED_HOLIDAYS = {
  "nsw-bank-holiday": {
    state: "NSW",
    label: "NSW Bank Holiday (banks and certain financial institutions only)",
    datesForFy(fy) { return [nthWeekdayOfMonth(fy, 8, 1, 1)]; },
  },
};

export class ValidationError extends Error {
  constructor(messages) {
    super(messages[0] || "Check the form values.");
    this.messages = messages;
  }
}

export function fyBounds(year) { return [`${year}-07-01`, `${year + 1}-06-30`]; }

export function formatFinancialYear(year) {
  if (!Number.isInteger(year)) throw new TypeError("Financial year start must be an integer.");
  const endYear = year + 1;
  return year >= 2020 && year <= 2035
    ? `${year}–${String(endYear).slice(-2)}`
    : `${year}–${endYear}`;
}

export function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function isoDate(date) { return date.toISOString().slice(0, 10); }

export function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (occurrence - 1) * 7;
  return isoDate(new Date(Date.UTC(year, month - 1, day)));
}

function parsePositiveDecimal(value, label, errors) {
  const text = String(value).trim();
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    errors.push(`${label}: enter a finite positive number.`);
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole || "0") * denominator + BigInt(fraction || "0");
  if (numerator <= 0n || numerator > 24n * denominator) {
    errors.push(`${label}: must be greater than 0 and no more than 24.`);
    return null;
  }
  return { numerator, denominator };
}

function ceilDiv(a, b) { return (a + b - 1n) / b; }

export function durationBounds(minText, maxText, errors = []) {
  const min = parsePositiveDecimal(minText, "Minimum daily hours", errors);
  const max = parsePositiveDecimal(maxText, "Maximum daily hours", errors);
  if (!min || !max) return null;
  if (min.numerator * max.denominator > max.numerator * min.denominator) {
    errors.push("Minimum daily hours cannot be greater than maximum daily hours.");
    return null;
  }
  const minimum = Number(ceilDiv(min.numerator * 60n, min.denominator));
  const maximum = Number((max.numerator * 60n) / max.denominator);
  if (minimum > maximum) {
    errors.push("The hours range contains no complete one-minute duration.");
    return null;
  }
  return [minimum, maximum];
}

export function parseClock(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

export function formatClock(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function createPrng(seed) {
  let state = Number(BigInt(seed) & 0xffffffffn) >>> 0;
  return function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return (z ^ (z >>> 14)) >>> 0;
  };
}

export function randomInteger(nextUint32, min, max) {
  const size = max - min + 1;
  const limit = Math.floor(0x100000000 / size) * size;
  let value;
  do value = nextUint32(); while (value >= limit);
  return min + (value % size);
}

function normalizeDateList(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))].sort();
}

function validateDateList(label, values, start, end, errors) {
  for (const value of values) {
    if (!parseIsoDate(value)) errors.push(`${label}: ${value || "(blank)"} is not a valid YYYY-MM-DD date.`);
    else if (value < start || value > end) errors.push(`${label}: ${value} is outside the selected financial year.`);
  }
}

function validateNonWorkingPeriods(rawPeriods, start, end, errors) {
  return (rawPeriods || []).map((period, index) => {
    const number = index + 1;
    const from = String(period.start || "").trim();
    const to = String(period.end || "").trim();
    if (!parseIsoDate(from)) errors.push(`Non-working period ${number}: enter a valid start date.`);
    else if (from < start || from > end) errors.push(`Non-working period ${number}: start date ${from} is outside the selected financial year.`);
    if (!parseIsoDate(to)) errors.push(`Non-working period ${number}: enter a valid end date.`);
    else if (to < start || to > end) errors.push(`Non-working period ${number}: end date ${to} is outside the selected financial year.`);
    if (parseIsoDate(from) && parseIsoDate(to) && from > to) errors.push(`Non-working period ${number}: start date must be on or before end date.`);
    return { start: from, end: to };
  });
}

export function validateConfig(raw, holidayData) {
  const errors = [];
  if (!STATES.includes(raw.state)) errors.push("Select a state or territory.");
  const fy = Number(raw.fy);
  const meta = holidayData.metadata;
  if (!Number.isInteger(fy) || fy < meta.fyStartYearMin || fy > meta.fyStartYearMax) {
    errors.push(`Financial year start must be from ${meta.fyStartYearMin} to ${meta.fyStartYearMax}.`);
  }
  const [start, end] = Number.isInteger(fy) ? fyBounds(fy) : ["", ""];
  const bounds = durationBounds(raw.minHours, raw.maxHours, errors);
  const earliest = parseClock(raw.earliestStart);
  const latest = parseClock(raw.latestStart);
  if (earliest === null) errors.push("Earliest start time is invalid.");
  if (latest === null) errors.push("Latest start time is invalid.");
  if (earliest !== null && latest !== null && earliest > latest) errors.push("Earliest start time cannot be later than latest start time.");
  if (latest !== null && bounds && latest + bounds[1] >= 1440) errors.push("Latest start time plus maximum hours must finish before midnight.");

  let seed;
  const seedText = String(raw.seed ?? "").trim();
  if (seedText) {
    if (!/^-?\d+$/.test(seedText)) errors.push("Seed must be an integer.");
    else { try { seed = BigInt(seedText); } catch { errors.push("Seed is not a valid integer."); } }
  }
  const filename = String(raw.filename ?? "").trim();
  if (!/^(?!\.)[A-Za-z0-9][A-Za-z0-9._-]{0,94}\.csv$/i.test(filename) || filename.includes("..")) {
    errors.push("Filename must begin with a letter or number, use only letters, numbers, dots, underscores or hyphens, and end in .csv.");
  }

  const excludedWeekdays = new Set((raw.excludedWeekdays || []).map(Number));
  for (const day of excludedWeekdays) if (![1, 2, 3, 4, 5].includes(day)) errors.push("An excluded weekday value is invalid.");
  const extraExcluded = normalizeDateList(raw.extraExcluded || []);
  const workedDates = normalizeDateList(raw.workedDates || []);
  validateDateList("Extra excluded date", extraExcluded, start, end, errors);
  validateDateList("Worked date", workedDates, start, end, errors);

  const selectedOptionalHolidays = new Set(raw.optionalHolidays || []);
  for (const key of selectedOptionalHolidays) {
    const definition = OPTIONAL_SCOPED_HOLIDAYS[key];
    if (!definition) errors.push(`Optional holiday ${key} is not supported.`);
    else if (definition.state !== raw.state) errors.push(`${definition.label} is available only when ${definition.state} is selected.`);
  }
  const nonWorkingPeriods = validateNonWorkingPeriods(raw.nonWorkingPeriods, start, end, errors);
  if (errors.length) throw new ValidationError([...new Set(errors)]);
  return {
    state: raw.state, fy, start, end, durationBounds: bounds, earliest, latest, seed, filename,
    excludedWeekdays, extraExcluded: new Set(extraExcluded), workedDates: new Set(workedDates),
    optionalHolidays: selectedOptionalHolidays, nonWorkingPeriods,
  };
}

export function holidaysFor(config, holidayData) {
  return Object.entries(holidayData.states[config.state])
    .filter(([date]) => date >= config.start && date <= config.end)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function optionalHolidayRows(config) {
  const rows = [];
  for (const key of config.optionalHolidays) {
    const definition = OPTIONAL_SCOPED_HOLIDAYS[key];
    for (const date of definition.datesForFy(config.fy)) {
      if (date >= config.start && date <= config.end) rows.push([date, definition.label, key]);
    }
  }
  return rows.sort(([a], [b]) => a.localeCompare(b));
}

function nonWorkingDateSet(config) {
  const dates = new Set();
  for (const period of config.nonWorkingPeriods) {
    for (let current = parseIsoDate(period.start); isoDate(current) <= period.end; current.setUTCDate(current.getUTCDate() + 1)) {
      dates.add(isoDate(current));
    }
  }
  return dates;
}

export function fixedRateEstimate(totalMinutes, fy) {
  const rateCents = FIXED_RATE_CENTS.get(fy);
  if (rateCents === undefined) return null;
  return { rateCents, amountCents: Math.round(totalMinutes * rateCents / 60) };
}

export function generate(config, holidayData) {
  if (config.seed === undefined) throw new ValidationError(["A seed is required. Generate one securely in the browser or enter an integer seed."]);
  const seed = config.seed;
  const next = createPrng(seed);
  const holidayRows = holidaysFor(config, holidayData);
  const holidayDates = new Set(holidayRows.map(([date]) => date));
  const scopedRows = optionalHolidayRows(config);
  const scopedDates = new Set(scopedRows.map(([date]) => date));
  const nonWorkingDates = nonWorkingDateSet(config);
  const excludedNonWorkingDates = new Set();
  const workedOverrideDates = new Set();
  const rows = [];
  let totalMinutes = 0;

  for (let current = parseIsoDate(config.start); isoDate(current) <= config.end; current.setUTCDate(current.getUTCDate() + 1)) {
    const date = isoDate(current);
    const weekday = current.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const otherwiseExcluded = weekend || config.excludedWeekdays.has(weekday) || holidayDates.has(date) || scopedDates.has(date) || config.extraExcluded.has(date) || nonWorkingDates.has(date);
    if (config.workedDates.has(date) && otherwiseExcluded) workedOverrideDates.add(date);
    if (!config.workedDates.has(date) && otherwiseExcluded) {
      if (nonWorkingDates.has(date) && !weekend && !config.excludedWeekdays.has(weekday) && !holidayDates.has(date) && !scopedDates.has(date) && !config.extraExcluded.has(date)) {
        excludedNonWorkingDates.add(date);
      }
      continue;
    }
    const startMinute = randomInteger(next, config.earliest, config.latest);
    const duration = randomInteger(next, config.durationBounds[0], config.durationBounds[1]);
    const totalHundredths = Math.floor((duration * 100 + 30) / 60);
    rows.push([date, WEEKDAY_NAMES[weekday], formatClock(startMinute), formatClock(startMinute + duration), (totalHundredths / 100).toFixed(2)]);
    totalMinutes += duration;
  }
  return {
    rows, holidays: holidayRows, optionalHolidays: scopedRows,
    effectiveHolidayCount: [...holidayDates].filter(date => !config.workedDates.has(date)).length,
    optionalHolidayCount: [...scopedDates].filter(date => !config.workedDates.has(date)).length,
    nonWorkingExcludedDates: [...excludedNonWorkingDates].sort(),
    workedOverrideDates: [...workedOverrideDates].sort(),
    totalMinutes, seed,
  };
}

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows) {
  return [CSV_COLUMNS, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}
