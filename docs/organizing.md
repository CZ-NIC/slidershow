# Organizing & tagging

## Thumbnails ribbon and grid

While presenting, press <kbd>Alt+J</kbd> to display the thumbnail ribbon or <kbd>Alt+G</kbd> to see the full grid. There, you can easily sort the frames. Either move them one by one or sort a whole section (by EXIF date or file names). Import new images just by dragging them in.

<!-- MEDIA: grid-overview.webm — open grid (Alt+G), drag a frame, sort a section by date. Generate via Playwright once demo photos provided. -->

### Multi-selection

The grid supports a file-manager style multi-selection – the current (highlighted) frame doubles as the selection cursor. While a selection exists, a "N frames selected" badge with copy/cut/paste/delete/clear buttons shows at the top.

- <kbd>Shift+Arrow</kbd> stretches or shrinks the selection from the cursor; <kbd>Shift+Up</kbd> grabs the whole row above. <kbd>Shift+click</kbd> extends to the clicked frame.
- <kbd>Space</kbd> (or <kbd>Ctrl+Space</kbd>) toggles the current frame in/out of the selection; <kbd>Ctrl+click</kbd> does the same for the clicked frame. A <kbd>Shift</kbd>/<kbd>Ctrl</kbd>+drag draws a rubber-band box that adds every frame it covers.
- A plain <kbd>Arrow</kbd> moves the cursor **keeping** the selection – so you can build a scattered pick with just <kbd>Space</kbd>+arrows. <kbd>Escape</kbd> (or a plain click) clears it.
- <kbd>Ctrl+Arrow</kbd> moves the whole selection as one block (a single undoable), even across sections, and is symmetric – <kbd>Ctrl+Down</kbd> then <kbd>Ctrl+Up</kbd> returns to the exact layout. Dragging a selected thumbnail moves the whole selection. With nothing selected it moves just the current frame, as before.
- With the selection in place: a digit tags every selected frame at once (bulk-consistent: if they all already carry the tag, it is removed from all), <kbd>0</kbd> untags them, <kbd>Delete</kbd> removes them, and <kbd>Ctrl+C</kbd>/<kbd>Ctrl+X</kbd>/<kbd>Ctrl+V</kbd> (or the classic <kbd>Ctrl+Insert</kbd> / <kbd>Shift+Delete</kbd> / <kbd>Shift+Insert</kbd>) copy / cut / paste them after the cursor – each as one undoable step.

<!-- MEDIA: multiselect.webm — Space+arrows to build a scattered pick, then Ctrl+Arrow to move the block. Generate via Playwright once demo photos provided. -->

The selection is a grid-only convenience; it is never saved into the presentation nor exported.

## Auxiliary window

While presenting, you may appraise an auxiliary window on the second monitor that shows you the next frame and presenting notes. Start it with <kbd>Alt+W</kbd>.

## Tagging & albums

Start tagging mode with <kbd>Alt+T</kbd>. Use the Numpad to tag the images – think of a tag as a number that corresponds to one of your categories. A photo may carry several tags at once: hitting a digit again toggles that tag off, <kbd>0</kbd> clears all of them. Text frames (with no photo/video) can be tagged too – their tag rides along in the exported document. Then in the menu, hit <kbd>Alt+Shift+G</kbd> to group the images into `<section>`s according to tags. The resulting sections come out ordered by tag number (1, 2, 3…), with every untagged photo gathered into a single catch-all section at the end. Export with <kbd>Ctrl+S</kbd>. Sorted & ready!

<!-- MEDIA: tagging.webm — Alt+T, tag photos with numpad, Alt+Shift+G to group into sections, export. THE key "aha" clip. Generate via Playwright once demo photos provided. -->

To wipe tags again, the grid ribbon has an "untag all" button on each section and on the whole presentation, clearing the tags of every frame inside in one undoable step.

The tag itself is set on the frame's `<img>`/`<video>` as [`sli-tag`](structure.md#sli-tag); display names come from [`sli-tag-names`](structure.md#sli-tag-names) on `<main>`.

### Naming tags

Tags can be named through the "Name tags…" button/command (<kbd>Alt+Shift+T</kbd> while in tagging mode): one row per digit, position corresponds to the digit (first row = tag 1, second = tag 2, …). Named tags then show up everywhere a tag is displayed (HUD, thumbnails, grid) instead of the bare digit.

### Filtering by tag

"Filter by tag…" (command palette, tagging group) shows only frames carrying any of the checked tags – a non-destructive preview of one or several albums at once. It applies both to the grid overview and to normal navigation (next/previous frame skip over hidden ones). A small icon appears next to the frame counter while a filter is active; click it to clear the filter, or reopen "Filter by tag…" to change the selection.

### Exporting albums to folders

"Export albums to folders…" (<kbd>Ctrl+Shift+S</kbd>, Chrome/Edge only) exports one folder per tag — named tags use their name, unnamed ones a `tag-<digit>` folder — plus a `vsechny` folder with everything, alongside an `alba.json` and one `<album>.txt` per album. Handy to prepare per-person, overlapping albums (e.g. "everyone" / "parents" / "leaders") for dragging into a photo-sharing upload. The dialog previews a per-tag count table and the total size. Photos are read from the in-memory file (if dropped in), fetched over http(s) (if the presentation — or the given "Base URL" — is on the web), or, failing both, from a source folder you pick (searched recursively). Firefox can't write folders; export the presentation with <kbd>Ctrl+S</kbd> (your tags are saved inside it) and re-run this in Chrome.

!!! note "How tags are stored"
    The tag is stored in the browser ([local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)) by the file name so that you do not lose the information at a sudden crash. However, in case you import another photo with the same name, it will inherit the tag from the clashing file.

!!! note "How grouping works"
    It iterates over all the frames and, if they are not already in a section having the same name (tag), it creates such a section. A frame with several tags is grouped only by the first one (with a notice); so at the first grouping, frames keep their former order in the new sections. The second time, they get appended to the section's end. You can easily re-order by date etc. in the grid view (<kbd>Alt+G</kbd>).
