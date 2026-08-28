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

test("slugify strips illegal filename chars, collapses whitespace, trims separators", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const values = await page.evaluate(() => [
        slugify("Dovolená 2019"),
        slugify("  a/b\\c:d?e  "),
        slugify("...trim---me..."), // dots trimmed, internal dash-run collapsed
        slugify('<>:"|?*'), // all illegal → empty
        slugify(""),
    ])
    expect(values).toEqual(["Dovolená-2019", "a-b-c-d-e", "trim-me", "", ""])
})

test("export_filename follows the presentation name, falls back to docname", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const result = await page.evaluate(() => {
        const before = export_filename() // no name yet → docname() fallback (…/basic.html)
        playback.set_presentation_name("Dovolená 2019")
        const named = { name: presentation_name(), title: document.title, file: export_filename(), attr: $main.attr("sli-title") }
        playback.changes.undo() // restores both attr and document.title
        const undone = { name: presentation_name(), file: export_filename(), attr: $main.attr("sli-title") }
        return { before, named, undone }
    })

    expect(result.before).toBe("basic.html")
    expect(result.named).toEqual({
        name: "Dovolená 2019", title: "Dovolená 2019", file: "Dovolená-2019.html", attr: "Dovolená 2019",
    })
    expect(result.undone.file).toBe("basic.html")
    expect(result.undone.attr).toBeUndefined()
})

test("renaming migrates the TAG-NAMES localStorage cache to the new key, undo moves it back", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const result = await page.evaluate(() => {
        // Named tags while the presentation was still unnamed → stored under the docname() fallback key.
        const base = "TAG-NAMES: " + docname()
        const named = "TAG-NAMES: Tábor 2019"
        localStorage.setItem(base, "rodiče,vedoucí")

        playback.set_presentation_name("Tábor 2019")
        const afterRename = { base: localStorage.getItem(base), named: localStorage.getItem(named) }

        playback.changes.undo()
        const afterUndo = { base: localStorage.getItem(base), named: localStorage.getItem(named) }

        localStorage.removeItem(base)
        localStorage.removeItem(named)
        return { afterRename, afterUndo }
    })

    expect(result.afterRename).toEqual({ base: null, named: "rodiče,vedoucí" })
    expect(result.afterUndo).toEqual({ base: "rodiče,vedoucí", named: null })
})

test("grid: clicking the Presentation/Section ribbon title turns it into an editable input", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(() => playback.hud.toggle_grid())

    const $main = page.locator("section-controller[data-role=main] .section-title-name")
    const $section = page.locator("section-controller:not([data-role=main]) .section-title-name")

    // Untitled main ribbon shows the fallback label; clicking it opens an input prefilled empty.
    await expect($main).toHaveText("Presentation")
    await $main.click()
    await expect($main.locator("input")).toHaveValue("")
    await expect($main.locator("input")).toHaveAttribute("placeholder", "Presentation")
    await $main.locator("input").fill("Tábor 2019")
    await $main.locator("input").press("Enter")
    await expect($main).toHaveText("Tábor 2019")
    const afterMain = await page.evaluate(() => ({ attr: $main.attr("sli-title"), title: document.title }))
    expect(afterMain).toEqual({ attr: "Tábor 2019", title: "Tábor 2019" })

    // Undo restores the fallback label in the ribbon too (Playback.reset() rebuilds the grid).
    await page.evaluate(() => playback.changes.undo())
    await expect($main).toHaveText("Presentation")

    // Section ribbon: same click-to-edit, writes sli-title (not sli-name).
    await expect($section).toHaveText("Section")
    await $section.click()
    await $section.locator("input").fill("Highlights")
    await $section.locator("input").press("Enter")
    await expect($section).toHaveText("Highlights")
    const sectionAttr = await page.evaluate(() => $("main > section").attr("sli-title"))
    expect(sectionAttr).toBe("Highlights")

    // Escape discards without touching the DOM.
    await $section.click()
    await $section.locator("input").fill("discarded")
    await $section.locator("input").press("Escape")
    await expect($section).toHaveText("Highlights")
})

test("_photo_date_range returns min–max month from sli-datetime, null when none", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const result = await page.evaluate(() => {
        const $a = $("article")
        const none = menu._photo_date_range($a)
        $($a[0]).attr("sli-datetime", "2019-08-15T10-00-00")
        $($a[1]).attr("sli-datetime", "2019-06-02T09-30-00")
        return { none, range: menu._photo_date_range($a) }
    })

    expect(result.none).toBeNull()
    expect(result.range).toEqual({ from: "2019-06", to: "2019-08" })
})

test("_toGroupKey reads a file's own modification date, written with hyphens in the time part", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const keys = await page.evaluate(() => {
        const sc = playback.section_controller
        return {
            // FrameFactory writes a lastModified fallback in this shape – it used to be unparseable
            file: sc._toGroupKey("2019-08-15T10-00-00", "days"),
            exif: sc._toGroupKey("2019-08-15T10:00:00", "days"),
            missing: sc._toGroupKey("", "days"),
        }
    })

    expect(keys.file).toBe("2019-08-15")
    expect(keys.exif).toBe("2019-08-15")
    expect(keys.missing).toBe("unknown-days")
})

test("recent list renders frame count and photo date range for each saved presentation", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const entries = await page.evaluate(() => {
        // Manually add a recent entry with date range (different URL so it's not filtered out)
        const entry = {
            url: "/other-presentation.html",
            frames: 12,
            name: "Other Presentation",
            time: new Date().toISOString(),
            storage: "local",
            dateFrom: "2019-06",
            dateTo: "2019-08"
        }
        const list = [entry]
        localStorage.setItem(Menu.RECENT_KEY, JSON.stringify(list))

        // Render recent list
        menu.refresh_recent()

        // Get rendered meta texts
        return $("#recent-panel .recent-meta").map((_, el) => $(el).text()).get()
    })

    // Should show frame count and date range
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]).toMatch(/12 frames · 2019-06 – 2019-08/)
})

test("recent list gracefully handles old entries without date range", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const result = await page.evaluate(() => {
        // Simulate old entry format (no dateFrom/dateTo)
        const oldEntry = {
            url: "/old-path.html",
            frames: 5,
            name: "Old Presentation",
            time: new Date().toISOString(),
            storage: "local"
        }

        // Manually insert into localStorage to simulate old data
        const list = [oldEntry]
        localStorage.setItem(Menu.RECENT_KEY, JSON.stringify(list))

        // Render recent list
        menu.refresh_recent()

        // Get the rendered meta for the old entry
        const $meta = $("#recent-panel .recent-meta").eq(0)
        return {
            text: $meta.text(),
            hasFrameCount: $meta.text().includes("5 frames"),
            hasDateRange: $meta.text().includes("–")
        }
    })

    expect(result.hasFrameCount).toBe(true)
    expect(result.hasDateRange).toBe(false)  // Old entries shouldn't show date range
})
