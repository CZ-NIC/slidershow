const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/points.html")

/** A point pill, as opposed to the trailing "+" button that shares its look. */
const POINT = ".hud-point:not(.hud-point-add)"
const ADD = ".hud-point-add"

/** Enter the presentation in editing mode, with the docs fetch stubbed out. */
async function start(page, hash = "#1?start&editing") {
    await page.goto(FIXTURE + hash)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    await page.evaluate(() => playback.hud._help = [{ page: "images", text: "#" }])
}

test("the points badge shows a frame's points while the properties panel is closed", async ({ page }) => {
    await start(page)

    const badge = page.locator("#hud-points")
    await expect(badge).toBeVisible()
    await expect(badge.locator(POINT)).toHaveCount(2)
    await expect(badge.locator(POINT).first()).toHaveText("[10,20,2]")

    // …and gets out of the way once the panel itself is up
    await page.keyboard.press("Alt+p")
    await expect(badge).toBeHidden()
    await page.keyboard.press("Alt+p")
    await expect(badge).toBeVisible()

    // a frame without points keeps just the "+" – the only hint the image can carry points at all
    // (PageDown would only walk the step-points themselves – they are zoom steps of this very frame)
    await page.evaluate(() => playback.goToFrame(1))
    await expect.poll(() => page.evaluate(() => playback.frame.index)).toBe(1)
    await expect(badge).toBeVisible()
    await expect(badge.locator(POINT)).toHaveCount(0)
    await expect(badge.locator(ADD)).toHaveCount(1)
})

test("the badge's + adds a point without opening the panel", async ({ page }) => {
    await start(page, "#2?start&editing") // an image with no points yet

    await page.locator("#hud-points " + ADD).click()

    await expect(page.locator("#hud-points " + POINT)).toHaveCount(1)
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeTruthy()
    await expect(page.locator("#hud-properties")).toBeHidden()
})

test("the badge is an editing-mode affordance only", async ({ page }) => {
    await start(page, "#1?start")
    await expect(page.locator("#hud-points")).toBeHidden()

    await page.keyboard.press("Alt+e") // editing mode on
    await expect(page.locator("#hud-points")).toBeVisible()
})

test("Alt+s adds a step point with the panel never opened, and the badge shows it", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await start(page, "#2?start&editing")

    await expect(page.locator("#hud-points " + POINT)).toHaveCount(0)
    await page.keyboard.press("Alt+s")

    await expect(page.locator("#hud-points " + POINT)).toHaveCount(1)
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeTruthy()

    // still undoable, panel or no panel
    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeFalsy()
    expect(errors).toEqual([])
})

test("clicking a pill activates it (state 2) without opening the properties panel", async ({ page }) => {
    await start(page)

    const pill = page.locator("#hud-points " + POINT).first()
    await pill.click()
    await expect(pill).toHaveClass(/active/)
    await expect(page.locator("#hud-properties")).toBeHidden()

    // clicking outside any pill drops it back out of state 2
    await page.locator("#hud-points .points-icon").click()
    await expect(page.locator("#hud-points " + POINT + ".active")).toHaveCount(0)
})

test("clicking/dragging the actor being live-edited does not end state 2", async ({ page }) => {
    await start(page)

    const pill = page.locator("#hud-points " + POINT).first()
    await pill.click()
    await expect(pill).toHaveClass(/active/)
    // let the (deferred) click-away listener actually bind before we probe it
    await page.waitForTimeout(50)

    // WZoom (frame_zoom.js) cannot stop its own drag-end click from bubbling to `document` – that
    // click must not itself be read as "clicked elsewhere" and end state 2 (see frame_zoom.js's
    // onDrop comment). Simulated here instead of a real mouse drag, since points.html's fixture
    // images sit far outside the viewport once zoomed/panned to a point.
    await page.evaluate(() => playback.frame.$actor[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })))
    await expect(pill).toHaveClass(/active/)
})

test("activating a pill makes it current (state 1) too, demoting whichever pill was current before", async ({ page }) => {
    await start(page)

    const [first, second] = [page.locator("#hud-points " + POINT).nth(0), page.locator("#hud-points " + POINT).nth(1)]
    await expect(first).toHaveClass(/current/) // the frame opened on its first point

    await second.click()
    await expect(second).toHaveClass(/active/)
    await expect(second).toHaveClass(/current/)
    await expect(first).not.toHaveClass(/current/)

    // leaving state 2 keeps it current – the actor really is sitting at that point now
    await page.locator("#hud-points .points-icon").click()
    await expect(second).not.toHaveClass(/active/)
    await expect(second).toHaveClass(/current/)
})

test("double-clicking a pill removes the point, undoably", async ({ page }) => {
    await start(page)
    await expect(page.locator("#hud-points " + POINT)).toHaveCount(2)

    await page.locator("#hud-points " + POINT).first().dblclick()
    await expect(page.locator("#hud-points " + POINT)).toHaveCount(1)

    await page.evaluate(() => playback.changes.undo())
    await expect(page.locator("#hud-points " + POINT)).toHaveCount(2)
})

test("undoing by keyboard while a point is being edited really undoes it", async ({ page }) => {
    await start(page)
    const points = () => page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))

    await page.locator("#hud-points " + POINT).first().click() // state 2 – the click-away listener is armed
    const transition = page.locator("#hud-points .hud-point-details input.hud-point-duration").first()
    await transition.fill("2.5")
    await transition.dispatchEvent("change")
    expect(JSON.parse(await points())[0]).toEqual([10, 20, 2, 2.5])

    // WebHotkeys runs a shortcut by clicking its HUD button, so Ctrl+Alt+Z's own click reaches the
    // click-away listener right after the undo – which used to save the pre-undo points straight
    // back over it, leaving the pills and the attribute disagreeing.
    await page.keyboard.press("Control+Alt+z")
    await expect.poll(async () => JSON.parse(await points())[0]).toEqual([10, 20, 2])
    await expect(page.locator("#hud-points " + POINT).first()).toHaveText("[10,20,2]")
})

test("a just-added point gets a details row with transition/duration inputs and a remove button, editable without the panel", async ({ page }) => {
    await start(page, "#2?start&editing") // an image with no points yet
    await page.keyboard.press("Alt+s")

    const details = page.locator("#hud-points .hud-point-details")
    const transition = details.locator("input.hud-point-duration").first()
    const duration = details.locator("input.hud-point-duration").last()
    await expect(transition).toHaveAttribute("accesskey", "i")
    await expect(duration).toHaveAttribute("accesskey", "u")

    const points = () => page.evaluate(() => JSON.parse(playback.frame.$actor.attr("sli-step-points")))
    // The point starts at the default view ("[]" – x/y/zoom collapse away); setting a duration must
    // still fill them with the real identity (0,0,1), not leave holes that reload as `null` (see
    // Hud._pointDetails).
    const [x, y, zoom] = [0, 0, 1]

    await transition.fill("2.5")
    await transition.dispatchEvent("change")
    await duration.fill("0.3")
    await duration.dispatchEvent("change")

    await expect.poll(points).toEqual([[x, y, zoom, 2.5, 0.3]])
    // the panel never opened – the fields must not have required it
    await expect(page.locator("#hud-properties")).toBeHidden()

    // each commit is its own undo step, like every other property edit
    await page.evaluate(() => playback.changes.undo())
    await expect.poll(points).toEqual([[x, y, zoom, 2.5]])

    // the remove button deletes the point outright, undoably too
    await details.locator(".hud-point-remove").click()
    await expect.poll(() => page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeFalsy()
    await page.evaluate(() => playback.changes.undo())
    await expect.poll(points).toEqual([[x, y, zoom, 2.5]])
})
