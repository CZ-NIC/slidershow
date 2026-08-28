const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

/** How many synthetic frames the timing tests build. Enough that an O(n²) lookup is unmistakable. */
const FRAMES = 8000

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

/**
 * Fills the presentation with FRAMES text frames (no media – we time the layout pass, not the network).
 * @returns {Promise<void>}
 */
async function buildBigPresentation(page, count) {
    await page.evaluate(n => {
        const html = Array.from({ length: n }, (_, i) => `<article><p>frame ${i}</p></article>`).join("")
        $("main section:first").append(html)
    }, count)
}

test("positionFrames stays fast with thousands of frames (no O(n²) thumbnail lookup)", async ({ page }) => {
    await buildBigPresentation(page, FRAMES)

    const { count, reset_ms, position_ms } = await page.evaluate(() => {
        Frame.load_all(playback) // create the Frame objects once, outside the measurement
        const t0 = performance.now()
        playback.reset()
        const reset_ms = performance.now() - t0
        const t1 = performance.now()
        playback.positionFrames()
        return { count: playback.$articles.length, reset_ms, position_ms: performance.now() - t1 }
    })

    console.log(`positionFrames: ${count} frames – reset() ${Math.round(reset_ms)} ms, positionFrames() ${Math.round(position_ms)} ms`)
    expect(count).toBeGreaterThanOrEqual(FRAMES)
    // Generous budget – the point is "seconds, not minutes": the old document-wide
    // `frame-preview[data-ref=N]` scan per frame needed tens of seconds here.
    expect(position_ms).toBeLessThan(5000)
    expect(reset_ms).toBeLessThan(15000)
})

test("getThumbnail is a constant-time lookup, not a document scan", async ({ page }) => {
    await buildBigPresentation(page, FRAMES)

    const result = await page.evaluate(async () => {
        Frame.load_all(playback)
        playback.reset()

        const hud = playback.hud
        const frame = $(playback.$articles[100]).data("frame")
        const $c = $("<div/>").appendTo("body")
        hud.assureThumbnail(frame, $c)

        // 20 000 lookups over a document holding thousands of frames – O(n) per lookup could never
        // finish this quickly.
        const t0 = performance.now()
        let hits = 0
        for (let i = 0; i < 20000; i++) {
            hits += hud.getThumbnail(frame, $c).length
        }
        const lookup_ms = performance.now() - t0

        // …and the same lookup by a plain {index} object, the way GridController.scrollToAnchor does it.
        const byIndexOnly = hud.getThumbnail({ index: frame.index }, $c).length
        $c.remove()
        return { hits, lookup_ms, byIndexOnly }
    })

    console.log(`getThumbnail: 20000 lookups in ${Math.round(result.lookup_ms)} ms`)
    expect(result.hits).toBe(20000)
    expect(result.byIndexOnly).toBe(1)
    expect(result.lookup_ms).toBeLessThan(1000)
})

test("the thumbnail index survives renumbering, removal and two containers at once", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const hud = playback.hud
        const first = $(playback.$articles[0]).data("frame")
        const second = $(playback.$articles[1]).data("frame")

        // the same frame previewed in two containers at once (ribbon + grid)
        const $ribbon = hud.$hud_thumbnails
        const $grid = hud.$hud_grid
        hud.assureThumbnail(first, $ribbon)
        hud.assureThumbnail(first, $grid)
        const inBoth = hud.getThumbnail(first).length
        const scopedRibbon = hud.getThumbnail(first, $ribbon).length
        const scopedGrid = hud.getThumbnail(first, $grid).length

        // renumbering: move the first frame behind the second one, then re-layout (positionFrames, not
        // reset() – the latter empties both containers, thumbnails and all)
        first.$frame.insertAfter(second.$frame)
        playback.positionFrames()
        const afterReorder = {
            index: first.index,
            found: hud.getThumbnail(first, $ribbon).length,
            refAttr: Number(hud.getThumbnail(first, $ribbon).attr("data-ref")),
            staleIndexEmpty: hud.getThumbnail({ index: 999 }, $ribbon).length,
        }

        // removal by any of the many `.remove()`/`.html("")` call sites must not leave a phantom
        hud.getThumbnail(first, $grid).remove()
        const afterRemoval = { grid: hud.getThumbnail(first, $grid).length, ribbon: hud.getThumbnail(first, $ribbon).length }

        hud.reset_thumbnails() // empties the ribbon container
        const afterReset = hud.getThumbnail(first).length

        return { inBoth, scopedRibbon, scopedGrid, afterReorder, afterRemoval, afterReset }
    })

    expect(result.inBoth).toBe(2)
    expect(result.scopedRibbon).toBe(1)
    expect(result.scopedGrid).toBe(1)
    expect(result.afterReorder.found).toBe(1)
    expect(result.afterReorder.refAttr).toBe(result.afterReorder.index)
    expect(result.afterReorder.staleIndexEmpty).toBe(0)
    expect(result.afterRemoval.grid).toBe(0)
    expect(result.afterRemoval.ribbon).toBe(1)
    expect(result.afterReset).toBe(0)
})
