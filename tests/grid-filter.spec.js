const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1)
        frames[1].set_tag(2)
        frames[2].set_tag(1)
    })
})

test("grid filter shows only frames carrying the given tag", async ({ page }) => {
    await page.evaluate(() => playback.hud.grid.setFilter(1))
    await expect(page.locator("#hud-grid")).toBeVisible()

    const refs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(refs.sort()).toEqual(["0", "2"])

    await expect.poll(() => page.url()).toContain("grid-filter:1")

    await page.evaluate(() => playback.hud.grid.setFilter(null))
    const allRefs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(allRefs.sort()).toEqual(["0", "1", "2"])
})

test("grid-filter hash key restores the filtered grid on load", async ({ page }) => {
    await page.goto(FIXTURE + "#1&state=grid-filter:2")
    await expect.poll(() => page.evaluate(() => playback.hud.grid_visible)).toBe(true)
    const refs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(refs).toEqual(["1"])
})
