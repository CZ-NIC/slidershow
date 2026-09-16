# Embedding (experimental)

!!! warning
    Experimental. Command names prefixed with `_` (`_load`, `_open`) are unstable and may change; `close`/`destroy` are settled. See [the design issue](https://github.com/e3rd/edvard-hub/issues/43) for open questions.

SlideRshow can run inside an `<iframe>` on a foreign page and be driven entirely from the host page via `postMessage`, instead of showing its own splash screen and drag&drop menu. This is meant for embedding a picker or a viewer into another app – the host supplies the photos/videos, and (in picker mode) reads back which ones the user picked.

## Starting the bridge

Add `?embed` to the iframe's `src`. This skips the normal `Menu` splash screen and starts [`EmbedBridge`](https://github.com/CZ-NIC/slidershow/blob/main/slidershow/embed_bridge.js) instead, which listens for commands and posts events back to `window.parent`.

```html
<iframe id="slidershow" src="https://cz-nic.github.io/slidershow/slidershow.html?embed"></iframe>
```

Every message in both directions is an object carrying `sli: true`, so the bridge can tell its own traffic apart from any other `postMessage` traffic on the page:

* host → iframe: `{sli: true, cmd, args}`
* iframe → host: `{sli: true, event, data}`

The bridge learns the host's origin from the **first** command it receives and enforces it on every command after that (a message from a different origin is ignored with a console warning) – except the very first `ready` event, which necessarily goes out with `targetOrigin: "*"` before any origin is known.

## Keyboard focus

A `postMessage` command carries no user gesture, so a fresh iframe never has keyboard focus – arrow keys and hotkeys would silently go to whatever on the host page had focus instead. `_open()` calls `window.focus()` on the iframe to grab it. If you programmatically steal focus back on the host page afterwards (e.g. into a text input), shortcuts stop reaching the iframe until it's focused again – click into it or call `iframe.contentWindow.focus()`.

If you keep the iframe hidden until it's opened (a common pattern for a fullscreen overlay embed), hide it with `opacity: 0; pointer-events: none`, **not** `visibility: hidden` or `display: none`. A `visibility: hidden`/`display: none` element cannot receive focus at all, so the `window.focus()` call above silently no-ops while the iframe is still hidden – by the time you reveal it (e.g. on the `opened` event), nothing retries the focus, and hotkeys stay dead until the user clicks into the iframe manually. `opacity: 0` keeps the iframe focusable while invisible, so the built-in `window.focus()` succeeds on its own.

`Escape` closes the embed (same as sending the `close` command) instead of toggling the normal in-app "☰" menu, which the embed contract keeps hidden – this also applies from inside the grid overview, where Escape first clears any clipboard/selection as usual and only closes on a second press. `Alt+m` ("show splashscreen", which normally stops playback and reopens the full splash/recent-list/drag&drop-upload screen) is a no-op in embed mode for the same reason – that screen has no business appearing inside a foreign page's embed.

## Back button

`_open()` pushes a history entry by default, so the browser's own Back button closes the overlay (firing `closed`, same as the `close` command) instead of navigating the host page away – without this, a fullscreen embed looks to the user like "a whole new page" they can't back out of with the button they'd normally reach for. Closing any other way (Escape, the ✕ icon, a `close` command) consumes that entry with a `history.back()` call of its own, so it never lingers.

This is opt-out, not opt-in (`_open({historyEntry: false})` disables it), so weigh whether it fits your host page before relying on the default: a host that does its own `pushState`-based routing may see its own `popstate` handling fire unexpectedly, and a page embedding several of these iframes at once can stack a Back-press per gallery opened. Repeated `_open()` calls on an already-open iframe (e.g. switching to a different gallery without closing first) never stack a second entry – only the first one 'sticks' until closed.

## Close icon

The top-right icon row (prev/next/grid) grows its own ✕ close icon while embedded, wired to the same `close()` the `Escape` key sends. There's no need to draw a custom close button on the host page over the iframe.

## Commands

| Command  | Args                                                          | Effect |
|----------|----------------------------------------------------------------|--------|
| `_load`  | `{photos: [{id, src, thumb?, type?, caption?}]}`                 | Replaces the whole presentation. `type` is `"image"` or `"video"`, guessed from the extension when omitted. `caption`, if given, shows as a bottom-center overlay while that photo is on screen (see [Captions](#captions)). |
| `_open`  | `{mode?: "view"\|"picker", startIndex?: number, grid?: boolean, hints?: boolean, fileInfo?: boolean, historyEntry?: boolean, captions?: boolean}` | Shows the overlay and starts playback (skipping the splash screen). `grid: true` opens straight into the grid overview instead of the single-frame view. `hints: true` re-enables the grid's empty-selection hint bar (off by default in embeds, see below). `fileInfo: true` re-enables the filename/GPS/device/datetime/tag overlay (also off by default; still toggleable by hand with the "i" hotkey once open). `historyEntry: false` opts out of the [Back button](#back-button) history entry (on by default). `captions: false` opts out of showing `photo.caption` (on by default, see [Captions](#captions)). |
| `close`  | –                                                                | Hides the overlay. In picker mode, reports back the selection (see below). |
| `destroy`| –                                                                | Detaches the bridge's `message` listener. |

## Events

| Event       | Data                              | When |
|-------------|------------------------------------|------|
| `ready`     | –                                  | Once, right after the bridge attaches – the earliest point at which the host may send commands. |
| `opened`    | –                                  | After `_open` finishes. |
| `closed`    | –                                  | After `close()` in view mode. |
| `confirmed` | `{selected: [{id, tags}]}`          | After `close()` in picker mode. |
| `error`     | `{message}`                        | A command handler threw. |

## Captions

Pass `caption` alongside `id`/`src` in `_load`'s `photos` to show a bottom-center overlay (`#hud-caption`) while that photo is on screen - meant for a title/description the host page already has (ex. a WordPress attachment's caption field), unlike `fileInfo`'s EXIF-ish metadata. On by default (opt-out via `_open({captions: false})`), since unlike `fileInfo` it's public-facing content the host presumably wants seen, not debug-ish metadata. A photo with no `caption` simply shows nothing (`#hud-caption` collapses to zero height when empty).

## Grid hint bar

The grid overview normally shows a faint always-there bar teaching the multi-select affordance ("Select frames — Shift/Ctrl-click or drag a box, or Space") whenever nothing is selected. It's off by default in embeds – a foreign page embedding a viewer/picker has no use for a hint that teaches an editing affordance – pass `_open({hints: true})` to bring it back.

## Picker mode

In picker mode (`_open({mode: "picker"})`), the user marks photos while browsing normally – pressing the digit key `1` (or toggling it from the grid overview) tags the current frame. `close()` reads back every frame carrying tag `1` as the selection; there is no dedicated "select" affordance or "confirm" button yet, tag `1` is simply overloaded for this first version.

## Full example

```html
<!DOCTYPE html>
<html>
<body>
  <iframe id="f" src="https://cz-nic.github.io/slidershow/slidershow.html?embed"></iframe>

  <script>
    const frame = document.getElementById("f").contentWindow
    const HOST_ORIGIN = "https://cz-nic.github.io" // the iframe's own origin

    function send(cmd, args) {
      frame.postMessage({ sli: true, cmd, args }, HOST_ORIGIN)
    }

    window.addEventListener("message", (e) => {
      if (e.origin !== HOST_ORIGIN || !e.data?.sli) return
      const { event, data } = e.data

      if (event === "ready") {
        // load photos, then open the picker
        send("_load", {
          photos: [
            { id: "1", src: "https://example.com/holiday-1.jpg" },
            { id: "2", src: "https://example.com/holiday-2.jpg" },
            { id: "3", src: "https://example.com/clip.mp4", type: "video" },
          ],
        })
        send("_open", { mode: "picker" })
      }

      if (event === "confirmed") {
        console.log("User picked:", data.selected) // [{id: "2", tags: [1]}, ...]
      }
    })
  </script>
</body>
</html>
```

See [`tests/embed.spec.js`](https://github.com/CZ-NIC/slidershow/blob/main/tests/embed.spec.js) and [`tests/fixtures/embed-host.html`](https://github.com/CZ-NIC/slidershow/blob/main/tests/fixtures/embed-host.html) for a runnable, minimal host page.
