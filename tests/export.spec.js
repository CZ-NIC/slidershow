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

test("single-file export inlines server-hosted media it can fetch, and reports the ones it can't", async ({ page }) => {
    const INLINED = path.resolve(__dirname, "fixtures/exported-inlined.tmp.html")

    await page.goto(TAGS_FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(() => {
        // Two frames point at fetchable http(s) media (no in-memory bytes – exactly the server-hosted
        // case the old single-file export left as bare links); the third keeps a relative path a file://
        // presentation can't resolve, so we can assert both the inlined and the left-as-link outcomes.
        const arts = playback.$articles.toArray()
        $(arts[0]).find("img").attr("sli-src", "http://example.test/one.jpg").removeAttr("src")
        $(arts[1]).find("img").attr("sli-src", "http://example.test/two.jpg").removeAttr("src")
        $(arts[2]).find("img").attr("sli-src", "keep-relative.jpg").removeAttr("src")
        // A 1x1 transparent PNG, returned for every fetch the export makes.
        const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoHtQwYAAAAASUVORK5CYII="), c => c.charCodeAt(0))
        window.fetch = async () => new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } })
    })

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(() => {
            menu.export.file_handler_wanted = false // force the <a download> path instead of showSaveFilePicker
            menu.export.export(true) // "Export all to a single file"
        }),
    ])
    await download.saveAs(INLINED)
    const html = fs.readFileSync(INLINED, "utf8")

    // Exactly the two http frames gained embedded bytes (sli-src stays on as a fallback label, same as
    // for drag-dropped media); the relative one, unfetchable from file://, carries no bytes.
    expect((html.match(/sli-src-bytes="data:image\/png;base64,/g) || []).length).toBe(2)
    expect(html).toContain('sli-src="keep-relative.jpg"')

    // And the user is told the one that couldn't be fetched was left as a link.
    await expect(page.locator(".ZebraDialog", { hasText: "couldn't be fetched" })).toBeVisible()

    fs.rmSync(INLINED, { force: true })
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

    // Leaflet must be bundled like every other vendor lib: it loads by default (MAP_ENABLE), and a failed
    // network load of it rejects the boot Promise.all and blanks the whole app offline (regression: it was
    // deliberately excluded, so an offline export black-screened the moment it lost network).
    const exportedHtml = fs.readFileSync(OFFLINE_EXPORTED, "utf8")
    expect(exportedHtml).toContain("leaflet@1.9.4/dist/leaflet.js")

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

    // Map left enabled (the real default): with Leaflet bundled the library loads offline from the file
    // itself, and this fixture has no GPS frame, so the map never starts and no tile is ever fetched –
    // proving the whole boot is genuinely network-free, map and all.
    await page.goto("file://" + OFFLINE_EXPORTED)
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
    // Leaflet is copied too – without it the boot's Promise.all rejects on the missing library and blanks
    // the app offline (it used to be excluded on the "maps need network anyway" reasoning, which ignored
    // that the *library* still has to load for the app to start at all).
    expect(layout.vendor.some(f => /leaflet/i.test(f))).toBe(true)

    // The copied slidershow.js must point vendor libs at the local copies, not the CDN
    // (the string "code.jquery.com" still legitimately appears in an unrelated comment)
    expect(layout.selfSource).toContain('JQUERY_SRC = "vendor/')
    expect(layout.selfSource).toContain("vendor/")

    // The exported HTML's bootstrap tag must point at the local copy, not the original (possibly CDN) src
    expect(layout.html).toContain('src="slidershow/slidershow.js"')
})

test("offline folder export actually boots when opened from file:// (no CORS-blocked vendor scripts)", async ({ page }) => {
    // Regression (reported by Edvard): a folder export opened from a real file:// origin black-screened –
    // jQuery went out via document.write with SRI + crossorigin, and textFit/wheel-zoom kept their
    // crossorigin from the vendor list, so the browser tried a CORS fetch of a sibling file:// file and
    // blocked it. The existing folder test above runs against a simulated http origin and never catches
    // this; here we pull the exported tree onto real disk and open it via file://, as the user does.
    const OUT_DIR = path.resolve(__dirname, "fixtures/offline-folder.tmp")

    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
        menu.export._is_file_protocol = () => false // let the export read the app's own files over XHR
    })
    await page.evaluate(() => menu.export.export_offline_folder())

    // Copy the whole exported OPFS tree onto real disk so it can be opened via file:// (OPFS itself isn't
    // reachable from a file:// navigation).
    const tree = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const out = {}
        const walk = async (dir, prefix) => {
            for await (const [name, handle] of dir.entries()) {
                if (handle.kind === "file") {
                    out[prefix + name] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()))
                } else {
                    await walk(handle, prefix + name + "/")
                }
            }
        }
        await walk(root, "")
        return out
    })

    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    for (const [rel, bytes] of Object.entries(tree)) {
        const dest = path.join(OUT_DIR, rel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, Buffer.from(bytes))
    }
    const htmlName = Object.keys(tree).find(n => !n.includes("/") && n.endsWith(".html"))

    // Network blocked: any fall-through to a CDN fails loudly instead of masking a broken local load.
    await page.route("**/*", route => route.request().url().startsWith("file:") ? route.continue() : route.abort())

    await page.goto("file://" + path.join(OUT_DIR, htmlName))
    await expect(page.locator("#start")).toBeVisible() // reached only if jQuery + every vendor lib loaded
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.keyboard.press("PageDown")
    await expect.poll(() => page.url()).toContain("#2")

    fs.rmSync(OUT_DIR, { recursive: true, force: true })
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

test("exporting keeps the live blob: sources alive, so grid previews still work afterwards", async ({ page }) => {
    // Dragged-in files are held as blob: URLs. The export copy is re-parsed from outerHTML, so it
    // carries the very same URL strings – revoking them while "unloading the copy" used to blank the
    // running presentation (and every grid preview) the moment one exported.
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)

    const result = await page.evaluate(async () => {
        const url = URL.createObjectURL(new Blob(["hello"], { type: "text/plain" }))
        $("<img/>", { "sli-src": "dragged.png", src: url }).appendTo(playback.$articles.eq(0))

        const $contents = $("<div>" + $("body").prop("outerHTML") + "</div>")
        await Frame.finalize_frames($contents, playback.$articles)

        const copy = $contents.find("img[sli-src='dragged.png']")
        let alive = true
        try {
            await fetch(url)
        } catch (e) {
            alive = false
        }
        return { alive, copyHasSrc: Boolean(copy.attr("src")), liveSrc: $("img[sli-src='dragged.png']", "main").attr("src") }
    })

    expect(result.alive).toBe(true)          // the live blob URL survived the export
    expect(result.copyHasSrc).toBe(false)    // …while the copy still dropped it, as it must
    expect(result.liveSrc).toMatch(/^blob:/) // the live element still points at it
})

test("the app code can be pointed at a copy that already exists, without copying anything", async ({ page }) => {
    // "Copy into a folder" needs a directory picker, network and readable sibling files; this one only
    // retargets the bootstrap tag, so it is the offline option that also works from file://.
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(() => {
            menu.export.file_handler_wanted = false
            menu.export.app_code = "local"
            menu.export.app_code_ref = "../lib/slidershow" // trailing slash deliberately left off
            return menu.export.export()
        }),
    ])
    const html = fs.readFileSync(await download.path(), "utf8")

    expect(html).toContain('src="../lib/slidershow/slidershow.js"')
    expect(html).not.toContain("cdn.jsdelivr.net/gh/CZ-NIC/slidershow")
    // the CDN's integrity/crossorigin would make the browser refuse the local file
    expect(html).not.toMatch(/integrity=.*slidershow\.js/)
})
