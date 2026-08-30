const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/tags.html")
/** Three frames that are nothing but an <img> – a photo album, as far as the grid is concerned. */
const PHOTOS = FIXTURE
/** Three text frames, i.e. an authored slide deck. */
const SLIDES = "file://" + path.resolve(__dirname, "fixtures/basic.html")

test("toggling the grid before the first frame is entered does not crash goToFrame", async ({ page }) => {
    const errors = []
    page.on("pageerror", e => errors.push(e.message))

    await page.goto(FIXTURE)
    await page.locator("#start").waitFor() // deliberately don't click – playback.frame is still the dummy pre-boot Frame

    await page.evaluate(() => playback.hud.toggle_grid()) // open, from a hash-restored state e.g.
    await page.evaluate(() => playback.hud.toggle_grid()) // close again, frame is still not ready

    expect(errors).toEqual([])
})

test("restoring grid from the hash before the first frame is entered still leaves the grid's own hotkeys enabled once it is", async ({ page }) => {
    // start skips the splash screen, so the grid restore (session.js restore_state's "grid" case)
    // runs while playback.frame is still the dummy pre-boot Frame – the exact race that left Hud.toggle_grid()
    // computing "on" as false forever after (see CHANGELOG "that same .index-readiness check...").
    await page.goto(FIXTURE + "#1?start&grid")
    await expect.poll(() => page.evaluate(() => typeof playback !== "undefined" && playback.frame?.index !== undefined)).toBe(true)

    expect(await page.evaluate(() => playback.hud.grid_visible)).toBe(true)
    expect(await page.evaluate(() => playback.operation.grid.some(h => h.enabled))).toBe(true)
})

test("grid tiles keep their 4:3 shape and a photo-only frame fills its tile instead of being a shrunken screen", async ({ page }) => {
    // The fixture holds three frames, i.e. a single grid row that does not fill the viewport – the case
    // where the flex container's default `align-content: stretch` used to inflate the row and pull the
    // tiles out of shape, undoing the whole point of sizing them by aspect-ratio.
    await page.goto(FIXTURE + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await expect.poll(() => page.locator("#hud-grid frame-preview.loading").count()).toBe(0)

    const tile = await page.evaluate(() => {
        const el = document.querySelector("#hud-grid frame-preview")
        const article = el.firstElementChild
        return {
            box: { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
            mediaOnly: el.classList.contains("media-only"),
            article: { w: article.getBoundingClientRect().width, h: article.getBoundingClientRect().height },
        }
    })

    expect(tile.box.w).toBeGreaterThan(0)
    expect(tile.box.h).toBeCloseTo(tile.box.w * 3 / 4, 0)

    // A frame whose article holds nothing but the <img> hands the whole tile over to the photo, so the
    // `object-fit: cover` crop follows the (4:3) tile rather than the screen's aspect ratio.
    expect(tile.mediaOnly).toBe(true)
    expect(tile.article.w).toBeCloseTo(tile.box.w, 0)
    expect(tile.article.h).toBeCloseTo(tile.box.h, 0)
})

test("the tile shape is autodetected: photos get a photo-shaped tile, authored slides the screen's shape", async ({ page }) => {
    // A slide overview that crops the slides is useless – you cannot tell one from another – so a deck of
    // authored frames keeps the device's own proportions instead of the photo-album 4:3.
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    expect(await page.evaluate(() => playback.hud.grid.detectTileShape())).toBe("4:3")
    expect(await page.getAttribute("#hud-grid", "data-tile")).toBe("4:3")

    await page.goto(SLIDES + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    expect(await page.evaluate(() => playback.hud.grid.detectTileShape())).toBe("screen")
    expect(await page.getAttribute("#hud-grid", "data-tile")).toBe("screen")

    const tile = await page.evaluate(() => {
        const r = document.querySelector("#hud-grid frame-preview").getBoundingClientRect()
        return { w: r.width, h: r.height, ratio: window.innerWidth / window.innerHeight }
    })
    expect(tile.h).toBeCloseTo(tile.w / tile.ratio, 0)
})

test("the tile shape cycles, survives in the hash and is never written into the document", async ({ page }) => {
    await page.goto(PHOTOS + "#1?start&grid&grid-tile=1:1")
    await page.locator("#hud-grid frame-preview").first().waitFor()

    // restored from the hash, overriding the 4:3 the photos would otherwise have been given
    expect(await page.getAttribute("#hud-grid", "data-tile")).toBe("1:1")
    const square = await page.evaluate(() => document.querySelector("#hud-grid frame-preview").getBoundingClientRect())
    expect(square.height).toBeCloseTo(square.width, 0)

    await page.keyboard.press("Alt+a")
    expect(await page.evaluate(() => playback.hud.grid.tile_shape)).toBe("screen")
    expect(await page.getAttribute("#hud-grid", "data-tile")).toBe("screen")
    expect(decodeURIComponent(page.url())).toContain("grid-tile=screen")

    // It is a view preference of whoever is browsing, so it must leave the presentation itself untouched –
    // no sli-* attribute appears anywhere (see GridController.tile_shape).
    expect(await page.evaluate(() => document.querySelector("main").outerHTML)).not.toContain("grid-tile")
})

test("tile captions cycle off → name → name+date and ride in the hash", async ({ page }) => {
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()

    const caption = page.locator("#hud-grid frame-preview").first().locator(".tile-label")
    // built for every tile from the start – the cycle only ever shows/hides it, never re-renders the grid
    await expect(caption).toBeAttached()
    await expect(caption).toBeHidden()

    await page.keyboard.press("Alt+f")
    await expect(caption).toBeVisible()
    await expect(caption.locator("b")).toHaveText("one.jpg") // sli-src wins over the shared src, see get_filename
    await expect(caption.locator("i")).toBeHidden()
    expect(page.url()).toContain("grid-labels=name")

    await page.keyboard.press("Alt+f")
    expect(await page.getAttribute("#hud-grid", "data-labels")).toBe("name-date")
    expect(page.url()).toContain("grid-labels=name-date")

    await page.keyboard.press("Alt+f") // back to off – and out of the hash again
    expect(await page.getAttribute("#hud-grid", "data-labels")).toBe("off")
    expect(page.url()).not.toContain("grid-labels")
})

test("\"show whole frames\" stops cropping and re-centres the crop bias", async ({ page }) => {
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()

    const fit = () => page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector("#hud-grid frame-preview img"))
        return { objectFit: cs.objectFit, objectPosition: cs.objectPosition }
    })
    // cropped by default, and biased upward because a phone photo's subject sits above the middle
    expect(await fit()).toEqual({ objectFit: "cover", objectPosition: "50% 40%" })

    await page.keyboard.press("Alt+c")
    expect(await page.getAttribute("#hud-grid", "data-fit")).toBe("contain")
    // nothing is cropped now, so the upward bias has to go – it would hang a portrait off its letterbox
    expect(await fit()).toEqual({ objectFit: "contain", objectPosition: "50% 50%" })
    expect(page.url()).toContain("grid-fit=contain")

    await page.keyboard.press("Alt+c")
    expect(await page.getAttribute("#hud-grid", "data-fit")).toBe("cover")
    expect(page.url()).not.toContain("grid-fit")
})

test("the column count is clamped and outlives the presentation it was set on", async ({ page }) => {
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    const columns = () => page.evaluate(() => GRID_COLUMNS)
    const stored = () => page.evaluate(() => localStorage.getItem("sli:grid-columns"))

    await page.keyboard.press("NumpadSubtract")
    expect(await columns()).toBe(5)
    expect(await stored()).toBe("5")

    // never down to zero: `calc(100% / var(--columns))` would divide by it and take the grid with it
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press("NumpadSubtract")
    }
    expect(await columns()).toBe(1)

    // a fresh visit picks the stored count back up instead of falling back to the built-in default
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    expect(await columns()).toBe(1)
    // ...and it is a preference of the person, not of this file, so it stays out of the hash
    expect(page.url()).not.toContain("column")
})

test("a slide letterboxed in a photo-shaped tile gets a quiet dark band, not the tile bleeding out", async ({ page }) => {
    // A frame with a layout of its own is previewed as a scaled clone of the real (screen-shaped) thing, so
    // in a 4:3 tile it cannot fill the cell. The leftover band used to be the light placeholder grey – and
    // bright yellow on the cursor frame, which read as the tile spilling over its neighbours.
    await page.goto(SLIDES + "#1?start&grid&grid-tile=4:3")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await expect.poll(() => page.locator("#hud-grid frame-preview.loading").count()).toBe(0)

    const backgrounds = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll("#hud-grid frame-preview")]
        const bg = el => getComputedStyle(el).backgroundColor
        return {
            current: bg(tiles.find(el => el.classList.contains("current"))),
            plain: bg(tiles.find(el => !el.classList.contains("current"))),
            // the clone really is shorter than the tile – that is what leaves the band in the first place
            shorter: tiles[0].firstElementChild.getBoundingClientRect().height < tiles[0].getBoundingClientRect().height,
        }
    })
    expect(backgrounds.shorter).toBe(true)
    expect(backgrounds.plain).toBe("rgb(26, 26, 26)") // --bg-surface-dark, same as the "show whole frames" letterbox
    // The cursor frame gets the very same band – it is marked by its highlight-coloured outline, not by a
    // fill, so its letterbox no longer lights up bright yellow next to its neighbours' grey ones.
    expect(backgrounds.current).toBe(backgrounds.plain)
    expect(backgrounds.current).not.toBe("rgb(255, 255, 0)") // --highlight

    // a loading cell keeps the light placeholder, it is still the cue that nothing has arrived yet
    expect(await page.evaluate(() => {
        const el = document.querySelector("#hud-grid frame-preview")
        el.classList.add("loading")
        const bg = getComputedStyle(el).backgroundColor
        el.classList.remove("loading")
        return bg
    })).not.toBe("rgb(26, 26, 26)")
})

test("the wheel over a video tile scrolls the grid, not the tile's camera badge", async ({ page }) => {
    await page.goto(SLIDES)
    await page.locator("#start").click()

    // Enough frames for the grid to scroll at all, the last of them videos – a video frame is media-only,
    // so its tile is not the scaled-down clone the 300px camera badge was sized for.
    await page.evaluate(async () => {
        $("<article><video sli-src='nowhere.mp4'></video></article>").prependTo("main section") // on screen from the start
        for (let i = 0; i < 40; i++) {
            $("<article><p>filler</p></article>").appendTo("main section")
        }
        playback.reset()
        playback.hud.toggle_grid()
        await new Promise(r => setTimeout(r, 1500))
    })

    // The badge stays inside the tile – overflowing content is what made the tile a scroll box of its own.
    const tile = page.locator("#hud-grid frame-preview.media-only").last()
    expect(await tile.evaluate(el => {
        const article = el.querySelector("article")
        return { over: article.scrollHeight - article.clientHeight, wide: article.scrollWidth - article.clientWidth }
    })).toEqual({ over: 0, wide: 0 })

    // …so the wheel reaches the grid underneath it
    const box = await tile.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => page.evaluate(() => document.querySelector("#hud-grid").scrollTop)).toBeGreaterThan(0)
})

test("hidden-tag view: 'dim' greys the tile out, 'hide' drops it, 'show' restores it – all in the same grid", async ({ page }) => {
    await page.goto(PHOTOS + "#1?start&grid")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await page.evaluate(() => {
        playback.$articles.eq(1).data("frame").set_tag(1) // two.jpg (index 1) carries the hidden tag
        $main.attr("sli-tag-hidden", "1")
        playback.hud.reset_grid()
    })
    const tile = page.locator("#hud-grid frame-preview[data-ref='1']")

    await expect(tile).toHaveClass(/grid-tag-dimmed/) // "dim" is the default
    await expect(tile).toBeVisible()

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> hide
    await expect(tile).not.toBeVisible()

    await page.evaluate(() => playback.operation._cycleTagHiddenMode()) // -> show
    await expect(tile).toBeVisible()
    await expect(tile).not.toHaveClass(/grid-tag-dimmed|grid-tag-hidden/)
})
