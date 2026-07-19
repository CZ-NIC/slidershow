const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("boots, starts playback and navigates frames", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    await page.locator("#start").click()
    await expect(page.locator("menu")).toBeHidden()
    await expect.poll(() => page.url()).toContain("#1")

    await page.keyboard.press("PageDown")
    await expect.poll(() => page.url()).toContain("#2")

    await page.keyboard.press("PageUp")
    await expect.poll(() => page.url()).toContain("#1")

    expect(errors).toEqual([])
})
