const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(() => {
        $main.attr("sli-tag-names", "rodice | vedouci")
        prop_invalidate() // the real "Name tags" dialog does this; tag_names() reads the memoized prop()
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1) // one.jpg -> rodice
        frames[1].set_tag(2) // two.jpg -> vedouci
        frames[2].set_tag(1) // three.jpg -> rodice
        frames[2].set_tag(2) // three.jpg -> also vedouci
        // Stash in-memory Files so export doesn't need a source directory picker.
        frames.forEach(f => f.$actor.data("file", new File(["x"], f.get_filename())))
    })
})

test("collect_tag_groups/union_frames resolve named tags only, deduped union", async ({ page }) => {
    const result = await page.evaluate(() => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        return {
            groups: groups.map(a => ({ name: a.name, files: a.frames.map(f => f.get_filename()).sort() })),
            union: union.map(f => f.get_filename()).sort(),
        }
    })
    expect(result.groups.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: "rodice", files: ["one.jpg", "three.jpg"] },
        { name: "vedouci", files: ["three.jpg", "two.jpg"] },
    ])
    expect(result.union).toEqual(["one.jpg", "three.jpg", "two.jpg"])
})

test("export_tags copies files into per-tag folders and writes tags.json/txt", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union)
    })

    const layout = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const names = []
        for await (const name of root.keys()) names.push(name)
        const readDir = async (dirName) => {
            const dir = await root.getDirectoryHandle(dirName)
            const files = []
            for await (const name of dir.keys()) files.push(name)
            return files.sort()
        }
        const readFile = async (name) => {
            const handle = await root.getFileHandle(name)
            const file = await handle.getFile()
            return await file.text()
        }
        return {
            top: names.sort(),
            rodice: await readDir("rodice"),
            vedouci: await readDir("vedouci"),
            tagsJson: JSON.parse(await readFile("tags.json")),
            rodiceTxt: (await readFile("rodice.txt")).split("\n").sort(),
        }
    })

    expect(layout.top.sort()).toEqual(["rodice", "rodice.txt", "tags.json", "vedouci", "vedouci.txt"])
    expect(layout.rodice).toEqual(["one.jpg", "three.jpg"])
    expect(layout.vedouci).toEqual(["three.jpg", "two.jpg"])
    expect(layout.tagsJson.rodice.sort()).toEqual(["one.jpg", "three.jpg"])
    expect(layout.rodiceTxt).toEqual(["one.jpg", "three.jpg"])
})

test("export_tags aborts with a conflict notice when the target already has a tag folder", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        await root.getDirectoryHandle("rodice", { create: true }) // pre-existing conflict
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union)
    })

    await expect(page.locator(".ZebraDialog", { hasText: "already contains" })).toBeVisible()

    const top = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const names = []
        for await (const name of root.keys()) names.push(name)
        return names.sort()
    })
    expect(top).toEqual(["rodice"]) // nothing else got created – aborted before copying
})

test("collision suffix: two frames sharing a basename in the same tag's folder get a _2 suffix", async ({ page }) => {
    const names = await page.evaluate(async () => {
        const usedNames = new Set()
        const a = menu.export._unique_name(usedNames, "pic.jpg")
        const b = menu.export._unique_name(usedNames, "pic.jpg")
        const c = menu.export._unique_name(usedNames, "pic.jpg")
        return [a, b, c]
    })
    expect(names).toEqual(["pic.jpg", "pic_2.jpg", "pic_3.jpg"])
})

test("_build_source_index finds files in nested subfolders (a common ancestor works as the source)", async ({ page }) => {
    const found = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        const sub1 = await root.getDirectoryHandle("sub1", { create: true })
        const write = async (dir, name) => {
            const fh = await dir.getFileHandle(name, { create: true })
            const w = await fh.createWritable()
            await w.write("x")
            await w.close()
        }
        await write(sub1, "one.jpg")
        const deep = await (await root.getDirectoryHandle("sub2", { create: true })).getDirectoryHandle("deep", { create: true })
        await write(deep, "two.jpg")

        const index = await menu.export._build_source_index(root)
        return [...index.keys()].sort()
    })
    expect(found).toEqual(["one.jpg", "two.jpg"])
})

test("_change_source_dir_handle overrides a previously persisted source folder", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        await root.getDirectoryHandle("folderA", { create: true })
        await root.getDirectoryHandle("folderB", { create: true })
    })

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        window.showDirectoryPicker = async () => root.getDirectoryHandle("folderA")
        await menu.export._get_source_dir_handle()
    })
    expect(await page.evaluate(async () => (await menu.export._load_persisted_handle()).name)).toBe("folderA")

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        window.showDirectoryPicker = async () => root.getDirectoryHandle("folderB")
        await menu.export._change_source_dir_handle()
    })
    expect(await page.evaluate(async () => (await menu.export._load_persisted_handle()).name)).toBe("folderB")

    // _get_source_dir_handle now reuses folderB straight away – no re-prompt needed
    await page.evaluate(() => {
        window.showDirectoryPicker = async () => { throw new Error("should not be called – a valid handle is already persisted") }
    })
    expect(await page.evaluate(async () => (await menu.export._get_source_dir_handle()).name)).toBe("folderB")
})

test("export summary offers Change source folder & retry when files are missing, and retry recovers them", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        await root.getDirectoryHandle("empty", { create: true })
        const found = await root.getDirectoryHandle("found", { create: true })
        const fh = await found.getFileHandle("three.jpg", { create: true })
        const w = await fh.createWritable()
        await w.write("data")
        await w.close()

        // three.jpg has to come from a source folder – drop its in-memory File stash
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[2].$actor.removeData("file")

        window.__sourcePick = "empty"
        window.showDirectoryPicker = async (opts) => opts.mode === "readwrite"
            ? root.getDirectoryHandle("target", { create: true })
            : root.getDirectoryHandle(window.__sourcePick)
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union)
    })

    await expect(page.locator(".ZebraDialog", { hasText: "missing" })).toBeVisible()
    const retryButton = page.getByRole("link", { name: "Change source folder & retry" })
    await expect(retryButton).toBeVisible()

    await page.evaluate(() => window.__sourcePick = "found")
    await retryButton.click()

    await expect.poll(() => page.locator(".ZebraDialog").last().textContent()).not.toContain("missing")

    // The writable's close() may still be settling the OPFS swap file (ex: "three.jpg.crswap") on a
    // slower/busier machine – poll instead of reading the listing the instant export_tags() resolves.
    const listCopied = () => page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const vedouci = await (await root.getDirectoryHandle("target")).getDirectoryHandle("vedouci")
        const names = []
        for await (const name of vedouci.keys()) names.push(name)
        return names.sort()
    })
    await expect.poll(listCopied).toEqual(["three.jpg", "two.jpg"])
})

test("collect_tag_groups also exports unnamed tags into a tag-<digit> folder", async ({ page }) => {
    const result = await page.evaluate(() => {
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(3) // one.jpg -> tag 3 (unnamed)
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        return {
            groups: groups.map(a => ({ name: a.name, files: a.frames.map(f => f.get_filename()).sort() })),
            union: union.map(f => f.get_filename()).sort(),
        }
    })
    // rodice (1), vedouci (2), tag-3 (unnamed) – ascending by digit
    expect(result.groups).toEqual([
        { name: "rodice", files: ["one.jpg", "three.jpg"] },
        { name: "vedouci", files: ["three.jpg", "two.jpg"] },
        { name: "tag-3", files: ["one.jpg"] },
    ])
    expect(result.union).toEqual(["one.jpg", "three.jpg", "two.jpg"])
})

test("_frame_http_url: absolute http used as-is, relative needs a base URL on a file:// presentation", async ({ page }) => {
    const urls = await page.evaluate(() => {
        const frame = $(playback.$articles[0]).data("frame")
        const set = v => frame.$actor.attr("sli-src", v)
        set("http://example.com/pics/one.jpg")
        const absolute = menu.export._frame_http_url(frame, "")
        set("sub/one.jpg")
        const relativeNoBase = menu.export._frame_http_url(frame, "")
        const relativeWithBase = menu.export._frame_http_url(frame, "http://example.com/pics/")
        return { absolute, relativeNoBase, relativeWithBase }
    })
    expect(urls.absolute).toBe("http://example.com/pics/one.jpg")
    expect(urls.relativeNoBase).toBe(null) // file:// doc + relative path + no base → not fetchable
    expect(urls.relativeWithBase).toBe("http://example.com/pics/sub/one.jpg")
})

test("export_tags fetches over http when a frame has no in-memory File", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()

        // three.jpg: no stashed File, only an absolute http sli-src → must be fetched, never a source folder
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[2].$actor.removeData("file")
        frames[2].$actor.attr("sli-src", "http://example.com/three.jpg")
        window.__fetched = []
        window.fetch = async (url) => {
            window.__fetched.push(String(url))
            return { ok: true, blob: async () => new Blob(["remote-bytes"]) }
        }
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union)
    })

    const out = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const vedouci = await root.getDirectoryHandle("vedouci")
        const names = []
        for await (const name of vedouci.keys()) names.push(name)
        const handle = await vedouci.getFileHandle("three.jpg")
        return { fetched: window.__fetched, files: names.sort(), text: await (await handle.getFile()).text() }
    })
    expect(out.fetched).toContain("http://example.com/three.jpg")
    expect(out.files).toEqual(["three.jpg", "two.jpg"])
    expect(out.text).toBe("remote-bytes") // written from the fetched blob, not a source folder
})

test("_validate_tag_groups flags a path separator and a name collision", async ({ page }) => {
    const problems = await page.evaluate(() => menu.export._validate_tag_groups([
        { name: "mama/tata", tag: 2, frames: [] },
        { name: "deti", tag: 3, frames: [] },
        { name: "Deti", tag: 4, frames: [] }, // case-insensitive collision with "deti"
    ]))
    expect(problems.some(p => p.includes("separator"))).toBe(true)
    expect(problems.some(p => p.includes("collide"))).toBe(true)
})

test("export_tags_dialog refuses to proceed when tag names collide", async ({ page }) => {
    await page.evaluate(() => {
        $main.attr("sli-tag-names", "vedouci | vedouci") // tag 1 and 2 share a name – collision
        prop_invalidate() // tag_names() reads the memoized prop(); the real dialog invalidates after a write
    })
    await page.evaluate(() => menu.export.export_tags_dialog())
    await expect(page.locator(".ZebraDialog", { hasText: "collide" })).toBeVisible()
    // no "Export" button offered – nothing should have run
    await expect(page.getByRole("link", { name: "Export" })).toHaveCount(0)
})

test("export_tags respects the writeJson/writeTxt flags", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union, "", false, true) // skip tags.json, keep the .txt files
    })

    const top = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const names = []
        for await (const name of root.keys()) names.push(name)
        return names.sort()
    })
    expect(top).toEqual(["rodice", "rodice.txt", "vedouci", "vedouci.txt"]) // no tags.json
})

test("export_tags_dialog offers direct tags.json/.txt downloads when folder export isn't supported", async ({ page }) => {
    await page.evaluate(() => { window.showDirectoryPicker = undefined })
    await page.evaluate(() => menu.export.export_tags_dialog())
    await expect(page.locator(".ZebraDialog", { hasText: "only in Chrome/Edge" })).toBeVisible()

    await page.evaluate(() => { window.__downloads = [] })
    await page.evaluate(() => {
        menu.export._download_manifest = (groups) => window.__downloads.push(["manifest", groups.map(g => g.name)])
        menu.export._download_txts = (groups) => window.__downloads.push(["txts", groups.map(g => g.name)])
    })
    await page.getByRole("link", { name: "Download tags.json" }).first().click()
    await page.evaluate(() => menu.export.export_tags_dialog()) // re-open a fresh dialog for the second button
    await page.getByRole("link", { name: "Download .txt files" }).last().click()

    const downloads = await page.evaluate(() => window.__downloads)
    expect(downloads).toEqual([
        ["manifest", ["rodice", "vedouci"]],
        ["txts", ["rodice", "vedouci"]],
    ])
})

test("conflict check also catches a loose tags.json/*.txt left over from a previous export", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        const fh = await root.getFileHandle("rodice.txt", { create: true }) // stray file, no subfolders
        const w = await fh.createWritable()
        await w.write("stale")
        await w.close()
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const groups = menu.export.collect_tag_groups()
        const union = menu.export.union_frames(groups)
        await menu.export.export_tags(groups, union)
    })

    await expect(page.locator(".ZebraDialog", { hasText: "already contains" })).toBeVisible()
    const top = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const names = []
        for await (const name of root.keys()) names.push(name)
        return names
    })
    expect(top).toEqual(["rodice.txt"]) // aborted – nothing else got created, the stale file wasn't touched
})
