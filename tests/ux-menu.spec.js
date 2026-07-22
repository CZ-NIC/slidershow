const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("repeat wraps from the last frame back to the first", async ({ page }) => {
    // Start on the last frame (basic.html has 3) with repeat preset from the hash.
    await page.goto(FIXTURE + "#3&state=repeat")
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#3")

    // Next frame past the end wraps to the first instead of shaking/staying.
    await page.keyboard.press("Shift+PageDown")
    await expect.poll(() => page.url()).toContain("#1")
})

test("Kiosk button starts playback in repeat mode", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator(".play-mode[data-kiosk]").click()

    // Playback started (splash hidden) and repeat is on – reflected in <main> and the hash.
    await expect(page.locator("menu")).toBeHidden()
    await expect(page.locator("main")).toHaveAttribute("data-repeat", "true")
    await expect.poll(() => page.url()).toContain("state=repeat")
})

test("Auto 5 s button starts playback with auto-forward", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator(".play-mode[data-duration='5']").click()

    await expect(page.locator("menu")).toBeHidden()
    await expect(page.locator("main")).toHaveAttribute("data-duration", "5")
    await expect.poll(() => page.url()).toContain("duration:5")
})

test("countdown bar shows when preset from the hash", async ({ page }) => {
    await page.goto(FIXTURE + "#1&state=progress")
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
