const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/backdrop.html")

/** The backdrop state of the n-th frame (1-based): [sli-backdrop-shown, the ::before background-image]. */
const backdrop = (page, n) => page.locator("main article").nth(n - 1).evaluate(el =>
    [el.getAttribute("sli-backdrop-shown"), getComputedStyle(el, "::before").backgroundImage])

test("auto: a photo frame gets a pre-blurred backdrop, slides do not", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("painted")
    expect((await backdrop(page, 1))[1]).toMatch(/^url\("data:image\/jpeg/)

    // the photo still fills the frame, the backdrop lies behind it
    const $article = page.locator("main article").first()
    const box = await $article.boundingBox()
    const imgBox = await $article.locator(":scope > img").boundingBox()
    expect(Math.round(imgBox.height)).toBe(Math.round(box.height))
    expect(await $article.evaluate(el => getComputedStyle(el, "::before").zIndex)).toBe("-1")

    await page.evaluate(() => Promise.all([2, 3].map(i => playback.$articles.eq(i - 1).data("frame").preload())))
    expect((await backdrop(page, 2))[0]).toBeNull() // no photo
    expect((await backdrop(page, 3))[0]).toBeNull() // authored slide – only with sli-backdrop=blur
})

test("blur from the hash covers an authored slide too, none turns it off", async ({ page }) => {
    await page.goto(FIXTURE + "#3?start&backdrop=blur")
    await expect.poll(async () => (await backdrop(page, 3))[0]).toBe("painted")

    await page.goto("about:blank")
    await page.goto(FIXTURE + "#1?start&backdrop=none")
    await page.evaluate(() => playback.frame.loaded)
    expect((await backdrop(page, 1))[0]).toBeNull()
})

test("Shift+B cycles auto → none → blur and the hash keeps it", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("painted")

    await page.keyboard.press("Shift+B")
    expect((await backdrop(page, 1))[0]).toBeNull()
    expect(page.url()).toContain("backdrop=none")

    await page.keyboard.press("Shift+B")
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("painted")
    expect(page.url()).toContain("backdrop=blur")
})

test("the backdrop does not travel into an export", async ({ page }) => {
    await page.goto(FIXTURE + "#1?start")
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("painted")
    const leftovers = await page.evaluate(async () => {
        const $contents = $main.clone()
        await Frame.finalize_frames($contents, playback.$articles)
        return $contents.find("[sli-backdrop-shown]").length
    })
    expect(leftovers).toBe(0)
})
