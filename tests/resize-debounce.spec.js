const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test("window resize is debounced: a burst of resize events triggers goToFrame only once, after it settles", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(() => {
        window.__goToFrameCalls = 0
        const original = playback.goToFrame.bind(playback)
        playback.goToFrame = (...args) => {
            window.__goToFrameCalls++
            return original(...args)
        }
        for (let i = 0; i < 10; i++) {
            window.dispatchEvent(new Event("resize"))
        }
    })

    // immediately after the burst, the debounce must not have fired yet
    expect(await page.evaluate(() => window.__goToFrameCalls)).toBe(0)

    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__goToFrameCalls)).toBe(1)
})

test("a resize while still on the menu (before any frame is entered) does not throw", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await page.goto(FIXTURE) // stay on the splash – no #start click, no frame entered yet
    await page.evaluate(() => window.dispatchEvent(new Event("resize")))
    await page.waitForTimeout(300)

    expect(errors).toEqual([])
})
