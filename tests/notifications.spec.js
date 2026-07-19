const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("info() auto_close scales with message length and is kept in history", async ({ page }) => {
    const short = await page.evaluate(() => {
        playback.hud.info("short")
        return playback.hud.info_history.at(-1)
    })
    expect(short.text).toBe("short")

    const longText = "x".repeat(100)
    await page.evaluate((t) => playback.hud.info(t), longText)
    expect(await page.evaluate(() => playback.hud.info_history.length)).toBe(2)
    expect(await page.evaluate(() => playback.hud.info_history.at(-1).text)).toBe(longText)
})

test("notification history command shows past notifications newest-first", async ({ page }) => {
    await page.evaluate(() => {
        playback.hud.info("first message")
        playback.hud.ok("Title", "second message")
    })
    await page.evaluate(() => playback.hud.show_notification_history())
    const dialog = page.locator(".ZebraDialog", { hasText: "Historie notifikací" })
    await expect(dialog).toBeVisible()
    const text = await dialog.textContent()
    expect(text.indexOf("second message")).toBeLessThan(text.indexOf("first message"))
})

test("history is bounded to the last 50 entries", async ({ page }) => {
    const length = await page.evaluate(() => {
        for (let i = 0; i < 60; i++) {
            playback.hud.info("msg " + i, true)
        }
        return playback.hud.info_history.length
    })
    expect(length).toBe(50)
    expect(await page.evaluate(() => playback.hud.info_history.at(-1).text)).toBe("msg 59")
})
