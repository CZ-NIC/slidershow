const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1) // one.jpg
        frames[1].set_tag(2) // two.jpg
        frames[2].set_tag(1) // three.jpg
    })
})

test("set_tag_filter shows only matching frames in the grid (OR across several tags)", async ({ page }) => {
    await page.evaluate(() => playback.set_tag_filter([1]))
    await page.evaluate(() => playback.hud.toggle_grid())
    await expect(page.locator("#hud-grid")).toBeVisible()

    let refs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(refs.sort()).toEqual(["0", "2"])

    await expect.poll(() => page.url()).toContain("tag-filter:1")

    // OR semantics: adding tag 2 brings frame 1 back too
    await page.evaluate(() => playback.set_tag_filter([1, 2]))
    refs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(refs.sort()).toEqual(["0", "1", "2"])

    await page.evaluate(() => playback.set_tag_filter([]))
    refs = await page.locator("#hud-grid frame-preview").evaluateAll(els => els.map(e => e.dataset.ref))
    expect(refs.sort()).toEqual(["0", "1", "2"])
})

test("set_tag_filter skips non-matching frames in normal (non-grid) navigation", async ({ page }) => {
    await page.evaluate(() => playback.set_tag_filter([2])) // only two.jpg (index 1)
    expect(await page.evaluate(() => playback.index)).toBe(1) // jumped off frame 0, which no longer matches

    await page.evaluate(() => playback.nextFrame())
    expect(await page.evaluate(() => playback.index)).toBe(1) // no other tag-2 frame ahead – stays put

    await page.evaluate(() => playback.previousFrame())
    expect(await page.evaluate(() => playback.index)).toBe(1) // no tag-2 frame behind either
})

test("clicking the tag-filter HUD icon clears the filter", async ({ page }) => {
    await page.evaluate(() => playback.set_tag_filter([1]))
    await expect(page.locator("#hud-tag-filter")).toBeVisible()

    await page.locator("#hud-tag-filter").click()
    expect(await page.evaluate(() => playback.tag_filter)).toEqual([])
    await expect(page.locator("#hud-tag-filter")).toBeHidden()
})

test("tag-filter hash key restores the filter (multiple tags, + separated)", async ({ page }) => {
    await page.goto(FIXTURE + "#1&state=tag-filter:1+2")
    expect(await page.evaluate(() => playback.tag_filter)).toEqual([1, 2])
})

test("Filter by tag dialog: checked tags apply, Clear filter resets", async ({ page }) => {
    await page.evaluate(() => playback.operation._filterByTagDialog())
    const rows = page.locator(".tag-filter-list label")
    await expect(rows).toHaveCount(2) // tags 1 and 2 are in use

    await page.locator(".tag-filter-list input[value='1']").check()
    await page.getByRole("link", { name: "Ok" }).click()
    await expect(page.locator(".ZebraDialog")).toBeHidden()
    expect(await page.evaluate(() => playback.tag_filter)).toEqual([1])

    await page.evaluate(() => playback.operation._filterByTagDialog())
    await page.getByRole("link", { name: "Clear filter" }).click()
    expect(await page.evaluate(() => playback.tag_filter)).toEqual([])
})
