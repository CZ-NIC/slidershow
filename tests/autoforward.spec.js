const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("auto-forward from the hash advances frames without input", async ({ page }) => {
    await page.goto(FIXTURE + "#1?duration=0.3")
    await page.locator("#start").click()

    // frames 1 and 2 inherit duration 0.3 s from the hash → advance on their own
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain("#2")
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain("#3")
})
