const { test, expect } = require("@playwright/test")
const path = require("path")
const fs = require("fs")

const fixture = name => "file://" + path.resolve(__dirname, `fixtures/${name}.html`)
/** A real photo carrying EXIF (Make "TestMake", Model "TestModel") – see tests/fixtures/exif.html. */
const EXIF_JPEG_B64 = fs.readFileSync(path.resolve(__dirname, "fixtures/exif.jpeg")).toString("base64")

/**
 * Import files through the very same Menu.appendFiles() a drop goes through, with full control over the
 * two things a real drop carries and a Playwright setInputFiles() cannot express: `webkitRelativePath`
 * (only a whole-folder drop has one) and `lastModified`.
 * @param {import("@playwright/test").Page} page
 * @param {string} criterion Value for the "Group by" select.
 * @param {{name: string, relative?: string, modified?: string, exif?: boolean}[]} specs
 */
async function importFiles(page, criterion, specs) {
    return await page.evaluate(async ({ criterion, specs, b64 }) => {
        const exifBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        $("#group-by").val(criterion)
        const files = specs.map(spec => {
            const video = spec.name.endsWith(".mp4")
            const body = spec.exif ? exifBytes : new Uint8Array([1, 2, 3])
            const file = new File([body], spec.name, {
                type: video ? "video/mp4" : "image/jpeg",
                lastModified: spec.modified ? new Date(spec.modified).getTime() : Date.now(),
            })
            if (spec.relative) {
                Object.defineProperty(file, "webkitRelativePath", { value: spec.relative })
            }
            return file
        })
        return await menu.appendFiles(files)
    }, { criterion, specs, b64: EXIF_JPEG_B64 })
}

/** Counts every SectionController.group() call, so "regrouped exactly once, and only after the import"
 * is an assertion and not a guess. Install before importing. */
async function watchRegroups(page) {
    await page.waitForFunction(() => window.playback) // the CDN vendors may still be loading
    await page.evaluate(() => {
        window.regroups = []
        const sc = playback.section_controller
        const original = sc.group.bind(sc)
        sc.group = (criterion, $frames) => {
            // the DOM as it stands at that very moment: a regroup running per file (as the EXIF reads
            // trickle in) would find fewer frames, and more than one section, in the document
            window.regroups.push({
                criterion,
                frames: $frames ? $frames.length : null,
                articles: $("main article").length,
                sections: $("main > section").length,
            })
            return original(criterion, $frames)
        }
    })
}

/** @returns The sections directly under <main>: their key/title and how many frames they hold. */
const sections = page => page.evaluate(() => $("main > section").toArray().map(el => ({
    name: el.getAttribute("sli-name"),
    title: el.getAttribute("sli-title"),
    frames: $(el).children("article").length,
})))

test("grouping by folder splits the import into sections right away, without any regroup", async ({ page }) => {
    await page.goto(fixture("empty"))
    await watchRegroups(page)

    // deliberately interleaved – the items get sorted by their key before the frames are built
    await importFiles(page, "folder", [
        { name: "1.jpg", relative: "trip/rome/1.jpg" },
        { name: "2.jpg", relative: "trip/pisa/2.jpg" },
        { name: "3.jpg", relative: "trip/rome/3.jpg" },
    ])

    expect(await sections(page)).toEqual([
        { name: "pisa", title: "pisa", frames: 1 },
        { name: "rome", title: "rome", frames: 2 },
    ])
    // the folder is known from the drop itself – nothing waits for, or is corrected by, the EXIF
    expect(await page.evaluate(() => window.regroups)).toEqual([])
    expect(await page.evaluate(() => $("main article[sli-folder]").length)).toBe(3)
})

test("grouping by day comes from the files' own modification time and survives the EXIF settling", async ({ page }) => {
    await page.goto(fixture("empty"))
    await watchRegroups(page)

    await importFiles(page, "days", [
        { name: "b.jpg", modified: "2019-06-02T10:00:00Z" },
        { name: "a.jpg", modified: "2019-06-01T10:00:00Z" },
        { name: "c.jpg", modified: "2019-06-02T18:00:00Z" },
    ])

    expect(await sections(page)).toEqual([
        { name: "2019-06-01", title: "2019-06-01", frames: 1 },
        { name: "2019-06-02", title: "2019-06-02", frames: 2 },
    ])
    expect(await page.evaluate(() => window.regroups)).toEqual([])

    // these photos carry no EXIF date, so once the batch settles there is nothing to correct – not even
    // a pointless undo entry is created
    await page.evaluate(() => menu.last_import_settled)
    await expect.poll(() => page.evaluate(() => window.regroups)).toEqual([])
})

test("an EXIF criterion regroups the whole batch exactly once, after the import", async ({ page }) => {
    await page.goto(fixture("empty"))
    await watchRegroups(page)

    await importFiles(page, "camera", [
        { name: "1.jpg", exif: true },
        { name: "2.jpg", exif: true },
        { name: "clip.mp4" }, // no EXIF at all → the untagged catch-all
    ])

    // The camera is unknown until the EXIF arrives, so the import itself lands as usual (one section,
    // no waiting) and the whole batch is regrouped once afterwards – never photo by photo, which the
    // DOM state captured at the call proves: all 3 frames already imported, still in their one section.
    await expect.poll(() => page.evaluate(() => window.regroups))
        .toEqual([{ criterion: "camera", frames: 3, articles: 3, sections: 1 }])

    expect(await sections(page)).toEqual(expect.arrayContaining([
        { name: "TestMake TestModel", title: "TestMake TestModel", frames: 2 },
    ]))
    expect(await page.evaluate(() => $("main > section[sli-untagged] > article").length)).toBe(1)
})

test("the Group by choice is remembered across a reload and another presentation", async ({ page }) => {
    await page.goto(fixture("empty"))
    await page.locator("#defaults summary").click() // unfold the Defaults panel
    await page.selectOption("#group-by", "months")

    await page.reload()
    await expect(page.locator("#group-by")).toHaveValue("months")

    await page.goto(fixture("basic")) // a different presentation, same browser
    await expect(page.locator("#group-by")).toHaveValue("months")
})

test("a date corrected by the EXIF is what decides whether the batch is regrouped at all", async ({ page }) => {
    await page.goto(fixture("empty"))
    await watchRegroups(page)
    await importFiles(page, "days", [
        { name: "a.jpg", modified: "2019-06-01T10:00:00Z" },
        { name: "b.jpg", modified: "2019-06-01T12:00:00Z" },
    ])

    const stale = await page.evaluate(() => {
        const $frames = $("main article")
        const before = menu._grouping_stale("days", $frames)
        // as if the EXIF had just told us the photo was actually taken on another day
        $frames.eq(0).find("img").attr("sli-datetime", "2019-05-30T10:00:00")
        prop_invalidate()
        return { before, after: menu._grouping_stale("days", $frames) }
    })

    expect(stale).toEqual({ before: false, after: true })
})
