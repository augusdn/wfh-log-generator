import { HOLIDAY_DATA } from "../data/holidays.js";
import { ValidationError, fixedRateEstimate, formatFinancialYear, fyBounds, generate, toCsv, validateConfig } from "./core.js";

const $ = id => document.getElementById(id);
const form = $("generator");
const errorSummary = $("error-summary");
const excludedDates = [];
const workedDates = [];
let nonWorkingPeriods = [];
let periodSequence = 0;
let currentOutput = null;

const TEXT = Object.freeze({
  errorTitle: count => `Check ${count} form ${count === 1 ? "value" : "values"}`,
  unexpected: "An unexpected error occurred. Reload the page and try again.",
  noRows: "No work dates match these settings. Reduce the exclusions and try again.",
});

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
    workedDates,
    optionalHolidays: $("nsw-bank-holiday").checked ? ["nsw-bank-holiday"] : [],
    nonWorkingPeriods: nonWorkingPeriods.map(({ start, end }) => ({ start, end })),
  };
}

function clearErrors() {
  errorSummary.hidden = true;
  errorSummary.replaceChildren();
}

function showErrors(messages) {
  const title = document.createElement("h2");
  title.textContent = TEXT.errorTitle(messages.length);
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
  const values = kind === "exclude" ? excludedDates : workedDates;
  const list = kind === "exclude" ? $("exclude-list") : $("worked-list");
  list.replaceChildren();
  values.forEach((date, index) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = date;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${date}`);
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
  const input = kind === "exclude" ? $("exclude-date") : $("worked-date");
  const values = kind === "exclude" ? excludedDates : workedDates;
  if (!input.value) {
    showErrors([`Select a${kind === "exclude" ? "n extra excluded date" : " worked date"}.`]);
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

function periodBounds() {
  const fy = Number($("fy").value);
  return Number.isInteger(fy) ? fyBounds(fy) : ["", ""];
}

function renderNonWorkingPeriods() {
  const container = $("non-working-periods");
  container.replaceChildren();
  const [min, max] = periodBounds();
  nonWorkingPeriods.forEach((period, index) => {
    const row = document.createElement("fieldset");
    row.className = "period-row";
    const legend = document.createElement("legend");
    legend.textContent = `Non-working period ${index + 1}`;

    const startLabel = document.createElement("label");
    startLabel.textContent = "Start date";
    const start = document.createElement("input");
    start.type = "date";
    start.value = period.start;
    start.min = min;
    start.max = max;
    start.setAttribute("aria-label", `Non-working period ${index + 1} start date`);

    const endLabel = document.createElement("label");
    endLabel.textContent = "End date";
    const end = document.createElement("input");
    end.type = "date";
    end.value = period.end;
    end.min = min;
    end.max = max;
    end.setAttribute("aria-label", `Non-working period ${index + 1} end date`);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost remove-period";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove non-working period ${index + 1}`);

    const update = () => {
      period.start = start.value;
      period.end = end.value;
      invalidateOutput();
    };
    start.addEventListener("input", update);
    end.addEventListener("input", update);
    remove.addEventListener("click", () => {
      nonWorkingPeriods = nonWorkingPeriods.filter(item => item.id !== period.id);
      renderNonWorkingPeriods();
      invalidateOutput();
    });

    startLabel.append(start);
    endLabel.append(end);
    row.append(legend, startLabel, endLabel, remove);
    container.append(row);
  });
}

$("add-period").addEventListener("click", () => {
  nonWorkingPeriods.push({ id: ++periodSequence, start: "", end: "" });
  renderNonWorkingPeriods();
  invalidateOutput();
  $("non-working-periods").lastElementChild?.querySelector("input")?.focus();
});

function renderHolidays() {
  const list = $("holiday-list");
  list.replaceChildren();
  const state = $("state").value;
  const fy = Number($("fy").value);
  const bankOption = $("nsw-bank-holiday-option");
  bankOption.hidden = state !== "NSW";
  $("nsw-bank-holiday").disabled = state !== "NSW";
  if (state !== "NSW") $("nsw-bank-holiday").checked = false;
  if (!HOLIDAY_DATA.states[state] || !Number.isInteger(fy) || fy < HOLIDAY_DATA.metadata.fyStartYearMin || fy > HOLIDAY_DATA.metadata.fyStartYearMax) {
    $("holiday-count").textContent = "—";
    return;
  }
  const [start, end] = fyBounds(fy);
  const rows = Object.entries(HOLIDAY_DATA.states[state]).filter(([date]) => date >= start && date <= end).sort(([a], [b]) => a.localeCompare(b));
  $("holiday-count").textContent = `${rows.length} days`;
  for (const [date, name] of rows) {
    const item = document.createElement("li");
    item.textContent = `${date} — ${name}`;
    list.append(item);
  }
  for (const input of [$("exclude-date"), $("worked-date")]) { input.min = start; input.max = end; }
  renderNonWorkingPeriods();
}

function invalidateOutput() {
  currentOutput = null;
  $("download").disabled = true;
  $("results").hidden = true;
}

function entropySeed() {
  if (!globalThis.crypto?.getRandomValues) throw new ValidationError(["A secure random seed could not be generated in this browser. Enter an integer seed manually and try again."]);
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return BigInt(bytes[0]);
}

function appendTextElement(parent, tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function renderAdjustmentSummary(result) {
  const panel = $("adjustment-summary");
  panel.replaceChildren();
  appendTextElement(panel, "h3", "Date adjustments");
  appendTextElement(panel, "p", `${result.nonWorkingExcludedDates.length} work dates excluded by non-working periods · ${result.workedOverrideDates.length} worked dates overrode other exclusions`);
  if (result.workedOverrideDates.length) appendTextElement(panel, "p", `Worked-date precedence applied to: ${result.workedOverrideDates.join(", ")}`, "date-list");
  if (result.nonWorkingExcludedDates.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Show dates excluded by non-working periods";
    const dates = document.createElement("p");
    dates.className = "date-list";
    dates.textContent = result.nonWorkingExcludedDates.join(", ");
    details.append(summary, dates);
    panel.append(details);
  } else {
    appendTextElement(panel, "p", "No otherwise-eligible work dates were excluded by non-working periods.", "caveat");
  }
}

function renderTaxEstimate(result, fy) {
  const panel = $("tax-estimate");
  panel.replaceChildren();
  appendTextElement(panel, "h3", "Estimated WFH fixed-rate deduction");
  const estimate = fixedRateEstimate(result.totalMinutes, fy);
  const financialYear = formatFinancialYear(fy);
  if (estimate) {
    appendTextElement(panel, "p", `${financialYear} · $${(estimate.amountCents / 100).toFixed(2)} · ${(estimate.rateCents / 100).toFixed(2)} AUD per hour · based on ${result.totalMinutes} generated minutes`);
  } else {
    appendTextElement(panel, "p", `No amount shown for ${financialYear}: an official fixed rate has not been published or verified by this app.`);
  }
  appendTextElement(panel, "p", "A deduction is not a tax refund or tax saving. Eligibility requires additional running expenses, actual contemporaneous records of every WFH hour, and at least one record for each included expense. Expenses covered by the rate cannot also be claimed separately. Records generally need to be kept for five years. Synthetic data must be verified and may not satisfy ATO requirements.", "caveat");
  const source = document.createElement("a");
  source.href = "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/working-from-home-expenses/fixed-rate-method";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "Official ATO fixed-rate method source";
  panel.append(source);
}

function renderResults(result, config) {
  const tbody = $("preview-body");
  tbody.replaceChildren();
  for (const row of result.rows.slice(0, 100)) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    tbody.append(tr);
  }
  const scoped = result.optionalHolidayCount ? ` · ${result.optionalHolidayCount} optional scoped holiday excluded` : "";
  $("summary").textContent = `${formatFinancialYear(config.fy)} · seed ${result.seed} · ${result.rows.length} rows · ${(result.totalMinutes / 60).toFixed(2)} total hours · ${result.effectiveHolidayCount} public holidays excluded${scoped}`;
  $("preview-note").textContent = result.rows.length > 100 ? `Showing the first 100 rows for performance. The download contains all ${result.rows.length} rows.` : `Showing all ${result.rows.length} rows.`;
  renderAdjustmentSummary(result);
  renderTaxEstimate(result, config.fy);
  $("results").hidden = false;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  clearErrors();
  try {
    if (!$("seed").value.trim()) $("seed").value = entropySeed().toString();
    const config = validateConfig(rawConfig(), HOLIDAY_DATA);
    const result = generate(config, HOLIDAY_DATA);
    if (result.rows.length === 0) throw new ValidationError([TEXT.noRows]);
    currentOutput = { csv: toCsv(result.rows), filename: config.filename };
    renderResults(result, config);
    $("download").disabled = false;
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    invalidateOutput();
    showErrors(error instanceof ValidationError ? error.messages : [TEXT.unexpected]);
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
    workedDates.splice(0);
    nonWorkingPeriods = [];
    renderDateList("exclude");
    renderDateList("worked");
    renderNonWorkingPeriods();
    clearErrors();
    invalidateOutput();
    renderHolidays();
  }, 0);
});

for (const id of ["state", "fy"]) $(id).addEventListener("change", () => { renderHolidays(); invalidateOutput(); });
form.addEventListener("input", event => {
  if (!["state", "fy", "exclude-date", "worked-date"].includes(event.target.id)) invalidateOutput();
});
renderHolidays();
