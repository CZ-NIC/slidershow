const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/video-points.html")

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

    expect(JSON.parse(await points(page))).toEqual([[3, "goto:12"]])
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

test("clicking a video pill in the panel edits it through the same dialog", async ({ page }) => {
    await start(page, "#1?start&editing&properties")
    await page.locator("#hud-properties .point-wrapper .hud-point").first().click()

    const dialog = page.locator(".video-point-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.locator("input[type=number]").first()).toHaveValue("2")

    await dialog.locator(".vp-rules label").nth(2).locator("input[type=checkbox]").check() // pause
    await confirm(page)

    expect(JSON.parse(await points(page))[0]).toEqual([2, "goto:5", "pause"])
})

test("a video point is removed from its dialog", async ({ page }) => {
    await start(page, "#1?start&editing&properties")
    await page.locator("#hud-properties .point-wrapper .hud-point").first().click()
    await confirm(page, "Remove")

    expect(JSON.parse(await points(page))).toEqual([[8]])
})

test("\"Zoom live\" hands over to the pill's live editing", async ({ page }) => {
    await start(page, "#1?start&editing&properties")
    await page.locator("#hud-properties .point-wrapper .hud-point").first().click()
    await confirm(page, "Zoom live")

    // the point stays selected, so every zoom/rotate of the video now writes into it –
    // and the video sits at the point itself, not at its goto target
    await expect(page.locator("#hud-properties .hud-point.active")).toHaveCount(1)
    await expect(page.locator("#hud-properties .hud-point.active")).toHaveText('[2,"goto:5"]')
    expect(await page.evaluate(() => playback.frame.$actor[0].currentTime)).toBe(2)
})
