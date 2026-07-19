const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/steps.html")

test("data-step elements appear one by one, then navigation leaves the frame", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await expect(page.locator("#s1")).toHaveClass(/step-hidden/)
    await expect(page.locator("#s2")).toHaveClass(/step-hidden/)

    await page.keyboard.press("PageDown")
    await expect(page.locator("#s1")).toHaveClass(/step-shown/)
    await expect(page.locator("#s2")).toHaveClass(/step-hidden/)
    expect(page.url()).toContain("#1")

    await page.keyboard.press("PageDown")
    await expect(page.locator("#s2")).toHaveClass(/step-shown/)

    await page.keyboard.press("PageDown")
    await expect.poll(() => page.url()).toContain("#2")
})
