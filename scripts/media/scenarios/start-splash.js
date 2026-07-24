const { withPage, openPresentation, screenshot } = require("../lib")
const { mixed } = require("../demo-files")

/** docs/playback.md — the menu splash with summary + quick-play buttons + Recent list. */
module.exports = () => withPage("start-splash", {}, async page => {
    await openPresentation(page, mixed())
    await screenshot("start-splash", page)
})
