# CHANGELOG

## 1.0.1 (unreleased)

* fix (playback): pressing Home now resets to the first step too

## 1.0.0 (2026-07-25)

* BREAKING: all app-owned attributes moved from `data-*` to a dedicated `sli-*` prefix (ex. `data-duration` → `sli-duration`) – every `sli-*` attribute is now unambiguously ours. Presentations exported before this change are not supported anymore; unless you replace the string manually.

### Grid & UI
* feat (grid): complete redesign with inline renaming of section titles and the top-level "Presentation" ribbon (click to edit, <kbd>Enter</kbd>/click-away commits, <kbd>Escape</kbd> discards, writes `sli-title` only), file-manager style multi-selection (<kbd>Shift+Arrow</kbd>/<kbd>Shift+click</kbd> for ranges, <kbd>Space</kbd>/<kbd>Ctrl+click</kbd> for toggle, <kbd>Ctrl+A</kbd> for all, <kbd>Ctrl+C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> for copy/cut/paste with undoable steps, dragging and rubber-band selection for bulk operations), powerful per-tile and aggregate loading spinners (per-tile shows buffered percentage and queue status, clicking aggregate spinner toggles a plain list of all in-flight files, queue-wait timing decoupled from fetch timing so tiles don't wrongly appear stuck), arrow-key navigation (<kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>PageUp</kbd>/<kbd>PageDown</kbd>) now lands on empty subsection ribbons as paste targets with proper row jumping, unified ribbon menus for both sections and the presentation (order/add/regroup for frames, add/sort/flatten for subsections, with hover tooltips), nested subsections with indentation levels, full "Loose frames" dividers (appear in sections, not just at top level, handle edge cases where subsections insert before loose frames), thumbnail tiles crop to fill their space (`object-fit: cover`) instead of letterboxing, recursive frame counting in section headers, proper `<div>`-wrapper navigation for grouped frames; all rendering and layout bugs fixed (Delete hotkey on ribbon paste-targets, Delete on top-level Presentation ribbon, hash-restore grid visibility and hotkey gate, sort-order swapped labels, grid spinner overlapping main view, tile spinner infinite loops, percentage math/-Infinity% edge case, tile sizing CSS specificity, Presentation header frame count)
* feat (naming): a presentation can now be named – type it into the field on the splash screen (blends in as the "Start presenting" label until hovered/focused, which reveals it's editable), hit <kbd>Alt+N</kbd> during playback, use the field at the top of the export dialog (<kbd>Ctrl+S</kbd>), or click the "Presentation" title directly in the grid overview. The name lives in `sli-title` on `<main>` (the same attribute a `<section>` uses one level up), is mirrored to the document `<title>` (browser tab), and – slugified – becomes the **export filename**, so a presentation named *Dovolená 2019* exports as `dovolena-2019.html` instead of the eternal `slidershow.html`; the `TAG-NAMES` localStorage cache is now keyed by the presentation name (falling back to the file name) instead of the file name alone, so several differently-named presentations dropped into the same generic URL (ex. `slidershow.html`) no longer share – and overwrite – one another's cached tag names, and renaming a presentation migrates its cached entry to the new key instead of orphaning it
* feat (menu): the "Recent" presentations list now shows frame count and photo date range (month granularity) for each saved presentation – e.g. `12 frames · 2019-06 – 2019-08` — helping you find the one you want quickly. Old entries from before this feature lack the dates and just show the count
* feat (menu): quick play-mode buttons next to Start — **⏱ 5 s** / **⏱ 10 s** launch straight into auto-forward, **🔁 Kiosk** auto-forwards and loops back to the first frame at the end; the splash also shows a summary of what's loaded (frames / videos / sections) and a "Recent" list of the last presentations you opened. The now-redundant "Press F1" hint (the command palette replaces it) is gone
* feat (hud): a thin countdown bar at the bottom edge shows the time until the next auto-forward; off by default, toggle with <kbd>Shift+C</kbd>, presettable from the hash (`#&state=progress`)
* feat: command palette
* enh (hud): notification toasts stay up longer for longer messages instead of a fixed 2s, and a new "Notification history" command lists the last 50
* enh (menu): the "Recent" presentations list now falls back to `sessionStorage` when `localStorage` is unavailable (e.g. on `file://`, private browsing mode); session-only entries are marked distinctly (muted, italic) so you know they won't persist after the browser closes; the Append frames panel is collapsible – folded when a presentation is loaded (Start is the primary action), unfolded when empty, auto-unfolds on file drag; the Defaults form folds separately
* enh: script tags are marked `crossorigin` so an uncaught error anywhere in the app (loaded off a CDN) surfaces its real message/file/line in the error toast instead of an opaque "Script error."; unexpected JS errors pop up as a toast instead of dying silently in the console

### Export
* fix (export): offline exports no longer black-screen when opened without network. Leaflet was deliberately left out of the offline bundle ("maps need network for tiles anyway"), but the library loads by default and its failed CDN fetch rejected the boot, blanking the whole app – it's now bundled like every other vendor lib (offline the map just has no tiles). A "Copy into a folder" export opened from `file://` also black-screened, because jQuery (via `document.write`) and textFit/wheel-zoom kept their `integrity`/`crossorigin` on the rewritten local paths, turning each load into a CORS request the `file://` origin blocks; those attributes are now dropped for non-`http(s)` sources
* feat (export): offline export – the Ctrl+S dialog's "Same folder"/"Another folder"/"Pack into one file" buttons now come with an "App's own code" radio (Load from CDN / Inline into the file / Copy into a folder) instead of a separate checkbox+button, since the three are mutually exclusive. "Inline" bundles the app's own code (vendor libs + local `slidershow/*.js` + `style.css`) verbatim into the exported file, so opening it later needs no network for anything but the map (still online-only, tiles need a network regardless). "Copy into a folder" (Chrome only) instead copies that code into `vendor/`/`slidershow/` folders next to the exported file and rewrites the head to the local relative paths – no inlining, so the exported HTML stays as small as a normal export
* feat (export): a new "Media paths" radio next to "Same folder"/"Another folder" can force every relative media path into an absolute URL against this page's own address, or force an already-absolute same-origin path back into a relative one – useful when the presentation is served from a local/dev server whose address won't be the final one, or vice versa
* feat (export): "Export all to a single file" now embeds server-hosted media too, not just drag-dropped files – any photo/video still referenced by an http(s) path is fetched and inlined as a data URI, so the one exported file is genuinely self-contained. Previously only files dropped in from disk (which carry their bytes in memory) got embedded; media loaded from a URL was left as a bare relative link. This is also the only way Firefox – which has no "Download all media to a folder" (that's Chrome/Edge-only) – can bundle server media at all. Media that can't be fetched (a relative path on a `file://` presentation, or a cross-origin URL blocked by CORS) is left as a link and reported, so you see exactly how many made it in
* feat (export): a new "Download all media to a folder" button (Chrome only, next to "Pack into one file") copies every photo/video as a real file into a `media/` folder next to the exported HTML and rewrites `sli-src` to point there – unlike "Pack into one file" the exported HTML itself stays small, and unlike "Same folder"/"Another folder" the export no longer depends on wherever the media used to live. Frames that aren't in memory or fetchable over http fall back to the same "pick a source folder" prompt as "Export tags to folders…"
* feat: "Export tags to folders…" (<kbd>Ctrl+Shift+S</kbd>, Chrome/Edge) copies one folder per named tag, with `tags.json` + `<tag>.txt` alongside; the source folder (for photos not currently loaded in memory) is searched recursively, so a common ancestor of several subfolders works, can be changed at any time via "Change source folder…", and missing files can be retried against a different folder without re-exporting everything
* enh (export tags): "Export tags to folders…" no longer copies every tagged photo again into a redundant catch-all folder (removes redundant catch-all folder copy), now offers "Write tags.json"/"Write a `<tag>.txt` file per tag" checkboxes to skip either manifest, in Firefox provides direct download buttons for `tags.json` and per-tag `.txt` files without the photos, downloads photos served over http(s) instead of only reading in-memory/on-disk files (relative paths resolve against the presentation's URL, or against a "Base URL" field when opened from `file://`), exports *unnamed* tags too into `tag-<digit>` folders, shows a per-tag table (name → count) plus total size (summed from in-memory files, with count of files whose size isn't known without network/disk read)

### Tagging
* feat (tagging): "Filter by tag…" shows only frames carrying any of the checked tags (OR across several), in both the grid and normal navigation; a HUD icon next to the frame counter appears while active and clears it on click
* feat (tagging): tags are now multi-valued – a frame can carry several tags at once, toggled per digit (<kbd>0</kbd> still clears all); tags can be named via a new "Name tags…" command/button (<kbd>Alt+Shift+T</kbd>, `sli-tag-names` on `<main>`), and named tags show wherever a tag is displayed (HUD, thumbnails, grid); tagging is now undoable. "Group frames according to their tag" (<kbd>Alt+Shift+G</kbd>) groups a multi-tagged frame by its first tag only, with a notice listing affected files
* feat (tagging): "untag all" button/command on a section and on the presentation (`<main>`) clears the tags from every frame inside, in one undoable step
* enh (tagging): text frames (those with no `<img>`/`<video>`) are taggable too now — `sli-tag` lands on the `<article>` itself and travels with the exported document (localStorage persistence is still photo-only, keyed by filename)
* enh (tagging): after "Group frames according to their tag" the resulting sections are ordered by tag number (1, 2, 3…) instead of by the order frames happened to appear; the untagged catch-all sinks to the end

### Playback & Media Loading
* feat: `<article sli-src>` – the `<img>`/`<video>` child is created automatically from the file extension
* feat: `sli-thumb` thumbnail preview – shows a lightweight preview while the full-quality file downloads, grid/ribbon uses it exclusively
* feat: auto-forward settable from the hash (`#1&state=duration:5`), round-trips with the auto-forward button
* feat: autostart presentation from URL hash – append `&state=start` to skip the splash screen and begin playback immediately (stackable with other state flags: `#1&state=thumbnails,grid,start`)
* feat: `sli-loop-presentation` on `<main>` — at the last frame, loop back to the first instead of stopping (kiosk / exhibition playback). Toggle live with <kbd>Shift+L</kbd>; presettable from the hash (`#&state=loop-presentation`). Distinct from the narrower-scoped, existing per-frame `sli-loop` (image animation)
* feat: when a file's full-quality download fails outright (ex: a transient network blip), a "↻ Retry" button appears where the loading spinner was (main view, centered) – click it to try again from a clean state. The grid gets an equivalent "⚠ Retry N frames" badge next to its spinner, bulk-retrying every thumbnail that failed the same way
* feat: `sli-fallback` (same template/inheritance as `sli-thumb`) points to a pre-converted alternative file that's loaded automatically when `sli-src` fails to load/decode (ex: HEIC/HEIF photos Chrome on Windows can't render); if the fallback also fails (or none is set), a toast warns about the unsupported file for the frame currently being viewed (the thumbnail, if any, stays visible)
* enh: HUD loading spinner while the current frame's full-quality media downloads
* enh: the loading spinner shows the download percentage while a video's or image's full-quality file is still downloading (video via native `progress`/`buffered`; images via a progress-tracked `fetch()`, falling back to the plain `<img>` load over `file://` or when `Content-Length` is missing)
* enh: preloading throttled & prioritized – current frame's original loads first, thumbnails stay cheap, neighbour originals download a few at a time in order of distance (no longer floods a real server)
* enh: `sli-fallback` accepts several space-separated templates, tried in order until one actually loads/decodes – lets a single `sli-fallback` set on `<main>` cover both photos and videos (which need differently-named/typed replacement files) without the generator having to know which applies to a given file
* enh: `sli-datetime` now resolves through the general `prop()` inheritance (like `sli-thumb`/`sli-fallback`/`sli-rotate`) instead of being read only off the `<img>`/`<video>` element, so it can be set once on `<article>`/`<section>`/`<main>` without a nested media tag

### Mobile
* enh (mobile): touch devices get a proper viewport meta tag with native pinch-zoom of the page disabled (correct scale instead of a shrunk, zoomable-out desktop layout), frames are laid out in a plain horizontal strip instead of the diagonal/spiral canvas (no more visible diagonal travel while swipe-dragging), no spiral fly-through or authored pan/zoom steps between/within frames (plain full-screen photo, finger-following swipe to the next like a photo-strip), the splash screen no longer reacts to swipe gestures and is skipped entirely once a presentation is loaded, the top control icons are replaced by a bottom nav bar (prev/grid/menu/next) that fades in/out on tap and mirrors the ☰ icon's status (play/pause, video rate, …), the toolbar menu shows only the handful of buttons that make sense without a keyboard, bigger grid tiles; the nav's prev/next buttons give immediate tap feedback and show a spinner if the frame doesn't arrive within 200ms; tap gestures (swipe following the finger, second tap on selected photo to enter) are now stable and responsive; pan-only-when-zoomed behavior prevents unwanted panning while not zoomed in; fixed layout bugs (toolbar buttons re-appearing despite visibility group, rotated photos showing unrotated while dragging, swipe desync and crashes, tap press feedback delay, nav button press state not showing during transitions)
* enh (mobile): swipe follows the finger in diagonal layout, ignores gestures started over the HUD, bigger tap targets on touch devices
* feat: <kbd>Alt+r</kbd> 🔄 rotates the whole view 90° – sets the same `sli-rotate` on `<main>` the Properties panel would, so every frame's photo inherits and zoom-compensates it exactly like the per-photo "Rotate right 90°" button does for one photo; handy on mobile when the phone's orientation lock disagrees with the presentation

### Maps & Navigation
* enh (map): lazy loading
* enh (zoom): faster wheel, slower touchpad

### Miscellaneous
* enh: single stylesheet source – `style.css` now uses native CSS nesting & custom properties, the LESS source is gone (needs an evergreen browser, ≳ late 2023)
* feat: grid dynamic loading, powerful grouping, etc.

### Fixes
* fix (append): a frame dropped onto "Append frames" could render blank (image never gets `src`) until you navigated away and back – newly appended frames are now preloaded eagerly instead of relying solely on the background preload queue, which a later navigation could wipe before it got to them
* fix: EXIF metadata (date, camera, GPS) show in the HUD already on the first visit of a frame, not only after returning to it
* fix: video end time `mm:ss` in a media fragment was read as `hh:mm` (60× longer)
* fix: panning the map (shown via <kbd>m</kbd>) before the first GPS frame threw an error
* fix: grouping by a tag with spaces or quotes broke mid-operation
* fix: programmatic `FrameFactory.img`/`video` without a File crashed
* fix: exif correct date format
* fix: map route was fetched and drawn twice when geometry is shown
* fix: local scripts (opened via `file://`, e.g. `presenter.html`/`tutorial_local.html`) failed to load ("source URI is not allowed"/CORS errors) since the CORS-error-visibility fix marked every `<script>` tag `crossorigin="anonymous"` by default – that only makes sense for the CDN vendor scripts, so it's now applied solely to `http(s)://` sources
* fix: a window resize right after loading a presentation (while still on the splash, before any frame is entered) threw `lastFrame is undefined` – the resize handler now repositions only once a frame is actually being presented, with a guard in `goToFrame` as a backstop
* fix: intermittent startup crash (`document.querySelector(...) is null` in `loadjQuery`) – no longer races the parser inserting the jQuery script
* fix (navigation): <kbd>Alt+PageDown</kbd> on the very first (loose, directly under `<main>`) frame jumped straight to the last slide instead of the next section
* fix (tagging): "Group frames according to their tag" now gathers *every* untagged frame (ex. cleared with <kbd>0</kbd>) into a single catch-all section — previously only frames loose under `<main>` were collected, so photos untagged inside an existing section stayed scattered there
* fix: unsaved-changes guard registered one handler per edit
* fix: progress spinner never finished when a dropped file could not be identified
* fix: the URL query string was dropped from the address bar on frame change
* fix: "Saved" could pop up before the exported file finished writing (Chrome rewrite mode)
* fix: never-rotated images no longer get a spurious rotate animation on zoom steps

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