const { withPage, openWithFiles, markVideoStart, moveMouse, wheel, pressKeys, narrate } = require("../lib")
const { curatedPhotos } = require("../demo-files")

/** docs/images.md — wheel-zoom into a photo, arrow-crawl around it. */
module.exports = () => withPage("zoom", { record: true }, async page => {
    const battleDog = curatedPhotos.find(f => f.includes("battle_dog"))
    await openWithFiles(page, [battleDog])
    markVideoStart(page) // cut the brief real menu/upload flash – it's not what this clip is about
    const img = page.locator("main article:visible img")
    await img.waitFor()
    const box = await img.boundingBox()
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    // the dog's face sits right-and-above the image's own centre
    const face = { x: center.x + box.width * 0.1, y: center.y - box.height * 0.15 }

    await narrate(page, [
        { caption: "Mouse wheel over the photo …", action: p => moveMouse(p, face.x, face.y) },
        {
            caption: "… scrolls to zoom in", before: 400, after: 800,
            // only 2 ticks – enough to read as "zoomed in on the dog", not a runaway zoom
            action: async p => {
                for (let i = 0; i < 2; i++) {
                    await wheel(p, -120, face)
                    await p.waitForTimeout(250)
                }
            },
        },
        // small, symmetric crawl (right+down, then left+up cancels it out) – stays on the dog's face
        // instead of drifting off the edge of the photo
        { caption: "Arrow keys crawl around the zoomed photo", after: 350, action: p => pressKeys(p, ["ArrowRight"], 200) },
        { after: 500, action: p => pressKeys(p, ["ArrowDown"], 200) },
        { caption: "Holding two arrows at once works too", after: 1000, action: p => pressKeys(p, ["ArrowLeft", "ArrowUp"], 200) },
    ])
})
