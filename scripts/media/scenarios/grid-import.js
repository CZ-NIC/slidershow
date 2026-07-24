const { withPage, openWithFiles, markVideoStart, openGridSilently, dropFilesOnto, narrate } = require("../lib")
const { randomPhotos } = require("../demo-files")

/** docs/organizing.md — "Import new images just by dragging them in": drop real files onto an existing
 * grid thumbnail. Uses dropFilesOnto() since this needs a real OS-style file drop (dataTransfer.items),
 * not the internal jQuery UI reorder-drag grid-overview.js uses.
 * Fresh photo slices (20-24 loaded, 25-26 dropped in) so nothing overlaps earlier grid scenarios.
 * Only grid-overview.webm demonstrates opening the grid itself – every other grid scenario opens it
 * silently before markVideoStart() so the clip just starts already inside the grid. */
module.exports = () => withPage("grid-import", { record: true }, async page => {
    await openWithFiles(page, randomPhotos.slice(20, 25))
    await openGridSilently(page)
    markVideoStart(page)

    const target = page.locator("#hud-grid frame-preview").first()

    await narrate(page, [
        {
            caption: "Drag new photos straight onto the grid to import them", after: 1000,
            action: p => dropFilesOnto(p, target, randomPhotos.slice(25, 27)),
        },
    ])
})
