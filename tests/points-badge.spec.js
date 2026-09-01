const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/points.html")

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
    await expect(badge.locator(".hud-point")).toHaveCount(2)
    await expect(badge.locator(".hud-point").first()).toHaveText("[10,20,2]")

    // …and gets out of the way once the panel itself is up
    await page.keyboard.press("Alt+p")
    await expect(badge).toBeHidden()
    await page.keyboard.press("Alt+p")
    await expect(badge).toBeVisible()

    // a frame without points shows nothing at all
    // (PageDown would only walk the step-points themselves – they are zoom steps of this very frame)
    await page.evaluate(() => playback.goToFrame(1))
    await expect.poll(() => page.evaluate(() => playback.frame.index)).toBe(1)
    await expect(badge).toBeHidden()
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

    await expect(page.locator("#hud-points")).toBeHidden()
    await page.keyboard.press("Alt+s")

    await expect(page.locator("#hud-points .hud-point")).toHaveCount(1)
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeTruthy()

    // still undoable, panel or no panel
    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-step-points"))).toBeFalsy()
    expect(errors).toEqual([])
})

test("clicking the badge opens the properties panel", async ({ page }) => {
    await start(page)
    await page.locator("#hud-points").click()
    await expect(page.locator("#hud-properties")).toBeVisible()
})
