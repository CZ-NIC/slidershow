const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("playback.preloaded stays in sync with the [sli-preloaded] attribute across navigation", async ({ page }) => {
    const attrPreloadedCount = () => page.evaluate(() => $("[sli-preloaded]").length)
    const setSize = () => page.evaluate(() => playback.preloaded.size)

    await expect.poll(setSize).toBeGreaterThan(0)
    expect(await setSize()).toBe(await attrPreloadedCount())

    await page.evaluate(() => playback.nextFrame())
    // background preload/unload bookkeeping runs async – poll instead of a fixed wait, since how long it
    // actually takes varies with machine load (a flat timeout was too tight on slower CI runners)
    await expect.poll(async () => await setSize() === await attrPreloadedCount()).toBe(true)
    expect(await setSize()).toBe(await attrPreloadedCount())
})

test("unload() removes the frame from playback.preloaded; preload() (incl. the already-preloaded fast path) adds it back", async ({ page }) => {
    const isTracked = () => page.evaluate(() => playback.preloaded.has(playback.frame))

    await expect.poll(isTracked).toBe(true)

    await page.evaluate(() => playback.frame.unload())
    expect(await isTracked()).toBe(false)
    expect(await page.evaluate(() => playback.frame.$frame.attr("sli-preloaded"))).toBeUndefined()
    // The medium is path-referenced (sli-src) – src is only derived state and must not survive unload,
    // or an import the size of a real gallery leaks it back into memory (and, later, into the export).
    expect(await page.evaluate(() => playback.frame.$actor.attr("src"))).toBeUndefined()
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-src"))).toBeTruthy()

    await page.evaluate(() => playback.frame.preload())
    expect(await isTracked()).toBe(true)

    // the "already preloaded" fast path (attribute set but this Frame instance not yet in the Set,
    // ex. after a duplicated frame) must still register itself
    await page.evaluate(() => playback.preloaded.delete(playback.frame))
    expect(await isTracked()).toBe(false)
    await page.evaluate(() => playback.frame.preload()) // attribute already there -> takes the fast path
    expect(await isTracked()).toBe(true)
})

test("duplicating a frame and navigating around it doesn't crash the preload/unload bookkeeping", async ({ page }) => {
    await page.evaluate(() => playback.operation.editing.enable())
    await page.locator("body").press("Alt+d")
    await expect.poll(() => page.evaluate(() => playback.$articles.length)).toBe(4)

    await page.evaluate(() => playback.nextFrame())
    await page.evaluate(() => playback.previousFrame())
    // see the "stays in sync" test above re: polling instead of a fixed wait
    const setSize = () => page.evaluate(() => playback.preloaded.size)
    const attrPreloadedCount = () => page.evaluate(() => $("[sli-preloaded]").length)
    await expect.poll(async () => await setSize() === await attrPreloadedCount()).toBe(true)

    expect(await setSize()).toBe(await attrPreloadedCount())
})

test("preloadWindow() scales down once the presentation grows past PRELOAD_LARGE_THRESHOLD", async ({ page }) => {
    // Faking $articles.length is cheaper than building a fixture with hundreds of real frames.
    const windowFor = (length) => page.evaluate((length) => {
        const original = playback.$articles
        Object.defineProperty(playback, "$articles", { value: { length }, configurable: true })
        try {
            return playback.preloadWindow()
        } finally {
            Object.defineProperty(playback, "$articles", { value: original, configurable: true })
        }
    }, length)
    const constants = await page.evaluate(() => ({
        back: PRELOAD_BACKWARD, forward: PRELOAD_FORWARD,
        backLarge: PRELOAD_BACKWARD_LARGE, forwardLarge: PRELOAD_FORWARD_LARGE,
        threshold: PRELOAD_LARGE_THRESHOLD,
    }))

    expect(await windowFor(constants.threshold)).toEqual([constants.back, constants.forward])
    expect(await windowFor(constants.threshold + 1)).toEqual([constants.backLarge, constants.forwardLarge])
})
