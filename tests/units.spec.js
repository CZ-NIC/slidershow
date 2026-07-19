const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("getEndTimeFromURL parses ss, mm:ss and hh:mm:ss media fragments", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const values = await page.evaluate(() => [
        getEndTimeFromURL("http://x/v.mp4#t=10,20"),
        getEndTimeFromURL("http://x/v.mp4#t=00:30,01:30"),
        getEndTimeFromURL("http://x/v.mp4#t=0,01:01:10"),
        getEndTimeFromURL("http://x/v.mp4#t=20"), // no end time
    ])
    expect(values).toEqual([20, 90, 3670, undefined])
})
