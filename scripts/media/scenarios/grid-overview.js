const { withPage, openWithFiles, markVideoStart, waitForGridSettled, moveMouse, drag, pressKeys, narrate } = require("../lib")
const { randomPhotos } = require("../demo-files")

/** docs/organizing.md — open the grid, browse thumbnails, drag one frame to reorder it.
 * The actual bound hotkey (operation.js, Switches group) is plain "g", not "Alt+G" as the docs used to
 * say — fixed docs/organizing.md + images.md wording to match (same for ribbon: "j", not "Alt+J").
 * This is the ONE grid scenario that narrates opening the grid itself (caption + "g" key badge) – every
 * other grid/multiselect/tagging scenario opens it silently via openGridSilently(), so a viewer isn't
 * shown the same "press g" beat over and over across a run of clips. */
module.exports = () => withPage("grid-overview", { record: true }, async page => {
    // a real-looking, fuller grid – 12 distinct random photos, not the same couple of demo shots
    await openWithFiles(page, randomPhotos.slice(0, 12))
    markVideoStart(page)

    await narrate(page, [
        { caption: "g opens the grid overview", after: 700, action: p => pressKeys(p, ["g"], 150, { repeat: false }) },
    ])
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await waitForGridSettled(page) // see waitForGridSettled's jsdoc – dragging too early grabs the wrong thumbnail

    // boundingBox() read once and held across a pause goes stale (the grid can still settle/scroll a bit
    // more even after waitForGridSettled) and the drag then grabs whatever thumbnail ended up at those
    // old coordinates instead of the one we showed the cursor sitting on – so re-read fresh right before
    // acting on it each time, not once up front.
    const box = async i => page.locator("#hud-grid frame-preview").nth(i).boundingBox()
    const center = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

    await narrate(page, [
        // land on the source thumbnail and hold there first – otherwise the drag's start is never
        // clearly visible, it just reads as the clone already being wherever it ends up
        { caption: "Drag a thumbnail …", after: 600, action: p => box(0).then(center).then(c => moveMouse(p, c.x, c.y)) },
        {
            caption: "… to reorder it", before: 200, after: 800,
            action: async p => {
                const source = center(await box(0))
                const target = center(await box(4))
                await drag(p, source, target, { steps: 20, durationMs: 900 })
            },
        },
    ])
})
