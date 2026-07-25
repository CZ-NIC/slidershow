const { test, expect } = require("@playwright/test")
const path = require("path")
const fs = require("fs")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")
const TAGS_FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")
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

test("offline export (one file) bundles the app's own code and boots with zero network requests", async ({ page }) => {
    const OFFLINE_EXPORTED = path.resolve(__dirname, "fixtures/exported-offline.tmp.html")

    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(() => {
            menu.export.file_handler_wanted = false
            menu.export.app_code = "inline"
            menu.export.export()
        }),
    ])
    await download.saveAs(OFFLINE_EXPORTED)

    // Block every non-file request outright (not just observe) – if the offline loader falls back
    // to the network anywhere, the boot below fails instead of silently succeeding via a real fetch.
    const blockedRequests = []
    await page.route("**/*", route => {
        const url = route.request().url()
        if (url.startsWith("file:")) {
            return route.continue()
        }
        blockedRequests.push(url)
        route.abort()
    })

    // map-disabled: maps stay online-only by design (tile server needs network regardless), so leave
    // that out of scope here and disable it the same way a real offline user would
    // (session.js hash format is "#<index>?param=value&..."; an empty index defaults to frame 0).
    await page.goto("file://" + OFFLINE_EXPORTED + "#?map-disabled")
    await expect(page.locator("#start")).toBeVisible()
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.keyboard.press("PageDown")
    await expect.poll(() => page.url()).toContain("#2")

    expect(blockedRequests).toEqual([])

    fs.rmSync(OFFLINE_EXPORTED, { force: true })
})

test("offline export (separate folder) copies vendor + local files and rewrites the bootstrap src", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
        // The fixture itself is file:// (Chrome then refuses XHR to sibling files – see the dedicated
        // test below), which isn't what this test is after; simulate an http(s)-served presentation.
        menu.export._is_file_protocol = () => false
    })

    await page.evaluate(() => menu.export.export_offline_folder())

    const layout = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const readDir = async (dir) => {
            const names = []
            for await (const name of dir.keys()) names.push(name)
            return names.sort()
        }
        const readFile = async (dir, name) => (await (await dir.getFileHandle(name)).getFile()).text()
        const top = await readDir(root)
        const slidershowDir = await root.getDirectoryHandle("slidershow")
        const vendorDir = await root.getDirectoryHandle("vendor")
        return {
            top,
            local: await readDir(slidershowDir),
            vendor: await readDir(vendorDir),
            selfSource: await readFile(slidershowDir, "slidershow.js"),
            html: await readFile(root, top.find(n => n.endsWith(".html"))),
        }
    })

    expect(layout.top).toEqual(expect.arrayContaining(["slidershow", "vendor"]))
    expect(layout.local).toEqual(expect.arrayContaining(["slidershow.js", "style.css", "static.js", "launch.js"]))
    expect(layout.vendor.length).toBeGreaterThan(0)
    expect(layout.vendor.some(f => /jquery/i.test(f))).toBe(true)

    // The copied slidershow.js must point vendor libs at the local copies, not the CDN
    // (the string "code.jquery.com" still legitimately appears in an unrelated comment)
    expect(layout.selfSource).toContain('JQUERY_SRC = "vendor/')
    expect(layout.selfSource).toContain("vendor/")

    // The exported HTML's bootstrap tag must point at the local copy, not the original (possibly CDN) src
    expect(layout.html).toContain('src="slidershow/slidershow.js"')
})

test("offline export (separate folder) refuses upfront on file://, instead of leaving a half-written folder", async ({ page }) => {
    // Regression: Chrome refuses XHR to sibling files from a file:// origin without
    // --allow-file-access-from-files – left unguarded, that throws mid-loop, leaving empty
    // vendor/slidershow folders behind and no exported HTML (reported by Edvard against tutorial_local.html).
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(() => menu.export.export_offline_folder())

    await expect(page.locator(".ZebraDialog", { hasText: "file://" })).toBeVisible()

    const top = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const names = []
        for await (const name of root.keys()) names.push(name)
        return names
    })
    expect(top).toEqual([]) // refused before creating anything, not even an empty vendor/slidershow
})

test("download all media to a folder copies every photo into media/ and rewrites sli-src to point there", async ({ page }) => {
    await page.goto(TAGS_FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
        // Stash in-memory Files so the copy doesn't need a source-folder picker (see export-tags.spec.js).
        playback.$articles.each((_, el) => {
            const frame = $(el).data("frame")
            frame.$actor.data("file", new File(["x"], frame.get_filename()))
        })
    })

    await page.evaluate(() => menu.export.export_media_folder())

    const layout = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const top = []
        for await (const name of root.keys()) top.push(name)
        const mediaDir = await root.getDirectoryHandle("media")
        const media = []
        for await (const name of mediaDir.keys()) media.push(name)
        const htmlName = top.find(n => n.endsWith(".html"))
        const html = await (await (await root.getFileHandle(htmlName)).getFile()).text()
        return { top: top.sort(), media: media.sort(), html }
    })

    expect(layout.top).toEqual(expect.arrayContaining(["media"]))
    expect(layout.media).toEqual(["one.jpg", "three.jpg", "two.jpg"])
    expect(layout.html).toContain('sli-src="media/one.jpg"')
    expect(layout.html).toContain('sli-src="media/two.jpg"')
    expect(layout.html).toContain('sli-src="media/three.jpg"')
})
