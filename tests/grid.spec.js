const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test("toggling the grid before the first frame is entered does not crash goToFrame", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await page.goto(FIXTURE)
    await page.locator("#start").waitFor() // deliberately don't click – playback.frame is still the dummy pre-boot Frame

    await page.evaluate(() => playback.hud.toggle_grid()) // open, from a hash-restored state e.g.
    await page.evaluate(() => playback.hud.toggle_grid()) // close again, frame is still not ready

    expect(errors).toEqual([])
})
