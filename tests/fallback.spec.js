const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/fallback.html")

test("get_fallback_src() resolves a space-separated data-fallback into an ordered candidate list", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const candidates = await page.evaluate(() => Frame.get_fallback_src($("img")))
    expect(candidates).toEqual(["does-not-exist-broken-original.jpg", "exif.jpeg"])
})

test("a broken original falls through data-fallback candidates in order, using the first that actually loads", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    // the 1st candidate (does-not-exist-*.jpg) 404s; the 2nd (exif.jpeg) is a real file and must win
    await expect.poll(() => page.locator("main img").getAttribute("src")).toBe("exif.jpeg")
})
