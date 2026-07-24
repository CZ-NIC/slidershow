# CHANGELOG

## 1.0.0 (unreleased)
* feat (grid): each thumbnail still waiting on its own preview fetch now shows a small per-tile spinner with its own buffered/download percentage, in addition to the existing aggregate spinner+percentage above the grid – works for both the normal `sli-thumb` probe and the full-quality fallback. A tile's ring is grey while merely queued behind `THUMB_CONCURRENCY`'s concurrent slots and turns to the active color once it actually starts downloading
* feat (grid): clicking the aggregate spinner+percentage badge above the grid toggles a plain list of every file currently loading (queued or in flight)
* fix (grid): a tile's spinner could keep spinning forever if its own thumbnail fetch threw (now caught and cleared) – most visible when leaving to the main view mid-fetch and coming back
* fix (grid): on a large presentation (hundreds of frames) with a slow connection, most of a tile's "loading" time is spent queued behind `THUMB_CONCURRENCY`'s 8 concurrent slots, not actually fetching – the stuck-fetch detector was timing that queue wait too, so dozens of tiles that were merely waiting their turn got wrongly folded into "⚠ Retry N frames" and never got a chance to show their own percentage; it now restarts each tile's clock once it actually gets a fetch slot
* fix (grid): the main view's own loading spinner/retry button (fixed to the viewport center) stayed visible while the grid was open, landing on top of some unrelated tile and looking like it belonged to it – now hidden whenever the grid is open
* fix (grid): toggling the grid (ex. via `&state=grid` in the hash) before the first frame had been entered threw `Cannot read properties of undefined (reading 'index')` – `Hud.toggle_grid()` treated `playback.frame` as ready whenever it was truthy, but it's never falsy (it defaults to a dummy `Frame` with no `.index`); it now checks `.index` instead, and `Playback.goToFrame()` no-ops instead of crashing if it still can't resolve a frame
* fix (grid): pressing <kbd>Delete</kbd> while the cursor was pinned on a section's ribbon (paste target) deleted the last-focused frame instead of the section
* fix (grid): "delete" on the top-level "Presentation" ribbon (or <kbd>Delete</kbd> pinned there) detached `<main>` itself, wiping the whole presentation – it now clears the presentation's content instead, keeping `<main>` intact

* feat (export): offline export – the Ctrl+S dialog's "Same folder"/"Another folder"/"Pack into one file" buttons now come with an "App's own code" radio (Load from CDN / Inline into the file / Copy into a folder) instead of a separate checkbox+button, since the three are mutually exclusive. "Inline" bundles the app's own code (vendor libs + local `slidershow/*.js` + `style.css`) verbatim into the exported file, so opening it later needs no network for anything but the map (still online-only, tiles need a network regardless). "Copy into a folder" (Chrome only) instead copies that code into `vendor/`/`slidershow/` folders next to the exported file and rewrites the head to the local relative paths – no inlining, so the exported HTML stays as small as a normal export
* feat (export): a new "Media paths" radio next to "Same folder"/"Another folder" can force every relative media path into an absolute URL against this page's own address, or force an already-absolute same-origin path back into a relative one – useful when the presentation is served from a local/dev server whose address won't be the final one, or vice versa
* feat (export): a new "Download all media to a folder" button (Chrome only, next to "Pack into one file") copies every photo/video as a real file into a `media/` folder next to the exported HTML and rewrites `sli-src` to point there – unlike "Pack into one file" the exported HTML itself stays small, and unlike "Same folder"/"Another folder" the export no longer depends on wherever the media used to live. Frames that aren't in memory or fetchable over http fall back to the same "pick a source folder" prompt as "Export tags to folders…"
* enh (export tags): "Export tags to folders…" no longer copies every tagged photo again into a redundant catch-all folder; the dialog now offers "Write tags.json"/"Write a `<tag>.txt` file per tag" checkboxes to skip either manifest, and in Firefox (no folder-export support) two buttons let you still download `tags.json`/the per-tag `.txt` files directly, without the photos
* enh (grid): arrow-key navigation (<kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>PageUp</kbd>/<kbd>PageDown</kbd>) can now land the cursor on an empty subsection's ribbon — pinning it as the <kbd>Ctrl+V</kbd> paste target — instead of skipping straight over it; previously the only way to paste into a freshly inserted empty subsection was to click its ribbon with the mouse. Continuing to move up/down from a pinned ribbon now keeps going instead of getting stuck, and vertical moves jump by exactly one visual row (previously a shorter row than the current column could make it overshoot further); the aimed-for column is remembered across such stops/short rows, so ex. leaving the 3rd thumbnail, crossing an empty section, lands back on the 3rd thumbnail of the next row (or the last one if it's shorter)
* enh (grid): the presentation ("Presentation" ribbon) and section ribbons now share the same menu — both get "order"/"add"/"regroup" for their own direct frames and "subsection: add/sort/flatten" for their subsections (previously the presentation only had the subsection ops, sections only the frame ops); `sortSections()` now sorts whichever section/main it's invoked on instead of always the top-level presentation. The "subsection" row sits level with the ribbon's title, the "frames" row right below it; every menu button/dropdown-item now has a hover tooltip explaining what it does (ex. "delete" vs "flatten" – delete removes the section and everything inside it, flatten only unwraps it, keeping the frames)
* enh (grid): a nested subsection's ribbon now indents further with each nesting level, so how deep it sits is visible at a glance; the "Loose frames" divider (previously only shown for frames loose directly under `<main>`) now also appears inside any section that mixes subsections with its own loose frames
* fix (grid): the "Loose frames" divider stayed missing when a subsection was inserted right before frames that were already loose in the section – the divider logic skipped the cue whenever a frame was preceded by any ribbon, assuming it was always that frame's own container heading the run, but an inserted subsection's ribbon isn't; it now only skips the cue for the frame's own container's ribbon
* feat: autostart presentation from URL hash – append `&state=start` to skip the splash screen and begin playback immediately (stackable with other state flags: `#1&state=thumbnails,grid,start`)
* fix (grid): a `sli-thumb` preview probe (`Frame.get_preview_thumb()`) fired an unthrottled `new Image()` per visible tile – a big grid could open up to `GRID_PRELOAD_RADIUS` (60) of these at once, flooding the browser's per-host connection pool over http(s) and leaving many thumbnails stuck unloaded; now gated through the same `thumb_loader` limiter as regular thumbnail loading
* feat (grid): a small spinner + percentage, in its own row right below the "Select frames…" pill (top-centre), shows progress while grid thumbnails are still being fetched, and disappears entirely (no reserved space) once the grid catches up
* feat: when a file's full-quality download fails outright (ex: a transient network blip), a "↻ Retry" button appears where the loading spinner was (main view, centered) – click it to try again from a clean state. The grid gets an equivalent "⚠ Retry N frames" badge next to its spinner, bulk-retrying every thumbnail that failed the same way
* fix (grid): the loading percentage could show "-Infinity%" – it reset its running total to 0 whenever the grid was hidden, even if fetches from before closing it were still in flight, so a later one settling after reopening divided by that stale 0 total
* BREAKING: all app-owned attributes moved from `data-*` to a dedicated `sli-*` prefix (ex. `data-duration` → `sli-duration`) so they can no longer be confused with attributes added by jQuery UI, Leaflet, or the browser itself – every `sli-*` attribute is now unambiguously ours. Presentations exported before this change are not supported anymore; re-export with the new version. UI-only wiring attributes (`data-role`, `data-sel`, `data-mode`, …) are unaffected
* fix: a window resize right after loading a presentation (while still on the splash, before any frame is entered) threw `lastFrame is undefined` – the resize handler now repositions only once a frame is actually being presented, with a guard in `goToFrame` as a backstop
* feat (menu): quick play-mode buttons next to Start — **⏱ 5 s** / **⏱ 10 s** launch straight into auto-forward, **🔁 Kiosk** auto-forwards and loops back to the first frame at the end; the splash also shows a summary of what's loaded (frames / videos / sections) and a "Recent" list of the last presentations you opened. The now-redundant "Press F1" hint (the command palette replaces it) is gone
* enh (menu): the "Recent" presentations list now falls back to `sessionStorage` when `localStorage` is unavailable (e.g. on `file://`, private browsing mode); session-only entries are marked distinctly (muted, italic) so you know they won't persist after the browser closes
* feat: `sli-loop-presentation` on `<main>` — at the last frame, loop back to the first instead of stopping (kiosk / exhibition playback). Toggle live with <kbd>Shift+L</kbd>; presettable from the hash (`#&state=loop-presentation`). Distinct from the narrower-scoped, existing per-frame `sli-loop` (image animation)
* feat (hud): a thin countdown bar at the bottom edge shows the time until the next auto-forward; off by default, toggle with <kbd>Shift+C</kbd>, presettable from the hash (`#&state=progress`)
* enh (tagging): text frames (those with no `<img>`/`<video>`) are taggable too now — `sli-tag` lands on the `<article>` itself and travels with the exported document (localStorage persistence is still photo-only, keyed by filename)
* feat (grid): file-manager style multi-selection — <kbd>Shift+Arrow</kbd>/<kbd>Shift+click</kbd> stretch or shrink the selection (<kbd>Shift+Up</kbd> grabs the row above), <kbd>Space</kbd>/<kbd>Ctrl+Space</kbd>/<kbd>Ctrl+click</kbd> toggle one frame, plain arrows move the cursor while keeping the selection (so a scattered pick can be built with <kbd>Space</kbd>+arrows), <kbd>Ctrl+A</kbd> selects everything (filter-visible), <kbd>Escape</kbd> clears it; a "N frames selected" badge with clipboard/clear buttons shows top-centre. Over the selection a digit tags all frames at once (bulk-consistent), <kbd>0</kbd> untags, <kbd>Delete</kbd> removes, <kbd>Ctrl+Arrow</kbd> moves the whole block (symmetric — Ctrl+Down then Ctrl+Up returns to the exact layout), dragging moves the whole selection (the drag clone shows a "N" badge when several frames travel together), a <kbd>Shift</kbd>/<kbd>Ctrl</kbd>+drag draws a rubber-band box that picks up every frame it covers, and <kbd>Ctrl+C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> (or <kbd>Ctrl+Insert</kbd> / <kbd>Shift+Delete</kbd> / <kbd>Shift+Insert</kbd>) copy / cut / paste — each a single undoable step. Cut frames are greyed out, copied frames get a dashed marker (and paste with their preview intact); the "✖" clear button (and Escape) drops an active cut/copy first, then the selection on a second press. Clicking a section's ribbon (rather than a frame) pins it as the paste destination, letting <kbd>Ctrl+V</kbd> target an otherwise-frameless section. A top-centre badge reads "N to copy/move, M other selected"; an empty grid shows a faint hint of how to start selecting. The selection is ephemeral (never saved nor exported)
* enh (export tags): "Export tags to folders…" now (1) downloads photos served over http(s) instead of only reading in-memory/on-disk files — relative paths resolve against the presentation's URL, or against a "Base URL" field the dialog offers when the presentation is opened from `file://`; (2) exports *unnamed* tags too, into a `tag-<digit>` folder; (3) shows a per-tag table (name → count) plus a total size (summed from in-memory files, with a count of files whose size isn't known without a network/disk read); and, in Firefox (no folder-export support), tells you your tags are saved so you can export the presentation with <kbd>Ctrl+S</kbd> and re-run the folder export in Chrome
* enh (tagging): the "Name tags…" dialog shows, next to each input, how many frames carry that tag
* enh: the loading spinner shows the download percentage while a video's or image's full-quality file is still downloading (video via native `progress`/`buffered`; images via a progress-tracked `fetch()`, falling back to the plain `<img>` load over `file://` or when `Content-Length` is missing)
* fix (navigation): <kbd>Alt+PageDown</kbd> on the very first (loose, directly under `<main>`) frame jumped straight to the last slide instead of the next section
* fix (tagging): "Group frames according to their tag" now gathers *every* untagged frame (ex. cleared with <kbd>0</kbd>) into a single catch-all section — previously only frames loose under `<main>` were collected, so photos untagged inside an existing section stayed scattered there
* enh (tagging): after "Group frames according to their tag" the resulting sections are ordered by tag number (1, 2, 3…) instead of by the order frames happened to appear; the untagged catch-all sinks to the end
* feat (tagging): "untag all" button/command on a section and on the presentation (`<main>`) clears the tags from every frame inside, in one undoable step
* enh: `sli-fallback` accepts several space-separated templates, tried in order until one actually loads/decodes – lets a single `sli-fallback` set on `<main>` cover both photos and videos (which need differently-named/typed replacement files) without the generator having to know which applies to a given file
* enh: `sli-datetime` now resolves through the general `prop()` inheritance (like `sli-thumb`/`sli-fallback`/`sli-rotate`) instead of being read only off the `<img>`/`<video>` element, so it can be set once on `<article>`/`<section>`/`<main>` without a nested media tag
* feat: `sli-fallback` (same template/inheritance as `sli-thumb`) points to a pre-converted alternative file that's loaded automatically when `sli-src` fails to load/decode (ex: HEIC/HEIF photos Chrome on Windows can't render); if the fallback also fails (or none is set), a toast warns about the unsupported file for the frame currently being viewed (the thumbnail, if any, stays visible)
* enh (grid): nested sections & loose frames — section/presentation headers now count frames recursively (all the way down, across nested subsections) while still listing only the direct subsections; regroup and post-delete navigation see through `<div>` wrappers (e.g. `sli-duration` groups) via a new `getDirectFrames`; frames living loose under `<main>` (in no `<section>`) get a full-width "Loose frames" divider in the grid instead of looking glued to the section above them (frame ordering still leaves div-wrapped groups untouched — known limitation)
* fix: local scripts (opened via `file://`, e.g. `presenter.html`/`tutorial_local.html`) failed to load ("source URI is not allowed"/CORS errors) since the CORS-error-visibility fix marked every `<script>` tag `crossorigin="anonymous"` by default – that only makes sense for the CDN vendor scripts, so it's now applied solely to `http(s)://` sources
* feat: "Export tags to folders…" (<kbd>Ctrl+Shift+S</kbd>, Chrome/Edge) copies one folder per named tag, with `tags.json` + `<tag>.txt` alongside; the source folder (for photos not currently loaded in memory) is searched recursively, so a common ancestor of several subfolders works, can be changed at any time via "Change source folder…", and missing files can be retried against a different folder without re-exporting everything
* feat (tagging): "Filter by tag…" shows only frames carrying any of the checked tags (OR across several), in both the grid and normal navigation; a HUD icon next to the frame counter appears while active and clears it on click
* feat (tagging): tags are now multi-valued – a frame can carry several tags at once, toggled per digit (<kbd>0</kbd> still clears all); tags can be named via a new "Name tags…" command/button (<kbd>Alt+Shift+T</kbd>, `sli-tag-names` on `<main>`), and named tags show wherever a tag is displayed (HUD, thumbnails, grid); tagging is now undoable
* enh (hud): notification toasts stay up longer for longer messages instead of a fixed 2s, and a new "Notification history" command lists the last 50
* fix (tagging): "Group frames according to their tag" (<kbd>Alt+Shift+G</kbd>) groups a multi-tagged frame by its first tag only, with a notice listing affected files
* enh (mobile grid): a second tap on the already-selected photo enters it (like the Enter hotkey) – double-tap isn't reliable on mobile
* enh (mobile): touch devices get a proper viewport meta tag with native pinch-zoom of the page disabled (correct scale instead of a shrunk, zoomable-out desktop layout), frames are laid out in a plain horizontal strip instead of the diagonal/spiral canvas (no more visible diagonal travel while swipe-dragging), no spiral fly-through or authored pan/zoom steps between/within frames (plain full-screen photo, finger-following swipe to the next like a photo-strip), the splash screen no longer reacts to swipe gestures and is skipped entirely once a presentation is loaded, the top control icons are replaced by a bottom nav bar (prev/grid/menu/next) that fades in/out on tap and mirrors the ☰ icon's status (play/pause, video rate, …), the toolbar menu shows only the handful of buttons that make sense without a keyboard, bigger grid tiles
* fix (mobile): the toolbar buttons hidden as "not needed without a keyboard" (thumbnails/grid/properties/steps/editing/tagging toggles, zoom buttons, …) reappeared once presenting started – enabling their group makes WebHotkeys run `$(el).show()`, and jQuery, finding the hiding rule still wins, fell back to forcing the button's default display *inline*, defeating a non-`!important` rule
* fix (grid): thumbnail tiles were always a fixed 30vw/30vh regardless of the configured column count (a CSS specificity tie made that rule win over the grid's own `calc()` sizing) – the mismatch between the visual layout and the grid's row/column bookkeeping is very likely what made a tapped photo land oddly
* feat: <kbd>Alt+r</kbd> 🔄 rotates the whole view 90° – sets the same `sli-rotate` on `<main>` the Properties panel would, so every frame's photo inherits and zoom-compensates it exactly like the per-photo "Rotate right 90°" button does for one photo; handy on mobile when the phone's orientation lock disagrees with the presentation
* fix (mobile): a rotated presentation briefly showed the incoming photo unrotated while swipe-dragging, snapping to rotated only once the drag landed – a dragged-in neighbour becomes visible well before `Frame.prepare()` runs on it (that only happens on arrival), so it's now rotated proactively as soon as the drag starts
* fix (mobile): swipe (the finger-following drag) could desync – a dragged-in neighbour and the leaving frame drifting apart/overlapping; a swipe now always acts like tapping the prev/next button once past the distance threshold, with a highlight on that button while dragging so the pending direction is visible
* enh (mobile): the bottom nav's prev/next buttons give immediate tap feedback and show a spinner if the frame doesn't arrive within 200ms (noticeable on a slow real server)
* fix (mobile): a touch on the photo still panned it (WZoom's own drag-scroll) even when not zoomed in, fighting the swipe-to-navigate gesture – WZoom engages its pan regardless of zoom level and there's no supported way to disable it only at 1x, so any pan it applies while not zoomed in is now undone right away (`onMove`), before the browser paints
* fix (mobile): the nav buttons' "tapped" press feedback wasn't visible until the finger lifted (it was tied to `click`, which only fires then) – now driven directly by touchstart, and stays on through the whole switch (instead of resetting on touchend) so it's clear a switch is in progress until the new frame actually arrives
* enh (grid/ribbon): thumbnails crop to fill their tile (`object-fit: cover`) instead of letterboxing a photo to the device's own aspect ratio – much less wasted grey space, especially with mixed portrait/landscape photos (the main full-screen view is unaffected, still shows the whole photo)
* fix (mobile): finishing a swipe crashed ("Cannot read properties of null (reading 'direction')") – the completion animation's callback read the drag state after it had already been reset to null
* fix (grid): the "Presentation (N)" section header only counted nested `<section>`s, showing 0 even when many frames sit directly under `<main>` – now counts all top-level frames like a real section's header does
* enh: script tags are marked `crossorigin` so an uncaught error anywhere in the app (loaded off a CDN) surfaces its real message/file/line in the error toast instead of an opaque "Script error."
* fix: <kbd>Alt+M</kbd> (show splashscreen) stopped working after visiting a frame without media (shortcut clash with video mute uncovered a WebHotkeys bug – fixed upstream, vendor bumped to 0.9.5)
* fix: EXIF metadata (date, camera, GPS) show in the HUD already on the first visit of a frame, not only after returning to it
* enh (menu): styled file-picker button, "Press F1 for keyboard shortcuts" hint
* fix: video end time `mm:ss` in a media fragment was read as `hh:mm` (60× longer)
* fix: panning the map (shown via <kbd>m</kbd>) before the first GPS frame threw an error
* fix: grouping by a tag with spaces or quotes broke mid-operation
* fix: programmatic `FrameFactory.img`/`video` without a File crashed
* enh (menu): the Append frames panel is collapsible – folded when a presentation is loaded (Start is the primary action), unfolded when empty, auto-unfolds on file drag; the Defaults form folds separately
* fix: map route was fetched and drawn twice when geometry is shown
* fix: unsaved-changes guard registered one handler per edit
* fix: progress spinner never finished when a dropped file could not be identified
* fix: the URL query string was dropped from the address bar on frame change
* fix: "Saved" could pop up before the exported file finished writing (Chrome rewrite mode)
* fix: never-rotated images no longer get a spurious rotate animation on zoom steps
* enh: unexpected JS errors pop up as a toast instead of dying silently in the console
* enh: single stylesheet source – `style.css` now uses native CSS nesting & custom properties, the LESS source is gone (needs an evergreen browser, ≳ late 2023)
* feat: `<article sli-src>` – the `<img>`/`<video>` child is created automatically from the file extension
* fix: intermittent startup crash (`document.querySelector(...) is null` in `loadjQuery`) – no longer races the parser inserting the jQuery script
* feat: auto-forward settable from the hash (`#1&state=duration:5`), round-trips with the auto-forward button
* feat: `sli-thumb` thumbnail preview – shows a lightweight preview while the full-quality file downloads, grid/ribbon uses it exclusively
* enh: HUD loading spinner while the current frame's full-quality media downloads
* enh: preloading throttled & prioritized – current frame's original loads first, thumbnails stay cheap, neighbour originals download a few at a time in order of distance (no longer floods a real server)
* feat: grid dynamic loading, powerful grouping, etc.
* feat: command palette
* fix: exif correct date format
* enh (map): lazy loading
* enh (zoom): faster wheel, slower touchpad
* enh (mobile): swipe follows the finger in diagonal layout, ignores gestures started over the HUD, bigger tap targets on touch devices

## 0.9.9 (2026-02-26)
* enh: preblink protection

## 0.9.8 (2026-02-05)
* update: new mapy.com API

## 0.9.7 (2025-10-22)
* feat: mobile swipe support
* enh: shortcuts
* fix: rotation

## 0.9.6 (2024-10-17)
* video pause will not cause frame change
* more intuitive auto-forward button
* fix: video autoplay when going backwards
* video zoom
* rotation
* spare map usage

## 0.9.2
* GUI controls
* grid
* dragging import
* tutorial

## 0.8.0
* auxiliary window to track the presentation pace
* thumbnail ribbon
* support for various media formats
* header and footer template
* stable save
* F5 honours the current frame (hash)
* properties panel
* basic editing mode

## 0.7.0
Every important feature working as expected.