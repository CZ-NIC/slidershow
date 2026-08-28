# Organizing & tagging

## Thumbnails ribbon and grid

While presenting, press <kbd>j</kbd> to display the thumbnail ribbon or <kbd>g</kbd> to see the full grid. There, you can easily sort the frames. Either move them one by one or sort a whole section (by EXIF date or file names). Import new images just by dragging them in.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/grid-overview.webm" title="Opening the grid and dragging a thumbnail to reorder it"></video>

**Reordering thumbnails.** Click and drag a tile to move it, or use Ctrl+Arrow to shift the whole selection as a block.

**Tile shape.** The grid guesses what it is showing: frames that hold nothing but a photo or video get a
photo-shaped 4:3 tile (a landscape phone photo then fits uncropped), while authored frames with a layout of
their own keep the shape of your screen, so the overview resembles what the audience will see. Press
<kbd>Alt+A</kbd> (or the ▭ button) to cycle the tile through **4:3**, **square** and **screen shape** yourself.

**Captions.** <kbd>Alt+F</kbd> cycles the caption laid over each tile: nothing → file name → file name and
capture date. Handy for finding a particular shot without having to recognize it from a cropped thumbnail.

**Show whole frames.** Thumbnails are cropped to fill their tile. <kbd>Alt+C</kbd> switches to showing every
frame whole instead – useful for checking composition or for telling portrait shots from landscape ones at a
glance, though the grid goes ragged, so it works better as a quick look than as a way to browse.

**Density.** <kbd>+</kbd> / <kbd>-</kbd> change how many tiles fit on a row. Your choice is remembered for
next time.

All of these are yours alone: the tile shape, captions and cropping live in the URL and the column count in
your browser, never in the presentation, so browsing someone else's file never changes it.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/grid-sort.webm" title="Sorting a whole section by EXIF date via the grid ribbon's order ▾ menu"></video>

**Sorting by EXIF date or file names.** Each section's ribbon menu has an "order ▾" button for bulk sorting without hand-dragging.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/grid-import.webm" title="Dragging new photos straight onto the grid to import them"></video>

### Multi-selection

The grid supports a file-manager style multi-selection – the current (highlighted) frame doubles as the selection cursor. While a selection exists, a "N frames selected" badge with copy/cut/paste/delete/clear buttons shows at the top.

- <kbd>Shift+Arrow</kbd> stretches or shrinks the selection from the cursor; <kbd>Shift+Up</kbd> grabs the whole row above. <kbd>Shift+click</kbd> extends to the clicked frame.
- <kbd>Space</kbd> (or <kbd>Ctrl+Space</kbd>) toggles the current frame in/out of the selection; <kbd>Ctrl+click</kbd> does the same for the clicked frame. A <kbd>Shift</kbd>/<kbd>Ctrl</kbd>+drag draws a rubber-band box that adds every frame it covers.
- A plain <kbd>Arrow</kbd> moves the cursor **keeping** the selection – so you can build a scattered pick with just <kbd>Space</kbd>+arrows. <kbd>Escape</kbd> (or a plain click) clears it.
- <kbd>Ctrl+Arrow</kbd> moves the whole selection as one block (a single undoable), even across sections, and is symmetric – <kbd>Ctrl+Down</kbd> then <kbd>Ctrl+Up</kbd> returns to the exact layout. Dragging a selected thumbnail moves the whole selection. With nothing selected it moves just the current frame, as before.
- With the selection in place: a digit tags every selected frame at once (bulk-consistent: if they all already carry the tag, it is removed from all), <kbd>0</kbd> untags them, <kbd>Delete</kbd> removes them, and <kbd>Ctrl+C</kbd>/<kbd>Ctrl+X</kbd>/<kbd>Ctrl+V</kbd> (or the classic <kbd>Ctrl+Insert</kbd> / <kbd>Shift+Delete</kbd> / <kbd>Shift+Insert</kbd>) copy / cut / paste them after the cursor – each as one undoable step.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/multiselect-scatter.webm" title="Space+arrows building a scattered multi-selection"></video>

**Building a scattered selection.** Use Space to toggle frames in and out, combined with arrow keys to move the cursor without losing the selection.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/multiselect-move.webm" title="Shift+Arrow extending a range, Ctrl+Arrow moving the whole block"></video>

The selection is a grid-only convenience; it is never saved into the presentation nor exported.

## Auxiliary window

While presenting, you may appraise an auxiliary window on the second monitor that shows you the next frame and presenting notes. Start it with <kbd>Alt+W</kbd>.

### Choosing what it shows where

The window is a two-by-two grid of sectors – a top and a bottom one in each column – and each of them may display any of:

| Pane | Shows |
|---|---|
| Current slide | the frame the audience sees, with the not-yet-revealed [steps](steps.md) outlined |
| Next slide | the frame that comes next |
| Notes | the [presenter's notes](structure.md#-presenters-notes-) of the current frame |
| Next notes | the presenter's notes of the *next* frame – a look ahead at what you are about to say |
| (empty) | nothing – does not take up space |

The default layout has the right column's bottom sector empty, so the notes run full height beside the slides.

```
current | notes            current | notes
--------|                 --------|------------
next    |                 next    | next notes

  the default               aux=current,next,notes,next-notes
```

Everything is set from one place: the ⚙ knob in the window's bottom right corner (it fades in on hover, so it does not disturb while presenting), or <kbd>Alt+Shift+W</kbd> in the main window – the same dialog either way. Besides the four panes it also carries the three sliders the window is divided by: the column split, and the row split of either column. Changes are shown live as you drag.

The arrangement is yours, not the presentation's, so it is not exported – it rides in the URL hash and is restored whenever that link is opened:

* `aux=` – the panes, in the order left top, left bottom, right top, right bottom. Trailing sectors left at their default are simply omitted.
* `aux-size=` – the three splits as percentages of the first part (`aux-size=60,67,40` = a 60 : 40 column split, the left column 67 : 33, the right one 40 : 60).

Both keys are left out while they hold their default, so the stock arrangement writes no hash at all.

## Grouping on import

A big drop does not have to land as one long section. In the splash screen's **Append frames → Defaults** panel, the **Group by** select splits every import into sections right away:

* **Folder** – the folder each file came from. Only a whole-folder drop (or the directory picker) tells the browser the original path; a plain multi-file drop has none, so the import stays in one section. The folder is remembered on the frame as `sli-folder`, so you can regroup by it later as well.
* **Day / Month / Year** – the photo's date.
* **Camera** – the make and model that took the photo (`sli-device`).

Folder and the dates are known from the files themselves, so those sections appear the very moment the import finishes. The camera – and an exact date, when the file's modification time lies about when the photo was taken – can only be read from the EXIF, which is loaded in the background: the presentation is usable immediately and re-shuffles itself **once**, when the last photo of the batch has been read. Nothing is regrouped photo by photo.

Your choice is remembered in this browser (like the grid's column count), not in the presentation – so it applies to every presentation you open here, while the sections it produced belong to the file you export.

The same criteria are available afterwards from the grid's **regroup ▾** ribbon menu (<kbd>g</kbd>), together with hours, weeks and tags.

## Tagging

Start tagging mode with <kbd>Alt+T</kbd>. Use the Numpad to tag the images – think of a tag as a number that corresponds to one of your categories. A photo may carry several tags at once: hitting a digit again toggles that tag off, <kbd>0</kbd> clears all of them. Text frames (with no photo/video) can be tagged too – their tag rides along in the exported document. Then in the menu, hit <kbd>Alt+Shift+G</kbd> to group the images into `<section>`s according to tags. The resulting sections come out ordered by tag number (1, 2, 3…), with every untagged photo gathered into a single catch-all section at the end. Export with <kbd>Ctrl+S</kbd>. Sorted & ready!

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/tagging.webm" title="Tagging photos, grouping them into sections by tag, and exporting"></video>

To wipe tags again, the grid ribbon has an "untag all" button on each section and on the whole presentation, clearing the tags of every frame inside in one undoable step.

The tag itself is set on the frame's `<img>`/`<video>` as [`sli-tag`](structure.md#sli-tag); display names come from [`sli-tag-names`](structure.md#sli-tag-names) on `<main>`.

### Naming tags

Tags can be named through the "Name tags…" button/command (<kbd>Alt+Shift+T</kbd> while in tagging mode): one row per digit, position corresponds to the digit (first row = tag 1, second = tag 2, …). Named tags then show up everywhere a tag is displayed (HUD, thumbnails, grid) instead of the bare digit.

### Filtering by tag

"Filter by tag…" (command palette, tagging group) shows only frames carrying any of the checked tags – a non-destructive preview of one or several tags at once. It applies both to the grid overview and to normal navigation (next/previous frame skip over hidden ones). A small icon appears next to the frame counter while a filter is active; click it to clear the filter, or reopen "Filter by tag…" to change the selection.

### Exporting tags to album folders

"Export tags to folders…" (<kbd>Ctrl+Shift+S</kbd>, Chrome/Edge only) exports one folder per tag — named tags use their name, unnamed ones a `tag-<digit>` folder — alongside a `tags.json` and one `<tag>.txt` per tag. Handy to prepare per-person, overlapping tags (e.g. "everyone" / "parents" / "leaders") for dragging into a photo-sharing upload. The dialog previews a per-tag count table and the total size. Photos are read from the in-memory file (if dropped in), fetched over http(s) (if the presentation — or the given "Base URL" — is on the web), or, failing both, from a source folder you pick (searched recursively). Firefox can't write folders; export the presentation with <kbd>Ctrl+S</kbd> (your tags are saved inside it) and re-run this in Chrome.

!!! note "How tags are stored"
    The tag is stored in the browser ([local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)) by the file name so that you do not lose the information at a sudden crash. However, in case you import another photo with the same name, it will inherit the tag from the clashing file.

!!! note "How grouping works"
    It iterates over all the frames and, if they are not already in a section having the same name (tag), it creates such a section. A frame with several tags is grouped only by the first one (with a notice); so at the first grouping, frames keep their former order in the new sections. The second time, they get appended to the section's end. You can easily re-order by date etc. in the grid view (<kbd>g</kbd>).
