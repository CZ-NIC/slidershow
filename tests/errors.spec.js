const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("uncaught errors and rejections surface as a toast", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    await page.evaluate(() => setTimeout(() => { throw new Error("boom") }))
    await expect(page.locator(".ZebraDialog")).toContainText("Error: boom")

    await page.evaluate(() => { Promise.reject(new Error("rejected promise")) })
    await expect(page.locator(".ZebraDialog", { hasText: "rejected promise" })).toBeVisible()
})
