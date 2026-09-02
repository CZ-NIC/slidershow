const { test, expect } = require("@playwright/test")
const path = require("path")

const THUMBS = "file://" + path.resolve(__dirname, "fixtures/data-saver.html")

/** Start playback, then turn the mode on by hand (no real metered connection to lean on). */
async function start(page, hash = "#1?start") {
    await page.goto(THUMBS + hash)
    // Not just "a frame exists" – before Playback.start() runs, playback.frame is still the dummy
    // pre-boot Frame and the Switches hotkeys are off, so an Alt+B pressed here would go nowhere.
    await expect.poll(() => page.evaluate(() =>
        typeof playback !== "undefined" && playback.operation?.switches?.some(h => h.enabled))).toBe(true)
}

const src = (page, selector) => page.evaluate(s => $(s).attr("src") || null, selector)

test("with a thumbnail available, the data saver shows it instead of downloading the original", async ({ page }) => {
    await start(page)
    // full-quality by default
    await expect.poll(() => src(page, "#with-thumb")).toBe("full.gif")

    await page.keyboard.press("Alt+b")
    await expect.poll(() => src(page, "#with-thumb")).toBe("thumb.gif")
    await expect(page.locator("#with-thumb")).toHaveAttribute("sli-data-saved", "thumb")
    // and it is the picture now, not a stand-in – so no "still loading" blur
    await expect(page.locator("#with-thumb")).not.toHaveAttribute("sli-thumb-shown", /.*/)
})

test("without a thumbnail, nothing is loaded until the frame is asked for", async ({ page }) => {
    await start(page, "#2?start")
    await page.keyboard.press("Alt+b")

    await expect(page.locator("#no-thumb")).toHaveAttribute("sli-data-saved", "none")
    expect(await src(page, "#no-thumb")).toBe(null)

    // the escape hatch: load this one frame in full after all
    await page.keyboard.press("Alt+l")
    await expect.poll(() => src(page, "#no-thumb")).toBe("full.gif")
    // …while the mode itself stays on
    expect(await page.evaluate(() => playback.dataSaver.active)).toBe(true)
})

test("switching the mode off downloads the originals again", async ({ page }) => {
    await start(page)
    await page.keyboard.press("Alt+b")
    await expect.poll(() => src(page, "#with-thumb")).toBe("thumb.gif")

    await page.keyboard.press("Alt+b")
    await expect.poll(() => src(page, "#with-thumb")).toBe("full.gif")
    await expect(page.locator("#with-thumb")).not.toHaveAttribute("sli-data-saved", /.*/)
})

test("the mode rides in the URL hash and wins over the connection's own preference", async ({ page }) => {
    await start(page)
    await page.keyboard.press("Alt+b")
    await expect.poll(() => page.url()).toContain("save-data")

    // restored from the hash on the next open
    await page.goto(THUMBS + "#1?start&save-data")
    await expect.poll(() => page.evaluate(() => playback?.dataSaver?.active)).toBe(true)
    expect(await page.evaluate(() => playback.dataSaver._explicit)).toBe(true)
})

test("the indicator appears with the mode and tells whether this frame is held back", async ({ page }) => {
    await start(page)
    const badge = page.locator("#hud-data-saver")
    await expect(badge).toBeHidden()

    await page.keyboard.press("Alt+b")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("🐢") // a thumbnail stands in – something is shown

    await page.evaluate(() => playback.goToFrame(1))
    await expect(badge).toHaveText(/Alt\+L/) // nothing at all here – say how to get it
})

test("the report counts the skipped files and estimates only from what was really measured", async ({ page }) => {
    await start(page)
    await page.keyboard.press("Alt+b")
    await expect.poll(() => src(page, "#with-thumb")).toBe("thumb.gif")

    const stats = await page.evaluate(() => playback.dataSaver.stats())
    expect(stats.skipped).toBeGreaterThan(0)
    // full.gif was loaded before the mode was switched on, so there IS a sample to estimate from
    expect(stats.sample).toBeGreaterThan(0)
    expect(stats.estimate).not.toBeNull()

    expect(await page.evaluate(() => playback.dataSaver.summary())).toContain("not downloaded")

    // with no sample at all the estimate is withheld rather than invented
    const honest = await page.evaluate(() => {
        playback.dataSaver.loaded.clear()
        return [playback.dataSaver.stats().estimate, playback.dataSaver.summary()]
    })
    expect(honest[0]).toBeNull()
    expect(honest[1]).toContain("unknown amount")
})

test("the data-saver bookkeeping never reaches the exported file", async ({ page }) => {
    await start(page)
    await page.keyboard.press("Alt+b")
    await expect(page.locator("#with-thumb")).toHaveAttribute("sli-data-saved", "thumb")

    const html = await page.evaluate(async () => {
        const $contents = $("<div>" + $("body").prop("outerHTML") + "</div>")
        await Frame.finalize_frames($contents, playback.$articles)
        return $contents.prop("innerHTML")
    })
    expect(html).not.toContain("sli-data-saved")
    expect(html).not.toContain("sli-load-full")
})
