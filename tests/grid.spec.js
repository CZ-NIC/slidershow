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

test("restoring &state=grid from the hash before the first frame is entered still leaves the grid's own hotkeys enabled once it is", async ({ page }) => {
    // state=start skips the splash screen, so the grid restore (session.js restore_state's "grid" case)
    // runs while playback.frame is still the dummy pre-boot Frame – the exact race that left Hud.toggle_grid()
    // computing "on" as false forever after (see CHANGELOG "that same .index-readiness check...").
    await page.goto(FIXTURE + "#1&state=start,grid")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)

    expect(await page.evaluate(() => playback.hud.grid_visible)).toBe(true)
    expect(await page.evaluate(() => playback.operation.grid.some(h => h.enabled))).toBe(true)
})
