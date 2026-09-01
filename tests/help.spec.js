const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/props.html")

/** A stand-in for the fetched docs/*.md pages, so no test needs the network. */
const DOCS = [
    { page: "video", text: "## `sli-playback-rate`\n\nThe speed of the video.\n\n## `sli-video`\n\nSomething else.\n" },
    { page: "structure", text: "### `sli-duration`\n\nHow long a frame lasts. See [`sli-loop`](#sli-loop).\n" },
]

async function start(page) {
    await page.goto(FIXTURE)
    await page.locator("#start").click()
    await page.evaluate(docs => playback.hud._help = docs, DOCS)
    await page.evaluate(() => playback.hud.toggle_properties())
}

test("a property label unfolds its documentation inline and links to the published page", async ({ page }) => {
    await start(page)

    const row = page.locator("#hud-properties [data-property=duration][data-el-tag=ARTICLE]")
    await expect(row.locator(".prop-help")).toHaveCount(0)

    await row.locator("label").click()
    const help = row.locator(".prop-help")
    await expect(help).toContainText("How long a frame lasts")

    // the docs link points at the page the section was actually found in, not at the repo root
    await expect(help.locator("a", { hasText: "→ docs" }))
        .toHaveAttribute("href", "https://cz-nic.github.io/slidershow/docs/structure/#sli-duration")
    // an in-page markdown link is rewritten to that same published page
    await expect(help.locator("a", { hasText: "sli-loop" }))
        .toHaveAttribute("href", "https://cz-nic.github.io/slidershow/docs/structure/#sli-loop")

    // clicking again folds it back
    await row.locator("label").click()
    await expect(row.locator(".prop-help")).toHaveCount(0)
})

test("the short help serves as the label tooltip", async ({ page }) => {
    await start(page)
    await expect(page.locator("#hud-properties [data-property=duration][data-el-tag=ARTICLE] label"))
        .toHaveAttribute("title", /How long a frame lasts/)
})

test("a section is looked up across every docs page", async ({ page }) => {
    await start(page)
    expect(await page.evaluate(() => playback.hud.get_help("playback-rate", true, false)))
        .toBe("The speed of the video.")
    expect(await page.evaluate(() => playback.hud.get_help("nonexistent", true, false)))
        .toBe("Cannot fetch help for nonexistent")
})
