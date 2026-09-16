const { test, expect } = require("@playwright/test")
const path = require("path")

// Two <img sli-src> frames, the first one with a sli-thumb – see the fixture's own comment.
const THUMBS = "file://" + path.resolve(__dirname, "fixtures/data-saver.html")

async function start(page, url, hash = "#1?start") {
    await page.goto(url + hash)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined),
        { timeout: 20000 }).toBe(true)
}

test("a preview of a frame whose media has not arrived yet stands in with its thumbnail", async ({ page }) => {
    await start(page, THUMBS)

    // The frame as the aux window would receive it right after the playback moved – `preload()` has only
    // started the download, so without the stand-in the clone would carry a bare sli-src and show nothing.
    const preview = await page.evaluate(() => {
        const frame = $(playback.$articles[0]).data("frame")
        frame.unload()
        return frame.get_preview()
    })
    expect(preview).toContain("thumb.gif")

    // The frame with no sli-thumb has nothing to stand in with, and must not invent a src
    const bare = await page.evaluate(() => {
        const frame = $(playback.$articles[1]).data("frame")
        frame.unload()
        return frame.get_preview()
    })
    expect(bare).not.toMatch(/\ssrc=/)
})

test("the aux window gets the preview again once the media really loaded", async ({ page }) => {
    await start(page, THUMBS)
    await page.evaluate(() => {
        window._infos = 0
        const original = playback.aux_window.info.bind(playback.aux_window)
        playback.aux_window.info = (frame, following) => {
            window._infos++
            return original(frame, following)
        }
    })

    await page.evaluate(() => playback.goToFrame(1))
    // Once straight away (possibly still a black/thumbnail preview) and at least once more afterwards.
    await expect.poll(() => page.evaluate(() => window._infos), { timeout: 10000 }).toBeGreaterThan(1)
})
