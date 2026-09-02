const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")

async function open_dialog(page, url = FIXTURE + "#1?start") {
    await page.goto(url)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    await page.keyboard.press("Control+s")
    await expect(page.locator(".ZebraDialog:visible")).toBeVisible()
}

const dialog = page => page.locator(".ZebraDialog:visible")

test("Ctrl+S opens one Export button, not a row of five", async ({ page }) => {
    await open_dialog(page)

    const buttons = dialog(page).locator(".ZebraDialog_Buttons a")
    await expect(buttons).toHaveCount(2)
    await expect(buttons.nth(0)).toHaveText("Cancel")
    await expect(buttons.nth(1)).toHaveText("Export")

    // the five old buttons are the "Media:" radio group now
    await expect(dialog(page).locator("input[name=media-target]")).toHaveCount(4)
})

test("the media folder path is a field in the dialog instead of a second prompt", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)
    // pretend the presentation already knows where its media lives
    await page.evaluate(() => $main.attr("sli-path", "photos/"))
    await page.keyboard.press("Control+s")

    const field = dialog(page).locator("input.export-path")
    await expect(field).toHaveValue("photos/")

    await field.fill("../shared-media/")
    // the export itself is stubbed – we only care that the field reaches it
    const used = await page.evaluate(() => {
        let seen = null
        menu.export._run_export = (compact, path) => { seen = { compact, path } }
        menu.export._export_selected()
        return seen
    })
    expect(used).toEqual({ compact: false, path: "../shared-media/" })
    // …and is remembered on <main> for the next export
    expect(await page.evaluate(() => $main.attr("sli-path"))).toBe("../shared-media/")
})

test("an empty path means the exported file's own folder", async ({ page }) => {
    await open_dialog(page)
    await dialog(page).locator("input.export-path").fill("   ")

    const used = await page.evaluate(() => {
        let seen = null
        menu.export._run_export = (compact, path) => { seen = { compact, path } }
        menu.export._export_selected()
        return seen
    })
    expect(used).toEqual({ compact: false, path: "" })
    expect(await page.evaluate(() => $main.attr("sli-path"))).toBe(undefined)
})

test("settings the picked media target doesn't reach are greyed out", async ({ page }) => {
    await open_dialog(page)

    // "Referenced where they are now" – the path field and the media-paths rewrite both apply
    await expect(dialog(page).locator("input.export-path")).toBeEnabled()
    await expect(dialog(page).locator(".media-paths-radio")).not.toHaveClass(/inapplicable/)

    await dialog(page).locator("input[name=media-target][value=single]").click()
    await expect(dialog(page).locator("input.export-path")).toBeDisabled()
    await expect(dialog(page).locator(".media-paths-radio")).toHaveClass(/inapplicable/)
    await expect(dialog(page).locator(".media-paths-radio input").first()).toBeDisabled()
    // the app's own code still applies to a single-file export
    await expect(dialog(page).locator(".app-code-footer")).not.toHaveClass(/inapplicable/)

    // "folders by tags" writes no presentation file, so the app-code choice is moot there
    await dialog(page).locator("input[name=media-target][value=tags]").click()
    await expect(dialog(page).locator(".app-code-footer")).toHaveClass(/inapplicable/)

    // …and going back re-enables what it disabled
    await dialog(page).locator("input[name=media-target][value=reference]").click()
    await expect(dialog(page).locator("input.export-path")).toBeEnabled()
    await expect(dialog(page).locator(".app-code-footer")).not.toHaveClass(/inapplicable/)
})

test("Export runs the picked target", async ({ page }) => {
    await open_dialog(page)
    await page.evaluate(() => {
        window._calls = []
        menu.export._run_export = (compact, path) => window._calls.push(["run", compact, path])
        menu.export.export_media_folder = () => window._calls.push(["media_folder"])
        menu.export.export_tags_dialog = () => window._calls.push(["tags"])
    })

    await dialog(page).locator("input[name=media-target][value=single]").click()
    await dialog(page).locator(".ZebraDialog_Buttons a", { hasText: "Export" }).click()

    expect(await page.evaluate(() => window._calls)).toEqual([["run", true, ""]])
})
