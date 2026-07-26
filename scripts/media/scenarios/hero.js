const {
    withPage, presenterUrl, dropFilesFromSide, markVideoStart, pressKeys, wheel, moveMouse, click, narrate,
    waitForGridSettled, wakeControlIcons,
} = require("../lib")
const { mixed } = require("../demo-files")

/** docs/index.md — the hero clip: drag a mix of photos+videos in from outside, watch it start playing
 * (appendFiles() auto-starts – there's no separate "click Start" step in the real flow), zoom into a
 * photo, then a whistle-stop tour of tagging, the grid and cut/paste. */
module.exports = () => withPage("hero", { record: true }, async page => {
    await page.goto(presenterUrl())
    await page.waitForTimeout(400)
    markVideoStart(page) // only trims the brief initial page-load flash, NOT the drag-in – that's the point of this clip

    await narrate(page, [
        { caption: "Drag files in from anywhere …", after: 600, action: p => dropFilesFromSide(p, p.locator("menu"), mixed(3, 1)) },
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
        { caption: "… as far in as you like …", before: 400, after: 900, action: p => wheel(p, -600, center) },
        { caption: "… rotate with a single key …", after: 900, action: p => pressKeys(p, ["r"], 200, { repeat: false }) },
    ])

    await wakeControlIcons(page) // top-bar icons (☰, ▦, …) auto-hide; wake them before reading their box
    const burger = await page.locator("#playback-icon").boundingBox()
    const burgerCenter = { x: burger.x + burger.width / 2, y: burger.y + burger.height / 2 }
    await narrate(page, [
        { caption: "Open the menu …", after: 400, action: p => click(p, burgerCenter.x, burgerCenter.y) },
    ])
    await page.locator("#hud-menu").waitFor({ state: "visible" })

    const taggingBtn = await page.locator('#hud-menu button[data-hotkey="Alt+t"]').boundingBox()
    await narrate(page, [
        { caption: "Switch to tagging mode …", after: 500, action: p => click(p, taggingBtn.x + taggingBtn.width / 2, taggingBtn.y + taggingBtn.height / 2) },
    ])

    const tag2Btn = await page.locator('#hud-menu button[data-hotkey="Numpad2"]').boundingBox()
    await narrate(page, [
        { caption: "… and tag what matters", after: 600, action: p => click(p, tag2Btn.x + tag2Btn.width / 2, tag2Btn.y + tag2Btn.height / 2) },
    ])

    await narrate(page, [
        { caption: "Close the menu …", after: 500, action: p => click(p, burgerCenter.x, burgerCenter.y) },
    ])

    await wakeControlIcons(page)
    const gridBtn = await page.locator('#control-icons [title="Grid overview"]').boundingBox()
    await narrate(page, [
        { caption: "Jump to the grid …", after: 700, action: p => click(p, gridBtn.x + gridBtn.width / 2, gridBtn.y + gridBtn.height / 2) },
    ])
    await waitForGridSettled(page)

    await narrate(page, [
        { caption: "Cut …", after: 700, action: p => pressKeys(p, ["Control", "x"], 300, { repeat: false }) },
        { caption: "… move to where it belongs …", after: 300, action: p => pressKeys(p, ["ArrowLeft"], 250, { repeat: false }) },
        { after: 700, action: p => pressKeys(p, ["ArrowLeft"], 250, { repeat: false }) },
        { caption: "… and paste", after: 900, action: p => pressKeys(p, ["Control", "v"], 300, { repeat: false }) },
    ])
})
