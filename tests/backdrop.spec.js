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

// A photo "from another origin" (file:// page, so any http URL is one), served by page.route with or
// without Access-Control-Allow-Origin.
const PNG = require("fs").readFileSync(path.resolve(__dirname, "fixtures/portrait.png"))

async function crossOrigin(page, { cors, hash = "#1?start" }) {
    // Interception skips the browser's CORS check, so a refusal is simulated: a CORS-mode request (it
    // carries an Origin header) to a server without the header fails like it would for real.
    await page.route("http://photos.test/**", route => (!cors && "origin" in route.request().headers())
        ? route.abort()
        : route.fulfill({ body: PNG, contentType: "image/png", headers: cors ? { "Access-Control-Allow-Origin": "*" } : {} }))
    await page.goto(FIXTURE + hash)
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index === 0)).toBe(true)
    await page.evaluate(() => playback.frame.loaded)
}

const reload_first = page => page.evaluate(async () => {
    const frame = playback.$articles.eq(0).data("frame")
    const img = frame.$actor[0]
    Frame.backdrop_clear(frame.$frame)
    await new Promise(resolve => { img.onload = resolve; img.src = "http://photos.test/p.png" })
    frame.backdrop_prepare()
})

test("cross-origin photo: a CORS server gets the cheap painted backdrop", async ({ page }) => {
    await crossOrigin(page, { cors: true })
    await reload_first(page)
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("painted")
    expect((await backdrop(page, 1))[1]).toMatch(/^url\("data:image\/jpeg/)
    expect(await page.locator("main article img").first().getAttribute("crossorigin")).toBeNull()
})

test("cross-origin photo: no CORS stays a live blur", async ({ page }) => {
    await crossOrigin(page, { cors: false })
    await reload_first(page)
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("live")
    await page.waitForTimeout(500)
    expect((await backdrop(page, 1))[0]).toBe("live")
})

test("cross-origin photo: the data saver does not fetch it again", async ({ page }) => {
    let cors_fetches = 0
    await crossOrigin(page, { cors: true })
    page.on("request", r => { r.url().startsWith("http://photos.test/") && "origin" in r.headers() && cors_fetches++ })
    await page.evaluate(() => { playback.dataSaver.active = true })
    await reload_first(page)
    await expect.poll(async () => (await backdrop(page, 1))[0]).toBe("live")
    await page.waitForTimeout(500)
    expect((await backdrop(page, 1))[0]).toBe("live")
    expect(cors_fetches).toBe(0) // no CORS-mode refetch
})
