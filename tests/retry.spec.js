const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("main-view retry button shows on frame.load_failed and clicking it re-arms the load", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const frame = playback.frame
        frame.load_failed = true
        playback.hud.loading(frame) // frame.loaded is already resolved -> .then() fires on next tick
        await new Promise(r => setTimeout(r, 20))
        const retryVisibleAfterFail = playback.hud.$hud_retry.is(":visible")

        let unloadCalled = false, preloadCalled = false
        const origUnload = frame.unload.bind(frame), origPreload = frame.preload.bind(frame)
        frame.unload = () => { unloadCalled = true; return origUnload() }
        frame.preload = () => { preloadCalled = true; return origPreload() }

        playback.hud.$hud_retry.trigger("click")
        await new Promise(r => setTimeout(r, 20))

        return {
            retryVisibleAfterFail,
            retryHiddenAfterClick: !playback.hud.$hud_retry.is(":visible"),
            loadFailedResetAfterClick: frame.load_failed === false,
            unloadCalled, preloadCalled,
        }
    })
    expect(result.retryVisibleAfterFail).toBe(true)
    expect(result.retryHiddenAfterClick).toBe(true)
    expect(result.loadFailedResetAfterClick).toBe(true)
    expect(result.unloadCalled).toBe(true)
    expect(result.preloadCalled).toBe(true)
})

test("grid 'Retry N frames' badge tracks _grid_failed and clicking it retries each one", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const frame = $(playback.$articles[0]).data("frame")
        playback.hud._grid_failed.add(frame)
        playback.hud._updateGridRetryBadge()

        // #hud-selection (its parent) starts display:none and nothing in this test opens the grid to
        // reveal it, so check the badge's own display toggle rather than jQuery's ancestor-aware :visible.
        const badgeVisibleAfterFail = playback.hud.$hud_grid_retry.css("display") !== "none"
        const badgeText = playback.hud.$hud_grid_retry.text()

        let unloadCalled = false, assuredWith = null
        const origUnload = frame.unload.bind(frame)
        frame.unload = () => { unloadCalled = true; return origUnload() }
        const origAssure = playback.hud.assureThumbnail.bind(playback.hud)
        playback.hud.assureThumbnail = (f, c, p) => { assuredWith = f; return origAssure(f, c, p) }

        playback.hud.$hud_grid_retry.trigger("click")
        await new Promise(r => setTimeout(r, 20))

        return {
            badgeVisibleAfterFail, badgeText,
            badgeHiddenAfterClick: playback.hud.$hud_grid_retry.css("display") === "none",
            setEmptyAfterClick: playback.hud._grid_failed.size === 0,
            unloadCalled, retriedTheFailedFrame: assuredWith === frame,
        }
    })
    expect(result.badgeVisibleAfterFail).toBe(true)
    expect(result.badgeText).toContain("Retry 1 frame")
    expect(result.badgeHiddenAfterClick).toBe(true)
    expect(result.setEmptyAfterClick).toBe(true)
    expect(result.unloadCalled).toBe(true)
    expect(result.retriedTheFailedFrame).toBe(true)
})
