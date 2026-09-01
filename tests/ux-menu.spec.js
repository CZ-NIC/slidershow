const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("loop-presentation wraps from the last frame back to the first", async ({ page }) => {
    // Start on the last frame (basic.html has 3) with loop-presentation preset from the hash.
    await page.goto(FIXTURE + "#3?loop-presentation")
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#3")

    // Next frame past the end wraps to the first instead of shaking/staying.
    await page.keyboard.press("Shift+PageDown")
    await expect.poll(() => page.url()).toContain("#1")
})

test("Kiosk button starts playback in loop mode", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator(".play-mode[data-kiosk]").click()

    // Playback started (splash hidden) and loop-presentation is on – reflected in <main> and the hash.
    await expect(page.locator("menu")).toBeHidden()
    await expect(page.locator("main")).toHaveAttribute("sli-loop-presentation", "true")
    await expect.poll(() => page.url()).toContain("loop-presentation")
})

test("Auto 5 s button starts playback with auto-forward", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator(".play-mode[sli-duration='5']").click()

    await expect(page.locator("menu")).toBeHidden()
    await expect(page.locator("main")).toHaveAttribute("sli-duration", "5")
    await expect.poll(() => page.url()).toContain("duration=5")
})

test("countdown bar shows when preset from the hash", async ({ page }) => {
    await page.goto(FIXTURE + "#1?progress")
    await page.locator("#start").click()
    await expect(page.locator("#hud-progress")).toHaveClass(/\bon\b/)
})

test("countdown bar stays hidden by default", async ({ page }) => {
    await page.goto(FIXTURE + "#1")
    await page.locator("#start").click()
    await expect(page.locator("#hud-progress")).not.toHaveClass(/\bon\b/)
})

test("content summary reports the loaded frame count", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#content-summary")).toContainText("3 frames")
})

test("the Escape menu steps aside for the properties panel instead of hiding under it", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    await page.evaluate(() => playback.hud._help = [{ page: "structure", text: "#" }])

    const menu = page.locator("#hud-righttop-wrapper")
    const panel = page.locator("#hud-properties")

    await page.keyboard.press("Escape") // open the menu
    await expect(page.locator("#hud-menu")).toBeVisible()
    const alone = await menu.boundingBox()

    await page.keyboard.press("Alt+p")
    await expect(panel).toBeVisible()
    await expect(page.locator("#hud")).toHaveClass(/properties-open/)

    const shifted = await menu.boundingBox()
    const box = await panel.boundingBox()
    expect(shifted.x).toBeLessThan(alone.x) // moved left, out of the corner
    expect(shifted.x + shifted.width).toBeLessThanOrEqual(box.x + 1) // and no longer overlaps

    // closing the panel gives the corner back
    await page.keyboard.press("Alt+p")
    await expect(page.locator("#hud")).not.toHaveClass(/properties-open/)
    expect((await menu.boundingBox()).x).toBeCloseTo(alone.x, 0)
})
