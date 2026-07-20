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
 *   <article> loose0            (index 0 – loose, directly under <main>)
 *   <section> <article> <article> (indices 1, 2)
 *   <section> <article>           (index 3)
 */
async function buildLooseFirst(page) {
    await page.evaluate(() => {
        const frame = () => $("<article/>").append($("<img/>", { src: "exif.jpeg" }))
        $main.empty()
        frame().appendTo($main)                                  // index 0 – loose first frame
        $("<section/>").append(frame(), frame()).appendTo($main) // indices 1, 2
        $("<section/>").append(frame()).appendTo($main)          // index 3
        playback.reset()
        // re-establish a valid current frame after emptying <main> (goToFrame reads the outgoing one)
        const $first = $("main article").first()
        playback.frame = $first.data("frame")
        playback.$current = $first
        playback.index = 0
    })
}

test("nextSection from a loose first frame goes to the next section, not the last slide", async ({ page }) => {
    await buildLooseFirst(page)
    const idx = await page.evaluate(() => {
        playback.nextSection() // current is already the loose first frame (index 0)
        return playback.index
    })
    expect(idx).toBe(1) // first frame of the first <section> – not the last frame (3)
})

test("nextSection from inside a section still steps to the next section", async ({ page }) => {
    await buildLooseFirst(page)
    const idx = await page.evaluate(() => {
        playback.goToFrame(1) // first frame of the first section
        playback.nextSection()
        return playback.index
    })
    expect(idx).toBe(3) // first (only) frame of the second section
})
