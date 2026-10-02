import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function generate(page) {
  await page.getByLabel("Integer seed Optional").fill("123");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByRole("heading", { name: "Generated results" })).toBeVisible();
}

async function addLeave(page, number, type, start, end) {
  await page.getByRole("button", { name: "Add leave period" }).click();
  await page.getByLabel(`Leave period ${number} type`).selectOption(type);
  await page.getByLabel(`Leave period ${number} start date`).fill(start);
  await page.getByLabel(`Leave period ${number} end date`).fill(end);
}

test.beforeEach(async ({ page }) => {
  const external = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") external.push(request.url());
  });
  await page.goto("/");
  expect(external).toEqual([]);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("SA holiday override works and privacy copy is English", async ({ page }, testInfo) => {
  await expect(page.getByText("There are no analytics, cookies", { exact: false })).toBeVisible();
  await page.getByText(/Bundled holidays in the selected financial year/).click();
  await expect(page.getByText("2025-12-26 — Proclamation Day", { exact: true })).toBeVisible();
  await generate(page);
  await expect(page.locator("#preview-body")).not.toContainText("2025-10-06");

  await page.locator("#include-date").fill("2025-10-06");
  await page.locator(".date-builder").nth(1).getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.locator("#preview-body")).toContainText("2025-10-06");
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: `test-artifacts/${testInfo.project.name}.png`, fullPage: true });
});

test("NSW bank holiday option is state-scoped, optional, and excludes the official date", async ({ page }) => {
  await expect(page.locator("#nsw-bank-holiday-option")).toBeHidden();
  await page.getByLabel("State or territory").selectOption("NSW");
  const checkbox = page.getByLabel("NSW Bank Holiday (banks and certain financial institutions only)");
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await generate(page);
  await expect(page.locator("#summary")).toContainText("1 optional scoped holiday excluded");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await event;
  const bytes = Buffer.concat(await (await download.createReadStream()).toArray()).toString("utf8");
  expect(bytes).not.toContain("2025-08-04");
  await page.getByLabel("State or territory").selectOption("SA");
  await expect(page.locator("#nsw-bank-holiday-option")).toBeHidden();
  await expect(checkbox).not.toBeChecked();
});

test("multiple leave ranges de-duplicate dates and stay out of CSV", async ({ page }) => {
  await addLeave(page, 1, "annual", "2025-12-24", "2025-12-29");
  await addLeave(page, 2, "sick-personal", "2025-12-29", "2025-12-30");
  await generate(page);
  await expect(page.locator("#leave-summary")).toContainText("Annual leave: 2");
  await expect(page.locator("#leave-summary")).toContainText("Sick/personal leave: 2");
  await expect(page.locator("#leave-summary")).toContainText("Unique excluded work dates: 3");
  await page.getByText("Show excluded work dates").click();
  await expect(page.locator("#leave-summary")).toContainText("2025-12-24, 2025-12-29, 2025-12-30");

  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await event;
  const csv = Buffer.concat(await (await download.createReadStream()).toArray()).toString("utf8");
  expect(csv).not.toMatch(/2025-12-(24|29|30)/);
  expect(csv).not.toMatch(/leave|deduction|tax|rate/i);
});

test("leave validation is strict; remove and reset clear memory-only entries", async ({ page }) => {
  await addLeave(page, 1, "annual", "2025-08-10", "2025-08-09");
  await page.getByRole("button", { name: "Generate preview" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("start date must be on or before end date");
  await page.getByRole("button", { name: "Remove leave period 1" }).click();
  await expect(page.locator(".leave-row")).toHaveCount(0);
  await addLeave(page, 1, "sick-personal", "2025-08-11", "2025-08-12");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".leave-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await expect(page.locator("#results")).toBeHidden();
});

test("fixed-rate estimate uses generated minutes and unpublished years show no amount", async ({ page }) => {
  await generate(page);
  const tax = page.locator("#tax-estimate");
  await expect(tax).toContainText("Estimated WFH fixed-rate deduction");
  await expect(tax).toContainText("0.70 AUD per hour");
  await expect(tax).toContainText("not a tax refund or tax saving");
  await expect(tax).toContainText("five years");

  const fy = page.getByLabel("Financial year start");
  await fy.fill("2026");
  await fy.press("Tab");
  await expect(fy).toHaveValue("2026");
  await expect(page.locator("#results")).toBeHidden();
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(tax).toContainText("No amount shown");
  await expect(tax).not.toContainText(/\$\d/);
});

test("same seed downloads exactly the same bytes", async ({ page }) => {
  await generate(page);
  const firstEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const first = await firstEvent;
  const firstBytes = await (await first.createReadStream()).toArray();

  await page.getByRole("button", { name: "Generate preview" }).click();
  const secondEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const second = await secondEvent;
  const secondBytes = await (await second.createReadStream()).toArray();
  expect(Buffer.concat(firstBytes).equals(Buffer.concat(secondBytes))).toBe(true);
  expect(first.suggestedFilename()).toBe("synthetic-wfh-log.csv");
});

test("keyboard order and mobile layout remain bounded", async ({ page }) => {
  await page.locator("#state").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#fy")).toBeFocused();
  await page.getByRole("button", { name: "Add leave period" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Leave period 1 type")).toBeFocused();
  await page.getByRole("button", { name: "Remove leave period 1" }).click();
  await generate(page);
  const viewport = page.viewportSize();
  for (const selector of ["body", ".card", ".table-wrap"]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
});
