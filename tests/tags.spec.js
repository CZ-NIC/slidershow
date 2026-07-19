const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("set_tag toggles multi-valued tags, clears on 0, persists to localStorage, undo/redo", async ({ page }) => {
    await page.evaluate(() => playback.frame.set_tag(1))
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBe("1")

    await page.evaluate(() => playback.frame.set_tag(2))
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBe("1 2")
    expect(await page.evaluate(() => playback.frame.get_tags())).toEqual([1, 2])

    const filename = await page.evaluate(() => playback.frame.get_filename())
    expect(await page.evaluate(f => localStorage.getItem("TAG: " + f), filename)).toBe("1 2")

    // toggle 1 off again
    await page.evaluate(() => playback.frame.set_tag(1))
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBe("2")

    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBe("1 2")

    await page.evaluate(() => playback.changes.redo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBe("2")

    // 0/null clears all
    await page.evaluate(() => playback.frame.set_tag(null))
    expect(await page.evaluate(() => playback.frame.$actor.attr("data-tag"))).toBeUndefined()
    expect(await page.evaluate(f => localStorage.getItem("TAG: " + f), filename)).toBeNull()
})

test("tag names dialog resolves digits to names in the HUD", async ({ page }) => {
    await page.evaluate(() => playback.operation._nameTagsDialog())
    await page.locator(".ZebraDialog_Prompt_Input").fill("rodiče,vedoucí")
    await page.getByRole("link", { name: "Ok" }).click()
    expect(await page.evaluate(() => $main.attr("data-tag-names"))).toBe("rodiče,vedoucí")

    await page.evaluate(() => playback.frame.set_tag(2))
    expect(await page.evaluate(() => playback.frame.tag_display())).toBe("vedoucí")
    expect(await page.evaluate(() => playback.hud.$hud_tag.text())).toContain("vedoucí")

    await page.evaluate(() => playback.frame.set_tag(9))
    expect(await page.evaluate(() => playback.frame.tag_display())).toBe("vedoucí · 9")
})

test("group by tags uses the first token and notifies about multi-tagged frames", async ({ page }) => {
    const filenames = await page.evaluate(() => playback.$articles.toArray().map(el => $(el).data("frame").get_filename()))
    await page.evaluate((names) => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1)
        frames[1].set_tag(1)
        frames[1].set_tag(2)
        frames[2].set_tag(2)
    }, filenames)

    await page.evaluate(() => playback.section_controller.group("tags"))
    const sectionNames = await page.$$eval("section", els => els.map(e => e.dataset.name))
    expect(sectionNames.sort()).toEqual(["1", "2"])

    await expect(page.locator(".ZebraDialog", { hasText: "má víc tagů" })).toBeVisible()
})
