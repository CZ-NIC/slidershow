const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(() => {
        $main.attr("data-tag-names", "rodice,vedouci")
        const frames = playback.$articles.toArray().map(el => $(el).data("frame"))
        frames[0].set_tag(1) // one.jpg -> rodice
        frames[1].set_tag(2) // two.jpg -> vedouci
        frames[2].set_tag(1) // three.jpg -> rodice
        frames[2].set_tag(2) // three.jpg -> also vedouci
        // Stash in-memory Files so export doesn't need a source directory picker.
        frames.forEach(f => f.$actor.data("file", new File(["x"], f.get_filename())))
    })
})

test("collect_albums/union_frames resolve named tags only, deduped union", async ({ page }) => {
    const result = await page.evaluate(() => {
        const albums = menu.export.collect_albums()
        const union = menu.export.union_frames(albums)
        return {
            albums: albums.map(a => ({ name: a.name, files: a.frames.map(f => f.get_filename()).sort() })),
            union: union.map(f => f.get_filename()).sort(),
        }
    })
    expect(result.albums.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: "rodice", files: ["one.jpg", "three.jpg"] },
        { name: "vedouci", files: ["three.jpg", "two.jpg"] },
    ])
    expect(result.union).toEqual(["one.jpg", "three.jpg", "two.jpg"])
})

test("export_albums copies files into per-album + vsechny folders and writes alba.json/txt", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const albums = menu.export.collect_albums()
        const union = menu.export.union_frames(albums)
        await menu.export.export_albums(albums, union)
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
            vsechny: await readDir("vsechny"),
            rodice: await readDir("rodice"),
            vedouci: await readDir("vedouci"),
            albaJson: JSON.parse(await readFile("alba.json")),
            rodiceTxt: (await readFile("rodice.txt")).split("\n").sort(),
        }
    })

    expect(layout.top.sort()).toEqual(["alba.json", "rodice", "rodice.txt", "vedouci", "vedouci.txt", "vsechny"])
    expect(layout.vsechny).toEqual(["one.jpg", "three.jpg", "two.jpg"])
    expect(layout.rodice).toEqual(["one.jpg", "three.jpg"])
    expect(layout.vedouci).toEqual(["three.jpg", "two.jpg"])
    expect(layout.albaJson.rodice.sort()).toEqual(["one.jpg", "three.jpg"])
    expect(layout.rodiceTxt).toEqual(["one.jpg", "three.jpg"])
})

test("export_albums aborts with a conflict notice when the target already has an album folder", async ({ page }) => {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        await root.getDirectoryHandle("rodice", { create: true }) // pre-existing conflict
        window.showDirectoryPicker = async () => navigator.storage.getDirectory()
    })

    await page.evaluate(async () => {
        const albums = menu.export.collect_albums()
        const union = menu.export.union_frames(albums)
        await menu.export.export_albums(albums, union)
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

test("collision suffix: two frames sharing a basename in the same album get a _2 suffix", async ({ page }) => {
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
        const albums = menu.export.collect_albums()
        const union = menu.export.union_frames(albums)
        await menu.export.export_albums(albums, union)
    })

    await expect(page.locator(".ZebraDialog", { hasText: "missing" })).toBeVisible()
    const retryButton = page.getByRole("link", { name: "Change source folder & retry" })
    await expect(retryButton).toBeVisible()

    await page.evaluate(() => window.__sourcePick = "found")
    await retryButton.click()

    await expect.poll(() => page.locator(".ZebraDialog").last().textContent()).not.toContain("missing")

    const copied = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const vsechny = await (await root.getDirectoryHandle("target")).getDirectoryHandle("vsechny")
        const names = []
        for await (const name of vsechny.keys()) names.push(name)
        return names.sort()
    })
    expect(copied).toEqual(["one.jpg", "three.jpg", "two.jpg"])
})
