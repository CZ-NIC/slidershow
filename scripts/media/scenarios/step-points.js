const { withPage, openWithFiles, markVideoStart, moveMouse, wheel, pressKeys, narrate } = require("../lib")
const { curatedPhotos } = require("../demo-files")

/** docs/images.md — open the property panel (Alt+P), compose a couple of sli-step-points by zooming/
 * panning and clicking "+", then step through them with the regular next-step key.
 * Uses the middle of 3 curated photos so we can leave-and-return afterward: going FORWARD into a frame
 * primes step playback at its first point, going backward instead jumps straight to the last one (see
 * Frame.steps_prepare's "Adjust initial step" logic) – without that, "n" has nothing to advance through,
 * since the step list is only (re)built on actual frame entry, not when a point is added mid-edit. */
module.exports = () => withPage("step-points", { record: true }, async page => {
    await openWithFiles(page, curatedPhotos.slice(0, 3))
    await page.keyboard.down("Shift")
    await page.keyboard.press("PageDown") // land on the middle photo
    await page.keyboard.up("Shift")
    await page.waitForTimeout(400)
    markVideoStart(page)

    const actorBox = () => page.evaluate(() => {
        const r = playback.frame.$actor[0].getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
    })

    await narrate(page, [
        { caption: "Alt+P opens the property panel", after: 600, action: p => pressKeys(p, ["Alt", "p"], 400, { repeat: false }) },
    ])

    const plusBtn = page.locator('#hud-properties input[name="step-points"] + .hud-point')
    await plusBtn.waitFor()
    const box = await actorBox()
    const spotA = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.38 }
    const spotB = { x: box.x + box.width * 0.32, y: box.y + box.height * 0.68 }

    await narrate(page, [
        { caption: "\"+\" captures the current view as the first point", before: 600, after: 500, action: () => plusBtn.click() },
        { caption: "Zoom and pan to a new spot …", before: 400, action: p => moveMouse(p, spotA.x, spotA.y) },
        { after: 700, action: async p => { await wheel(p, -300, spotA); await p.waitForTimeout(200) } },
        { caption: "… \"+\" captures it as the next point", before: 300, after: 700, action: () => plusBtn.click() },
        { caption: "One more, elsewhere on the photo", before: 400, action: p => moveMouse(p, spotB.x, spotB.y) },
        { after: 700, action: async p => { await wheel(p, -220, spotB); await p.waitForTimeout(200) } },
        { after: 700, action: () => plusBtn.click() },
        { caption: "Alt+P closes the panel", before: 400, after: 500, action: p => pressKeys(p, ["Alt", "p"], 400, { repeat: false }) },
        { caption: "Leaving and returning primes playback at the first point", before: 500, after: 300, action: p => pressKeys(p, ["Shift", "PageUp"], 200, { repeat: false }) },
        { before: 200, after: 700, action: p => pressKeys(p, ["Shift", "PageDown"], 200, { repeat: false }) },
        { caption: "\"n\" (or → / Space) steps through the points", after: 900, action: p => pressKeys(p, ["n"], 200, { repeat: false }) },
        { after: 900, action: p => pressKeys(p, ["n"], 200, { repeat: false }) },
    ])
})
