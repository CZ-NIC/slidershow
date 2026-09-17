const { test, expect } = require("@playwright/test")
const path = require("path")
const fs = require("fs")
const os = require("os")

const BASIC = "file://" + path.resolve(__dirname, "fixtures/basic.html")
const STEPS = "file://" + path.resolve(__dirname, "fixtures/steps.html")

/** Starts the presentation and lays the print pages out. @returns {Promise<number>} page count */
async function layout(page, url, options = {}) {
    await page.goto(url)
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")
    return await page.evaluate(opts => menu.pdf.build(opts), options)
}

test("one page per frame, every step flattened", async ({ page }) => {
    const pages = await layout(page, BASIC, { include_steps: false })
    expect(pages).toBe(3)
    await expect(page.locator("print-page")).toHaveCount(3)
    // The live presentation is hidden, the print tree is what shows.
    await expect(page.locator("main h1")).toBeHidden()
    await expect(page.locator("print-page:first-child article")).toBeVisible()
    await expect(page.locator("print-page").first()).toContainText("Frame one")
    await expect(page.locator("print-page").last()).toContainText("Frame three")
})

test("with steps, each step gets its own page carrying its own state", async ({ page }) => {
    // steps.html: frame 1 has two steps (3 pages), frame 2 has none (1 page)
    const pages = await layout(page, STEPS, { include_steps: true })
    expect(pages).toBe(4)

    const shown = await page.evaluate(() => [...document.querySelectorAll("print-page")]
        .map(p => [...p.querySelectorAll("[sli-step].step-shown")].map(el => el.id)))
    expect(shown).toEqual([[], ["s1"], ["s1", "s2"], []])
})

test("the page is sized to the paper and the slide letterboxed into it", async ({ page }) => {
    await layout(page, BASIC, { include_steps: false, page_size: "16:9" })
    const box = await page.locator("print-page").first().boundingBox()
    expect(Math.round(box.width)).toBe(1280)
    expect(Math.round(box.height)).toBe(720)

    const { scaled_w, page_w } = await page.evaluate(() => {
        const article = document.querySelector("print-page > article")
        return { scaled_w: article.getBoundingClientRect().width, page_w: 1280 }
    })
    expect(scaled_w).toBeLessThanOrEqual(page_w + 1)
})

test("teardown puts the presentation back", async ({ page }) => {
    await layout(page, STEPS, { include_steps: true })
    await page.evaluate(() => menu.pdf.teardown())
    await expect(page.locator("print-page")).toHaveCount(0)
    await expect(page.locator("main #s1")).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.hasAttribute("sli-print"))).toBe(false)
    expect(await page.evaluate(() => playback.step_disabled)).toBe(false)
    // Back on the frame we started from, its steps reset the way the Home key resets them.
    expect(page.url()).toContain("#1")
    await expect(page.locator("#s1")).toHaveClass(/step-shown/)
    await expect(page.locator("#s2")).toHaveClass(/step-hidden/)
})

test("print media hides the HUD and keeps the pages", async ({ page }) => {
    await layout(page, BASIC, { include_steps: false })
    await page.emulateMedia({ media: "print" })
    await expect(page.locator("print-page")).toHaveCount(3)
    await expect(page.locator("#hud")).toBeHidden()
    await expect(page.locator("print-toolbar")).toBeHidden()
})

test("the browser writes a PDF with one sheet per page", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() is Chromium-only")
    await layout(page, BASIC, { include_steps: false })
    const file = path.join(os.tmpdir(), `slidershow-test-${process.pid}.pdf`)
    await page.pdf({ path: file, preferCSSPageSize: true })
    const sheets = fs.readFileSync(file, "latin1").match(/\/Type\s*\/Page[^s]/g) || []
    expect(sheets.length).toBe(3)
    fs.unlinkSync(file)
})

test("the print-pdf hash lays the presentation out on its own", async ({ page }) => {
    await page.goto(STEPS + "#1?print-pdf")
    await page.locator("#start").click()
    // Generous: the layout walks (and loads) the whole presentation before the pages appear.
    await expect(page.locator("print-page")).toHaveCount(4, { timeout: 20000 })
})
