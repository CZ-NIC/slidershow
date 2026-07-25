const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test("tag_names()/collect_tag_groups read sli-tag-names from <main> even before the first goToFrame (splashscreen)", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").waitFor() // wait for boot, but deliberately don't click – playback.frame is still the dummy pre-boot Frame
    await page.evaluate(() => {
        $main.attr("sli-tag-names", "rodice | vedouci")
        $(playback.$articles[0]).data("frame").$actor.attr("sli-tag", "1")
    })

    expect(await page.evaluate(() => playback.frame.tag_names())).toEqual(["rodice", "vedouci"])

    const groups = await page.evaluate(() => menu.export.collect_tag_groups().map(a => a.name))
    expect(groups).toEqual(["rodice"])
})
