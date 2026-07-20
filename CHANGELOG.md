# CHANGELOG

## 1.0.0 (unreleased)
* fix: local scripts (opened via `file://`, e.g. `presenter.html`/`tutorial_local.html`) failed to load ("source URI is not allowed"/CORS errors) since the CORS-error-visibility fix marked every `<script>` tag `crossorigin="anonymous"` by default – that only makes sense for the CDN vendor scripts, so it's now applied solely to `http(s)://` sources
* feat: "Export albums to folders…" (<kbd>Ctrl+Shift+S</kbd>, Chrome/Edge) copies one folder per named tag plus a `vsechny` folder with everything, with `alba.json` + `<album>.txt` alongside; the source folder (for photos not currently loaded in memory) is searched recursively, so a common ancestor of several subfolders works, can be changed at any time via "Change source folder…", and missing files can be retried against a different folder without re-exporting everything
* feat (tagging): "Filter by tag…" shows only frames carrying any of the checked tags (OR across several), in both the grid and normal navigation; a HUD icon next to the frame counter appears while active and clears it on click
* feat (tagging): tags are now multi-valued – a frame can carry several tags at once, toggled per digit (<kbd>0</kbd> still clears all); tags can be named via a new "Name tags…" command/button (<kbd>Alt+Shift+T</kbd>, `data-tag-names` on `<main>`), and named tags show wherever a tag is displayed (HUD, thumbnails, grid); tagging is now undoable
* enh (hud): notification toasts stay up longer for longer messages instead of a fixed 2s, and a new "Notification history" command lists the last 50
* fix (tagging): "Group frames according to their tag" (<kbd>Alt+Shift+G</kbd>) groups a multi-tagged frame by its first tag only, with a notice listing affected files
* enh (mobile grid): a second tap on the already-selected photo enters it (like the Enter hotkey) – double-tap isn't reliable on mobile
* enh (mobile): touch devices get a proper viewport meta tag with native pinch-zoom of the page disabled (correct scale instead of a shrunk, zoomable-out desktop layout), frames are laid out in a plain horizontal strip instead of the diagonal/spiral canvas (no more visible diagonal travel while swipe-dragging), no spiral fly-through or authored pan/zoom steps between/within frames (plain full-screen photo, finger-following swipe to the next like a photo-strip), the splash screen no longer reacts to swipe gestures and is skipped entirely once a presentation is loaded, the top control icons are replaced by a bottom nav bar (prev/grid/menu/next) that fades in/out on tap and mirrors the ☰ icon's status (play/pause, video rate, …), the toolbar menu shows only the handful of buttons that make sense without a keyboard, bigger grid tiles
* fix (mobile): the toolbar buttons hidden as "not needed without a keyboard" (thumbnails/grid/properties/steps/editing/tagging toggles, zoom buttons, …) reappeared once presenting started – enabling their group makes WebHotkeys run `$(el).show()`, and jQuery, finding the hiding rule still wins, fell back to forcing the button's default display *inline*, defeating a non-`!important` rule
* fix (grid): thumbnail tiles were always a fixed 30vw/30vh regardless of the configured column count (a CSS specificity tie made that rule win over the grid's own `calc()` sizing) – the mismatch between the visual layout and the grid's row/column bookkeeping is very likely what made a tapped photo land oddly
* feat: <kbd>Alt+r</kbd> 🔄 rotates the whole view 90° – sets the same `data-rotate` on `<main>` the Properties panel would, so every frame's photo inherits and zoom-compensates it exactly like the per-photo "Rotate right 90°" button does for one photo; handy on mobile when the phone's orientation lock disagrees with the presentation
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
* feat: `<article data-src>` – the `<img>`/`<video>` child is created automatically from the file extension
* fix: intermittent startup crash (`document.querySelector(...) is null` in `loadjQuery`) – no longer races the parser inserting the jQuery script
* feat: auto-forward settable from the hash (`#1&state=duration:5`), round-trips with the auto-forward button
* feat: `data-thumb` thumbnail preview – shows a lightweight preview while the full-quality file downloads, grid/ribbon uses it exclusively
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