const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/notes.html")
const BASIC = "file://" + path.resolve(__dirname, "fixtures/basic.html")

/** Start the playback and hand the docs fetch a stub, so the properties panel need not wait for the network. */
async function start(page, url = FIXTURE) {
    await page.goto(url)
    await page.locator("#start").click()
    await page.evaluate(() => playback.hud._help = "#") // non-empty → fetch_help() short-circuits
}

/** Raw (markdown) notes of every frame. */
const notes = page => page.evaluate(() =>
    playback.$articles.toArray().map(el => $(el).data("frame").get_notes_raw()))

test("notes are read from a comment before the frame as well as from one inside it", async ({ page }) => {
    await start(page)
    expect(await notes(page)).toEqual(["Note **before** the frame.", "Note inside the frame.", ""])

    // markdown is rendered for the aux window
    expect(await page.evaluate(() => playback.frame.get_notes())).toContain("<strong>before</strong>")
})

test("set_notes rewrites the existing comment, creates a missing one and removes an emptied one", async ({ page }) => {
    await start(page)
    await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_notes("Rewritten.")   // comment sits before the frame – edited in place
        frames[2].set_notes("Brand new.")   // no comment yet – one is created as the first child
    })
    expect(await notes(page)).toEqual(["Rewritten.", "Note inside the frame.", "Brand new."])

    // a created note lands inside the frame, so it travels with it (and thus into the export)
    expect(await page.evaluate(() => playback.$articles.get(2).firstChild.nodeValue.trim())).toBe("Brand new.")
    // …while the pre-existing one keeps the spelling it was authored with
    expect(await page.evaluate(() => playback.$articles.get(0).previousSibling.previousSibling.nodeValue.trim()))
        .toBe("Rewritten.")

    // emptying drops the comment altogether rather than leaving an empty one behind
    await page.evaluate(() => $(playback.$articles.get(2)).data("frame").set_notes("  "))
    expect(await page.evaluate(() => playback.$articles.get(2).firstChild.nodeType === Node.COMMENT_NODE)).toBe(false)
})

test("properties panel edits the notes and the change is undoable", async ({ page }) => {
    await start(page)
    await page.evaluate(() => playback.hud.toggle_properties())

    const field = page.locator("#hud-properties textarea[data-property=notes]")
    await expect(field).toHaveValue("Note **before** the frame.")

    await field.fill("Talk about cats.")
    await field.blur() // <textarea> fires `change` on blur
    expect((await notes(page))[0]).toBe("Talk about cats.")

    await page.evaluate(() => playback.changes.undo())
    expect((await notes(page))[0]).toBe("Note **before** the frame.")
})

test("Presenter's notes… dialog writes the note", async ({ page }) => {
    await start(page)
    await page.evaluate(() => playback.goToFrame(2)) // the frame with no notes yet
    await page.evaluate(() => playback.operation._notesDialog())

    const dialog = page.locator(".ZebraDialog:visible")
    await expect(dialog.locator(".notes-editor textarea")).toBeFocused()
    await dialog.locator(".notes-editor textarea").fill("Wrap it up.")
    await dialog.getByRole("link", { name: "Ok" }).click()

    expect((await notes(page))[2]).toBe("Wrap it up.")
})

test("aux layout and its splits ride in the URL hash, the defaults stay out of it", async ({ page }) => {
    await start(page, BASIC)
    await expect.poll(() => page.url()).not.toContain("aux")

    // the fourth sector (bottom right) is empty by default – filling it shows up in the hash
    await page.evaluate(() => playback.aux_window.set_layout(["current", "next", "notes", "next-notes"]))
    await expect.poll(() => decodeURIComponent(page.url())).toContain("aux=current,next,notes,next-notes")
    await expect.poll(() => page.url()).not.toContain("aux-size") // splits untouched → still absent

    // trailing sectors left at their default are dropped, the rest is spelled out
    await page.evaluate(() => playback.aux_window.set_layout(["notes", "-", "notes", "-"], [60, 50, 67]))
    await expect.poll(() => decodeURIComponent(page.url())).toContain("aux=notes,-")
    await expect.poll(() => decodeURIComponent(page.url())).toContain("aux-size=60,50,67")

    // back to the built-in arrangement – both keys disappear again
    await page.evaluate(() => playback.aux_window.set_layout(AUX_LAYOUT_DEFAULT, AUX_SIZE_DEFAULT))
    await expect.poll(() => page.url()).not.toContain("aux")
})

test("aux arrangement is restored from the hash; missing, unknown and out-of-range values fall back", async ({ page }) => {
    // `aux` and `aux-size` are independent keys and may come in either order – neither may clobber the other
    await start(page, BASIC + "#1?aux-size=70,40,55&aux=next-notes,current,-,next")
    expect(await page.evaluate(() => playback.aux_window.layout)).toEqual(["next-notes", "current", "-", "next"])
    expect(await page.evaluate(() => playback.aux_window.sizes)).toEqual([70, 40, 55])

    // a shortened hash (ex: one written before the fourth sector existed) fills the rest in from the default
    await page.evaluate(() => playback.aux_window.set_layout(["notes", "-", "next-notes"]))
    expect(await page.evaluate(() => playback.aux_window.layout)).toEqual(["notes", "-", "next-notes", "-"])
    expect(await page.evaluate(() => playback.aux_window.sizes)).toEqual([70, 40, 55]) // sizes left alone

    await page.evaluate(() => playback.aux_window.set_layout(["notes", "nonsense", "-", "-"], [999, "x", 1]))
    expect(await page.evaluate(() => playback.aux_window.layout)).toEqual(["notes", "next", "-", "-"])
    expect(await page.evaluate(() => playback.aux_window.sizes)).toEqual([90, 67, 10]) // AUX_SIZE_MAX/MIN
})

/** Open the aux window and return it together with a reader of its sector geometry. */
async function open_aux(page) {
    const [aux] = await Promise.all([
        page.context().waitForEvent("page"),
        page.evaluate(() => playback.aux_window.open())
    ])
    await aux.waitForLoadState()
    // Reported as a percentage of the window rounded to the nearest ten – the exact pixels wobble
    // by one or two with the sector borders, and it is the proportions this is about anyway.
    const sectors = () => aux.evaluate(() => $(".aux-slot").map((_, el) => {
        const box = el.getBoundingClientRect()
        const share = (px, whole) => Math.round(px / whole * 10) * 10
        return `${$(el).attr("data-pane")}:${$(el).is(":visible")
            ? `${share(box.width, innerWidth)}x${share(box.height, innerHeight)}` : "gone"}`
    }).get())
    return { aux, sectors }
}

test("an emptied sector takes no room; its neighbour gets the whole column", async ({ page }) => {
    await start(page, BASIC)
    await page.setViewportSize({ width: 1000, height: 600 })
    const { aux, sectors } = await open_aux(page)
    await aux.setViewportSize({ width: 1000, height: 600 })

    // default: the bottom right sector is empty, so the notes run the full height beside the slides
    await expect.poll(sectors).toEqual(["current:50x70", "next:50x30", "notes:50x100", "-:gone"])

    // filling it splits that column by the third slider (67 : 33 by default)
    await page.evaluate(() => playback.aux_window.set_layout(["current", "next", "notes", "next-notes"]))
    await expect.poll(sectors).toEqual(["current:50x70", "next:50x30", "notes:50x70", "next-notes:50x30"])

    // emptying a whole column hands the other one the entire width
    await page.evaluate(() => playback.aux_window.set_layout(["-", "-", "notes", "next-notes"]))
    await expect.poll(sectors).toEqual(["-:gone", "-:gone", "notes:100x70", "next-notes:100x30"])
})

test("aux splits are honoured and the knob's dialog commits on Ok, reverts on Cancel", async ({ page }) => {
    await start(page, BASIC)
    await page.setViewportSize({ width: 1000, height: 600 })
    const { aux, sectors } = await open_aux(page)
    await aux.setViewportSize({ width: 1000, height: 600 })

    // one knob for the whole window, not one picker per sector
    await expect(aux.locator(".aux-settings")).toHaveCount(1)
    await expect(aux.locator(".aux-slot select")).toHaveCount(0)
    await aux.locator(".aux-settings").click()

    const rows = aux.locator(".aux-layout-list")
    await expect(rows.locator("select")).toHaveCount(4)
    await expect(rows.locator("input[type=range]")).toHaveCount(3)

    await rows.locator("select").nth(3).selectOption("next-notes")
    await rows.locator("input[type=range]").nth(0).fill("70")
    // previewed live, but nothing is written to the URL until it is confirmed
    await expect.poll(sectors).toEqual(["current:70x70", "next:70x30", "notes:30x70", "next-notes:30x30"])
    await expect.poll(() => page.url()).not.toContain("aux-size")

    await aux.getByRole("link", { name: "Ok" }).click()
    await expect.poll(() => decodeURIComponent(page.url())).toContain("aux-size=70,67,67")

    // a cancelled visit leaves the confirmed arrangement alone
    await aux.locator(".aux-settings").click()
    await aux.locator(".aux-layout-list input[type=range]").nth(0).fill("20")
    await expect.poll(sectors).toContain("current:20x70")
    await aux.getByRole("link", { name: "Cancel" }).click()
    await expect.poll(() => page.evaluate(() => playback.aux_window.sizes)).toEqual([70, 67, 67])
    await expect.poll(sectors).toContain("current:70x70")
})
