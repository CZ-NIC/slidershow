const path = require("path")
const { REPO_ROOT, withPage, openWithFiles, markVideoStart, pressKeys, wheel, moveMouse, click, narrate } = require("../lib")

/** docs/images.md — the corner points badge: in editing mode (Alt+E) a frame's step-points show as pills
 * in the top-right corner, with a "+" to add one without opening the property panel.
 * Fixed photo: nahodny_fotecky/20260610_083025.jpg (two horses grazing; see photos.json).
 * Key interactions: Alt+E, wheel-zoom, click "+" in the badge, click a pill to reveal its transition/duration row. */
module.exports = () => withPage("points-badge", { record: true }, async page => {
    const photoPath = path.join(REPO_ROOT, "..", "copyright_allowed_to_use", "nahodny_fotecky", "20260610_083025.jpg")
    await openWithFiles(page, [photoPath])
    await page.locator("main article").first().waitFor()
    await page.waitForTimeout(400)
    markVideoStart(page)

    const leftHead = { x: 1050, y: 531 }
    const middleHead = { x: 863, y: 550 }
    const plus = () => page.locator("#hud-points .hud-point-add").first()
    const clickLocator = async (p, loc) => {
        const b = await loc.boundingBox()
        await click(p, b.x + b.width / 2, b.y + b.height / 2)
    }

    await narrate(page, [
        { caption: "Editing mode (Alt+E) …", after: 600, action: p => pressKeys(p, ["Alt", "e"], 400, { repeat: false }) },
        { caption: "Zoom to the first spot …", after: 500, action: p => moveMouse(p, leftHead.x, leftHead.y) },
        { before: 200, after: 700, action: p => wheel(p, -600, leftHead) },
    ])
    await plus().waitFor()
    await narrate(page, [
        { caption: "… and press + in the corner badge to add a point", before: 500, after: 900, action: p => clickLocator(p, plus()) },
        { caption: "Zoom elsewhere …", before: 300, after: 400, action: p => wheel(p, 600, leftHead) },
        { before: 0, after: 700, action: p => wheel(p, -600, middleHead) },
        { caption: "… and add another", before: 400, after: 1000, action: p => clickLocator(p, plus()) },
    ])
    await narrate(page, [
        { caption: "Click a pill to edit its point and timing", before: 300, after: 1500, action: p => clickLocator(p, page.locator("#hud-points .hud-point:not(.hud-point-add)").first()) },
    ])
})
