# Testing SlideRshow

How to verify a change in this repository. Written so that neither a contributor nor an
automated agent has to reverse-engineer the setup before writing the first assertion.

## The three checks

```bash
npm test            # Playwright end-to-end tests (tests/*.spec.js)
npm run typecheck   # tsc over the JSDoc annotations (jsconfig.json, checkJs)
npx playwright test tests/grid.spec.js -g "sticky"   # one file / one test while iterating
```

* `npm test` is the real safety net — the app has **no build step and no unit-test layer**, so
  everything is tested through a browser.
* `npm run typecheck` has a **known error baseline** (~100 errors, mostly jQuery/`HTMLElement`
  narrowing). Don't try to clear it; just make sure your file's line numbers add nothing new:
  `npm run typecheck 2>&1 | grep -c "error TS"` before and after.
* Playwright needs **network access**: the fixtures load jQuery, Leaflet & co. from CDN. An
  occasional `page.goto()` timeout is a CDN stall, not your bug — re-run before investigating
  (CI already retries twice; see `playwright.config.js`).

Useful flags while debugging: `--headed`, `--debug`, `--repeat-each=5` (flakiness),
`--workers=1`, `PWDEBUG=1`.

## How a test is shaped

Tests open `tests/fixtures/*.html` over `file://` — the app deliberately supports `file://`,
so no server is started. The standard preamble:

```js
const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/basic.html")
```

Two ways in:

```js
await page.goto(FIXTURE)
await page.locator("#start").click()      // through the splash screen, like a user
```

```js
await page.goto(FIXTURE + "#3?start&grid&editing")   // straight into a state
```

The second form uses the URL hash that `session.js` restores (`start`, `grid`, `properties`,
`editing`, `tagging`, `thumbnails`, `duration=…`, `no-steps`, `progress`, `tag-filter=…`,
`aux`, `grid-tile=…`, `map-disabled`, …; the number before `?` is the 1-based frame). It is the
fastest way to reproduce a boot-order race — several real bugs only ever happened when a
feature was restored *before* the first frame was entered.

Everything the app exposes is a plain global inside the page, so `page.evaluate()` is the main
instrument — prefer it over poking the DOM when you can assert on state directly:

```js
await page.evaluate(() => playback.hud.toggle_properties())
expect(await page.evaluate(() => playback.frame.index)).toBe(2)
expect(await page.evaluate(() => playback.$articles.length)).toBe(3)
```

Globals available in the page: `playback` (the hub — `playback.hud`, `.frame`, `.changes`,
`.operation`, `.session`, `.menu`), `$` (jQuery), `wh` (WebHotkeys), `$main`, `prop()`.
A frame object hangs off its `<article>`: `$(el).data("frame")`.

## Idioms worth copying

**Catch page errors.** An exception inside a jQuery handler fails nothing by itself; assert
explicitly:

```js
const errors = []
page.on("pageerror", e => errors.push(e.message))
// …
expect(errors).toEqual([])
```

**Use `expect.poll` / web-first assertions, never a bare timeout.** Navigation, thumbnails and
transitions are asynchronous:

```js
await expect.poll(() => page.url()).toContain("#2")
await expect(page.locator("#hud-properties")).toBeVisible()
await expect.poll(() => page.locator("#hud-grid frame-preview.loading").count()).toBe(0)
```

**Test hotkeys through the keyboard**, not by calling the callback — the registration in
`operation.js` (and whether the right hotkey *group* is enabled) is half of what can break:

```js
await page.keyboard.press("PageDown")
await page.keyboard.press("Alt+p")
```

**Every mutating edit must be undoable** (see `Changes` in CLAUDE.md). A test for an edit is
not finished until it also asserts the undo:

```js
await page.evaluate(() => playback.changes.undo())
expect(await page.evaluate(() => playback.frame.$frame.attr("sli-duration"))).toBe(undefined)
```

**Stub the docs fetch** when the properties panel is involved, so no test waits on jsDelivr.
`Hud._help` holds one entry per `docs/*.md` page; anything non-empty short-circuits
`fetch_help()`:

```js
await page.evaluate(() => playback.hud._help = [{ page: "structure", text: "#" }])
```

**Assert on `sli-*` attributes, not on JS fields.** State lives in the DOM
(`$frame.attr("sli-duration")`); a JS field is usually a cache and may lie.

**Media in tests.** `*.jpg` and `*.mp4` are gitignored, so fixtures use tiny data-URI or
generated media instead of binary files (`tests/fixtures/exif.jpeg` is the deliberate
exception, needed for the EXIF parser). Build an `<img>` with a data URI when a test needs
real pixels.

## Fixtures

`tests/fixtures/` holds one small HTML per shape of presentation:

| fixture | what it is |
| --- | --- |
| `basic.html` | three text frames — an authored slide deck |
| `props.html` | `sli-*` attributes spread over `<main>` / `<section>` / `<article>`, for `prop()` resolution |
| `steps.html` | `sli-step` elements |
| `tags.html` | image-only frames — a photo album, for the grid and tagging |
| `notes.html` | presenter's notes in comments, before and inside frames |
| `exif.html` + `exif.jpeg` | EXIF reading |
| `fallback.html` | missing/broken media |
| `empty.html` | no frames at all |

Reuse one before adding another; a new fixture should be as small as the feature demands and
carry a comment saying which case it exists for.

## Which spec does a change belong in?

`tests/` is organized per feature — `navigation`, `steps`, `grid`, `multiselect`, `tags`,
`tag-filter`, `export`, `export-tags`, `undo`, `menu`, `ux-menu`, `notifications`, `exif`,
`grouping`/`import-grouping`, `thumbnails-perf`, `preload-set`, `autoforward`, `retry`,
`fallback`, `prop`, `units`, `errors`, `smoke`, plus `*-perf` for the ones asserting a budget
(counts of loaded elements, layout passes) rather than behaviour.

**Touching playback, export or navigation without adding a test there is a regression waiting
to happen** — that is the one rule CLAUDE.md states outright.

## Manual check

Some things (visual layout, video, drag & drop of real files) are faster to eyeball:

* open `presenter.html` — same app, but loading `slidershow/*.js` from the local path, so your
  edit is live on reload (`slidershow.html` pulls a released build from CDN and will *not*
  show your change);
* `extra/tutorial_local.html` is the feature tour against local sources;
* drop a folder of photos onto the splash screen to exercise the import path.

Finally: record every user-visible change in `CHANGELOG.md` under the top (unreleased) version,
tagged `feat`/`fix`/`enh`, and update `docs/` + `README.md` when you add an `sli-*` attribute or
a shortcut.
