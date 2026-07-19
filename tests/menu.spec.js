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

test("append panel is unfolded when the presentation has no frames", async ({ page }) => {
    await page.goto(fixture("empty"))
    await expect(page.locator("#append-panel")).toHaveAttribute("open")
    await expect(page.locator("#drop")).toBeVisible()
    await expect(page.locator("#start")).toBeHidden()
})
