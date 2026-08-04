const path = require("path")
const { REPO_ROOT, withPage, openWithFiles, markVideoStart, pressKeys, wheel, moveMouse, narrate, wakeControlIcons } = require("../lib")

/** docs/index.md — step-points demo: pan/zoom to two spots on a photo, add points (Alt+s) with one
 * rotated, then close the property panel (Alt+p). Shows the authored presentation workflow. */
module.exports = () => withPage("step-points", { record: true }, async page => {
    // The specific photo for this scenario (2 horses, good for panning between heads).
    const photoPath = path.join(REPO_ROOT, "..", "copyright_allowed_to_use", "nahodny_fotecky", "20260610_083025.jpg")

    await openWithFiles(page, [photoPath])
    await page.locator("main article").first().waitFor()
    // Non-zero so the "leaving and returning" jump at the end animates instead of snapping.
    await page.evaluate(() => document.querySelector("main")?.setAttribute("sli-transition-duration", "1"))
    await page.evaluate(() => document.querySelector("main img")?.setAttribute("sli-step-points", "[[], [-1361,-435,7.6],[-740,-498,7.6],[620,542,5,null,null,90]]"))


    await page.waitForTimeout(400)
    markVideoStart(page)

    await narrate(page, [
        { after: 0, action: p => pressKeys(p, ["Home"], 300, { repeat: false }) },
        // { caption: "Zoom out …", before: 0, after: 0, action: p => wheel(p, 480, { x: 1000, y: 500 }) },
        // // { caption: "Leaving and returning primes playback at the first point", before: 500, after: 300, action: p => pressKeys(p, ["Shift", "PageUp"], 200, { repeat: false }) },
        // { caption: "Reset playback to the beginning", before: 500, after: 1500, action: p => pressKeys(p, ["Home"], 200, { repeat: false }) },
        // { before: 200, after: 700, action: p => pressKeys(p, ["Home"], 200, { repeat: false }) },
        { caption: "Hit \"n\" / → / Space to step through the previously set points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        { after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        { after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        { caption: "The playback moves automatically and respects the rotation", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        // { caption: "\"n\" (or → / Space) 3steps through the points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        // { caption: "\"n\" (or → / Space) 4steps through the points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
        // { after: 900, action: p => pressKeys(p, ["n"], 200, { repeat: false }) },
    ])

    // const leftHeadX = 1050, leftHeadY = 531
    // await narrate(page, [
    //     { caption: "Pan to the first point …", action: p => moveMouse(p, leftHeadX, leftHeadY) },
    //     { caption: "… and zoom in.", before: 300, after: 500, action: p => wheel(p, -600, { x: leftHeadX, y: leftHeadY }) },
    // ])
    // await narrate(page, [
    //     { caption: "Open the property panel …", after: 300, action: p => pressKeys(p, ["Alt", "p"], 300, { repeat: false }) },
    // ])
    // await page.locator(".hud-point").first().waitFor()
    // await narrate(page, [
    //     { caption: "… and add a step point", after: 0, action: p => pressKeys(p, ["Alt", "s"], 300, { repeat: false }) },
    // ])

    // await narrate(page, [
    //     { caption: "Zoom out …", before: 0, after: 0, action: p => wheel(p, 600, { x: 1000, y: 500 }) },
    // ])

    // const middleHeadX = 863, middleHeadY = 550
    // await narrate(page, [
    //     { caption: "… choose another place to zoom in …", after: 0, action: p => wheel(p, -600, { x: middleHeadX, y: middleHeadY }) },
    // ])

    // await narrate(page, [
    //     { caption: "… and add a step point", after: 400, action: p => pressKeys(p, ["Alt", "s"], 300, { repeat: false }) },
    // ])

    // await narrate(page, [
    //     { caption: "Let's find another horse …", before: 0, after: 0, action: p => wheel(p, 600, { x: 640, y: 400 }) },
    // ])

    // const rightHeadX = 463, rightHeadY = 602
    // await narrate(page, [
    //     { caption: "… zoom in …", after: 400, action: p => wheel(p, -480, { x: rightHeadX, y: rightHeadY }) },
    // ])

    // await narrate(page, [
    //     { caption: "… rotate …", action: p => pressKeys(p, ["Shift","r"], 50, { repeat: false }) },
    //     {  before: 0, after: 400, action: p => pressKeys(p, ["Shift","r"], 50, { repeat: false }) },
    //     {  before: 0, after: 400, action: p => pressKeys(p, ["Shift","r"], 50, { repeat: false }) },
    //     {  before: 0, after: 400, action: p => pressKeys(p, ["Shift","r"], 50, { repeat: false }) },
    //     {  before: 0, after: 400, action: p => pressKeys(p, ["Shift","r"], 50, { repeat: false }) },
    //     { caption: "… and add the third step point", after: 200, action: p => pressKeys(p, ["Alt", "s"], 300, { repeat: false }) },
    // ])
    // await page.waitForTimeout(200)

    // await narrate(page, [
    //     { caption: "Close the panel", after: 0, action: p => pressKeys(p, ["Alt", "p"], 300, { repeat: false }) },
    //     { caption: "Zoom out …", before: 0, after: 0, action: p => wheel(p, 480, { x: 1000, y: 500 }) },
    //     // { caption: "Leaving and returning primes playback at the first point", before: 500, after: 300, action: p => pressKeys(p, ["Shift", "PageUp"], 200, { repeat: false }) },
    //     { caption: "Reset playback to the beginning", before: 500, after: 1500, action: p => pressKeys(p, ["Home"], 200, { repeat: false }) },
    //     // { before: 200, after: 700, action: p => pressKeys(p, ["Home"], 200, { repeat: false }) },
    //     { caption: "\"n\" (or → / Space) steps through the points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
    //     { caption: "the playback moves automatically and respects the rotation", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
    //     // { caption: "\"n\" (or → / Space) 3steps through the points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
    //     // { caption: "\"n\" (or → / Space) 4steps through the points", after: 900, action: p => pressKeys(p, ["Space"], 200, { repeat: false }) },
    //     // { after: 900, action: p => pressKeys(p, ["n"], 200, { repeat: false }) },
    // ])
})
