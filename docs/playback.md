# Playback

## Controls

There is a variety of keyboard shortcuts. Click the menu button in the top right corner (<kbd>Esc</kbd>) or hit <kbd>F1</kbd> to see a complete list.

* Next frame: <kbd>Right</kbd>, <kbd>PageDown</kbd>, <kbd>n</kbd>, <kbd>Space</kbd>
* Previous frame: <kbd>Left</kbd>, <kbd>PageUp</kbd>, <kbd>p</kbd>
* Video: Adjust speed by <kbd>Numpad +/-</kbd>
* Toggle file info: <kbd>f</kbd>
* Toggle HUD map: <kbd>m</kbd>

## Start

The `<menu>` is displayed before the presentation starts, unless the `<main>` has the `sli-start` attribute.

When a presentation is loaded, the splash shows a short summary of what is loaded (frames / videos / sections) and, next to the big ▶ Start button, quick play-mode buttons:

* **⏱ 5 s** / **⏱ 10 s** – start straight into auto-forward with that per-frame duration.
* **🔁 Kiosk** – auto-forward **and** loop the whole presentation (back to the first frame at the end) – exhibition / kiosk mode.

The last few presentations you opened are listed under "Recent" so you can jump back to them.

![The menu splash with summary, quick-play buttons and Recent list](assets/start-splash.png)

### URL-hash presets

Most viewing options can also be preset from the URL hash so you can hand out a ready-to-run link, e.g. `presentation.html#1?duration=5&loop-presentation&progress` starts at frame 1, auto-forwards every 5 s, loops at the end and shows the countdown bar.

Available parameters include `duration=<seconds>` (numeric), `loop-presentation`, `progress`, `thumbnails`, `grid`, `properties`, `no-steps`, `editing`, `tagging`, `tag-filter=<id>` (may repeat), `tag-names=<comma-separated>`. Boolean flags like `loop-presentation` may omit a value; `tag-filter` can appear multiple times for multiple tag IDs.
