const { test, expect } = require("@playwright/test")
const path = require("path")

const POINTS = "file://" + path.resolve(__dirname, "fixtures/points.html")
const VIDEO_POINTS = "file://" + path.resolve(__dirname, "fixtures/video-points.html")
const VIDEO_CUT = "file://" + path.resolve(__dirname, "fixtures/video-cut.html")

async function start(page, url, hash = "#1?start") {
    await page.goto(url + hash)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined),
        { timeout: 20000 }).toBe(true)
}

/** Plain text of the frame's points summary. */
const summary = page => page.evaluate(() => $("<div/>").html(playback.frame.get_points_summary()).text())

test("a frame's zoom flyover is summed up for the presenter", async ({ page }) => {
    await start(page, POINTS)
    expect(await summary(page)).toContain("zoom: 2× → 3×")

    // a frame that just shows its photo has nothing to announce
    await page.evaluate(() => playback.goToFrame(1))
    expect(await summary(page)).toBe("")

    // the default first point reads as the plain full view
    await page.evaluate(() => playback.goToFrame(2))
    expect(await summary(page)).toContain("full view → 2× → 3×")
})

test("video cues and the video cut are summed up too", async ({ page }) => {
    await start(page, VIDEO_POINTS)
    expect(await summary(page)).toContain("0:02 (→ 0:05) → 0:08")

    await start(page, VIDEO_CUT)
    await page.evaluate(() => playback.frame.setVideoCut(playback.frame.$actor, 2, 75))
    expect(await summary(page)).toContain("0:02 – 1:15")

    await page.evaluate(() => playback.frame.setVideoCut(playback.frame.$actor, 5, undefined))
    expect(await summary(page)).toContain("0:05 – end")
})

test("the aux window shows the points next to the notes", async ({ page }) => {
    await start(page, POINTS)
    const [aux] = await Promise.all([
        page.context().waitForEvent("page"),
        page.evaluate(() => playback.aux_window.open())
    ])
    await aux.waitForLoadState()
    await page.evaluate(() => playback.goToFrame(0))

    const notes = aux.locator(".aux-slot[data-pane=notes] .aux-points")
    await expect(notes).toContainText("zoom: 2×")
})
