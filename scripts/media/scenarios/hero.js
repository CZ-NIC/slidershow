const { withPage, presenterUrl, dropFilesOnto, markVideoStart, pressKeys, wheel, moveMouse, narrate } = require("../lib")
const { mixed } = require("../demo-files")

/** docs/index.md — the hero clip: drop a mix of photos+videos onto the menu, watch it start playing
 * (appendFiles() auto-starts – there's no separate "click Start" step in the real flow), then a couple of
 * transitions/zoom beats. */
module.exports = () => withPage("hero", { record: true }, async page => {
    await page.goto(presenterUrl())
    await page.waitForTimeout(400)
    markVideoStart(page) // only trims the brief initial page-load flash, NOT the drop – that's the point of this clip

    await narrate(page, [
        { caption: "Drop a mix of photos and videos onto the menu …", after: 600, action: p => dropFilesOnto(p, p.locator("menu"), mixed(3, 1)) },
    ])
    await page.locator("main article").first().waitFor()
    await page.waitForTimeout(600)
    await narrate(page, [
        { caption: "… and it starts right away", after: 900, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { before: 600, after: 900, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
    ])

    // `main article:visible img` is unreliable here – several off-screen articles can still count as
    // ":visible" (CSS-transformed, not display:none), so it can resolve to a hidden frame's element
    // instead of the one actually on screen. playback.frame.$actor is ground truth for "what's shown now".
    const box = await page.evaluate(() => {
        const r = playback.frame.$actor[0].getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

    await narrate(page, [
        { caption: "Wheel-zoom into any photo …", action: p => moveMouse(p, center.x, center.y) },
        { caption: "… right where you're presenting", before: 400, after: 900, action: p => wheel(p, -200, center) },
    ])
})
