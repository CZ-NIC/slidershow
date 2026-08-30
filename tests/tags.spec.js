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
    const inputs = page.locator(".tag-names-list input[type=text]")
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

test("Name tags dialog: 🙈 checkbox writes sli-tag-hidden (tag digits and the untagged pseudo-tag), undo restores it", async ({ page }) => {
    await page.evaluate(() => playback.operation._nameTagsDialog())
    await page.locator(".tag-names-list label").filter({ hasText: "1:" }).locator(".tag-hidden-checkbox").check()
    await page.locator(".tag-untagged-row .tag-hidden-checkbox").check()
    await page.getByRole("link", { name: "Ok" }).click()
    expect(await page.evaluate(() => $main.attr("sli-tag-hidden"))).toBe("1 0")

    await page.evaluate(() => playback.changes.undo())
    expect(await page.evaluate(() => $main.attr("sli-tag-hidden"))).toBeUndefined()
})

test("Frame.is_tag_hidden matches a frame's own tags, or the untagged sentinel for tag-less frames", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(0).data("frame").set_tag(1) // one.jpg tagged, two/three.jpg untagged
        $main.attr("sli-tag-hidden", "1")
    })
    expect(await page.evaluate(() => playback.$articles.eq(0).data("frame").is_tag_hidden())).toBe(true)
    expect(await page.evaluate(() => playback.$articles.eq(1).data("frame").is_tag_hidden())).toBe(false)

    await page.evaluate(() => $main.attr("sli-tag-hidden", "0"))
    expect(await page.evaluate(() => playback.$articles.eq(0).data("frame").is_tag_hidden())).toBe(false) // tagged, sentinel doesn't apply
    expect(await page.evaluate(() => playback.$articles.eq(1).data("frame").is_tag_hidden())).toBe(true) // untagged
})

test("Cycle hidden-tag view (dim/hide/show/lock): skips hidden frames in playback except in 'show'", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg (index 1) carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
    })
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("dim") // default

    // "dim": still skipped during navigation (grid is closed here – see the grid.spec.js reachability test)
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).not.toBe(1)

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> hide
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("hide")
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).not.toBe(1)

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> show
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("show")
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).toBe(1) // hiding suppressed, frame reachable again

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> lock
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("lock")
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).not.toBe(1)

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // back to dim
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("dim")
})

test("The grid's own cursor/click navigation always reaches a hidden frame (dim/hide/show), closing the grid shows it once – except in 'lock'", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg (index 1) carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.hud.toggle_grid()
    })

    // "dim" (default): the grid can still move its cursor onto the hidden frame directly
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).toBe(1)

    // Closing the grid on it shows it once, instead of redirecting away now that grid_visible is false
    await page.evaluate(() => playback.hud.toggle_grid())
    expect(await page.evaluate(() => playback.index)).toBe(1)

    // Stepping onward resumes the normal skip
    await page.evaluate(() => playback.previousFrame())
    expect(await page.evaluate(() => playback.index)).toBe(0)
    await page.evaluate(() => playback.nextFrame())
    expect(await page.evaluate(() => playback.index)).toBe(2) // skipped back over 1

    // "lock": the grid itself now also refuses to land on it
    await page.evaluate(() => {
        playback.hud.toggle_grid()
        playback.operation._cycleTagHiddenMode() // dim -> hide
        playback.operation._cycleTagHiddenMode() // hide -> show
        playback.operation._cycleTagHiddenMode() // show -> lock
    })
    await page.evaluate(() => playback.goToFrame(1))
    expect(await page.evaluate(() => playback.index)).not.toBe(1)
})

test("HUD counter and Playback.visible_slide_count/visible_slide_index exclude hidden frames from the total and position, except in 'show'", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg (index 1) carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.goToFrame(0) // one.jpg – re-render the counter under the new hidden state
    })
    expect(await page.evaluate(() => playback.slide_count)).toBe(3) // raw total is unaffected
    expect(await page.evaluate(() => playback.visible_slide_count)).toBe(2) // two.jpg doesn't count
    expect(await page.evaluate(() => playback.visible_slide_index)).toBe(0) // one.jpg is the 1st visible one
    await expect(page.locator("#hud-counter")).toHaveText("1 / 2")

    await page.evaluate(() => playback.nextFrame()) // skips hidden two.jpg, lands on three.jpg
    expect(await page.evaluate(() => playback.index)).toBe(2)
    expect(await page.evaluate(() => playback.visible_slide_index)).toBe(1) // 2nd visible frame
    await expect(page.locator("#hud-counter")).toHaveText("2 / 2")

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> hide
    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> show
    expect(await page.evaluate(() => playback.visible_slide_count)).toBe(3) // hiding suppressed
})

test("previousFrame keeps searching backward through a hidden run instead of bouncing forward", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg (index 1) carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.goToFrame(2) // three.jpg, past the hidden run
    })
    expect(await page.evaluate(() => playback.index)).toBe(2)

    await page.evaluate(() => playback.previousFrame())
    expect(await page.evaluate(() => playback.index)).toBe(0) // one.jpg – not stuck back on 2
})

test("The section-level 'collection' counter also excludes hidden frames, not just the whole-presentation one", async ({ page }) => {
    await page.evaluate(() => {
        const $frames = playback.$articles.toArray().map(el => $(el))
        const $extra = $frames[2].clone() // a 3rd member for section A, so it stays >1 after hiding two.jpg
        $main.empty()
        $("<section/>").append($frames[0], $frames[1], $extra).appendTo($main) // A: one, two(to hide), extra
        $("<section/>").append($frames[2]).appendTo($main) // B: three – a 2nd section so A's count differs from the whole
        playback.reset()
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.goToFrame(0) // one.jpg, in section A
    })
    // Section A has 3 members, 1 hidden -> "1 / 2" for the collection; presentation has 4, 1 hidden -> "1 / 3" overall
    await expect(page.locator("#hud-counter")).toHaveText("1 / 2 (1 / 3)")
})

test("A grid tile's dim/hide class updates immediately when its tag changes, instead of staying stuck until the next full grid rebuild", async ({ page }) => {
    await page.evaluate(() => {
        $main.attr("sli-tag-hidden", "1")
        playback.hud.toggle_grid()
    })
    const tile = page.locator("#hud-grid frame-preview[data-ref='1']")
    await expect(tile).not.toHaveClass(/grid-tag-dimmed/)

    await page.evaluate(() => playback.$articles.eq(1).data("frame").set_tag(1)) // two.jpg now carries the hidden tag
    await expect(tile).toHaveClass(/grid-tag-dimmed/)

    await page.evaluate(() => playback.$articles.eq(1).data("frame").set_tag(1)) // toggle back off
    await expect(tile).not.toHaveClass(/grid-tag-dimmed/)
})

test("Grid ribbon counts show hidden frames as a separate 'N hidden' suffix, not folded into the total", async ({ page }) => {
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.hud.toggle_grid()
    })
    const mainCounts = page.locator("#hud-grid .section-title-counts").first()
    await expect(mainCounts).toHaveText("(1 section, 3 frames, 1 hidden)")

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> hide (still hidden, count stays)
    await expect(mainCounts).toHaveText("(1 section, 3 frames, 1 hidden)")

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> show (hiding suppressed)
    await expect(mainCounts).toHaveText("(1 section, 3 frames)")
})

test("Cycle hidden-tag view mirrors into the URL hash, session-only (not the sli-tag-hidden document data)", async ({ page }) => {
    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> hide
    await expect.poll(() => page.url()).toContain("tag-hidden-mode=hide")

    await page.goto(FIXTURE + "#1?tag-hidden-mode=hide")
    expect(await page.evaluate(() => playback.tag_hidden_mode)).toBe("hide")
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
