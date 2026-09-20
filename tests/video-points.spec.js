const { test, expect } = require("@playwright/test")
const path = require("path")
const fs = require("fs")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/video-points.html")
const VIDEO_CUT_FIXTURE = "file://" + path.resolve(__dirname, "fixtures/video-cut.html")

/** Enter the presentation in editing mode, with the docs fetch stubbed out. */
async function start(page, hash = "#1?start&editing") {
    await page.goto(FIXTURE + hash)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    await page.evaluate(() => playback.hud._help = [{ page: "video", text: "#" }])
}

/** The <input> the panel writes the points to, no matter whether the panel was ever opened. */
const points = page => page.evaluate(() => playback.frame.$actor.attr("sli-video-points"))

/** Park the video at `time` (a paused video would make the dialog's "resume" path untestable). */
async function seek(page, time, play = false) {
    await page.evaluate(async ([time, play]) => {
        const video = playback.frame.$actor[0]
        video.muted = false
        video.currentTime = time
        if (play) {
            await video.play()
        } else {
            video.pause()
        }
    }, [time, play])
}

/** Confirm the dialog and wait until it is really gone (it holds the hotkeys suspended until then). */
async function confirm(page, caption = "Ok") {
    await page.locator(".ZebraDialog a", { hasText: caption }).click()
    await expect(page.locator(".ZebraDialog")).toHaveCount(0)
}

test("the badge shows video points in their own format", async ({ page }) => {
    await start(page)
    const badge = page.locator("#hud-points")
    await expect(badge).toBeVisible()
    await expect(badge.locator(".points-icon")).toHaveText("🎬")
    await expect(badge.locator(".hud-point").first()).toHaveText('[2,"goto:5"]')
})

test("Alt+v asks what the point should do, pauses meanwhile and resumes after", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await start(page, "#2?start&editing")
    await seek(page, 3, true)

    await page.keyboard.press("Alt+v")
    await expect(page.locator(".video-point-dialog")).toBeVisible()
    expect(await page.evaluate(() => playback.frame.$actor[0].paused)).toBe(true)

    // rules the plain snapshot could never express
    const dialog = page.locator(".video-point-dialog")
    await dialog.locator(".vp-rules label").first().locator("input[type=checkbox]").check()
    await dialog.locator(".vp-rules label").first().locator("input[type=number]").fill("12")
    await confirm(page)

    // the time comes from the playhead, which kept running until the dialog paused it
    const [[time, ...rules]] = JSON.parse(await points(page))
    expect(rules).toEqual(["goto:12"])
    expect(time).toBeCloseTo(3, 1)
    await expect.poll(() => page.evaluate(() => playback.frame.$actor[0].paused)).toBe(false)

    // still undoable, panel or no panel
    await page.evaluate(() => playback.changes.undo())
    expect(await points(page)).toBeFalsy()
    expect(errors).toEqual([])
})

test("Cancel adds nothing and keeps the video where it was", async ({ page }) => {
    await start(page, "#2?start&editing")
    await seek(page, 4)

    await page.keyboard.press("Alt+v")
    await confirm(page, "Cancel")
    expect(await points(page)).toBeFalsy()
    // the video was paused before, so it stays paused
    expect(await page.evaluate(() => playback.frame.$actor[0].paused)).toBe(true)
})

test("a second Alt+v offers to cut – the previous bare point gets the jump target", async ({ page }) => {
    await start(page, "#2?start&editing")

    await seek(page, 2)
    await page.keyboard.press("Alt+v")
    await confirm(page)
    expect(JSON.parse(await points(page))).toEqual([[2]])

    await seek(page, 7)
    await page.keyboard.press("Alt+v")
    // a bare previous point is almost certainly half a cut – continuing it is the default
    await expect(page.locator(".video-point-dialog input[value=continue]")).toBeChecked()
    await confirm(page)

    expect(JSON.parse(await points(page))).toEqual([[2, "goto:7"]])
})

test("Shift+Alt+v keeps the old no-dialog snapshot", async ({ page }) => {
    await start(page, "#2?start&editing")
    await seek(page, 5)

    await page.keyboard.press("Shift+Alt+v")
    await expect(page.locator(".video-point-dialog")).toHaveCount(0)
    expect(JSON.parse(await points(page))).toEqual([[5]])
})

test("clicking a video pill edits its rules in place, with the video paused at that very moment", async ({ page }) => {
    await start(page)
    await seek(page, 12, true)

    const pill = page.locator("#hud-points .hud-point").first()
    await pill.click()

    // no dialog over the video – the moment the point talks about stays visible while it is tuned
    await expect(page.locator(".video-point-dialog")).toHaveCount(0)
    await expect(pill).toHaveClass(/active/)
    const details = page.locator("#hud-points .hud-point-details")
    await expect(details).toBeVisible()
    await expect(details.locator("input[type=number]").first()).toHaveValue("2")
    expect(await page.evaluate(() => playback.frame.$actor[0].paused)).toBe(true)
    expect(await page.evaluate(() => playback.frame.$actor[0].currentTime)).toBe(2)

    // the jump target (the point's second number) is editable right there
    const goto = details.locator("input[type=number]").nth(1)
    await goto.fill("9")
    await goto.dispatchEvent("change")
    expect(JSON.parse(await points(page))).toEqual([[2, "goto:9"], [8]])

    // a hundredth of a second is settable – a cut has to land on the right frame
    const time = details.locator("input[type=number]").first()
    await time.fill("3.25")
    await time.dispatchEvent("change")
    expect(JSON.parse(await points(page))).toEqual([[3.25, "goto:9"], [8]])

    // …as is pausing / muting, which no position could express
    await details.locator("input[type=checkbox]").last().check() // pause
    await details.locator("select").selectOption("mute")
    expect(JSON.parse(await points(page))).toEqual([[3.25, "goto:9", "pause", "mute"], [8]])

    // each commit is its own undo step, like every other property edit
    await page.evaluate(() => playback.changes.undo())
    expect(JSON.parse(await points(page))).toEqual([[3.25, "goto:9", "pause"], [8]])

    // leaving the editing resumes the playback it interrupted
    await page.locator("#hud-points .points-icon").click()
    await expect.poll(() => page.evaluate(() => playback.frame.$actor[0].paused)).toBe(false)
})

test("a video point is removed from its detail row", async ({ page }) => {
    await start(page)
    await page.locator("#hud-points .hud-point").first().click()
    await page.locator("#hud-points .hud-point-remove").click()

    expect(JSON.parse(await points(page))).toEqual([[8]])
    await page.evaluate(() => playback.changes.undo())
    expect(JSON.parse(await points(page))[0]).toEqual([2, "goto:5"])
})

test("a video point has a transition, but no duration – the video decides when the next one comes", async ({ page }) => {
    await start(page)
    await page.locator("#hud-points .hud-point").first().click()

    const details = page.locator("#hud-points .hud-point-details")
    await expect(details.locator("input[type=number][accesskey=i]")).toHaveCount(1) // "Transition"
    // "Duration" is a step-point-only field (Alt+u here belongs to the "pause" checkbox instead)
    await expect(details.locator("input[type=number][accesskey=u]")).toHaveCount(0)
})

test("\"Zoom live\" hands over to the pill's live editing", async ({ page }) => {
    await start(page, "#2?start&editing")
    await seek(page, 3)

    await page.keyboard.press("Alt+v")
    await confirm(page, "Zoom live")

    // the point stays selected, so every zoom/rotate of the video now writes into it
    await expect(page.locator("#hud-points .hud-point.active")).toHaveCount(1)
    await expect(page.locator("#hud-points .hud-point.active")).toHaveText("[3]")
    expect(await page.evaluate(() => playback.frame.$actor[0].currentTime)).toBe(3)
})

test("video cut trim lives in sli-src, survives unload/reload, and reaches the export", async ({ page }) => {
    await page.goto(VIDEO_CUT_FIXTURE + "#1?start&editing")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)

    await page.evaluate(() => playback.frame.setVideoCut(playback.frame.$actor, 2, 8))
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-src"))).toBe("clip.mp4#t=2,8")
    expect(await page.evaluate(() => playback.frame.$actor.attr("src"))).toBe("clip.mp4#t=2,8")

    // Simulate the frame falling far outside the preload window: unload() must drop `src` (it is only
    // derived, re-readable state) but the trim must survive – it now lives in sli-src.
    await page.evaluate(() => playback.frame.unload())
    expect(await page.evaluate(() => playback.frame.$actor.attr("src"))).toBeUndefined()
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-src"))).toBe("clip.mp4#t=2,8")

    await page.evaluate(() => playback.frame.preload())
    await expect.poll(() => page.evaluate(() => playback.frame.$actor.attr("src"))).toBeTruthy()
    expect(await page.evaluate(() => playback.frame.getVideoCut(playback.frame.$actor))).toEqual({ start: 2, stop: 8 })

    const EXPORTED = path.resolve(__dirname, "fixtures/exported-video-cut.tmp.html")
    try {
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.evaluate(() => {
                menu.export.file_handler_wanted = false // force the <a download> path instead of showSaveFilePicker
                menu.export.app_code = "cdn" // this fixture is file://, so the default would be "asis" instead
                menu.export.export()
            }),
        ])
        await download.saveAs(EXPORTED)
        const html = fs.readFileSync(EXPORTED, "utf8")

        expect(html).toContain('sli-src="clip.mp4#t=2,8"')
        expect(html).not.toMatch(/<video[^>]* src=/)
    } finally {
        fs.rmSync(EXPORTED, { force: true })
    }
})
