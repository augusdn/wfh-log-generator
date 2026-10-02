import { HOLIDAY_DATA } from "../data/holidays.js";
import { ValidationError, fyBounds, generate, holidaysFor, toCsv, validateConfig } from "./core.js";

const $ = id => document.getElementById(id);
const form = $("generator");
const errorSummary = $("error-summary");
const excludedDates = [];
const includedDates = [];
let currentOutput = null;

function rawConfig() {
  return {
    state: $("state").value,
    fy: $("fy").value,
    excludedWeekdays: [...document.querySelectorAll('input[name="weekday"]:checked')].map(input => input.value),
    minHours: $("min-hours").value,
    maxHours: $("max-hours").value,
    earliestStart: $("earliest").value,
    latestStart: $("latest").value,
    seed: $("seed").value,
    filename: $("filename").value,
    extraExcluded: excludedDates,
    includedOverrides: includedDates,
  };
}

function clearErrors() {
  errorSummary.hidden = true;
  errorSummary.replaceChildren();
}

function showErrors(messages) {
  const title = document.createElement("h2");
  title.textContent = `입력값 ${messages.length}개를 확인해 주세요`;
  const list = document.createElement("ul");
  for (const message of messages) {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  }
  errorSummary.replaceChildren(title, list);
  errorSummary.hidden = false;
  errorSummary.focus();
}

function renderDateList(kind) {
  const values = kind === "exclude" ? excludedDates : includedDates;
  const list = kind === "exclude" ? $("exclude-list") : $("include-list");
  list.replaceChildren();
  values.forEach((date, index) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = date;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${date} 삭제`);
    remove.addEventListener("click", () => {
      values.splice(index, 1);
      renderDateList(kind);
      invalidateOutput();
    });
    item.append(text, remove);
    list.append(item);
  });
}

function addDate(kind) {
  const input = kind === "exclude" ? $("exclude-date") : $("include-date");
  const values = kind === "exclude" ? excludedDates : includedDates;
  if (!input.value) {
    showErrors([`${kind === "exclude" ? "추가 제외일" : "공휴일 포함 예외"}을 선택하세요.`]);
    input.focus();
    return;
  }
  if (!values.includes(input.value)) values.push(input.value);
  values.sort();
  input.value = "";
  renderDateList(kind);
  clearErrors();
  invalidateOutput();
}

document.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => addDate(button.dataset.add)));

function renderHolidays() {
  const list = $("holiday-list");
  list.replaceChildren();
  const state = $("state").value;
  const fy = Number($("fy").value);
  if (!HOLIDAY_DATA.states[state] || !Number.isInteger(fy) || fy < HOLIDAY_DATA.metadata.fyStartYearMin || fy > HOLIDAY_DATA.metadata.fyStartYearMax) {
    $("holiday-count").textContent = "—";
    return;
  }
  const [start, end] = fyBounds(fy);
  const rows = Object.entries(HOLIDAY_DATA.states[state]).filter(([date]) => date >= start && date <= end).sort(([a], [b]) => a.localeCompare(b));
  $("holiday-count").textContent = `${rows.length}일`;
  for (const [date, name] of rows) {
    const item = document.createElement("li");
    item.textContent = `${date} — ${name}`;
    list.append(item);
  }
  $("exclude-date").min = $("include-date").min = start;
  $("exclude-date").max = $("include-date").max = end;
}

function invalidateOutput() {
  currentOutput = null;
  $("download").disabled = true;
  $("results").hidden = true;
}

function entropySeed() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return BigInt(bytes[0]);
}

function renderResults(result) {
  const tbody = $("preview-body");
  tbody.replaceChildren();
  const previewRows = result.rows.slice(0, 100);
  for (const row of previewRows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    tbody.append(tr);
  }
  const totalMinutes = result.rows.reduce((sum, row) => {
    const [sh, sm] = row[2].split(":").map(Number);
    const [eh, em] = row[3].split(":").map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);
  $("summary").textContent = `${result.rows.length}행 · 총 ${(totalMinutes / 60).toFixed(2)}시간 · 공휴일 ${result.effectiveHolidayCount}일 제외`;
  $("preview-note").textContent = result.rows.length > 100 ? `성능을 위해 처음 100행만 표시합니다. 다운로드에는 ${result.rows.length}행이 모두 포함됩니다.` : `${result.rows.length}행 전체를 표시합니다.`;
  $("results").hidden = false;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  clearErrors();
  try {
    const config = validateConfig(rawConfig(), HOLIDAY_DATA);
    const result = generate(config, HOLIDAY_DATA, entropySeed());
    if (result.rows.length === 0) throw new ValidationError(["조건에 맞는 근무일이 없어 CSV를 만들 수 없습니다. 제외 설정을 줄여 주세요."]);
    const csv = toCsv(result.rows);
    currentOutput = { csv, filename: config.filename };
    renderResults(result);
    $("download").disabled = false;
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    invalidateOutput();
    showErrors(error instanceof ValidationError ? error.messages : ["예상하지 못한 오류가 발생했습니다. 페이지를 새로고침해 주세요."]);
    console.error(error);
  }
});

$("download").addEventListener("click", () => {
  if (!currentOutput) return;
  const blob = new Blob([currentOutput.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentOutput.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    excludedDates.splice(0);
    includedDates.splice(0);
    renderDateList("exclude");
    renderDateList("include");
    clearErrors();
    invalidateOutput();
    renderHolidays();
  }, 0);
});

for (const id of ["state", "fy"]) $(id).addEventListener("change", () => { renderHolidays(); invalidateOutput(); });
form.addEventListener("input", event => {
  if (!["state", "fy", "exclude-date", "include-date"].includes(event.target.id)) invalidateOutput();
});
renderHolidays();
