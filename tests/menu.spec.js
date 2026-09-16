const { test, expect } = require("@playwright/test")
const path = require("path")

const fixture = name => "file://" + path.resolve(__dirname, `fixtures/${name}.html`)

test("append panel is folded when a presentation is loaded", async ({ page }) => {
    await page.goto(fixture("basic"))
    await expect(page.locator("#start")).toBeVisible()
    await expect(page.locator("#append-panel")).not.toHaveAttribute("open")
    await expect(page.locator("#drop")).toBeHidden()

    // unfolding reveals the drop zone and the folded Defaults sub-panel
    await page.locator("#append-panel > summary").click()
    await expect(page.locator("#drop")).toBeVisible()
    await expect(page.locator("#defaults input[name=duration]")).toBeHidden()
})

test("Alt+m returns to the splashscreen while presenting", async ({ page }) => {
    await page.goto(fixture("basic"))
    await page.locator("#start").click()
    await expect(page.locator("menu")).toBeHidden()

    // navigate a bit first – frames without media used to disable the Media group
    // repeatedly, which knocked the clashing global Alt+m out of the registry
    await page.keyboard.press("PageDown")
    await page.keyboard.press("Alt+m")
    await expect(page.locator("menu")).toBeVisible()
})

test("append panel is unfolded when the presentation has no frames", async ({ page }) => {
    await page.goto(fixture("empty"))
    await expect(page.locator("#append-panel")).toHaveAttribute("open")
    await expect(page.locator("#drop")).toBeVisible()
    await expect(page.locator("#start")).toBeHidden()
})

// The HUD menu fades out during the presentation, yet its buttons are only affordances of the hotkeys.
// WebHotkeys skips a hotkey whose element is hidden unless told otherwise – see the `inHidden` option
// the bootstrap passes (slidershow.js).
test("a shortcut whose button sits in the hidden HUD menu still fires", async ({ page }) => {
    await page.goto(fixture("basic"))
    await page.locator("#start").click()
    await expect.poll(() => page.url()).toContain("#1")

    await page.evaluate(() => playback.hud.$hud_menu.hide())
    await page.keyboard.press("Alt+t") // the 🏷 menu button's own combination
    expect(await page.evaluate(() => playback.tagging_mode)).toBe(true)
})
