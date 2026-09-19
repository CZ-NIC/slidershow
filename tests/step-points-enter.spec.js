const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/points.html")

/** The frame of `#zoomed-start`, whose first point is already zoomed in. */
const ZOOMED = 3

/**
 * Enter the presentation and record every FrameZoom.set call, so that a test can tell an instant
 * jump to a point from a `sli-step-transition-duration` long animation into it.
 */
async function spy(page) {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index)).toBe(0)
    await page.evaluate(() => {
        window.zooms = []
        const original = FrameZoom.prototype.set
        FrameZoom.prototype.set = function ($el, left, top, scale, transition_duration, ...rest) {
            // the id keeps the neighbouring frames' own refresh_actor calls out of the way
            window.zooms.push({ id: $el.attr("id"), left, top, scale, transition_duration })
            return original.call(this, $el, left, top, scale, transition_duration, ...rest)
        }
    })
}

/** The last zoom applied to the given image, along with how long it took to get there. */
const zoom_of = (page, id) => expect.poll(() => page.evaluate(i => window.zooms.filter(z => z.id === i).at(-1), id))

/** Walk to the frame. */
async function go(page, index) {
    await page.evaluate(i => playback.goToFrame(i), index)
    await expect.poll(() => page.evaluate(() => playback.frame.index)).toBe(index)
}

test("a frame whose first point is zoomed opens in it, with no zooming in front of the viewer", async ({ page }) => {
    await spy(page)

    // the initial point of [[10,20,2],[30,40,3]] – reached at once, not over sli-step-transition-duration
    await go(page, ZOOMED)
    await zoom_of(page, "zoomed-start").toMatchObject({ left: 10, top: 20, scale: 2, transition_duration: 0 })

    // stepping is still animated – the point names no duration of its own, so FrameZoom is left
    // to resolve sli-step-transition-duration itself
    await page.keyboard.press("PageDown")
    await zoom_of(page, "zoomed-start").toMatchObject({ left: 30, top: 40, scale: 3, transition_duration: undefined })
})

test("the very first frame of the presentation opens in its first point too", async ({ page }) => {
    // Playback starts on it, so it has no previous frame to arrive from – nothing used to put the
    // frame into its initial state at all and a zoomed first point was simply ignored.
    await page.goto(FIXTURE)
    await expect.poll(() => page.evaluate(() => typeof FrameZoom !== "undefined")).toBe(true)
    await page.evaluate(() => {
        window.zooms = []
        const original = FrameZoom.prototype.set
        FrameZoom.prototype.set = function ($el, left, top, scale, transition_duration, ...rest) {
            window.zooms.push({ id: $el.attr("id"), left, top, scale, transition_duration })
            return original.call(this, $el, left, top, scale, transition_duration, ...rest)
        }
    })
    await page.locator("#start").click()
    await expect.poll(() => page.evaluate(() => playback.frame?.index)).toBe(0)

    // frame 0 carries [[10,20,2],[30,40,3]] on an image of its own (no id, hence the undefined)
    await zoom_of(page, undefined).toMatchObject({ left: 10, top: 20, scale: 2, transition_duration: 0 })
})

test("coming back to a frame lands on its last point at once", async ({ page }) => {
    await spy(page)
    await go(page, ZOOMED + 1)

    // backwards into the frame – its last point is its state now, and it is there immediately
    await go(page, ZOOMED)
    await zoom_of(page, "zoomed-start").toMatchObject({ left: 30, top: 40, scale: 3, transition_duration: 0 })
})

test("a transition_duration on the very first point asks for an intro zoom", async ({ page }) => {
    await spy(page)
    // there is nothing to transition from, so the slot means "zoom in when the frame opens"
    await page.evaluate(() => $("#zoomed-start").attr("sli-step-points", "[[10,20,2,1.5],[30,40,3]]"))

    await go(page, ZOOMED)
    await zoom_of(page, "zoomed-start").toMatchObject({ left: 10, top: 20, scale: 2, transition_duration: 1.5 })
})
