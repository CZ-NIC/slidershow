const { test, expect } = require("@playwright/test")
const path = require("path")

// `embed-host.html` iframes empty.html?embed – `?embed` starts EmbedBridge instead of the splash screen
// (see embed_bridge.js / launch.js). A file:// top page is needed: Chromium blocks a file:// iframe
// under a non-file:// (ex. about:blank) parent, so `page.setContent()` isn't an option here.
const HOST = "file://" + path.resolve(__dirname, "fixtures/embed-host.html")
const IFRAME = "file://" + path.resolve(__dirname, "fixtures/empty.html") + "?embed"
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

/** Collects every `{sli:true, …}` message the host page receives, so a race against a fast "ready"
 * handshake can't lose an event the way a one-shot listener registered after goto() could. */
async function gotoHost(page) {
    await page.addInitScript(() => {
        window.__sliEvents = []
        window.addEventListener("message", e => {
            if (e.data?.sli) {
                window.__sliEvents.push(e.data)
            }
        })
    })
    await page.goto(HOST)
}

function eventsOf(page, name) {
    return page.evaluate(name => (window.__sliEvents || []).filter(e => e.event === name), name)
}

async function waitForEvent(page, name) {
    await expect.poll(() => eventsOf(page, name).then(l => l.length), { timeout: 15000 }).toBeGreaterThan(0)
    return (await eventsOf(page, name)).at(-1).data
}

function post(page, cmd, args) {
    return page.evaluate(({ cmd, args }) => {
        document.getElementById("f").contentWindow.postMessage({ sli: true, cmd, args }, "*")
    }, { cmd, args })
}

test("embed: _load/_open/close round-trips over postMessage", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }, { id: "b", src: PIXEL }] })
    await expect.poll(() => frame.evaluate(() => playback.$articles.length)).toBe(2)

    await post(page, "_open", { mode: "picker" })
    await waitForEvent(page, "opened")
    await expect(frame.locator("menu")).toBeHidden()

    // land on frame 0, then mark it "selected" (tag 1) before closing the picker
    await expect.poll(() => frame.evaluate(() => playback.frame?.index)).toBe(0)
    await frame.evaluate(() => playback.frame.set_tag(1))

    await post(page, "close")
    const confirmed = await waitForEvent(page, "confirmed")
    expect(confirmed).toEqual({ selected: [{ id: "a", tags: [1] }] })
    await expect(frame.locator("menu")).toBeVisible()

    expect(errors).toEqual([])
})

test("embed: view mode close() reports \"closed\", not \"confirmed\"", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await gotoHost(page)
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")

    await post(page, "close")
    await waitForEvent(page, "closed")
    expect(await eventsOf(page, "confirmed")).toEqual([])

    expect(errors).toEqual([])
})

test("embed: Escape reports close instead of toggling the (hidden) menu", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")
    await expect.poll(() => frame.evaluate(() => playback.frame?.index)).toBe(0)

    await frame.locator("body").press("Escape")
    await waitForEvent(page, "closed")
})

test("embed: _open({grid: true}) starts in the grid overview", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }, { id: "b", src: PIXEL }] })
    await post(page, "_open", { grid: true })
    await waitForEvent(page, "opened")

    await expect.poll(() => frame.evaluate(() => playback.hud.grid_visible)).toBe(true)
})

test("embed: Escape closes from within the grid overview too", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", { grid: true })
    await waitForEvent(page, "opened")
    await expect.poll(() => frame.evaluate(() => playback.hud.grid_visible)).toBe(true)

    await frame.locator("body").press("Escape")
    await waitForEvent(page, "closed")
})

test("embed: _load starts a fresh gallery on frame 0, not wherever the previous one left off", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, src: PIXEL })) })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")
    await frame.evaluate(() => playback.goToFrame(3))
    await expect.poll(() => frame.evaluate(() => playback.frame?.index)).toBe(3)

    await post(page, "close")
    await waitForEvent(page, "closed")

    // Same iframe, a different gallery - must not reuse the previous one's frame index.
    await post(page, "_load", { photos: [{ id: "b0", src: PIXEL }, { id: "b1", src: PIXEL }] })
    await post(page, "_open", {})
    await expect.poll(() => frame.evaluate(() => playback.frame?.index)).toBe(0)
})

test("embed: _open({grid: true}) opens the grid even if it was already open from a previous _open()", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }, { id: "b", src: PIXEL }] })
    await post(page, "_open", { grid: true })
    await waitForEvent(page, "opened")
    await expect.poll(() => frame.evaluate(() => playback.hud.grid_visible)).toBe(true)

    await post(page, "close")
    await waitForEvent(page, "closed")

    // Same iframe, reopened with grid:true again - toggling blindly would have closed it instead.
    await post(page, "_load", { photos: [{ id: "c", src: PIXEL }] })
    await post(page, "_open", { grid: true })
    await expect.poll(() => frame.evaluate(() => playback.hud.grid_visible)).toBe(true)
})

test("embed: a close icon is wired into the control-icons row", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")

    // The whole icon row (prev/next/grid/close) is hidden until an interaction reveals it, then fades
    // again after a second of inactivity – same as every other control-icons entry.
    const closeIcon = frame.locator("#control-icons [title=Close]")
    await frame.evaluate(() => document.dispatchEvent(new Event("mousemove")))
    await expect(closeIcon).toBeVisible()
    await closeIcon.click()
    await waitForEvent(page, "closed")
})

test("embed: grid hint bar is hidden by default, shown with hints:true", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", { grid: true })
    await waitForEvent(page, "opened")

    await expect(frame.locator("#hud-selection")).toBeHidden()

    await post(page, "close")
    await waitForEvent(page, "closed")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", { grid: true, hints: true })
    await waitForEvent(page, "opened")

    await expect(frame.locator("#hud-selection")).toHaveAttribute("data-mode", "hint")
})

test("embed: file info overlay is hidden by default, shown with fileInfo:true", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")
    await expect(frame.locator("#hud-fileinfo")).toBeHidden()

    await post(page, "close")
    await waitForEvent(page, "closed")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", { fileInfo: true })
    await waitForEvent(page, "opened")
    await expect(frame.locator("#hud-fileinfo")).toBeVisible()
})

test("embed: photo caption shows by default, hidden with captions:false", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL, caption: "Hello caption" }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")
    await expect(frame.locator("#hud-caption")).toBeVisible()
    await expect(frame.locator("#hud-caption")).toHaveText("Hello caption")

    await post(page, "close")
    await waitForEvent(page, "closed")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL, caption: "Hello caption" }] })
    await post(page, "_open", { captions: false })
    await waitForEvent(page, "opened")
    await expect(frame.locator("#hud-caption")).toBeHidden()
})

test("embed: photo with no caption shows nothing", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")
    await expect(frame.locator("#hud-caption")).toBeEmpty()
})

test("embed: Alt+m (show splashscreen) is a no-op", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")

    await frame.locator("body").press("Alt+m")
    await expect(frame.locator("menu")).toBeHidden()
    await expect.poll(() => frame.evaluate(() => playback.frame?.index)).toBe(0)
})

test("embed: browser Back closes the overlay (default historyEntry)", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", {})
    await waitForEvent(page, "opened")

    // page.goBack() waits for a "load" event that never fires for a pushState/popstate-only
    // transition (no document is actually loaded) - drive it the same way a real Back-button click
    // does under the hood instead.
    await page.evaluate(() => window.history.back())
    await waitForEvent(page, "closed")
    // Back closed the embed, not the host page itself.
    expect(page.url()).toBe(HOST)
    await expect(frame.locator("menu")).toBeVisible()
})

test("embed: historyEntry: false opts out of the Back-button behavior", async ({ page }) => {
    await gotoHost(page)
    const frame = page.frame({ url: IFRAME })
    await waitForEvent(page, "ready")

    await post(page, "_load", { photos: [{ id: "a", src: PIXEL }] })
    await post(page, "_open", { historyEntry: false })
    await waitForEvent(page, "opened")

    await post(page, "close")
    await waitForEvent(page, "closed")
    // No entry was pushed, so nothing consumed it - close() must not have called history.back().
    expect(page.url()).toBe(HOST)
})
