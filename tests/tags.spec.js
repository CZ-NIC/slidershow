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
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBe("1")

    await page.evaluate(() => playback.frame.set_tag(2))
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBe("1 2")
    expect(await page.evaluate(() => playback.frame.get_tags())).toEqual([1, 2])

    const filename = await page.evaluate(() => playback.frame.get_filename())
    expect(await page.evaluate(f => localStorage.getItem("sli:tag:" + f), filename)).toBe("1 2")

    // toggle 1 off again
    await page.evaluate(() => playback.frame.set_tag(1))
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBe("2")

    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBe("1 2")

    await page.evaluate(() => playback.changes.redo())
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBe("2")

    // 0/null clears all
    await page.evaluate(() => playback.frame.set_tag(null))
    expect(await page.evaluate(() => playback.frame.$actor.attr("sli-tag"))).toBeUndefined()
    expect(await page.evaluate(f => localStorage.getItem("sli:tag:" + f), filename)).toBeNull()
})

test("text frames (no media) are taggable too – sli-tag lands on the article itself", async ({ page }) => {
    await page.evaluate(() => {
        $main.empty()
        $("<section/>").append($("<article/>").html("<h1>Intro</h1><p>text only</p>")).appendTo($main)
        playback.reset()
        const $f = $("main article").first()
        playback.frame = $f.data("frame"); playback.$current = $f; playback.index = 0
    })
    await page.evaluate(() => playback.frame.set_tag(2))
    expect(await page.evaluate(() => playback.frame.$frame.attr("sli-tag"))).toBe("2")
    expect(await page.evaluate(() => playback.frame.get_tags())).toEqual([2])

    await page.evaluate(() => playback.frame.set_tag(2)) // toggle off
    expect(await page.evaluate(() => playback.frame.$frame.attr("sli-tag"))).toBeUndefined()
})

test("tag names dialog resolves digits to names in the HUD", async ({ page }) => {
    await page.evaluate(() => playback.operation._nameTagsDialog())
    const inputs = page.locator(".tag-names-list input")
    await inputs.nth(0).fill("rodiče")
    await inputs.nth(1).fill("vedoucí")
    await page.getByRole("link", { name: "Ok" }).click()
    expect(await page.evaluate(() => $main.attr("sli-tag-names"))).toBe("rodiče | vedoucí")

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
    const sectionNames = await page.$$eval("section", els => els.map(e => e.getAttribute("sli-name")))
    expect(sectionNames.sort()).toEqual(["1", "2"])

    await expect(page.locator(".ZebraDialog", { hasText: "have more than one tag" })).toBeVisible()
})

test("Name tags dialog: first input is focused, Enter confirms, URL-unsafe chars are rejected", async ({ page }) => {
    await page.evaluate(() => playback.operation._nameTagsDialog())
    await expect(page.locator(".tag-names-list input").first()).toBeFocused()

    // invalid characters: : & + break URL encoding – warned, nothing is saved (the dialog itself still
    // closes on Ok/Enter – the library has no notion of "stay open, this input was rejected" for custom inline content)
    await page.locator(".tag-names-list input").first().fill("a:b")
    await page.keyboard.press("Enter")
    const warning = page.locator(".ZebraDialog", { hasText: "Remove" })
    await expect(warning).toBeVisible()
    expect(await page.evaluate(() => $main.attr("sli-tag-names"))).toBeUndefined()
    await warning.getByRole("link", { name: "Ok" }).click() // dismiss the warning
    await expect(warning).not.toBeVisible() // let its close animation finish before reopening

    // reopen, fix the value, Enter confirms via keydown (not just a click) – scoped to the now-visible
    // dialog since the first one's (closed, but not detached) .tag-names-list is still in the DOM
    await page.evaluate(() => playback.operation._nameTagsDialog())
    await page.locator(".ZebraDialog:visible .tag-names-list input").first().fill("rodina")
    await page.keyboard.press("Enter")
    await expect(page.locator(".ZebraDialog:visible")).toHaveCount(0)
    expect(await page.evaluate(() => $main.attr("sli-tag-names"))).toBe("rodina")
})

test("Name tags dialog shows the frame count carrying each tag next to its input", async ({ page }) => {
    await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1)
        frames[1].set_tag(1)
        frames[2].set_tag(2)
    })
    await page.evaluate(() => playback.operation._nameTagsDialog())
    const counts = page.locator(".tag-names-list label .tag-count")
    await expect(counts.nth(0)).toHaveText(" (2)") // tag 1 on two frames
    await expect(counts.nth(1)).toHaveText(" (1)") // tag 2 on one frame
    await expect(counts.nth(2)).toHaveText("")     // tag 3 unused → no count shown
})

test("tag names persist to localStorage keyed by document name and restore on a fresh load", async ({ page }) => {
    await page.evaluate(() => playback.operation._nameTagsDialog())
    await page.locator(".tag-names-list input").first().fill("rodina")
    await page.getByRole("link", { name: "Ok" }).click()

    const key = await page.evaluate(() => "TAG-NAMES: " + docname())
    expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe("rodina")

    // simulate a crash/reload of the very same (unsaved) presentation: sli-tag-names is gone from the
    // fresh DOM, but the boot-time restore in Playback's constructor should bring it back from localStorage
    await page.reload()
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    expect(await page.evaluate(() => $main.attr("sli-tag-names"))).toBe("rodina")
})

test("Filter by tag dialog: first checkbox is focused and Enter confirms (with whatever is checked)", async ({ page }) => {
    await page.evaluate(() => playback.frame.set_tag(1))
    await page.evaluate(() => playback.operation._filterByTagDialog())
    const firstCheckbox = page.locator(".tag-filter-list input").first()
    await expect(firstCheckbox).toBeFocused()

    await firstCheckbox.check() // Enter itself doesn't toggle a checkbox – only Space/click do
    await page.keyboard.press("Enter")
    await expect(page.locator(".ZebraDialog:visible")).toHaveCount(0)
    expect(await page.evaluate(() => playback.tag_filter)).toEqual([1])
})
