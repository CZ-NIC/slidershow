const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

/** Stub `showSaveFilePicker` with a real OPFS file handle, same idiom export.spec.js uses for folders. */
async function stubSaveFilePicker(page, name = "export.html") {
    await page.evaluate(async (name) => {
        const root = await navigator.storage.getDirectory()
        window.showSaveFilePicker = async () => root.getFileHandle(name, { create: true })
    }, name)
}

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        await root.remove({ recursive: true }).catch(() => { })
        // Fresh IndexedDB per test - handles/targets persist across tests otherwise.
        await new Promise(resolve => {
            const req = indexedDB.deleteDatabase("sli:tag-export")
            req.onsuccess = req.onerror = resolve
        })
        menu.export.app_code = "cdn" // avoid the file:// "asis"/"inline" complications, irrelevant here
    })
})

test("persisted target is reused without a picker on the next export", async ({ page }) => {
    await stubSaveFilePicker(page, "trip.html")
    const firstName = await page.evaluate(async () => {
        const handle = await menu.export.assure_handler(false)
        return handle.name
    })
    expect(firstName).toBe("trip.html")
    await page.evaluate(async () => {
        const handle = await menu.export.assure_handler(false)
        await handle.createWritable().then(w => w.close())
        await menu.export._record_export_target(handle, false)
        menu.export.file_handler = null // simulate a fresh page load - only the IndexedDB record survives
    })

    await page.evaluate(() => {
        window.showSaveFilePicker = async () => { throw new Error("should not be called - a valid target is already persisted") }
    })
    const secondName = await page.evaluate(async () => (await menu.export.assure_handler(false)).name)
    expect(secondName).toBe("trip.html")
})

test("a size/mtime mismatch asks before overwriting, and 'Cancel' falls back to the picker", async ({ page }) => {
    await stubSaveFilePicker(page, "a.html")
    await page.evaluate(async () => {
        const handle = await menu.export.assure_handler(false)
        await handle.createWritable().then(w => w.write("hello").then(() => w.close()))
        await menu.export._record_export_target(handle, false)
        menu.export.file_handler = null

        // The file changes on disk after it was recorded (a `size` mismatch).
        const root = await navigator.storage.getDirectory()
        const h = await root.getFileHandle("a.html")
        await h.createWritable().then(w => w.write("changed on disk, now longer").then(() => w.close()))
    })

    // Decline the overwrite confirmation -> falls back to a fresh picker.
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        window.showSaveFilePicker = async () => root.getFileHandle("b.html", { create: true })
        menu.export._confirm = async () => false
    })
    expect(await page.evaluate(async () => (await menu.export.assure_handler(false)).name)).toBe("b.html")
})

test("a size/mtime mismatch, once confirmed, reuses the same target", async ({ page }) => {
    await stubSaveFilePicker(page, "a.html")
    await page.evaluate(async () => {
        const handle = await menu.export.assure_handler(false)
        await handle.createWritable().then(w => w.write("hello").then(() => w.close()))
        await menu.export._record_export_target(handle, false)
        menu.export.file_handler = null

        const root = await navigator.storage.getDirectory()
        const h = await root.getFileHandle("a.html")
        await h.createWritable().then(w => w.write("changed on disk, now longer").then(() => w.close()))
        menu.export._confirm = async () => true
    })
    expect(await page.evaluate(async () => (await menu.export.assure_handler(false)).name)).toBe("a.html")
})

test("hosted origin never persists a target", async ({ page }) => {
    await page.evaluate(() => { menu.export._is_file_protocol = () => false })
    await stubSaveFilePicker(page, "hosted.html")
    await page.evaluate(async () => {
        const handle = await menu.export.assure_handler(false)
        await handle.createWritable().then(w => w.close())
        await menu.export._record_export_target(handle, false)
        menu.export.file_handler = null
    })
    const stored = await page.evaluate(async () => menu.export._load_export_target())
    expect(stored).toBeNull()
})
