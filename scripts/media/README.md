# Docs media generator

Generates the screenshots/clips embedded in `docs/*.md` (see `docs/assets/`) by driving the real app
with Playwright — no manual screen recording. Source demo photos/videos live outside the repo (personal,
copyright-free) at the path configured in `demo-files.js`.

`photos.json` has one-line descriptions for whichever source files have actually ended up visible in a
generated clip so far (**not** a catalog of the whole pool — that would cost a vision call per photo for
no benefit until a file is actually used). Add an entry there whenever a scenario picks a new file, so the
next scenario can choose fittingly instead of by blind index. Also try not to reuse the same 1–2 photos
across every scenario — there's a large pool in `demo-files.js`'s `randomPhotos`, so spread scenarios
across different slices of it.

## Usage

```sh
node scripts/media/run.js <scenario-name>   # e.g. zoom, start-splash
node scripts/media/run.js all               # regenerate everything
```

Each scenario writes straight to `docs/assets/<name>.png` or `.webm`.

## Adding a new scenario

Drop a new file in `scenarios/`, named after its output. No registration needed — `run.js` picks up
every file in that directory automatically. Look at `scenarios/zoom.js` or `scenarios/start-splash.js`
for the shape: open the app via one of the `lib.js` openers, then either `screenshot()` or narrate a
short interaction and let `withPage(name, { record: true }, ...)` capture+compress it to webm.

## Picking the right opener (`lib.js`)

- **`openWithFiles(page, filePaths)`** — default choice for anything in playback. Goes through the real
  menu + hidden `#file` input, i.e. the actual `FrameFactory` file-intake pipeline the app itself uses.
  Call `markVideoStart(page)` right after it resolves to cut the brief (~0.3–0.5s) real menu/upload
  flash out of the final clip, unless the scenario is specifically demonstrating adding files (then
  leave it in and caption it — see `hero.webm`).
- **`openPresentation(page, filePaths, opts)`** — builds a throwaway HTML fixture with `<img>`/`<video>`
  tags already hardcoded in (mirrors `tests/fixtures/basic.html`), landing on the splash screen with the
  summary/quick-play/Recent list visible, nothing auto-starts. Use for splash screenshots
  (`start-splash.js`) only.

  **Do not use this (or a variant of it) for anything that zooms or reads pixel positions.** A static
  fixture's `<img src="file://...">` never goes through `FrameFactory`, which is what the real upload
  path uses to establish the sizing/ratio state the zoom math depends on. An earlier version of this
  file had an `openPlayback()` opener built on the same fixture (to skip the menu flash for playback
  scenarios) — it looked pixel-identical to `openWithFiles()` in a static screenshot, but wheel-zoom
  anchored to a wrong, wildly different point in the photo. Diagnosed by comparing `openWithFiles` vs.
  the fixture-based opener with otherwise identical zoom code – only the opener differed. If you need a
  flash-free playback opener again, trim `openWithFiles()` with `markVideoStart()` instead of bypassing
  the real intake pipeline.
- **`openGridSilently(page)`** — presses "g", waits for the grid to load+settle, no caption/key badge.
  Only `grid-overview.webm` narrates opening the grid itself; every other grid/multiselect/tagging
  scenario should call this **before** `markVideoStart(page)`, so the keypress lands in the trimmed
  lead-in and the clip just starts already inside the grid — a viewer watching several of these clips in
  a row shouldn't see the same "press g" beat repeated in every one.

## Narrating a silent recording

A screen recording with no audio and no visible OS cursor is hard to follow, so every interactive
scenario should narrate itself. Write it as a `narrate(page, steps)` call — a declarative list of
`{ caption, action, before, after }` steps — rather than hand-interleaving `caption()`/`beat()` calls;
see `scenarios/zoom.js` or `scenarios/video-cut.js`. It reduces a scenario to "what happens", trims the
pacing boilerplate to two numbers per step, and makes re-timing a clip later a one-line edit instead of
a re-read of the whole file:

```js
await narrate(page, [
    { caption: "Mouse wheel over the photo …", action: p => moveMouse(p, face.x, face.y) },
    { caption: "… scrolls to zoom in", before: 400, after: 800, action: p => wheel(p, -120, face) },
])
```

- `caption` (optional) replaces the on-screen caption; omit it to keep whatever's already showing (for a
  second action under the same caption).
- `action` (optional) is `async (page) => ...` — the actual interaction.
- `before` (default 700ms) is the pause after the caption appears and before `action` runs — time to
  read it. `after` (default 500ms) is the pause after `action` before the next step's caption swaps in.
- The caption is cleared automatically after the last step.
- Drop to the hand-written `caption()`/`beat()` form (still exported, nothing wrong with it) when a step
  doesn't fit the "caption, pause, one action, pause" shape — e.g. the very first pause before anything
  has appeared yet, or when you need a computed value (a `boundingBox()`) between two narrate() calls.

The primitives `narrate()` is built on, still available directly:

- **`caption(page, text)`** / **`beat(page, ms = 1200)`** — what `narrate()` calls per step.
- **`moveMouse` / `click` / `wheel`** — everything mouse-driven goes through these instead of
  `page.mouse.*` directly: they animate a visible fake cursor (a real Playwright mouse move is
  invisible in a recording) and flash a click/scroll pulse so the viewer sees *where* the action
  happens.
- **`pressKeys(page, keys, holdMs, { repeat })`** — shows key-cap badges (←→↑↓ etc.) for the held keys.
  - `repeat: true` (default) fakes OS key-repeat: Playwright's `keyboard.down()` fires a single keydown
    with no repeat, but the app's arrow-crawl (and anything else relying on a *held* key) depends on the
    browser re-firing keydown while a real key is down. A literal one-shot `down()`/`up()` pair will
    look like nothing happened. Use for anything meant to look "held" (arrow-crawl).
  - `repeat: false` sends a single down/hold/up. **Required for one-shot hotkey chords** (e.g. Alt+P) —
    with `repeat: true` a *toggle* shortcut gets re-triggered every ~110ms and can flip back to where it
    started before the hold ends.

## Gotchas already worked around in `lib.js` (don't reintroduce them)

- **White flash on navigation**: `context.addInitScript` paints `<html>` black before the page's own
  styles load. Without it every clip opens with a jarring white frame.
- **`document.documentElement` is `null`** at the point `addInitScript` callbacks actually run (true
  document-start, before the parser has created `<html>`) — the overlay setup retries via
  `setTimeout(fn, 0)` until it exists instead of crashing.
- **`moveMouse`'s first-ever call must issue a REAL `page.mouse.move()`, not just update the overlay.**
  There's no way to glide from an unknown starting point, so the temptation is a "we're already there,
  nothing to do" shortcut when the WeakMap position tracker has no entry yet – but Playwright's virtual
  mouse defaults to wherever a previous action (e.g. a menu click) left it, which is generally NOT (x, y).
  Skipping the real move there leaves the actual mouse stuck at that stale position while our own
  bookkeeping claims it's at (x, y) — everything downstream (`elementFromPoint`, boundingBox checks) looks
  correct because it's checking the intended coordinates, not where the real mouse is. This was a real bug
  here: it silently broke the grid drag scenario (mousedown landed on the stale position, dragging
  whatever thumbnail happened to be there instead of the one the video visibly hovers over) while every
  manual check "confirmed" the right element. If you ever reach for an "already there, skip it" shortcut
  in a mouse helper, make sure "already there" is verified against a real prior move, not assumed.
- **Grid drag needs `waitForGridSettled()` first.** `hud.js`'s `makeThumbnailsImportable()` re-binds
  jQuery UI `.draggable()` progressively as each thumbnail finishes loading (and the grid can still be
  visually settling for a bit even after the loading placeholders are gone) – computing a thumbnail's
  `boundingBox()` too early, or holding it across a pause, and dragging from it can silently drag a
  *different* thumbnail than the one the cursor is visibly on. Always `waitForGridSettled(page)` before
  reading grid thumbnail positions, and prefer re-reading `boundingBox()` immediately before acting on it
  over computing it once and holding it across a `beat()`.
- **Fade transitions need a fast-in, but a slow-out.** A single shared CSS `transition: opacity <N>s`
  smooths both directions equally – which means a slow fade-*out* (the whole point, so it's visible) also
  makes the fade-*in* just as slow. Since a caption/key-badge is often replaced well within that duration,
  it can visually never finish appearing before it starts disappearing again (verified: a badge held only
  ~150ms with a 1s two-way transition only ever reached ~15% opacity). `caption()`/`keys()` in `lib.js` set
  `transition: none` when showing and `transition: opacity 1s ease` only when hiding – don't collapse that
  back into one static CSS rule.
- **A short `pressKeys()` hold can silently no-op during a recording even though the identical call works
  fine outside one.** Ctrl+Arrow (grid multiselect move) with `holdMs: 200` sometimes never triggered the
  app's hotkey handler at all under `{ record: true }` – same code, verified reliable with `record`
  omitted. Recording overhead apparently eats into the real wall-clock window a short hold provides. Fix:
  give any single discrete-but-consequential keypress (not a held arrow-crawl) a generous hold, ~400ms,
  when it's wrapped in `withPage(..., { record: true }, ...)`. If a scenario's action visibly "does
  nothing" only in the recorded output, suspect this before suspecting the app.
- **Known-bad source files**: `demo-files.js` exports `KNOWN_BAD_EXIF`, filenames whose malformed EXIF
  crashes exif-js (`window.onerror` in `launch.js` then surfaces it as a visible "Uncaught RangeError"
  toast in the recording). Filter them out of any new slice of `randomPhotos` – see
  `scenarios/multiselect-scatter.js` for the pattern. Add to the list if another photo trips the same
  thing (bisect with a quick per-file `pageerror` listener, like that scenario's discovery did).

## Verifying output without eyeballing a video player

**Don't trust `ffmpeg -ss <t> -i clip.webm` stills for anything sub-second-precise** — repeatedly gave
stale/wrong-looking frames here (e.g. showing full opacity when the live DOM was independently confirmed
to be mid-fade), apparently because Playwright's recorded webm has sparse keyframes and a variable
framerate that trips up seeking, even with `-i` before `-ss` (frame-accurate seeking). Re-encode to a
constant framerate first, then seek in *that* file:

```sh
ffmpeg -y -i docs/assets/zoom.webm -vf fps=25 -r 25 /tmp/cfr.mp4
ffmpeg -y -i /tmp/cfr.mp4 -ss 3.5 -frames:v 1 /tmp/check.png
```

For anything about *live DOM state* rather than what a frame looks like (e.g. "does this opacity actually
change over time", "which element ends up `.ui-draggable-dragging`"), skip video entirely and check the
page directly with a throwaway `page.evaluate()`/`getComputedStyle()` script — it's ground truth, a
rendered still is one more step removed and easy to misjudge by eye for subtle changes.

Then read `/tmp/check.png` to check captions/cursor/timing landed where expected.
