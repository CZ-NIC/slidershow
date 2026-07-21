const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

// Grid multi-selection. The exercised operations (extendTo / toggleSelect / moveSelection left-right /
// tagSelection / deleteSelection) are index-based, not layout-based, so they are stable headless.
// Row moves (up/down) depend on the rendered column count and are left to manual/visual checks.

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    // six frames in a single section, each identifiable by its data-src (0.jpg … 5.jpg)
    await page.evaluate(() => {
        const frame = n => $("<article/>").append($("<img/>", { src: "exif.jpeg", "data-src": n + ".jpg" }))
        $main.empty()
        const $s = $("<section/>").appendTo($main)
        for (let i = 0; i < 6; i++) frame(i).appendTo($s)
        playback.reset()
        const $first = $("main article").first()
        playback.frame = $first.data("frame")
        playback.$current = $first
        playback.index = 0
        playback.hud.toggle_grid() // open the grid so the selection has a place to paint
    })
})

const filenames = page => page.evaluate(() =>
    playback.$articles.toArray().map(el => $(el).data("frame").get_filename()))
const selection = page => page.evaluate(() =>
    [...playback.hud.grid.selection].sort((a, b) => a - b))
const tagOf = (page, i) => page.evaluate(i =>
    $(playback.$articles[i]).data("frame").$actor.attr("data-tag"), i)

test("Shift-extend selects an inclusive range and shrinks back toward the anchor", async ({ page }) => {
    await page.evaluate(() => playback.goToFrame(1)) // cursor + anchor at index 1
    await page.evaluate(() => playback.hud.grid.extendTo(3))
    expect(await selection(page)).toEqual([1, 2, 3])
    expect(await page.evaluate(() => playback.index)).toBe(3) // cursor follows the far end

    // extending back toward the anchor shrinks the range (does not add on the other side)
    await page.evaluate(() => playback.hud.grid.extendTo(2))
    expect(await selection(page)).toEqual([1, 2])

    // the selected thumbnails carry the visual class, the others do not
    expect(await page.locator("#hud-grid frame-preview.selected").count()).toBe(2)
})

test("Space toggles the cursor frame; a plain arrow move KEEPS the selection, Escape clears it", async ({ page }) => {
    await page.evaluate(() => playback.goToFrame(2))
    await page.evaluate(() => playback.hud.grid.toggleSelect())
    expect(await selection(page)).toEqual([2])
    await page.evaluate(() => playback.hud.grid.toggleSelect())
    expect(await selection(page)).toEqual([])

    // Space-select a couple of scattered frames by toggling + plain-moving the cursor (which no longer
    // wipes the selection) – this is the "build a random pick with Space+arrows" flow.
    await page.evaluate(() => playback.hud.grid.moveCursor(() => playback.goToFrame(1)))
    await page.evaluate(() => playback.hud.grid.toggleSelect())          // select 1
    await page.evaluate(() => playback.hud.grid.moveCursor(() => playback.nextFrame())) // → 2, keep
    await page.evaluate(() => playback.hud.grid.moveCursor(() => playback.nextFrame())) // → 3, keep
    await page.evaluate(() => playback.hud.grid.toggleSelect())          // select 3
    expect(await selection(page)).toEqual([1, 3])

    // clearSelection (what Escape triggers over a selection) wipes it
    await page.evaluate(() => playback.hud.grid.clearSelection())
    expect(await selection(page)).toEqual([])
})

test("Ctrl+Arrow moves the whole selection as one undoable block, reselecting it afterwards", async ({ page }) => {
    // select 2.jpg + 3.jpg (indices 2,3), move the block right past 4.jpg
    await page.evaluate(() => { playback.goToFrame(2); playback.hud.grid.extendTo(3) })
    await page.evaluate(() => playback.hud.grid.moveSelection("right"))

    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "4.jpg", "2.jpg", "3.jpg", "5.jpg"])
    expect(await selection(page)).toEqual([3, 4]) // same frames, reselected at their new indices

    await page.evaluate(() => playback.changes.undo())
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])

    await page.evaluate(() => playback.changes.redo())
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "4.jpg", "2.jpg", "3.jpg", "5.jpg"])
})

test("moving a block right then left returns to the exact original layout (symmetric)", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(2); playback.hud.grid.extendTo(3) })
    const before = await filenames(page)
    await page.evaluate(() => playback.hud.grid.moveSelection("right"))
    expect(await filenames(page)).not.toEqual(before)
    await page.evaluate(() => playback.hud.grid.moveSelection("left"))
    expect(await filenames(page)).toEqual(before) // the reported Ctrl+Down/Ctrl+Up asymmetry is gone
    expect(await selection(page)).toEqual([2, 3])
})

test("copy then paste clones the selection right after the cursor", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.extendTo(2) }) // select 1.jpg, 2.jpg
    await page.evaluate(() => playback.hud.grid.copySelection())
    await page.evaluate(() => playback.goToFrame(4)) // cursor on 4.jpg
    await page.evaluate(() => playback.hud.grid.paste())
    // clones land just after 4.jpg; originals stay put
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "1.jpg", "2.jpg", "5.jpg"])

    await page.evaluate(() => playback.changes.undo())
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])
})

test("cut then paste moves the selection (one undoable), clearing the clipboard", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(0); playback.hud.grid.extendTo(1) }) // cut 0.jpg, 1.jpg
    await page.evaluate(() => playback.hud.grid.cutSelection())
    await page.evaluate(() => playback.goToFrame(4)) // cursor on 4.jpg
    await page.evaluate(() => playback.hud.grid.paste())
    expect(await filenames(page)).toEqual(["2.jpg", "3.jpg", "4.jpg", "0.jpg", "1.jpg", "5.jpg"])

    await page.evaluate(() => playback.changes.undo())
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])
})

test("dragging a multi-selection moves every selected frame, not just the dragged one", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(0); playback.hud.grid.extendTo(1) }) // 0.jpg, 1.jpg
    // simulate the drop of the dragged thumbnail onto 4.jpg (after it) – the whole selection travels
    await page.evaluate(() => playback.hud.grid.moveSelectionBeside(4, false))
    expect(await filenames(page)).toEqual(["2.jpg", "3.jpg", "4.jpg", "0.jpg", "1.jpg", "5.jpg"])
    expect(await selection(page)).toEqual([3, 4])
})

test("a digit tags the whole selection as one undoable, 0 untags it", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.extendTo(3) })

    // tagging_mode routes the digit hotkey through Playback.tag_current → grid.tagSelection
    await page.evaluate(() => playback.tag_current(5))
    expect(await tagOf(page, 1)).toBe("5")
    expect(await tagOf(page, 2)).toBe("5")
    expect(await tagOf(page, 3)).toBe("5")
    expect(await tagOf(page, 0)).toBeUndefined() // outside the selection

    // one undo reverts the whole batch
    await page.evaluate(() => playback.changes.undo())
    expect(await tagOf(page, 1)).toBeUndefined()
    expect(await tagOf(page, 3)).toBeUndefined()

    // re-tag, then a second tag is added (bulk-consistent: all get it)
    await page.evaluate(() => playback.changes.redo())
    await page.evaluate(() => playback.tag_current(7))
    expect(await tagOf(page, 2)).toBe("5 7")

    // 0 clears every tag across the selection in one step
    await page.evaluate(() => playback.tag_current(null))
    expect(await tagOf(page, 1)).toBeUndefined()
    expect(await tagOf(page, 2)).toBeUndefined()
    expect(await tagOf(page, 3)).toBeUndefined()
})

test("bulk tag is consistent: if all already carry the tag it is removed from all", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(0); playback.hud.grid.extendTo(2) })
    await page.evaluate(() => playback.tag_current(3)) // all three now carry 3
    await page.evaluate(() => playback.tag_current(3)) // → removed from all (not toggled per-frame)
    expect(await tagOf(page, 0)).toBeUndefined()
    expect(await tagOf(page, 1)).toBeUndefined()
    expect(await tagOf(page, 2)).toBeUndefined()
})

test("cut marks the thumbnails and paste clears the mark", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(0); playback.hud.grid.extendTo(1) })
    await page.evaluate(() => playback.hud.grid.cutSelection())
    // both cut thumbnails carry the .cut class and the badge shows the clipboard count
    expect(await page.locator("#hud-grid frame-preview.cut").count()).toBe(2)
    await expect(page.locator("#hud-selection .sel-count")).toContainText("2 frames to move")
    await page.evaluate(() => playback.goToFrame(4))
    await page.evaluate(() => playback.hud.grid.paste())
    await page.waitForTimeout(50)
    expect(await page.locator("#hud-grid frame-preview.cut").count()).toBe(0) // mark gone after the move
})

test("the badge tells copied-vs-otherwise-selected apart", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.extendTo(2); playback.hud.grid.copySelection() })
    await expect(page.locator("#hud-selection .sel-count")).toHaveText("2 frames to copy")
    // extend the selection to include two more frames that are NOT on the clipboard
    await page.evaluate(() => playback.hud.grid.extendTo(4)) // now 1..4 selected, still only 1,2 copied
    await expect(page.locator("#hud-selection .sel-count")).toHaveText("2 frames to copy, 2 other selected")
    // copied frames carry the dashed 'copied' marker
    expect(await page.locator("#hud-grid frame-preview.copied").count()).toBe(2)
})

test("empty grid shows a discoverability hint that disappears once selecting", async ({ page }) => {
    await expect(page.locator("#hud-selection")).toHaveAttribute("data-mode", "hint")
    await expect(page.locator("#hud-selection .sel-count")).toContainText("Select frames")
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.toggleSelect() })
    await expect(page.locator("#hud-selection")).toHaveAttribute("data-mode", "active")
})

test("Shift+drag draws a marquee that adds every covered frame to the selection", async ({ page }) => {
    // box from the top-left of frame 0 to the bottom-right of frame 2 (all three in the same row)
    const box = await page.evaluate(() => {
        const r0 = document.querySelector("#hud-grid frame-preview[data-ref='0']").getBoundingClientRect()
        const r2 = document.querySelector("#hud-grid frame-preview[data-ref='2']").getBoundingClientRect()
        return { x1: r0.left + 3, y1: r0.top + 3, x2: r2.right - 3, y2: r2.bottom - 3 }
    })
    await page.keyboard.down("Shift")
    await page.mouse.move(box.x1, box.y1)
    await page.mouse.down()
    await page.mouse.move((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2)
    await page.mouse.move(box.x2, box.y2)
    await page.mouse.up()
    await page.keyboard.up("Shift")
    expect(await selection(page)).toEqual([0, 1, 2])
})

test("pasted clones render a preview (not an empty placeholder)", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.extendTo(2); playback.hud.grid.copySelection() })
    await page.evaluate(() => playback.goToFrame(4))
    await page.evaluate(() => playback.hud.grid.paste())
    await page.waitForTimeout(600)
    const withImg = await page.evaluate(() => $("#hud-grid frame-preview").toArray().filter(el => $(el).find("img").length).length)
    expect(withImg).toBe(8) // all six originals + two clones show an <img>, none left as "..."
})

test("Delete removes the whole selection as one undoable", async ({ page }) => {
    await page.evaluate(() => { playback.goToFrame(1); playback.hud.grid.extendTo(2) })
    await page.evaluate(() => playback.hud.grid.deleteSelection())
    expect(await filenames(page)).toEqual(["0.jpg", "3.jpg", "4.jpg", "5.jpg"])

    await page.evaluate(() => playback.changes.undo())
    expect(await filenames(page)).toEqual(["0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])
})
