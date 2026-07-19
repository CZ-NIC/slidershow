const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

const order = page => page.$$eval("main article", els => els.map(e => e.textContent.trim()))

test("moveFrame goes through Changes and undo/redo restores the DOM", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    expect(await order(page)).toEqual(["Frame one", "Frame two", "Frame three"])

    await page.evaluate(() => playback.section_controller.moveFrame(0, 1, false))
    expect(await order(page)).toEqual(["Frame two", "Frame one", "Frame three"])

    await page.evaluate(() => playback.changes.undo())
    expect(await order(page)).toEqual(["Frame one", "Frame two", "Frame three"])

    await page.evaluate(() => playback.changes.redo())
    expect(await order(page)).toEqual(["Frame two", "Frame one", "Frame three"])
})
