const { withPage, openWithFiles, markVideoStart, openGridSilently, pressKeys, narrate } = require("../lib")
const { randomPhotos, KNOWN_BAD_EXIF } = require("../demo-files")

/** docs/organizing.md — Space+arrows build a scattered multi-selection (plain Arrow keeps the selection,
 * only Space toggles). Fresh photo slice (27-34) so it doesn't overlap earlier grid scenarios.
 * Only grid-overview.webm demonstrates opening the grid itself – every other grid scenario opens it
 * silently before markVideoStart() so the clip just starts already inside the grid. */
module.exports = () => withPage("multiselect-scatter", { record: true }, async page => {
    // 20260720_082551.jpg (normally index 30) is in KNOWN_BAD_EXIF – its malformed EXIF crashes exif-js
    // with an uncaught RangeError that the app's global error handler then shows as a visible toast.
    const photos = randomPhotos.slice(27, 36).filter(f => !KNOWN_BAD_EXIF.some(bad => f.includes(bad))).slice(0, 8)
    await openWithFiles(page, photos)
    await openGridSilently(page)
    markVideoStart(page)

    await narrate(page, [
        { caption: "Space toggles the current frame into the selection", after: 400, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { caption: "A plain arrow moves the cursor, KEEPING the selection", before: 500, after: 300, action: p => pressKeys(p, ["ArrowRight"], 120, { repeat: false }) },
        { before: 200, after: 300, action: p => pressKeys(p, ["ArrowRight"], 120, { repeat: false }) },
        { caption: "Space again picks up another, scattered one", before: 400, after: 400, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { before: 400, after: 300, action: p => pressKeys(p, ["ArrowRight"], 120, { repeat: false }) },
        { before: 200, after: 300, action: p => pressKeys(p, ["ArrowRight"], 120, { repeat: false }) },
        { caption: "A scattered pick, built with Space+arrows alone", before: 400, after: 900, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
    ])
})
