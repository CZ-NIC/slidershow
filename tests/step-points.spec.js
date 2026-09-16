const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/points.html")

/** Current wzoom state of the image, or null when it has never been zoomed. */
const zoom = page => page.evaluate(() => {
    const w = $("#triple").data("wzoom")
    return w ? [w.content.currentScale, w.content.currentLeft, w.content.currentTop] : null
})

test("entering a frame lands at the first step point, not at a later one", async ({ page }) => {
    await page.goto(FIXTURE + "#2?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index), { timeout: 20000 }).toBe(1)

    // walk into the third frame, whose first point is the default position "[]"
    await page.keyboard.press("PageDown")
    await expect.poll(() => page.evaluate(() => playback.frame.index)).toBe(2)
    await expect.poll(() => zoom(page).then(z => z?.[0] ?? 1)).toBe(1) // not zoomed in

    // the following points still work
    await page.keyboard.press("PageDown")
    await expect.poll(() => zoom(page).then(z => z?.[0])).toBe(2)
    await page.keyboard.press("PageDown")
    await expect.poll(() => zoom(page).then(z => z?.[0])).toBe(3)

    // and going back returns to the very first point
    await page.keyboard.press("PageUp")
    await expect.poll(() => zoom(page).then(z => z?.[0])).toBe(2)
    await page.keyboard.press("PageUp")
    await expect.poll(() => zoom(page).then(z => z?.[0])).toBe(1)
})
