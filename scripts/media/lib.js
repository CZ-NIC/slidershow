/** Shared helpers for the docs media generator (scripts/media/run.js). */
const { chromium } = require("playwright")
const path = require("path")
const fs = require("fs")
const { execFileSync } = require("child_process")

const REPO_ROOT = path.resolve(__dirname, "..", "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "assets")
const VIEWPORT = { width: 1280, height: 800 }

const presenterUrl = () => "file://" + path.join(REPO_ROOT, "presenter.html")

/** Launches a fresh browser+context (with video recording if `record`), yields a page to `fn`, then
 * cleans up and (for videos) re-encodes the raw webm down to a small, docs-friendly size via ffmpeg. */
const pageCreatedAt = new WeakMap()
const videoTrimSeconds = new WeakMap()

async function withPage(name, { record } = {}, fn) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const browser = await chromium.launch()
    const rawVideoDir = record ? fs.mkdtempSync(path.join(require("os").tmpdir(), "slidershow-media-")) : undefined
    const context = await browser.newContext({
        viewport: VIEWPORT,
        recordVideo: record ? { dir: rawVideoDir, size: VIEWPORT } : undefined,
    })
    // Kills the white flash-of-unstyled-content during navigation, and (re)installs the caption/cursor/
    // key-badge overlay on window.__media – this runs before the page's own scripts, at the earliest
    // point Playwright lets us inject anything, and again on every subsequent navigation.
    await context.addInitScript(installOverlayScript)
    const page = await context.newPage()
    pageCreatedAt.set(page, Date.now())
    try {
        await fn(page)
    } finally {
        await context.close()
        await browser.close()
    }
    if (record) {
        const raw = await page.video().path()
        const out = path.join(OUT_DIR, `${name}.webm`)
        compressVideo(raw, out, videoTrimSeconds.get(page))
        fs.rmSync(rawVideoDir, { recursive: true, force: true })
        return out
    }
}

/** VP9/CRF re-encode: cuts Playwright's raw capture down to a size sane for a docs site. `trimSeconds`
 * (from markVideoStart()) drops a leading slice of dead footage – e.g. the brief real menu/upload flash
 * from openWithFiles() – before the interesting part of a scenario begins. */
function compressVideo(rawPath, outPath, trimSeconds) {
    const args = ["-y"]
    if (trimSeconds) {
        args.push("-ss", trimSeconds.toFixed(2))
    }
    args.push(
        "-i", rawPath,
        "-an", // the app has no meaningful audio track to keep
        "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-deadline", "good",
        outPath,
    )
    execFileSync("ffmpeg", args, { stdio: "inherit" })
}

/** Marks "the interesting part starts here" so the final compress step trims everything before it (e.g.
 * call right after openWithFiles() resolves, to cut the brief real menu/upload flash that isn't part of
 * what the scenario is narrating). No-op if `record` wasn't requested. */
function markVideoStart(page) {
    const createdAt = pageCreatedAt.get(page)
    if (createdAt) {
        videoTrimSeconds.set(page, (Date.now() - createdAt) / 1000)
    }
}

/** Opens presenter.html and appends real demo files via the hidden #file input (no OS drag&drop needed –
 * it triggers the exact same Menu.appendFiles() code path a real drop would). This lands on the LIVE
 * playback (appendFiles auto-starts), so use it for playback/editing scenarios, not the splash. */
async function openWithFiles(page, filePaths) {
    await page.goto(presenterUrl())
    await page.waitForTimeout(300) // let the splash actually paint before we act on it
    await page.locator("#append-panel > summary").click()
    await page.setInputFiles("#file", filePaths)
    await page.locator("main article").first().waitFor()
}

/** Waits until every grid thumbnail has finished loading (no more `frame-preview.loading` placeholders).
 *
 * Matters a lot more than it sounds: `hud.js`'s `makeThumbnailsImportable()` re-binds jQuery UI
 * `.draggable()` progressively as each thumbnail finishes loading. Drag a thumbnail (or read its
 * boundingBox for one) while others are still mid-load and the grid can still be visually reflowing –
 * jQuery UI's own drag-start hit-testing then sometimes latches onto a DIFFERENT thumbnail than the one
 * the cursor is actually sitting on (verified: cursor visually on frame 0, `.ui-draggable-dragging` ends
 * up on frame 3). Always call this before computing thumbnail positions or dragging in the grid. */
async function waitForGridSettled(page) {
    await page.waitForFunction(
        () => document.querySelectorAll("#hud-grid frame-preview.loading").length === 0,
        { timeout: 10000 },
    )
}

/** Opens the grid with the "g" keypress un-narrated (no caption, no key badge) and pre-settled – for
 * every grid/multiselect/tagging scenario except the one dedicated to showing the grid open itself
 * (grid-overview.webm). Call this BEFORE markVideoStart() so the keypress lands in the trimmed lead-in
 * and the clip just starts already inside the grid. */
async function openGridSilently(page) {
    await page.keyboard.press("g")
    await page.locator("#hud-grid frame-preview").first().waitFor()
    await waitForGridSettled(page)
}

/** Builds a throwaway presentation HTML file with real demo photos/videos already embedded as frames
 * (mirrors tests/fixtures/basic.html) and opens it. Unlike openWithFiles(), this lands on the splash
 * screen with the summary/quick-play/Recent list already populated, since the frames exist before Menu
 * even constructs – nothing auto-starts. */
function buildPresentationFixture(filePaths, { title } = {}) {
    const articles = filePaths.map(f => {
        const isVideo = /\.(mp4|webm|mov)$/i.test(f)
        const tag = isVideo ? `<video src="file://${f}"></video>` : `<img src="file://${f}">`
        return `        <article>${tag}</article>`
    }).join("\n")
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    ${title ? `<title>${title}</title>` : ""}
    <script src="file://${path.join(REPO_ROOT, "slidershow", "slidershow.js")}"></script>
</head>
<body>
    <main>
        <section>
${articles}
        </section>
    </main>
</body>
</html>
`
    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "slidershow-fixture-"))
    const file = path.join(dir, "presentation.html")
    fs.writeFileSync(file, html)
    return "file://" + file
}

async function openPresentation(page, filePaths, opts) {
    await page.goto(buildPresentationFixture(filePaths, opts))
    await page.locator("#content-summary").waitFor()
}

async function screenshot(name, page, opts = {}) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const out = path.join(OUT_DIR, `${name}.png`)
    await page.screenshot({ path: out, ...opts })
    return out
}

/** Runs at document-start (via context.addInitScript) on every navigation: paints the page black
 * immediately (no white FOUC flash) and builds the window.__media overlay API (caption / fake cursor /
 * key badges / click pulse) that the node-side helpers below drive through page.evaluate(). */
function installOverlayScript() {
    // At true document-start (which is when this runs) <html> doesn't exist yet in Chromium – wait for
    // the parser to create it instead of crashing on a null documentElement.
    if (!document.documentElement) {
        return void setTimeout(installOverlayScript, 0)
    }

    const style = document.createElement("style")
    style.textContent = "html { background: #000 !important; }"
    document.documentElement.appendChild(style)

    const root = document.createElement("div")
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;"

    const caption = document.createElement("div")
    caption.style.cssText = `position:absolute;left:24px;bottom:24px;font:600 22px/1.4 system-ui,sans-serif;
        color:#fff;background:rgba(0,0,0,.72);padding:10px 18px;border-radius:8px;
        box-shadow:0 2px 12px rgba(0,0,0,.5);opacity:0;transition:opacity 1s ease;max-width:70vw;`
    root.appendChild(caption)

    const keys = document.createElement("div")
    keys.style.cssText = "position:absolute;left:24px;bottom:78px;display:flex;gap:8px;opacity:0;transition:opacity 1s ease;"
    root.appendChild(keys)

    const cursor = document.createElement("div")
    cursor.style.cssText = `position:absolute;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;
        border-radius:50%;background:rgba(255,210,0,.95);border:2px solid #fff;
        box-shadow:0 0 6px rgba(0,0,0,.6);opacity:0;transition:opacity .15s ease;`
    root.appendChild(cursor)

    const attach = () => document.documentElement.appendChild(root)
    attach()
    // <body> gets wiped/replaced by some frameworks after load; make sure the overlay survives.
    new MutationObserver(() => { if (!root.isConnected) attach() }).observe(document.documentElement, { childList: true })

    window.__media = {
        caption(text) {
            // Same rule as keys() below: only overwrite the text when actually showing a caption, so
            // hiding fades the existing text out instead of instantly blanking it first.
            if (text) {
                caption.textContent = text
            }
            // Fast in, slow out: a single shared transition duration for both directions means a slow
            // fade-OUT (wanted, so it's clearly visible) also makes the fade-IN just as slow – and captions
            // often get replaced well within that duration, so they'd never even finish appearing before
            // starting to disappear again (verified: only ~15% opacity reached after a 150ms hold with a
            // 1s two-way transition). Showing is instant; only hiding fades.
            caption.style.transition = text ? "none" : "opacity 1s ease"
            caption.style.opacity = text ? "1" : "0"
        },
        cursor(x, y) {
            cursor.style.transform = `translate(${x}px,${y}px)`
            cursor.style.opacity = "1"
        },
        keys(labels) {
            // Only rebuild content when actually showing badges. On hide, leave the old badges in the
            // DOM and just fade the container's opacity – clearing innerHTML immediately (the old bug
            // here) wiped the badges before the opacity transition had anything left to fade, so the
            // "fade" was invisible: an empty box instantly disappearing, not a fadeout.
            if (labels && labels.length) {
                keys.innerHTML = ""
                for (const label of labels) {
                    const badge = document.createElement("div")
                    badge.textContent = label
                    badge.style.cssText = `font:700 18px/1 ui-monospace,monospace;color:#fff;
                        background:rgba(20,20,20,.88);border:1px solid rgba(255,255,255,.55);
                        border-radius:6px;padding:8px 14px;box-shadow:0 2px 8px rgba(0,0,0,.5);`
                    keys.appendChild(badge)
                }
            }
            // Fast in, slow out – see caption()'s comment above for why a single shared duration doesn't work.
            keys.style.transition = labels && labels.length ? "none" : "opacity 1s ease"
            keys.style.opacity = labels && labels.length ? "1" : "0"
        },
        pulse(x, y) {
            const p = document.createElement("div")
            p.style.cssText = `position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;
                border-radius:50%;border:3px solid rgba(255,210,0,.95);
                transform:translate(${x}px,${y}px) scale(1);opacity:1;
                transition:transform .4s ease-out,opacity .4s ease-out;`
            root.appendChild(p)
            requestAnimationFrame(() => {
                p.style.transform = `translate(${x}px,${y}px) scale(2.6)`
                p.style.opacity = "0"
            })
            setTimeout(() => p.remove(), 450)
        },
    }
}

/** Shows an on-screen caption (bottom-left) so a silent screen recording still communicates what action
 * is about to happen. Call again with a new string to replace it, or "" to clear it. */
const caption = (page, text) => page.evaluate(text => window.__media?.caption(text), text)

/** A visible beat of stillness before the next action, so a viewer has time to read the caption and
 * register the scene before something moves. */
const beat = (page, ms = 1200) => page.waitForTimeout(ms)

const lastMousePos = new WeakMap()

/** Smoothly glides the (visible, overlaid) fake cursor to (x, y) and moves the real Playwright mouse
 * along with it, so mouse-driven interactions read clearly in a recording instead of teleporting. */
async function moveMouse(page, x, y, { steps = 24, durationMs = 500 } = {}) {
    const from = lastMousePos.get(page)
    if (!from) {
        // First-ever move on this page: there's no known real position to glide from (Playwright's
        // virtual mouse defaults to wherever a previous click/etc left it, not necessarily (x, y)), so a
        // "no-op, we're already there" shortcut here would leave the REAL mouse somewhere else entirely
        // while our own bookkeeping claims it's at (x, y). Concretely: this silently broke grid-drag –
        // mousedown landed on whatever the real (stale) position was, dragging the wrong thumbnail,
        // while every log/boundingBox check "confirmed" the intended element (because those checks used
        // our – wrong – bookkeeping or elementFromPoint at the intended coordinates, not the real mouse
        // position). Always issue a real move here, once.
        await page.mouse.move(x, y)
        await page.evaluate(([px, py]) => window.__media?.cursor(px, py), [x, y])
        lastMousePos.set(page, { x, y })
        return
    }
    if (from.x === x && from.y === y) {
        return // genuinely already there for real, nothing to do
    }
    for (let i = 1; i <= steps; i++) {
        const ix = from.x + (x - from.x) * (i / steps)
        const iy = from.y + (y - from.y) * (i / steps)
        await page.mouse.move(ix, iy)
        await page.evaluate(([px, py]) => window.__media?.cursor(px, py), [ix, iy])
        await page.waitForTimeout(durationMs / steps)
    }
    lastMousePos.set(page, { x, y })
}

/** Moves to (x, y) with a visible cursor, flashes a click-pulse ring, then actually clicks. */
async function click(page, x, y) {
    await moveMouse(page, x, y)
    await page.evaluate(([px, py]) => window.__media?.pulse(px, py), [x, y])
    await page.mouse.click(x, y)
}

/** Scrolls the wheel at the given position (or the cursor's current position), flashing a pulse per tick
 * so "the wheel just moved here" is visible in the recording. */
async function wheel(page, deltaY, at) {
    if (at) {
        await moveMouse(page, at.x, at.y)
    }
    const pos = lastMousePos.get(page)
    await page.evaluate(([px, py]) => window.__media?.pulse(px, py), [pos.x, pos.y])
    await page.mouse.wheel(0, deltaY)
}

/** Drags from `from` to `to` (both {x, y}) – glide in, press, glide to target, release. Works for any
 * real mouse-based drag (jQuery UI `.draggable()`, native rubber-band selection, …) since it's just a
 * held mouse button plus real intermediate `mouse.move()`s, exactly like a real user dragging. */
async function drag(page, from, to, opts = {}) {
    await moveMouse(page, from.x, from.y)
    await page.evaluate(([px, py]) => window.__media?.pulse(px, py), [from.x, from.y])
    await page.mouse.down()
    // A library like jQuery UI Draggable (used by the grid) decides WHICH element it's dragging at the
    // first qualifying mousemove, not at mousedown – if that first move already travels a good chunk of
    // the way to `to`, its hit-testing can lock onto a different element than the one under the cursor
    // at mousedown (verified: dragged the wrong thumbnail this way). A near-zero nudge first forces that
    // decision to happen while still effectively at `from`.
    await page.mouse.move(from.x + 2, from.y + 2)
    await page.waitForTimeout(400) // dwell on pickup – otherwise the drag start is never clearly visible
    await moveMouse(page, to.x, to.y, opts)
    await page.waitForTimeout(400) // dwell on drop, same reason
    await page.mouse.up()
}

/** Simulates a real OS file drag-and-drop onto `locator` – for the app's *import* drop zones (menu
 * append panel, grid thumbnails via `Menu.importable()`), which read `dataTransfer.items` and need
 * actual `kind === "file"` items, not just mouse events. Playwright has no native "drag real files from
 * the desktop" API, so this builds a `DataTransfer` with real `File` objects (read from disk, base64'd
 * across the page boundary) and dispatches dragenter/dragover/drop with it – indistinguishable from a
 * real drop to the app's own drop handler. Shows a cursor pulse at the drop point first. */
async function dropFilesOnto(page, locator, filePaths) {
    const box = await locator.boundingBox()
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await moveMouse(page, point.x, point.y)
    await page.evaluate(([px, py]) => window.__media?.pulse(px, py), [point.x, point.y])

    const files = filePaths.map(p => ({
        name: path.basename(p),
        type: p.match(/\.(mp4|webm|mov)$/i) ? "video/mp4" : "image/jpeg",
        base64: fs.readFileSync(p).toString("base64"),
    }))
    const dataTransfer = await page.evaluateHandle(files => {
        const dt = new DataTransfer()
        for (const { name, type, base64 } of files) {
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
            dt.items.add(new File([bytes], name, { type }))
        }
        return dt
    }, files)

    await locator.dispatchEvent("dragover", { dataTransfer })
    await page.waitForTimeout(300) // let the "drop here" hover state actually render
    await locator.dispatchEvent("drop", { dataTransfer })
}

const KEY_LABELS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" }

/** Shows key-cap badges for `keys`, holds them down together for `holdMs`, releases, hides the badges.
 * E.g. pressKeys(page, ["ArrowLeft", "ArrowUp"]) for a diagonal crawl with both arrows held at once.
 *
 * The app only pans while arrow keys are down because the browser keeps re-firing "keydown" (with
 * repeat:true) as long as a real key is held – Playwright's keyboard.down() sends exactly one keydown,
 * no auto-repeat. So a real held key would visibly crawl but our single synthetic one would just jump
 * 50px once and stop. We fake the repeat ourselves: keep re-sending keydown (no matching keyup) every
 * ~110ms for the duration of the hold, which is exactly what a real held key does at the OS level.
 *
 * Pass `{ repeat: false }` for a one-shot hotkey chord (e.g. Alt+P) instead of a held navigation key –
 * repeating those re-triggers the app's hotkey handler every ~110ms, which for a *toggle* shortcut means
 * it flips on/off/on/... and can easily end up back where it started. */
async function pressKeys(page, keys, holdMs = 500, { repeat = true } = {}) {
    const labels = keys.map(k => KEY_LABELS[k] || k)
    await page.evaluate(labels => window.__media?.keys(labels), labels)
    if (repeat) {
        const repeatMs = 110
        for (let elapsed = 0; elapsed <= holdMs; elapsed += repeatMs) {
            for (const k of keys) {
                await page.keyboard.down(k)
            }
            await page.waitForTimeout(repeatMs)
        }
    } else {
        for (const k of keys) {
            await page.keyboard.down(k)
        }
        await page.waitForTimeout(holdMs)
    }
    for (const k of [...keys].reverse()) {
        await page.keyboard.up(k)
    }
    await page.evaluate(() => window.__media?.keys(null))
}

/**
 * Declarative step runner over the same primitives above – reduces a scenario to "what happens", not
 * "how to pace it". Each step: { caption, action, before, after }.
 *   - caption (optional): replaces the on-screen caption; omit to keep whatever's already showing.
 *   - action (optional): async (page) => ... – the actual interaction (moveMouse/click/wheel/pressKeys/...).
 *   - before (ms, default 700): pause after the caption appears, before `action` runs – time to read it.
 *   - after (ms, default 500): pause after `action` finishes, before the next step's caption swaps in.
 * Clears the caption after the last step. Equivalent hand-written form (still fine for one-off
 * scenarios, or when a step needs more than one action / a computed value between steps):
 *   await caption(page, "..."); await beat(page, 700); await moveMouse(...); await beat(page, 500)
 */
async function narrate(page, steps) {
    for (const step of steps) {
        if (step.caption !== undefined) {
            await caption(page, step.caption)
        }
        await beat(page, step.before ?? 700)
        if (step.action) {
            await step.action(page)
        }
        await beat(page, step.after ?? 500)
    }
    await caption(page, "")
    await beat(page, 1000) // let the final fade actually finish before the recording/scenario ends
}

module.exports = {
    REPO_ROOT, OUT_DIR, VIEWPORT, presenterUrl,
    withPage, openWithFiles, openPresentation, screenshot, markVideoStart, waitForGridSettled, openGridSilently,
    caption, beat, moveMouse, click, wheel, drag, dropFilesOnto, pressKeys, narrate,
}
