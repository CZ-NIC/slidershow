const { test, expect } = require("@playwright/test")
const path = require("path")
const fs = require("fs")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")
// Saved next to the fixture so the exported <script src> relative path keeps working. Gitignored.
const EXPORTED = path.resolve(__dirname, "fixtures/exported.tmp.html")

test.afterAll(() => fs.rmSync(EXPORTED, { force: true }))

test("export round-trips: the exported file boots and keeps frames + data attributes", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(() => {
            menu.export.file_handler_wanted = false // force the <a download> path instead of showSaveFilePicker
            menu.export.export()
        }),
    ])
    await download.saveAs(EXPORTED)

    await page.goto("file://" + EXPORTED)
    await expect(page.locator("#start")).toBeVisible()
    await expect(page.locator("article")).toHaveCount(3)
    await expect(page.locator("article[sli-duration='7.5']")).toHaveCount(1)

    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.keyboard.press("PageDown")
    await expect.poll(() => page.url()).toContain("#2")
})
