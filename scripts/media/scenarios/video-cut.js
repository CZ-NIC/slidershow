const { withPage, openWithFiles, markVideoStart, click, pressKeys, narrate } = require("../lib")
const { curatedVideos } = require("../demo-files")

/** docs/video.md — trim a clip's playback range via the sli-video-cut property panel field. */
module.exports = () => withPage("video-cut", { record: true }, async page => {
    const wardrobeMystery = curatedVideos.find(f => f.includes("wardrobe_mystery")) // 37.5s clip
    await openWithFiles(page, [wardrobeMystery])
    markVideoStart(page) // cut the brief real menu/upload flash – it's not what this clip is about
    await page.locator("video").waitFor()

    await narrate(page, [
        {
            caption: "Open the property panel …", after: 900,
            action: async p => {
                await pressKeys(p, ["Alt", "p"], 250, { repeat: false })
                await p.locator('#hud-properties input[name="video-cut"]').waitFor()
            },
        },
        {
            caption: "sli-video-cut: type START,STOP …", after: 500,
            action: async p => {
                const input = p.locator('#hud-properties input[name="video-cut"]')
                const box = await input.boundingBox()
                await click(p, box.x + box.width / 2, box.y + box.height / 2)
                await p.waitForTimeout(400)
                await p.keyboard.type("15,19", { delay: 180 })
            },
        },
        { caption: "… commits and re-cuts the clip", before: 500, after: 1500, action: p => p.keyboard.press("Tab") },
    ])
})
