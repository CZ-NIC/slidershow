const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/caption.html")

for (const frame of [1, 2]) {
    test(`a figcaption overlays frame ${frame} while the photo still fills it`, async ({ page }) => {
        await page.goto(FIXTURE + `#${frame}?start`)
        const $article = page.locator("main article").nth(frame - 1)
        const $img = $article.locator(":scope > img")
        const $caption = $article.locator(":scope > figcaption")
        await expect($caption).toBeVisible()

        // the medium is still the actor and the frame is still a photo for the grid
        expect(await page.evaluate(() => playback.frame.$actor.is("article > img"))).toBe(true)
        expect(await page.evaluate(() => is_media_only(playback.frame.$frame))).toBe(true)

        // photo fills the frame, caption sits on its bottom edge
        const box = await $article.boundingBox()
        const imgBox = await $img.boundingBox()
        const capBox = await $caption.boundingBox()
        expect(Math.round(imgBox.width)).toBe(Math.round(box.width))
        expect(Math.round(imgBox.height)).toBe(Math.round(box.height))
        expect(Math.round(capBox.y + capBox.height)).toBe(Math.round(box.y + box.height))
        expect(await $caption.evaluate(el => getComputedStyle(el).position)).toBe("absolute")
    })
}
