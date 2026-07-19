const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/exif.html")

test("EXIF device shows in the HUD on the first visit, without leaving the frame", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    // arrives asynchronously once Frame.exif() parses the image – no navigation in between
    await expect(page.locator("#hud-device")).toHaveText("TestMake TestModel")
})
