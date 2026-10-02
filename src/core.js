export const CSV_COLUMNS = ["Date", "Day of Week", "Start Time", "End Time", "Total Hours"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export class ValidationError extends Error {
  constructor(messages) {
    super(messages[0] || "입력값을 확인해 주세요.");
    this.messages = messages;
  }
}

export function fyBounds(year) {
  return [`${year}-07-01`, `${year + 1}-06-30`];
}

export function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parsePositiveDecimal(value, label, errors) {
  const text = String(value).trim();
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    errors.push(`${label}: 유한한 양수를 입력하세요.`);
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole || "0") * denominator + BigInt(fraction || "0");
  if (numerator <= 0n || numerator > 24n * denominator) {
    errors.push(`${label}: 0보다 크고 24 이하여야 합니다.`);
    return null;
  }
  return { numerator, denominator };
}

function ceilDiv(a, b) { return (a + b - 1n) / b; }

export function durationBounds(minText, maxText, errors = []) {
  const min = parsePositiveDecimal(minText, "최소 시간", errors);
  const max = parsePositiveDecimal(maxText, "최대 시간", errors);
  if (!min || !max) return null;
  if (min.numerator * max.denominator > max.numerator * min.denominator) {
    errors.push("최소 시간은 최대 시간보다 클 수 없습니다.");
    return null;
  }
  const minimum = Number(ceilDiv(min.numerator * 60n, min.denominator));
  const maximum = Number((max.numerator * 60n) / max.denominator);
  if (minimum > maximum) {
    errors.push("시간 범위에 온전한 1분 단위 시간이 하나도 없습니다.");
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

export function validateConfig(raw, holidayData) {
  const errors = [];
  if (!STATES.includes(raw.state)) errors.push("주/준주를 선택하세요.");
  const fy = Number(raw.fy);
  const meta = holidayData.metadata;
  if (!Number.isInteger(fy) || fy < meta.fyStartYearMin || fy > meta.fyStartYearMax) {
    errors.push(`회계연도 시작 연도는 ${meta.fyStartYearMin}~${meta.fyStartYearMax}만 지원합니다.`);
  }
  const bounds = durationBounds(raw.minHours, raw.maxHours, errors);
  const earliest = parseClock(raw.earliestStart);
  const latest = parseClock(raw.latestStart);
  if (earliest === null) errors.push("가장 이른 시작 시각이 올바르지 않습니다.");
  if (latest === null) errors.push("가장 늦은 시작 시각이 올바르지 않습니다.");
  if (earliest !== null && latest !== null && earliest > latest) errors.push("가장 이른 시작 시각은 가장 늦은 시각보다 늦을 수 없습니다.");
  if (latest !== null && bounds && latest + bounds[1] >= 1440) errors.push("가장 늦은 시작 시각과 최대 근무시간을 합치면 자정을 넘거나 자정에 끝납니다.");

  let seed;
  const seedText = String(raw.seed ?? "").trim();
  if (seedText) {
    if (!/^-?\d+$/.test(seedText)) errors.push("시드는 정수여야 합니다.");
    else {
      try { seed = BigInt(seedText); } catch { errors.push("시드가 올바른 정수가 아닙니다."); }
    }
  }
  const filename = String(raw.filename ?? "").trim();
  if (!/^(?!\.)[A-Za-z0-9][A-Za-z0-9._-]{0,94}\.csv$/i.test(filename) || filename.includes("..")) {
    errors.push("파일명은 영문자/숫자로 시작하고 안전한 영문자, 숫자, 점, 밑줄, 하이픈만 사용한 .csv여야 합니다.");
  }

  const excludedWeekdays = new Set((raw.excludedWeekdays || []).map(Number));
  for (const day of excludedWeekdays) if (![1, 2, 3, 4, 5].includes(day)) errors.push("제외 요일 값이 올바르지 않습니다.");
  const extraExcluded = normalizeDateList(raw.extraExcluded || []);
  const includedOverrides = normalizeDateList(raw.includedOverrides || []);
  const [start, end] = Number.isInteger(fy) ? fyBounds(fy) : ["", ""];
  for (const [label, values] of [["추가 제외일", extraExcluded], ["공휴일 포함 예외", includedOverrides]]) {
    for (const value of values) {
      if (!parseIsoDate(value)) errors.push(`${label}: ${value || "(빈 값)"}은 올바른 YYYY-MM-DD 날짜가 아닙니다.`);
      else if (value < start || value > end) errors.push(`${label}: ${value}은 선택한 회계연도 밖입니다.`);
    }
  }
  const conflicts = extraExcluded.filter(date => includedOverrides.includes(date));
  if (conflicts.length) errors.push(`같은 날짜를 제외·포함할 수 없습니다: ${conflicts.join(", ")}`);
  const stateHolidays = holidayData.states[raw.state] || {};
  for (const date of includedOverrides) {
    if (!(date in stateHolidays) || date < start || date > end) errors.push(`공휴일 포함 예외 ${date}은 선택한 주/회계연도의 번들 공휴일이 아닙니다.`);
  }
  if (errors.length) throw new ValidationError([...new Set(errors)]);
  return { state: raw.state, fy, start, end, durationBounds: bounds, earliest, latest, seed, filename, excludedWeekdays, extraExcluded: new Set(extraExcluded), includedOverrides: new Set(includedOverrides) };
}

export function holidaysFor(config, holidayData) {
  return Object.entries(holidayData.states[config.state])
    .filter(([date]) => date >= config.start && date <= config.end)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function generate(config, holidayData, entropySeed = 0n) {
  const seed = config.seed ?? entropySeed;
  const next = createPrng(seed);
  const holidayRows = holidaysFor(config, holidayData);
  const effectiveHolidays = new Set(holidayRows.map(([date]) => date).filter(date => !config.includedOverrides.has(date)));
  const rows = [];
  for (let current = parseIsoDate(config.start); isoDate(current) <= config.end; current.setUTCDate(current.getUTCDate() + 1)) {
    const date = isoDate(current);
    const weekday = current.getUTCDay();
    if (weekday === 0 || weekday === 6 || config.excludedWeekdays.has(weekday) || effectiveHolidays.has(date) || config.extraExcluded.has(date)) continue;
    const startMinute = randomInteger(next, config.earliest, config.latest);
    const duration = randomInteger(next, config.durationBounds[0], config.durationBounds[1]);
    const totalHundredths = Math.floor((duration * 100 + 30) / 60);
    rows.push([date, WEEKDAY_NAMES[weekday], formatClock(startMinute), formatClock(startMinute + duration), (totalHundredths / 100).toFixed(2)]);
  }
  return { rows, holidays: holidayRows, effectiveHolidayCount: effectiveHolidays.size, seed };
}

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows) {
  return [CSV_COLUMNS, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}
