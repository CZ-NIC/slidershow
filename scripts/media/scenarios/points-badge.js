const path = require("path")
const { withPage, openWithFiles, markVideoStart, pressKeys, wheel, click, narrate } = require("../lib")
const { RANDOM_SUBDIR } = require("../demo-files")

/** docs/images.md — the corner points badge: in editing mode (Alt+E) a frame's step-points show as pills
 * in the top-right corner, with a "+" to add one without opening the property panel.
 * Fixed photo: nahodny_fotecky/20260719_194735.jpg (vintage cream Fiat 500; see photos.json).
 * Key interactions: Alt+E, wheel-zoom, click "+" in the badge (3×), click a pill to reveal its transition/duration row. */
module.exports = () => withPage("points-badge", { record: true }, async page => {
    await openWithFiles(page, [path.join(RANDOM_SUBDIR, "20260719_194735.jpg")])
    await page.locator("main article").first().waitFor()
    await page.waitForTimeout(400)
    markVideoStart(page)

    // viewport coords of the 4:3 photo fitted into 1280×800 (x offset ≈107, scale ≈1.333 of an 800px-wide preview)
    const badge = { x: 380, y: 528 }
    const mirror = { x: 793, y: 387 }
    const wheelHub = { x: 664, y: 680 }
    const plus = () => page.locator("#hud-points .hud-point-add").first()
    const clickLocator = async (p, loc) => {
        const b = await loc.boundingBox()
        await click(p, b.x + b.width / 2, b.y + b.height / 2)
    }

    await narrate(page, [
        { caption: "Editing mode (Alt+E) …", after: 200, action: p => pressKeys(p, ["Alt", "e"], 400, { repeat: false }) },
        { caption: "Zoom to the first spot …", before: 300, after: 350, action: p => wheel(p, -600, badge) },
    ])
    await plus().waitFor()
    await narrate(page, [
        { caption: "… and press + in the corner badge to add a point", before: 300, after: 400, action: p => clickLocator(p, plus()) },
        { caption: "Zoom elsewhere …", before: 150, after: 100, action: p => wheel(p, 600, badge) },
        { before: 0, after: 300, action: p => wheel(p, -600, mirror) },
        { caption: "… and add another", before: 150, after: 350, action: p => clickLocator(p, plus()) },
        { caption: "… and one more", before: 150, after: 100, action: p => wheel(p, 600, mirror) },
        { before: 0, after: 300, action: p => wheel(p, -600, wheelHub) },
        { before: 0, after: 400, action: p => clickLocator(p, plus()) },
    ])
    await narrate(page, [
        { caption: "Click a pill to edit its point and timing", before: 300, after: 900, action: p => clickLocator(p, page.locator("#hud-points .hud-point:not(.hud-point-add)").first()) },
    ])
})
