const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

test("group by tags wraps leftover untagged frames (loose under <main>) into their own section", async ({ page }) => {
    await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1) // one.jpg tagged, two.jpg (frames[1]) stays untagged
        frames[2].set_tag(1) // three.jpg tagged
    })
    await page.evaluate(() => playback.section_controller.group("tags"))

    const loose = await page.evaluate(() => $main.children("article, article-map").length)
    expect(loose).toBe(0) // nothing left directly under <main>

    const sections = await page.evaluate(() =>
        $("main > section").toArray().map(el => $(el).children("article, article-map").length))
    expect(sections.sort()).toEqual([1, 2]) // the tagged section (2 frames) + the untagged catch-all (1)
})

test("group by tags names the section after the tag's name, keeping the tag digit in data-name", async ({ page }) => {
    await page.evaluate(() => {
        $main.attr("data-tag-names", "rodice")
        playback.$articles.toArray().map(el => $(el).data("frame"))[0].set_tag(1)
    })
    await page.evaluate(() => playback.section_controller.group("tags"))

    const section = await page.evaluate(() => {
        const el = $("main > section[data-name='1']")[0]
        return { name: el.dataset.name, title: el.dataset.title }
    })
    expect(section).toEqual({ name: "1", title: "rodice" })

    const label = await page.evaluate(() =>
        playback.section_controller.getSectionName($("main > section[data-name='1']")))
    expect(label).toBe("rodice (1)")
})

test("renaming a tag and re-grouping refreshes the section's title, keeping the same section", async ({ page }) => {
    await page.evaluate(() => {
        $main.attr("data-tag-names", "rodice")
        playback.$articles.toArray().map(el => $(el).data("frame"))[0].set_tag(1)
    })
    await page.evaluate(() => playback.section_controller.group("tags"))
    const before = await page.evaluate(() => $("main > section").length)

    await page.evaluate(() => $main.attr("data-tag-names", "rodina"))
    await page.evaluate(() => playback.section_controller.group("tags"))

    const after = await page.evaluate(() => $("main > section").length)
    expect(after).toBe(before) // same section reused, not a second one created

    const title = await page.evaluate(() => $("main > section[data-name='1']")[0].dataset.title)
    expect(title).toBe("rodina")
})

test("group by tags orders the resulting sections by tag number", async ({ page }) => {
    await page.evaluate(() => {
        const f = playback.$articles.toArray().map(el => $(el).data("frame"))
        f[0].set_tag(3) // tagged out of numeric order on purpose
        f[1].set_tag(1)
        f[2].set_tag(2)
    })
    await page.evaluate(() => playback.section_controller.group("tags"))

    const names = await page.evaluate(() => $("main > section").toArray().map(el => el.dataset.name))
    expect(names).toEqual(["1", "2", "3"])
})

test("group by tags puts the untagged catch-all after the numbered sections", async ({ page }) => {
    await page.evaluate(() => {
        const f = playback.$articles.toArray().map(el => $(el).data("frame"))
        f[0].set_tag(2) // one.jpg
        f[2].set_tag(1) // three.jpg – two.jpg stays untagged
    })
    await page.evaluate(() => playback.section_controller.group("tags"))

    const names = await page.evaluate(() => $("main > section").toArray().map(el => el.dataset.name))
    expect(names).toEqual(["1", "2", undefined]) // numeric first, the data-untagged catch-all last
})

test("untagAll clears every tag inside <main> and is undoable", async ({ page }) => {
    await page.evaluate(() => {
        const f = playback.$articles.toArray().map(el => $(el).data("frame"))
        f[0].set_tag(1)
        f[1].set_tag(2)
    })
    expect(await page.evaluate(() => $("main [data-tag]").length)).toBe(2)

    await page.evaluate(() => playback.section_controller.untagAll($main))
    expect(await page.evaluate(() => $("main [data-tag]").length)).toBe(0)

    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => $("main [data-tag]").length)).toBe(2)
})

test("grid 'Presentation' header shows both section and frame counts", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.toArray().map(el => $(el).data("frame"))[0].set_tag(1)
    })
    await page.evaluate(() => playback.section_controller.group("tags"))

    const label = await page.evaluate(() => playback.section_controller.getSectionName($main, "Presentation"))
    expect(label).toMatch(/^Presentation \(\d+ sections?, \d+ frames?\)$/)
})

test("a plain (no-title) section falls back to 'Section (N)'", async ({ page }) => {
    // FRAME_SELECTOR requires a <main> ancestor, so the section needs to actually be attached there
    const label = await page.evaluate(() => {
        const $section = $("<section/>").append($("<article/>"), $("<article/>")).appendTo($main)
        return playback.section_controller.getSectionName($section)
    })
    expect(label).toBe("Section (2)")
})
