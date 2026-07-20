const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/props.html")

test("prop() walks element → article → section → main with type coercion", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const values = await page.evaluate(() => ({
        own: prop("duration", $("#a1")),
        section: prop("duration", $("#a2")),
        main: prop("duration", $("#a3")),
        walk_to_main: prop("rotate", $("#a3")),
        presence_is_true: prop("step-shown", $("#a2")),
        sibling_not_inherited: prop("step-shown", $("#a1")),
        numeric: prop("playback-rate", $("#a3")),
        string_false: prop("start", $("#a3")),
        prop_default: prop("thumb", $("#a1")),
        custom_default: prop("fit", $("#a1"), "custom"),
    }))

    expect(values).toEqual({
        own: 1,
        section: 2,
        main: 3,
        walk_to_main: 90,
        presence_is_true: true,
        sibling_not_inherited: false,
        numeric: 7.5,
        string_false: false,
        prop_default: "",
        custom_default: "custom",
    })
})

test("prop() memoizes within a generation; prop_invalidate() makes a later data-* write visible", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const r = await page.evaluate(() => {
        const $a1 = $("#a1")
        const first = prop("duration", $a1)   // 1, now memoized for this generation
        $a1.attr("data-duration", 5)           // raw attribute write, deliberately without invalidating
        const stale = prop("duration", $a1)   // served from cache -> proves the memo is actually live
        prop_invalidate()
        const fresh = prop("duration", $a1)   // re-read from the DOM -> 5
        return { first, stale, fresh }
    })
    expect(r).toEqual({ first: 1, stale: 1, fresh: 5 })
})

test("navigating (goToFrame) invalidates the prop() cache", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    const r = await page.evaluate(() => {
        const $a1 = $("#a1")
        const before = prop("duration", $a1)  // cached
        $a1.attr("data-duration", 9)
        playback.goToFrame(playback.index)     // a normal navigation must drop stale lookups
        return { before, afterNav: prop("duration", $a1) }
    })
    expect(r).toEqual({ before: 1, afterNav: 9 })
})

test("rotate written on <main> is visible after refresh_actor (its invalidation point)", async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    const r = await page.evaluate(() => {
        const $a3 = $("#a3")
        const before = prop("rotate", $a3)         // walks to <main data-rotate=90> -> 90, cached
        $main.attr("data-rotate", 180)
        playback.frame.refresh_actor("rotate")     // the real rotate path bumps the cache here
        return { before, after: prop("rotate", $a3) }
    })
    expect(r).toEqual({ before: 90, after: 180 })
})
