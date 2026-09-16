/**
 * Experimental bridge for embedding slidershow in an iframe on a foreign page — receives commands via
 * `postMessage` and reports back playback/picker events. Started only with `?embed` in the URL (see
 * `main()` in launch.js), mirroring how `?controller=` starts an AuxWindow instead of the normal Menu.
 *
 * Command names are prefixed with `_` while still unstable (`_load`, `_open`); `close`/`destroy` are
 * settled. See https://github.com/e3rd/edvard-hub/issues/43 for the design and open questions.
 */
class EmbedBridge {
    /** @param {Menu} menu */
    constructor(menu) {
        this.menu = menu
        this.playback = menu.playback
        /** @type {boolean} Whether the current/last `_open` asked for picker mode (read back by close()). */
        this.pickerMode = false
        /** @type {boolean} Whether the current/last `_open` asked to show the grid's empty-selection hint
         * bar (see `Hud.refresh_selection_info`) – off by default, embeds are not meant to teach
         * multi-select. */
        this.showHints = false
        /** @type {boolean} Whether `_open` has pushed a history entry still waiting to be consumed by
         * `close()`/`_onPopstate()`. */
        this._historyPushed = false
        /** @type {?string} Origin of the hosting page – learned from its first command, then enforced on
         * every later one. An embedded page cannot know in advance which foreign site will load it, so
         * there is nothing to check the very first message against. */
        this.origin = null
        this._onMessage = this._onMessage.bind(this)
        this._onPopstate = this._onPopstate.bind(this)
        window.addEventListener("message", this._onMessage)
        // The readiness handshake carries nothing sensitive, so it may go out before the host's origin is
        // known; every reply after that is scoped to the origin learned from the host's first command.
        this._post("ready", {}, "*")
    }

    /** @param {MessageEvent} e */
    _onMessage(e) {
        const msg = e.data
        if (!msg || msg.sli !== true || typeof msg.cmd !== "string") {
            return // not meant for us – a host page carries plenty of unrelated postMessage traffic
        }
        if (this.origin === null) {
            this.origin = e.origin
        } else if (e.origin !== this.origin) {
            console.warn("EmbedBridge: ignoring command from unexpected origin", e.origin)
            return
        }
        try {
            switch (msg.cmd) {
                case "_load": return this._load(msg.args)
                case "_open": return this._open(msg.args)
                case "close": return this.close()
                case "destroy": return this.destroy()
                default: console.warn("EmbedBridge: unknown command", msg.cmd)
            }
        } catch (err) {
            this._post("error", { message: String(err?.message ?? err) })
        }
    }

    /**
     * Replace the whole presentation with the given photos/videos. Building frames straight from a URL
     * (no `File`, see `FrameFactory.img`/`.video`) skips the drag&drop-only EXIF/RAM-reading path entirely.
     * @param {{photos: {id:string, src:string, thumb?:string, type?: "image"|"video", caption?:string}[]}} args
     */
    _load(args) {
        const photos = args?.photos
        if (!Array.isArray(photos)) {
            throw new TypeError("_load requires { photos: [...] }")
        }
        $(FRAME_SELECTOR).remove()
        for (const photo of photos) {
            const type = photo.type || EmbedBridge._guessType(photo.src)
            // FrameFactory.img() calls back synchronously when given no File data (no EXIF to await).
            const $frame = type === "video" ? FrameFactory.video(photo.src) : FrameFactory.img(photo.src, true, null, false, () => { })
            $frame.data("embed-id", photo.id)
            if (photo.thumb) {
                $frame.find("img,video").attr("sli-thumb", photo.thumb)
            }
            if (photo.caption) {
                // Read back by Hud.file_info() via frame.$frame.data("embed-caption") - stashed the same
                // way as embed-id above, there being no generic per-frame metadata store outside jQuery's
                // own data bag on the frame's wrapper element.
                $frame.data("embed-caption", photo.caption)
            }
        }
        this.playback.reset()
        // reset() repositions onto whatever frame/index was current before - meaningless once the whole
        // photo set has just been replaced (ex. the host switching from one gallery to another reused
        // this same iframe), so land back on the first frame instead of wherever the old gallery left off.
        if (photos.length) {
            this.playback.goToFrame(0)
        }
        this.menu.refresh_summary()
    }

    /**
     * Show the overlay. "picker" mode just remembers itself for close() – which frames count as "picked"
     * is answered there, by tag 1 (see close()'s doc comment).
     * @param {{mode?: "view"|"picker", startIndex?: number, grid?: boolean, hints?: boolean,
     *          fileInfo?: boolean, historyEntry?: boolean, captions?: boolean}} [options]
     */
    _open(options = {}) {
        this.pickerMode = options.mode === "picker"
        // The grid's empty-selection hint bar (Hud.refresh_selection_info) is off by default in embeds –
        // it teaches an editing affordance (multi-select) that a foreign page embedding a viewer/picker
        // has no use for.
        this.showHints = options.hints === true
        // #hud-fileinfo (filename/GPS/device/datetime/tag) is off by default too – a foreign page's
        // viewer/picker rarely wants EXIF-ish metadata surfaced over the photo. Still toggleable by hand
        // via the "i" hotkey once open, same as outside embed mode.
        $("#hud-fileinfo").toggle(options.fileInfo === true)
        // #hud-caption (photo.caption passed to _load, see Hud.file_info) is the opposite: it's a
        // public-facing title/description meant to be seen, not EXIF-ish metadata, so it's opt-out
        // rather than opt-in - pass `_open({captions: false})` to suppress it.
        $("#hud-caption").toggle(options.captions !== false)
        this.menu.start_playback()
        if (Number.isInteger(options.startIndex)) {
            this.playback.goToFrame(options.startIndex)
        }
        // toggle_grid() is a real toggle - calling it unconditionally would close the grid instead of
        // opening it whenever it was already left open from a previous _open() on this same iframe.
        if (options.grid !== undefined && options.grid !== this.playback.hud.grid_visible) {
            this.playback.hud.toggle_grid()
        }
        // Push a history entry so the browser's Back button closes the overlay instead of navigating the
        // host page away – a fullscreen embed otherwise looks to the user like "a whole new page" they
        // can't back out of. On by default (opt-out via `historyEntry: false`): a host with its own
        // pushState-based routing, or a page embedding several of these on one page, may want to disable
        // it and manage Back itself instead. Guarded by `_historyPushed` so a repeated `_open()` on an
        // already-open iframe (ex. the host swapping to a different gallery without closing first) never
        // stacks a second entry.
        if (!this._historyPushed && options.historyEntry !== false) {
            history.pushState({ sliEmbedOpen: true }, "", location.href)
            this._historyPushed = true
            window.addEventListener("popstate", this._onPopstate)
        }
        // A command arriving over postMessage carries no user gesture, so keyboard focus is still
        // wherever it was on the host page – arrow keys/hotkeys would silently go there instead of to
        // us. window.focus() pulls it into this iframe's own document.
        window.focus()
        this._post("opened")
    }

    /** The browser's own Back button was pressed while our pushed history entry was on top – treat it
     * exactly like an incoming `close()` command. The entry is already consumed by this navigation, so
     * `close()` must not also call `history.back()` for it – hence clearing `_historyPushed` first. */
    _onPopstate() {
        if (!this._historyPushed) {
            return
        }
        this._historyPushed = false
        window.removeEventListener("popstate", this._onPopstate)
        this.close()
    }

    /**
     * Hide the overlay. In picker mode, reports back every frame carrying tag 1 – the picker's one and
     * only "selected" marker for this first version (digit key 1 / the grid's tag-selection toggles it).
     * A richer selection UI (dedicated tag names, a "confirm" affordance separate from closing) is an open
     * question left for a follow-up – see the GH issue.
     */
    close() {
        if (this._historyPushed) {
            // Closed via Escape/✕/host command rather than the browser's own Back button – the pushed
            // entry is still sitting on top of history and would otherwise linger there.
            this._historyPushed = false
            window.removeEventListener("popstate", this._onPopstate)
            history.back()
        }
        this.menu.stop_playback()
        if (this.pickerMode) {
            const selected = this._embedFrames()
                .filter(({ frame }) => frame?.get_tags().includes(1))
                .map(({ id, frame }) => ({ id, tags: frame.get_tags() }))
            this._post("confirmed", { selected })
        } else {
            this._post("closed")
        }
    }

    destroy() {
        window.removeEventListener("message", this._onMessage)
        if (this._historyPushed) {
            window.removeEventListener("popstate", this._onPopstate)
            this._historyPushed = false
        }
    }

    /** @returns {{id: *, frame: Frame}[]} Frames built by _load(), paired with the host's own id. */
    _embedFrames() {
        return $(FRAME_SELECTOR).toArray()
            .map(el => ({ id: $(el).data("embed-id"), frame: $(el).data("frame") }))
            .filter(({ id }) => id !== undefined)
    }

    /**
     * @param {string} event
     * @param {object} [data]
     * @param {?string} [targetOrigin] Defaults to the learned host origin; pass "*" only for the initial
     * "ready" handshake, before any origin is known.
     */
    _post(event, data = {}, targetOrigin = null) {
        if (window.parent === window) {
            return // not actually embedded (ex. opened directly while developing)
        }
        const origin = targetOrigin ?? this.origin
        if (!origin) {
            return // no host has spoken to us yet – nothing to reply to
        }
        // An opaque origin (file://, a sandboxed host iframe) serializes to the literal string "null",
        // which postMessage rejects as a target origin outright – there is no narrower origin to send to.
        window.parent.postMessage({ sli: true, event, data }, origin === "null" ? "*" : origin)
    }

    /**
     * Report the grid's current multi-selection to the host, keyed by the host's own ids (as passed to
     * `_load`). Called by GridController whenever its selection changes – see grid.js's
     * `_syncSelectionClass()`.
     * @param {*[]} ids
     */
    notifySelection(ids) {
        this._post("selectionChanged", { ids })
    }

    /** @param {string} src @returns {"image"|"video"} */
    static _guessType(src) {
        const ext = String(src).split(/[?#]/)[0].split(".").pop().toLowerCase()
        return VIDEO_EXTENSIONS.includes(ext) ? "video" : "image"
    }
}
