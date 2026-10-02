import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function generate(page, seed = "123") {
  await page.getByLabel("Integer seed Optional").fill(seed);
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByRole("heading", { name: "Generated results" })).toBeVisible();
}

async function addPeriod(page, number, start, end) {
  await page.getByRole("button", { name: "Add non-working period" }).click();
  await page.getByLabel(`Non-working period ${number} start date`).fill(start);
  await page.getByLabel(`Non-working period ${number} end date`).fill(end);
}

async function addDate(page, label, date) {
  const builder = page.locator(".date-builder").filter({ has: page.locator(`label:text-is("${label}")`) });
  await builder.locator('input[type="date"]').fill(date);
  await builder.getByRole("button", { name: "Add" }).click();
}

async function downloadText(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await event;
  return { download, text: Buffer.concat(await (await download.createReadStream()).toArray()).toString("utf8") };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("current English UI keeps FY and daily-hours clarity and includes a public holiday", async ({ page }, testInfo) => {
  await expect(page.getByText("There are no analytics, cookies", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Financial year")).toHaveValue("2025");
  await expect(page.getByLabel("Financial year").locator("option:checked")).toHaveText("2025–26 (1 Jul 2025 – 30 Jun 2026)");
  await expect(page.getByRole("heading", { name: "Daily working-time generation" })).toBeVisible();
  await expect(page.getByText("duration is selected independently and uniformly", { exact: false })).toBeVisible();
  await expect(page.getByText("Start time is selected independently", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Minimum daily hours")).toHaveValue("8.5");
  await expect(page.getByLabel("Maximum daily hours")).toHaveValue("9.0");
  await expect(page.getByRole("heading", { name: "Date adjustments", exact: true })).toBeVisible();
  await expect(page.getByText("A worked date always wins", { exact: false })).toBeVisible();
  await page.getByText(/Bundled holidays in the selected financial year/).click();
  await expect(page.getByText("2025-12-26 — Proclamation Day", { exact: true })).toBeVisible();

  await addDate(page, "Worked date", "2025-10-06");
  await generate(page);
  await expect(page.locator("#summary")).toContainText("2025–26 · seed 123");
  await expect(page.locator("#preview-body")).toContainText("2025-10-06");
  await expect(page.locator("#adjustment-summary")).toContainText("Worked-date precedence applied to: 2025-10-06");
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: `test-artifacts/${testInfo.project.name}.png`, fullPage: true });
});

test("NSW Bank Holiday remains state-scoped and can be overridden by Worked date", async ({ page }) => {
  await expect(page.locator("#nsw-bank-holiday-option")).toBeHidden();
  await page.getByLabel("State or territory").selectOption("NSW");
  const checkbox = page.getByLabel("NSW Bank Holiday (banks and certain financial institutions only)");
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await generate(page);
  await expect(page.locator("#summary")).toContainText("1 optional scoped holiday excluded");
  expect((await downloadText(page)).text).not.toContain("2025-08-04");

  await addDate(page, "Worked date", "2025-08-04");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.locator("#summary")).not.toContainText("optional scoped holiday excluded");
  const csv = (await downloadText(page)).text;
  expect(csv.match(/^2025-08-04,/gm)).toHaveLength(1);
  await page.getByLabel("State or territory").selectOption("SA");
  await expect(page.locator("#nsw-bank-holiday-option")).toBeHidden();
  await expect(checkbox).not.toBeChecked();
});

test("multiple non-working periods de-duplicate dates and stay out of CSV", async ({ page }) => {
  await addPeriod(page, 1, "2025-12-24", "2025-12-29");
  await addPeriod(page, 2, "2025-12-29", "2025-12-30");
  await generate(page);
  const panel = page.locator("#adjustment-summary");
  await expect(panel).toContainText("3 work dates excluded by non-working periods");
  await page.getByText("Show dates excluded by non-working periods").click();
  await expect(panel).toContainText("2025-12-24, 2025-12-29, 2025-12-30");

  const csv = (await downloadText(page)).text;
  expect(csv).not.toMatch(/2025-12-(24|29|30)/);
  expect(csv).not.toMatch(/non-working|worked date|excluded|seed|deduction|tax|rate/i);
  expect(csv.split("\n")[0]).toBe("Date,Day of Week,Start Time,End Time,Total Hours");
});

test("Worked date overrides weekend, weekday, period, and extra-date exclusions once in sorted output", async ({ page }) => {
  const date = "2025-07-05";
  await page.getByLabel("Monday").check();
  await addPeriod(page, 1, date, date);
  await addDate(page, "Extra excluded date", date);
  await addDate(page, "Worked date", date);
  await addDate(page, "Worked date", date);
  await generate(page);

  const csv = (await downloadText(page)).text;
  const lines = csv.trimEnd().split("\n");
  const dates = lines.slice(1).map(line => line.split(",")[0]);
  expect(dates.filter(value => value === date)).toHaveLength(1);
  expect(dates).toEqual([...dates].sort());
  expect(lines.find(line => line.startsWith(`${date},`))).toContain("Saturday");
});

test("non-working validation is strict; remove and reset clear memory-only adjustments", async ({ page }) => {
  await addPeriod(page, 1, "2025-08-10", "2025-08-09");
  await page.getByRole("button", { name: "Generate preview" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("start date must be on or before end date");
  await page.getByRole("button", { name: "Remove non-working period 1" }).click();
  await expect(page.locator(".period-row")).toHaveCount(0);
  await addPeriod(page, 1, "2025-08-11", "2025-08-12");
  await addDate(page, "Worked date", "2025-08-16");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".period-row")).toHaveCount(0);
  await expect(page.locator("#worked-list li")).toHaveCount(0);
  await expect(page.getByLabel("Integer seed Optional")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await expect(page.locator("#results")).toBeHidden();
});

test("blank seed uses secure uint32 entropy, is shown, is reproducible, and reset chooses another", async ({ page }) => {
  await page.addInitScript(() => {
    let value = 10;
    Object.defineProperty(Crypto.prototype, "getRandomValues", {
      configurable: true,
      value(array) { array[0] = ++value; return array; },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByLabel("Integer seed Optional")).toHaveValue("11");
  await expect(page.locator("#summary")).toContainText("seed 11");
  const first = (await downloadText(page)).text;
  await page.getByRole("button", { name: "Generate preview" }).click();
  expect((await downloadText(page)).text).toBe(first);

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Integer seed Optional")).toHaveValue("");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByLabel("Integer seed Optional")).toHaveValue("12");
  await expect(page.locator("#summary")).toContainText("seed 12");
});

test("blank seed fails clearly when secure crypto is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "getRandomValues", { configurable: true, value: undefined });
  });
  await page.reload();
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByRole("alert")).toContainText("secure random seed could not be generated");
  await expect(page.getByLabel("Integer seed Optional")).toHaveValue("");
  await expect(page.locator("#results")).toBeHidden();
});

test("fixed-rate estimate includes an explicit weekend Worked date", async ({ page }) => {
  await page.getByLabel("Minimum daily hours").fill("8.5");
  await page.getByLabel("Maximum daily hours").fill("8.5");
  await addDate(page, "Worked date", "2025-07-05");
  await generate(page);
  const tax = page.locator("#tax-estimate");
  await expect(tax).toContainText("Estimated WFH fixed-rate deduction");
  await expect(tax).toContainText("0.70 AUD per hour");
  await expect(tax).toContainText("not a tax refund or tax saving");

  await page.getByRole("button", { name: "Remove 2025-07-05" }).click();
  const fy = page.getByLabel("Financial year");
  await fy.selectOption("2026");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(tax).toContainText("No amount shown for 2026–27");
  await expect(tax).not.toContainText(/\$\d/);
});

test("no external request, persistence, or analytics occurs during adjustments and generation", async ({ page }) => {
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto("/");
  await addDate(page, "Worked date", "2025-07-05");
  await generate(page);
  await downloadText(page);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(value => new URL(value).hostname === "127.0.0.1")).toBe(true);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, cookies: "" });
});

test("keyboard order and mobile layout remain bounded", async ({ page }) => {
  await page.locator("#state").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#fy")).toBeFocused();
  await page.getByRole("button", { name: "Add non-working period" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Non-working period 1 start date")).toBeFocused();
  await page.getByRole("button", { name: "Remove non-working period 1" }).click();
  await generate(page);
  const viewport = page.viewportSize();
  for (const selector of ["body", ".card", ".table-wrap"]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
});
