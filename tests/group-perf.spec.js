const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

/** How many synthetic frames the timing test builds. Enough that an O(n²) section lookup is unmistakable. */
const FRAMES = 8000
/** How many distinct sections (months) the frames spread across – few sections, many frames each,
 * matching a real multi-year photo import. */
const MONTHS = 24

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("group(\"months\") stays fast with thousands of frames (no O(n²) section lookup)", async ({ page }) => {
    const { count, sections, group_ms } = await page.evaluate(({ frames, months }) => {
        const html = Array.from({ length: frames }, (_, i) => {
            const bucket = i % months
            const year = 2023 + Math.floor(bucket / 12)
            const m = String((bucket % 12) + 1).padStart(2, "0")
            return `<article><img sli-datetime="${year}-${m}-15T12:00:00"></article>`
        }).join("")
        $("main section:first").append(html)
        playback.reset()

        const t0 = performance.now()
        playback.section_controller.group("months")
        const group_ms = performance.now() - t0

        return {
            count: playback.$articles.length,
            sections: $("main > section").length,
            group_ms,
        }
    }, { frames: FRAMES, months: MONTHS })

    console.log(`group("months"): ${count} frames into ${sections} sections – ${Math.round(group_ms)} ms`)
    expect(count).toBeGreaterThanOrEqual(FRAMES)
    // MONTHS distinct sli-datetime months, plus one "unknown-months" catch-all for the fixture's own
    // pre-existing frames (none of which carry a datetime).
    expect(sections).toBe(MONTHS + 1)
    // Generous budget – the point is "well under a second", not a tight bound: the old document-wide
    // `section[sli-name=X]` selector re-run per frame needed tens of seconds here.
    expect(group_ms).toBeLessThan(5000)
})
