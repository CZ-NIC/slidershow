const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
})

/**
 * Builds, under <main>:
 *   <section A>
 *     <article> a1
 *     <div data-duration> <article> a2   (frame wrapped in a transparent div)
 *     <section A-sub> <article> a3        (nested subsection)
 *   <article> orphan1                     (loose under <main>, no section)
 *   <article> orphan2
 */
async function buildNested(page) {
    await page.evaluate(() => {
        const frame = () => $("<article/>").append($("<img/>", { src: "exif.jpeg" })) // img = a taggable actor
        $main.empty()
        const $A = $("<section/>", { "data-name": "A" })
        $A.append(frame()) // a1 – plain direct child
        $A.append($("<div/>", { "data-duration": "0.5" }).append(frame())) // a2 – wrapped in a div
        $A.append($("<section/>", { "data-name": "A-sub" }).append(frame())) // a3 – nested subsection
        $A.appendTo($main)
        frame().appendTo($main) // orphan1
        frame().appendTo($main) // orphan2
        playback.reset()
    })
}

test("section header counts frames recursively but lists only direct subsections", async ({ page }) => {
    await buildNested(page)
    const label = await page.evaluate(() =>
        playback.section_controller.getSectionName($("main > section[data-name='A']")))
    // 1 direct subsection (A-sub), 3 frames all the way down (a1 + wrapped a2 + nested a3)
    expect(label).toBe("A (1 section, 3 frames)")
})

test("presentation header counts every frame recursively, incl. loose ones", async ({ page }) => {
    await buildNested(page)
    const label = await page.evaluate(() =>
        playback.section_controller.getSectionName($main, "Presentation"))
    // 1 direct section (A); 5 frames total = 3 inside A + 2 orphans under <main>
    expect(label).toBe("Presentation (1 section, 5 frames)")
})

test("getDirectFrames sees through div wrappers but not into nested subsections", async ({ page }) => {
    await buildNested(page)
    const counts = await page.evaluate(() => {
        const $A = $("main > section[data-name='A']")
        return {
            direct: playback.section_controller.getDirectFrames($A).length,
            total: playback.section_controller.getTotalFrameCount($A),
            sections: playback.section_controller.getDirectSections($A).length,
        }
    })
    expect(counts).toEqual({ direct: 2, total: 3, sections: 1 }) // a1 + wrapped a2 (not nested a3)
})

test("regroup at a section reaches a frame wrapped in a div", async ({ page }) => {
    await buildNested(page)
    // tag the div-wrapped frame (a2) and regroup section A by tags
    await page.evaluate(() => {
        // re-establish a valid current frame after buildNested emptied <main> (group() navigates at the end)
        const $first = $("main article").first()
        playback.frame = $first.data("frame")
        playback.$current = $first

        const $A = $("main > section[data-name='A']")
        const wrapped = playback.section_controller.getDirectFrames($A).toArray()
            .find(el => el.parentElement.hasAttribute("data-duration"))
        $(wrapped).data("frame").set_tag(1)
        playback.hud.grid.sectionMenuAction($A, "regroup", "tags")
    })
    // the wrapped frame ended up in a data-name="1" section (was not overlooked inside its div)
    const moved = await page.evaluate(() => $("main section[data-name='1'] article").length)
    expect(moved).toBe(1)
})

test("grid shows a single 'loose frames' divider before orphan frames", async ({ page }) => {
    await buildNested(page)
    await page.evaluate(() => playback.hud.toggle_grid())
    await expect(page.locator("#hud-grid")).toBeVisible()

    const dividers = page.locator("#hud-grid .grid-orphan-divider")
    await expect(dividers).toHaveCount(1)

    // it sits after section A's thumbnails and immediately before the first orphan thumbnail
    const nextTag = await dividers.first().evaluate(el => el.nextElementSibling?.tagName)
    expect(nextTag).toBe("FRAME-PREVIEW")
})

test("grid shows no divider when every frame lives in a section", async ({ page }) => {
    // tags.html base: a single <section> with 3 frames, no orphans
    await page.evaluate(() => playback.hud.toggle_grid())
    await expect(page.locator("#hud-grid")).toBeVisible()
    await expect(page.locator("#hud-grid .grid-orphan-divider")).toHaveCount(0)
})
