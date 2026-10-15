const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/transition.html")
const BASIC = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test.beforeEach(async ({ page }) => {
    // Count the crossfades: every `fade` goes through document.startViewTransition.
    await page.addInitScript(() => {
        window.__vt = 0
        const original = Document.prototype.startViewTransition
        Document.prototype.startViewTransition = function (...args) {
            window.__vt++
            return original.apply(this, args)
        }
    })
})

/** Wait until the playback hotkeys are live (see TESTING.md). */
const ready = page => expect.poll(() => page.evaluate(() =>
    typeof playback !== "undefined" && playback.operation?.switches?.some(h => h.enabled))).toBe(true)

/** The camera ($main) sits exactly on the current frame and is not animating. */
const landed = page => page.evaluate(() => {
    const p = playback.frame.get_position()
    return !$main.is(":animated")
        && Math.abs(parseFloat($main.css("top")) - parseFloat(p.top)) < 1
        && Math.abs(parseFloat($main.css("left")) - parseFloat(p.left)) < 1
})

const vtCount = page => page.evaluate(() => window.__vt)

test("Chromium supports the View Transitions API", async ({ page }) => {
    await page.goto(FIXTURE)
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("function")
})

test("fade crossfades through a view transition and the camera lands on the target", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.goto(FIXTURE + "#3?start")
    await ready(page)

    await page.keyboard.press("PageDown") // → 4, fade inherited from its <section>
    await expect.poll(() => vtCount(page)).toBe(1)
    // the root crossfades for sli-transition-duration, the HUD does not fade
    await expect.poll(() => page.evaluate(() => document.getAnimations()
        .filter(a => /** @type {KeyframeEffect} */(a.effect).pseudoElement?.startsWith("::view-transition-"))
        .map(a => `${a.effect.pseudoElement} ${a.effect.getTiming().duration}`).sort().join(", ")))
        .toContain("::view-transition-new(root) 400")
    expect(await page.evaluate(() => document.getAnimations()
        .some(a => /(old|new)\(hud\)/.test(a.effect.pseudoElement ?? "")))).toBe(false)
    expect(await page.evaluate(() => playback.index)).toBe(3)
    // the duration is handed to the CSS pseudo elements for the time of the transition only
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--sli-transition-duration"))).toBe("")
    await expect.poll(() => landed(page)).toBe(true)
    expect(errors).toEqual([])
})

test("the target frame decides, in both directions", async ({ page }) => {
    await page.goto(FIXTURE + "#4?start")
    await ready(page)

    await page.keyboard.press("PageDown") // → 5: sli-transition=move on the frame beats the section's fade
    expect(await page.evaluate(() => $main.is(":animated"))).toBe(true)
    await expect.poll(() => landed(page)).toBe(true)
    expect(await vtCount(page)).toBe(0)

    await page.keyboard.press("PageUp") // back → 4: fade (the target's value, not the one of 5 being left)
    await expect.poll(() => vtCount(page)).toBe(1)
    await expect.poll(() => landed(page)).toBe(true)

    await page.keyboard.press("PageUp") // back → 3: scroll-down, treated as none
    expect(await landed(page)).toBe(true)
    expect(await vtCount(page)).toBe(1)
})

test("none and scroll-down are instant", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await ready(page)
    for (const index of [1, 2]) { // → 2 (none), → 3 (scroll-down)
        await page.keyboard.press("PageDown")
        expect(await page.evaluate(() => playback.index)).toBe(index)
        expect(await landed(page)).toBe(true) // no animation at all, right after the key press
    }
    expect(await vtCount(page)).toBe(0)
})

test("transition-duration 0 is instant for fade too", async ({ page }) => {
    await page.goto(FIXTURE + "#3?start&transition-duration=0")
    await ready(page)
    await page.keyboard.press("PageDown")
    expect(await landed(page)).toBe(true)
    expect(await vtCount(page)).toBe(0)
})

test("transition and transition-duration from the hash, kept in the hash", async ({ page }) => {
    await page.goto(BASIC + "#1?start&transition=fade&transition-duration=0.3")
    await ready(page)
    expect(await page.evaluate(() => [$main.attr("sli-transition"), $main.attr("sli-transition-duration")])).toEqual(["fade", "0.3"])
    await page.keyboard.press("PageDown")
    await expect.poll(() => vtCount(page)).toBe(1)
    await expect.poll(() => landed(page)).toBe(true)
    expect(page.url()).toContain("transition=fade")
    expect(page.url()).toContain("transition-duration=0.3")
})

test("an unknown value and extra tokens: only the first token counts, unknown is move", async ({ page }) => {
    await page.goto(BASIC + "#1?start")
    await ready(page)
    expect(await page.evaluate(() => {
        const frame = playback.frame
        return ["fade slow", "none whatever", "zoom", "scroll-down", ""].map(v => {
            frame.$frame.attr("sli-transition", v)
            prop_invalidate()
            return playback.transition_type(frame)
        })
    })).toEqual(["fade", "none", "move", "none", "move"])
})

test("prefers-reduced-motion turns move into fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(FIXTURE + "#4?start")
    await ready(page)
    await page.keyboard.press("PageDown") // → 5 (move)
    await expect.poll(() => vtCount(page)).toBe(1)
    await expect.poll(() => landed(page)).toBe(true)
})

test("rapid fade navigation does not throw and ends on the right frame", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.goto(BASIC + "#1?start&transition=fade&transition-duration=1")
    await ready(page)
    await page.keyboard.press("PageDown")
    await page.keyboard.press("PageDown")
    await expect.poll(() => page.evaluate(() => playback.index)).toBe(2)
    await expect.poll(() => landed(page)).toBe(true)
    expect(errors).toEqual([])
})

test("a step arriving during a move is instant", async ({ page }) => {
    await page.goto(BASIC + "#1?start&transition-duration=2")
    await ready(page)
    await page.keyboard.press("PageDown")
    expect(await page.evaluate(() => $main.is(":animated"))).toBe(true)
    await page.keyboard.press("PageDown") // the first move is still flying
    expect(await page.evaluate(() => playback.index)).toBe(2)
    expect(await landed(page)).toBe(true)
})

test("Kiosk crossfades unless the presentation sets its own transition", async ({ page }) => {
    await page.goto(BASIC)
    await page.locator(".play-mode[data-kiosk]").click()
    await expect(page.locator("main")).toHaveAttribute("sli-transition", "fade")
    await expect(page.locator("main")).toHaveAttribute("sli-transition-duration", "1.2")

    await page.goto(FIXTURE) // sets sli-transition-duration on <main> itself
    await page.locator(".play-mode[data-kiosk]").click()
    await expect(page.locator("main")).toHaveAttribute("sli-transition", "fade")
    await expect(page.locator("main")).toHaveAttribute("sli-transition-duration", "0.4")
})

test("no transition artifacts travel into an export", async ({ page }) => {
    await page.goto(FIXTURE + "#3?start")
    await ready(page)
    await page.keyboard.press("PageDown")
    await expect.poll(() => vtCount(page)).toBe(1)
    await expect.poll(() => landed(page)).toBe(true)
    await expect.poll(() => page.evaluate(() => playback.promise.then(() => true))).toBe(true) // the crossfade finished
    const html = await page.evaluate(async () => {
        const $contents = $main.clone()
        await Frame.finalize_frames($contents, playback.$articles)
        return $contents.prop("outerHTML") + (document.documentElement.getAttribute("style") ?? "")
    })
    expect(html).not.toContain("--sli-transition-duration")
    expect(html).not.toContain("view-transition")
})
