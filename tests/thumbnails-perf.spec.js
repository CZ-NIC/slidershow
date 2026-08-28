const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("makeThumbnailsImportable only (re)initializes elements that aren't draggable yet", async ({ page }) => {
    const newlyInitialized = await page.evaluate(() => {
        playback.hud.toggle_grid() // builds the grid + initializes its thumbnails once
        const $container = playback.hud.grid.$container

        // spy: importable() is called with exactly the elements about to be made draggable
        let initializedCount = 0
        const original = playback.menu.importable.bind(playback.menu)
        playback.menu.importable = ($el, cb) => { initializedCount += $el.length; return original($el, cb) }

        // no new thumbnails were added, so a repeated call must initialize nothing
        playback.hud.makeThumbnailsImportable($container)
        playback.hud.makeThumbnailsImportable($container)
        return initializedCount
    })
    expect(newlyInitialized).toBe(0)
})

test("assureThumbnail memoizes the sli-thumb preview per frame and clears it on reset", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const frame = $(playback.$articles[0]).data("frame")
        let builds = 0
        frame.get_preview_thumb = async () => { builds++; return "<img class='thumb'>" }

        const $c = $("<div/>").appendTo("body")
        playback.hud.assureThumbnail(frame, $c)
        await new Promise(r => setTimeout(r, 60)) // assureThumbnail fills the preview in a setTimeout(1)

        const cachedAfterFirst = playback.hud.previewCache.has(frame)

        // discard the DOM node (as grid scrolling does) and re-add it – must hit the cache, not rebuild
        playback.hud.getThumbnail(frame, $c).remove()
        playback.hud.assureThumbnail(frame, $c)
        await new Promise(r => setTimeout(r, 60))

        const buildsAfterReAdd = builds
        playback.hud.reset()
        return { cachedAfterFirst, buildsAfterReAdd, clearedByReset: playback.hud.previewCache.has(frame) }
    })
    expect(result.cachedAfterFirst).toBe(true)
    expect(result.buildsAfterReAdd).toBe(1) // built once, the re-add was a cache hit
    expect(result.clearedByReset).toBe(false)
})

test("grid shows a spinner+percentage badge while thumbnail fetches are pending, hides once done", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const frame = $(playback.$articles[0]).data("frame")
        const other = $(playback.$articles[1]).data("frame")
        let resolveThumb, resolveOther
        frame.get_preview_thumb = () => new Promise(r => { resolveThumb = r })
        other.get_preview_thumb = () => new Promise(r => { resolveOther = r })

        // Make grid_visible true directly, without GridController.load() – that would kick off its own
        // real thumbnail fetches for every fixture frame and pollute the percentage this test computes.
        const $container = playback.hud.$hud_grid.show()
        playback.hud.assureThumbnail(frame, $container)
        playback.hud.assureThumbnail(other, $container)

        await new Promise(r => setTimeout(r, 30)) // let the setTimeout(1) fire and reach the pending await
        const activeWhileBothPending = playback.hud.$hud_grid_loading.hasClass("active")

        resolveThumb("<img class='thumb'>")
        await new Promise(r => setTimeout(r, 30))
        const percentAfterOneOfTwo = playback.hud.$hud_grid_loading_percent.text()
        const activeAfterOneOfTwo = playback.hud.$hud_grid_loading.hasClass("active")

        resolveOther("<img class='thumb'>")
        await new Promise(r => setTimeout(r, 30))
        const activeAfterBothDone = playback.hud.$hud_grid_loading.hasClass("active")

        return { activeWhileBothPending, percentAfterOneOfTwo, activeAfterOneOfTwo, activeAfterBothDone }
    })
    expect(result.activeWhileBothPending).toBe(true)
    expect(result.percentAfterOneOfTwo).toBe("50%")
    expect(result.activeAfterOneOfTwo).toBe(true)
    expect(result.activeAfterBothDone).toBe(false)
})

test("grid percentage never divides by a stale 0 total after hiding the grid mid-fetch (regression: -Infinity%)", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const frames = [0, 1, 2].map(i => $(playback.$articles[i]).data("frame"))
        const resolvers = []
        frames.forEach(f => { f.get_preview_thumb = () => new Promise(r => resolvers.push(r)) })

        const $container = playback.hud.$hud_grid.show()
        frames.forEach(f => playback.hud.assureThumbnail(f, $container))
        await new Promise(r => setTimeout(r, 30)) // all 3 now pending, total=3

        playback.hud.$hud_grid.hide() // grid closed while fetches are still in flight
        resolvers[0]("<img class='thumb'>") // settles while grid_visible is false – used to reset total to 0
        await new Promise(r => setTimeout(r, 30))

        playback.hud.$hud_grid.show() // grid reopened, 2 fetches (of the original 3) still pending
        resolvers[1]("<img class='thumb'>") // one more settles: used to compute (0 - 1) / 0 * 100 = -Infinity
        await new Promise(r => setTimeout(r, 30))
        const percentWithOnePending = playback.hud.$hud_grid_loading_percent.text()

        resolvers[2]("<img class='thumb'>")
        await new Promise(r => setTimeout(r, 30))

        return { percentWithOnePending, percentAfterAllDone: playback.hud.$hud_grid_loading_percent.text() }
    })
    expect(result.percentWithOnePending).not.toContain("Infinity")
    expect(result.percentWithOnePending).not.toContain("NaN")
    expect(result.percentAfterAllDone).not.toContain("Infinity")
    expect(result.percentAfterAllDone).not.toContain("NaN")
})

test("Frame.exif reads only the header slice of a large File, not the whole file", async ({ page }) => {
    const seenSize = await page.evaluate(async () => {
        const big = new File([new Uint8Array(1024 * 1024)], "big.jpg", { type: "image/jpeg" }) // 1 MB
        let size = null
        const original = EXIF.getData
        EXIF.getData = (src) => { size = src instanceof Blob ? src.size : -1 } // capture, don't actually parse
        Frame.exif($("<img/>"), big, () => { })
        await new Promise(r => setTimeout(r, 30)) // the read waits for a concurrency slot first
        EXIF.getData = original
        return size
    })
    expect(seenSize).toBe(256 * 1024) // sliced to EXIF_HEADER_BYTES, not the full 1 MB
})
