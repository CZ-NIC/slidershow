const { withPage, openWithFiles, markVideoStart, waitForGridSettled, pressKeys, narrate } = require("../lib")
const { randomPhotos } = require("../demo-files")

/** docs/organizing.md — THE "aha" clip: Alt+T tagging mode, tag a few photos with digit keys, Alt+Shift+G
 * groups them into sections by tag, open the grid to see the result, Ctrl+S to export.
 * Fresh photo slice (43-47) so it doesn't overlap earlier grid/multiselect scenarios.
 * The export dialog is only opened and shown, never confirmed – clicking a real export button would
 * trigger an actual browser download, which isn't part of what this clip demonstrates. */
module.exports = () => withPage("tagging", { record: true }, async page => {
    await openWithFiles(page, randomPhotos.slice(43, 47))
    markVideoStart(page)

    await narrate(page, [
        { caption: "Alt+T starts tagging mode", after: 700, action: p => pressKeys(p, ["Alt", "t"], 400, { repeat: false }) },
        { caption: "A digit tags the current photo", after: 500, action: p => pressKeys(p, ["1"], 250, { repeat: false }) },
        { caption: "Space moves to the next photo", before: 400, after: 400, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { caption: "Tag it differently …", before: 300, after: 500, action: p => pressKeys(p, ["2"], 250, { repeat: false }) },
        { before: 400, after: 400, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { caption: "… and so on for the rest", before: 300, after: 500, action: p => pressKeys(p, ["1"], 250, { repeat: false }) },
        { before: 400, after: 400, action: p => pressKeys(p, ["Space"], 150, { repeat: false }) },
        { before: 300, after: 700, action: p => pressKeys(p, ["2"], 250, { repeat: false }) },
        {
            caption: "Alt+Shift+G groups everything into sections by tag", before: 600, after: 900,
            action: p => pressKeys(p, ["Alt", "Shift", "g"], 400, { repeat: false }),
        },
    ])

    await narrate(page, [
        { caption: "g opens the grid — sorted, ready to review", after: 900, action: p => pressKeys(p, ["g"], 200, { repeat: false }) },
    ])
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await waitForGridSettled(page)
    await page.waitForTimeout(600)

    await narrate(page, [
        { caption: "Ctrl+S exports the sorted presentation", before: 800, after: 1200, action: p => pressKeys(p, ["Control", "s"], 400, { repeat: false }) },
    ])
    await page.keyboard.press("Escape") // close the export dialog without triggering a real download
})
