const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/video-points.html")

/** Enter the presentation and get its (muted, so it may autoplay headless) video running. */
async function start(page) {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    await page.evaluate(async () => {
        const video = playback.frame.$actor[0]
        video.muted = true
        await video.play()
    })
    await expect.poll(() => playing(page)).toBe(true)
}

const playing = page => page.evaluate(() => !playback.frame.$actor[0].paused)

test("the grid pauses the video it covers, and closing it plays it again", async ({ page }) => {
    // Opening the grid does not leave the frame (Playback.goToFrame returns early while the grid is up),
    // so the video used to go on playing - and sounding - behind the overlay.
    await start(page)

    await page.evaluate(() => playback.hud.toggle_grid())
    expect(await playing(page)).toBe(false)

    await page.evaluate(() => playback.hud.toggle_grid())
    await expect.poll(() => playing(page)).toBe(true)
})

test("a video that was already paused is not started by closing the grid", async ({ page }) => {
    await start(page)
    await page.evaluate(() => playback.frame.$actor[0].pause())

    await page.evaluate(() => playback.hud.toggle_grid())
    await page.evaluate(() => playback.hud.toggle_grid())

    expect(await playing(page)).toBe(false)
})

test("leaving the grid on another frame does not resume the video it covered", async ({ page }) => {
    // Closing onto a different frame makes goToFrame leave the covered one (pausing its videos itself);
    // playing them again would sound from a frame no longer on screen.
    await start(page)

    await page.evaluate(() => playback.hud.toggle_grid())
    await page.evaluate(() => playback.goToFrame(1)) // grid navigation: the frame is not entered yet
    await page.evaluate(() => playback.hud.toggle_grid())

    expect(await page.evaluate(() => $(playback.$articles[0]).find("video")[0].paused)).toBe(true)
})
