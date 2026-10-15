const { test, expect } = require("@playwright/test")
const path = require("path")

const fixture = layout => "file://" + path.resolve(__dirname, `fixtures/layout-${layout}.html`)

/** [top, left] of the n-th frame (1-based) in px, as laid out on the canvas. */
const pos = (page, n) => page.locator("main article").nth(n - 1).evaluate(el => [el.offsetTop, el.offsetLeft])

test("row: frames sit side by side, navigation lands on the right one", async ({ page }) => {
    await page.goto(fixture("row") + "#1?start")
    await page.waitForFunction(() => window.playback?.frame)
    const [top1, left1] = await pos(page, 1)
    const [top2, left2] = await pos(page, 2)
    expect(top2).toBe(top1)
    expect(left2).toBe(left1 + (await page.evaluate(() => window.innerWidth)))

    await page.keyboard.press("ArrowRight")
    await expect.poll(() => page.evaluate(() => playback.index)).toBe(1)
    const frame = await page.locator("main article").nth(1).boundingBox()
    expect(Math.round(frame.x)).toBe(0)
    expect(Math.round(frame.y)).toBe(0)
})

test("column: frames are stacked, navigation lands on the right one", async ({ page }) => {
    await page.goto(fixture("column") + "#1?start")
    await page.waitForFunction(() => window.playback?.frame)
    const [top1, left1] = await pos(page, 1)
    const [top2, left2] = await pos(page, 2)
    expect(left2).toBe(left1)
    expect(top2).toBe(top1 + (await page.evaluate(() => window.innerHeight)))

    await page.keyboard.press("ArrowRight")
    await expect.poll(() => page.evaluate(() => playback.index)).toBe(1)
    const frame = await page.locator("main article").nth(1).boundingBox()
    expect(Math.round(frame.x)).toBe(0)
    expect(Math.round(frame.y)).toBe(0)
})

test.describe("touch device", () => {
    test.use({ hasTouch: true, isMobile: true })

    test("column stays a column, anything else becomes a row", async ({ page }) => {
        await page.goto(fixture("column") + "#1?start")
        await page.waitForFunction(() => window.playback?.frame)
        expect(await page.evaluate(() => playback.isMobileMode)).toBe(true)
        const [top1, left1] = await pos(page, 1)
        const [top2, left2] = await pos(page, 2)
        expect(left2).toBe(left1)
        expect(top2).toBeGreaterThan(top1)

        await page.goto(fixture("row") + "#1?start")
        await page.waitForFunction(() => window.playback?.frame)
        const [rtop1] = await pos(page, 1)
        const [rtop2, rleft2] = await pos(page, 2)
        expect(rtop2).toBe(rtop1)
        expect(rleft2).toBeGreaterThan(0)
    })
})
