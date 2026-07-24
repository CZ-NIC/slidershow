const { withPage, openWithFiles, markVideoStart, openGridSilently, pressKeys, narrate } = require("../lib")
const { randomPhotos } = require("../demo-files")

/** docs/organizing.md — Shift+Arrow extends a range selection, Ctrl+Arrow moves the whole block as one
 * undoable step (and is symmetric: right then left returns to the exact original layout).
 * Fresh photo slice (35-42).
 * Only grid-overview.webm demonstrates opening the grid itself – every other grid scenario opens it
 * silently before markVideoStart() so the clip just starts already inside the grid. */
module.exports = () => withPage("multiselect-move", { record: true }, async page => {
    await openWithFiles(page, randomPhotos.slice(35, 43))
    await openGridSilently(page)
    markVideoStart(page)

    await narrate(page, [
        { caption: "Shift+Arrow extends a range from the cursor", after: 300, action: p => pressKeys(p, ["Shift", "ArrowRight"], 150, { repeat: false }) },
        { before: 200, after: 700, action: p => pressKeys(p, ["Shift", "ArrowRight"], 150, { repeat: false }) },
        // holdMs 400 here (not the usual ~150-200) – verified that a short hold sometimes doesn't leave
        // enough real time for the app's Ctrl+Arrow handler to run during a recording session, so the
        // move silently never happens even though the exact same call works fine outside recording.
        { caption: "Ctrl+Arrow moves the whole block at once", after: 900, action: p => pressKeys(p, ["Control", "ArrowRight"], 400, { repeat: false }) },
        { caption: "…and back again — it's symmetric", before: 600, after: 900, action: p => pressKeys(p, ["Control", "ArrowLeft"], 400, { repeat: false }) },
    ])
})
