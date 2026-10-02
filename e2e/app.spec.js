import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function generate(page) {
  await page.getByLabel("정수 시드 선택").fill("123");
  await page.getByRole("button", { name: "미리보기 생성" }).click();
  await expect(page.getByRole("heading", { name: "생성 결과" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const external = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") external.push(request.url());
  });
  await page.goto("/");
  expect(external).toEqual([]);
});

test("SA FY sample shows and excludes holiday, then override restores it", async ({ page }, testInfo) => {
  await page.getByText(/선택한 회계연도의 번들 공휴일 보기/).click();
  await expect(page.getByText("2025-12-26 — Proclamation Day", { exact: true })).toBeVisible();
  await generate(page);
  await expect(page.locator("#preview-body")).not.toContainText("2025-10-06");

  await page.locator("#include-date").fill("2025-10-06");
  await page.locator(".date-builder").nth(1).getByRole("button", { name: "추가" }).click();
  await page.getByRole("button", { name: "미리보기 생성" }).click();
  await expect(page.locator("#preview-body")).toContainText("2025-10-06");
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: `test-artifacts/${testInfo.project.name}.png`, fullPage: true });
});

test("same seed downloads exactly the same bytes", async ({ page }) => {
  await generate(page);
  const firstEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 다운로드" }).click();
  const first = await firstEvent;
  const firstBytes = await (await first.createReadStream()).toArray();

  await page.getByRole("button", { name: "미리보기 생성" }).click();
  const secondEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 다운로드" }).click();
  const second = await secondEvent;
  const secondBytes = await (await second.createReadStream()).toArray();
  expect(Buffer.concat(firstBytes).equals(Buffer.concat(secondBytes))).toBe(true);
  expect(first.suggestedFilename()).toBe("synthetic-wfh-log.csv");
});

test("validation is explicit and reset clears generated output", async ({ page }) => {
  await page.getByLabel("최소 근무시간").fill("9");
  await page.getByLabel("최대 근무시간").fill("8");
  await page.getByRole("button", { name: "미리보기 생성" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("최소 시간은 최대 시간보다 클 수 없습니다");
  await page.getByLabel("최소 근무시간").fill("8.5");
  await page.getByLabel("최대 근무시간").fill("9");
  await generate(page);
  await page.getByRole("button", { name: "초기화" }).click();
  await expect(page.getByRole("button", { name: "CSV 다운로드" })).toBeDisabled();
  await expect(page.locator("#results")).toBeHidden();
});

test("keyboard order reaches form controls and mobile table remains bounded", async ({ page }) => {
  await page.locator("#state").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#fy")).toBeFocused();
  await generate(page);
  const box = await page.locator(".table-wrap").boundingBox();
  const viewport = page.viewportSize();
  expect(box.width).toBeLessThanOrEqual(viewport.width);
});
