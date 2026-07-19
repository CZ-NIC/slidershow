# CHANGELOG

## 1.0.0 (unreleased)
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