/**
 * Main menu.
*/
class Menu {
    constructor() {
        this.aux_window = new AuxWindow()
        this.$menu = $("menu").show(0)
        this.$start_wrapper = $("#start-wrapper")
        this.markdown = new showdown.Converter()

        this.$start = $("#start").focus().click(() => this.start_playback())

        /** @type {Playback} */
        const pl = playback = this.playback = new Playback(this, this.aux_window) // expose global `playback`

        this.export = new Export(this)

        // With a presentation loaded, Start is the primary action – keep the append panel folded.
        // With no frames, appending is the only action – unfold it.
        this.$append_panel = $("#append-panel").prop("open", !$(FRAME_SELECTOR).length)

        if (!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
        }

        // Shortcuts available only in menu, not in playback
        this.shortcuts = [] // none right now

        // The splash screen is laid out for a wide desktop window (three side-by-side columns) and is
        // useless clutter on a phone when there is already a presentation to show – skip straight to it.
        // (With no frames yet, the append-files panel is the only thing to do, so the splash stays.)
        const [, paramsPart] = window.location.hash.substring(1).split("?")
        const startFromHash = paramsPart && new URLSearchParams(paramsPart).has("start")
        if (prop("start", $main) || startFromHash || (pl.isMobileMode && $(FRAME_SELECTOR).length)) {
            this.start_playback()
        }

        // Drop new files
        const $drop = this.$drop = $("#drop")
        this.$menu.on("drop", ev => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
            if (this.appendFiles(items)) {
                $drop.text(`Dropped ${items.length} files.`)
            } else {
                $drop.text('Drop failed, try again')
            }
        }).on("dragover", ev => {
            this.$append_panel.prop("open", true) // dragging files in → reveal the drop zone
            $drop.text("Drop anywhere")
            ev.preventDefault()

        }).on("dragleave", ev => {
            $drop.text($drop.data("placeholder"))
            ev.preventDefault()
        })

        // Input files
        const $file = $("#file").change(() => {
            this.appendFiles([...$file[0].files])
        })

        // Quick play-mode buttons – launch straight into auto-forward (or kiosk = auto + loop) without
        // opening the properties panel. They set sli-duration / sli-loop-presentation on <main> (where prop() ends its
        // walk, same as the in-show "Set auto-forward" command and the `duration`/`loop` hash keys), then start.
        $(".play-mode", this.$menu).on("click", e => {
            const $b = $(e.currentTarget)
            $main.attr("sli-duration", Number($b.attr("sli-duration")) || 5)
            if ($b.is("[data-kiosk]")) {
                $main.attr("sli-loop-presentation", "true")
            }
            prop_invalidate()
            this.start_playback()
        })

        this.refresh_summary()
        this.refresh_recent()

        // Presentation name: editable on the splash, prefilled with the current name. Routed through
        // Playback.set_presentation_name (undoable, mirrors to document.title). Only visible once a
        // presentation is loaded (#start-wrapper is hidden otherwise) – naming nothing is pointless.
        this.$presentation_name = $("#presentation-name").val(presentation_name())
            .on("change", e => this.playback.set_presentation_name(String($(e.target).val())))
    }

    /**
     * Min–max photo month (`YYYY-MM`) across the frames' `sli-datetime` (set from EXIF or the file's
     * lastModified), or null when none carry one. Month granularity keeps the splash label compact.
     * @param {JQuery} $frames
     * @returns {?{from: string, to: string}}
     */
    _photo_date_range($frames) {
        const months = $frames.map((_, el) => {
            const dt = String(el.getAttribute("sli-datetime") || $(el).find("[sli-datetime]").attr("sli-datetime") || "")
            return dt ? dt.slice(0, 7) : null // "YYYY-MM", lexicographically sortable
        }).get().filter(Boolean).sort()
        return months.length ? { from: months[0], to: months[months.length - 1] } : null
    }

    /** "2019-06" or "2019-06 – 2019-08" from a `{from, to}` range (empty when null). */
    _format_range(range) {
        return !range ? "" : range.from === range.to ? range.from : `${range.from} – ${range.to}`
    }

    /** Human-readable count of the loaded presentation, so a fresh drop (or a reopened file) is visibly
     * confirmed on the splash instead of a bare Start button. */
    refresh_summary() {
        const $frames = $(FRAME_SELECTOR)
        const $summary = $("#content-summary")
        if (!$frames.length) {
            return $summary.empty()
        }
        const videos = $frames.filter((_, el) => {
            if (el.tagName === "VIDEO" || $(el).find("video").length) {
                return true
            }
            const src = el.getAttribute("sli-src") || $(el).find("[sli-src]").attr("sli-src") || ""
            return VIDEO_EXTENSIONS.includes(src.split(/[?#]/)[0].split(".").pop().toLowerCase())
        }).length
        const sections = $("main section").length
        const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`
        const parts = [plural($frames.length, "frame")]
        if (videos) {
            parts.push(plural(videos, "video"))
        }
        if (sections > 1) {
            parts.push(plural(sections, "section"))
        }
        const range = this._format_range(this._photo_date_range($frames))
        if (range) {
            parts.push(range)
        }
        $summary.text(parts.join(" · "))
    }

    /** localStorage key holding the recent-presentations list (newest first). */
    static get RECENT_KEY() { return "sli:recent" }
    static get RECENT_SESSION_KEY() { return "sli:recent-session" }
    static get RECENT_MAX() { return 8 }

    static _local_storage_available() {
        try {
            const test = "__test__"
            localStorage.setItem(test, test)
            localStorage.removeItem(test)
            return true
        } catch (e) {
            return false
        }
    }

    _recent_load() {
        const list = []
        try {
            const local = JSON.parse(localStorage.getItem(Menu.RECENT_KEY)) || []
            list.push(...local.map(e => ({ ...e, storage: "local" })))
        } catch (e) { /* ignore */ }

        try {
            const session = JSON.parse(sessionStorage.getItem(Menu.RECENT_SESSION_KEY)) || []
            list.push(...session.map(e => ({ ...e, storage: "session" })))
        } catch (e) { /* ignore */ }

        return list.sort((a, b) => new Date(b.time) - new Date(a.time))
    }

    /** Remember the currently loaded presentation so it can be reopened from the splash next time.
     * Keyed by path (hash dropped → reopens clean); no-op when there is nothing loaded. */
    record_recent() {
        const frames = $(FRAME_SELECTOR).length
        if (!frames) {
            return
        }
        const url = location.pathname + location.search
        const range = this._photo_date_range($(FRAME_SELECTOR))
        const entry = {
            url, frames, name: presentation_name() || docname(), time: new Date().toISOString(),
            ...(range && { dateFrom: range.from, dateTo: range.to }),
        }

        // Try localStorage first; fall back to sessionStorage if localStorage unavailable (file://, private mode)
        const useLocal = Menu._local_storage_available()
        const key = useLocal ? Menu.RECENT_KEY : Menu.RECENT_SESSION_KEY
        const storage = useLocal ? localStorage : sessionStorage

        try {
            const list = (JSON.parse(storage.getItem(key)) || []).filter(e => e.url !== url)
            list.unshift(entry)
            storage.setItem(key, JSON.stringify(list.slice(0, Menu.RECENT_MAX)))
        } catch (e) { /* quota or other error – recents are a convenience, ignore */ }
    }

    /** Render the recent-presentations list on the splash. Skips the entry for the current document. */
    refresh_recent() {
        const here = location.pathname + location.search
        const list = this._recent_load().filter(e => e.url && e.url !== here)
        const $panel = $("#recent-panel").empty()
        // Always render the heading (with a muted placeholder when empty) so the feature is discoverable.
        $("<div/>", { class: "recent-title", text: "Recent" }).appendTo($panel)
        if (!list.length) {
            $("<div/>", { class: "recent-empty", text: "Presentations you open show up here" }).appendTo($panel)
            return
        }
        list.forEach(e => {
            const $a = $("<a/>", { href: e.url, title: e.url, text: e.name || e.url })
            if (e.storage === "session") {
                $a.addClass("recent-session-only")
                $("<span/>", { class: "recent-meta", text: "—" }).appendTo($a)
            } else {
                // Older entries predate dateFrom/dateTo – guard, they just show the frame count.
                const range = this._format_range(e.dateFrom ? { from: e.dateFrom, to: e.dateTo } : null)
                const meta = [`${e.frames} frames`, range].filter(Boolean).join(" · ")
                $("<span/>", { class: "recent-meta", text: meta }).appendTo($a)
            }
            $a.appendTo($panel)
        })
    }

    start_playback() {
        this.record_recent() // remember this presentation for the splash's "Recent" list next time
        this.$menu.hide()
        this.playback.start()
        this.shortcuts.forEach(s => s.disable())
    }
    stop_playback() {
        this.playback.stop()
        this.$menu.show()
        this.$start.focus()

        // scroll back
        Playback.resetWindow()
        $main.css({ top: '0px', left: '0px' })

        this.shortcuts.forEach(s => s.enable())
    }

    help() {
        const text = wh.getText().split("\n").join("<br>")
        this.playback.hud.ok("Shortcuts", text)
    }

    clean_playback() { // XX not used right now
        if (this.playback) {
            this.playback.destroy()
            this.playback = playback = null
        }
        $(FRAME_SELECTOR).remove()  // delete old frames
    }

    /**
     * Insert frames to a new section of the document, sets defaults and show the menu controls
     * @param {File[]} items
     * @returns {Boolean} Whether the items were successfully inserted.
     */
    appendFiles(items) {
        if (!items.length) {
            return false
        }
        const $section = this.playback.section_controller.insertNewSection($main)
        const $frames = this.loadFiles(items)

        $section.hide(0).append($frames).children().hide(0).parent().show(0)
        this.$start_wrapper.show()
        this.$start.focus()
        this.playback.reset()
        // Preload eagerly: goToFrame only guarantees the current+following frame synchronously,
        // the rest queue as background tasks that a later navigation can wipe before they run,
        // leaving a newly appended frame blank until the user revisits it.
        $frames.forEach($frame => $frame.data("frame")?.preload())
        this.start_playback()
        return true
    }

    /**
     * @param {File[]} items
     * @returns {JQuery[]} frames
     */
    loadFiles(items) {
        console.log("File items", items) // XX we might use item.size too

        // Prepare frames
        const path = $("#defaults [name=path]").val()
        const ram_only = !Boolean(path)
        const spin = this.display_progress(items.length, this.$drop)
        return items.map(item =>
            FrameFactory.file(path + item.name, false, item, ram_only, spin))
            .filter(x => !!x)
    }

    /**
     * Make the element importable = able to receive the files being dropped on.
     * @param {JQuery} $el
     * @param {onDropCallback} onDrop Called on successful drop.
     * @returns {JQuery}
     * @callback onDropCallback
     * @param {JQuery[]} frames Frames not yet inserted into the DOM.
     * @param {HTMLElement} target Element being dropped on.
     * @param {boolean} before Dragged before or after the element
     */
    importable($el, onDrop) {
        let lastEvent = null
        $el.off("drop dragover dragleave")
            .on("drop", e => {
                const before = clean(e)
                const items = [...e.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
                const frames = this.loadFiles(items)
                if (frames.length) {
                    this.playback.hud.info("Imported: " + frames.length)
                    onDrop(frames, e.currentTarget, before) // we should insert them into DOM
                } else {
                    this.playback.hud.info("Drop failed, try again")
                }
            })
            .on("dragover", e => {
                if (lastEvent && lastEvent.currentTarget !== e.currentTarget) {
                    // since dragleave is not guaranteed to run (FF 146),
                    // "Import here" labels were left hanging on a quick mouse move
                    clean(lastEvent)
                }
                lastEvent = e
                $(e.currentTarget).addClass(`importable-target dragging-target dragging-${clean(e) ? "before" : "after"}`)
            }
            )
        return $el

        function clean(e) {
            e.preventDefault()
            $(e.currentTarget).removeClass("importable-target dragging-target dragging-before dragging-after")
            const rect = e.currentTarget.getBoundingClientRect()
            return e.clientX < rect.left + rect.width / 2
        }
    }

    display_progress(max, $placement = null) {
        const $progress = $("<div/>", { id: "progress" }).insertAfter($placement || "h1").circleProgress({
            value: 0,
            max: max
        })
        let progress = 0
        return (finish = false) => {
            if (finish) {
                progress = max - 1
            }
            $progress.circleProgress("value", ++progress)
            if (progress === max) {
                $progress.fadeOut(2000, () => $progress.remove())
            }
        }
    }

    /**
     * XX This is not used at the moment, I am not able to export CSS due to CORS.
     * @returns
     */
    make_header_offline() {
        return $("script", "head").map((_, el) =>
            $.ajax({
                url: el.src,
                dataType: "text",
            }).then(text => `<script data-url="${el.src}">${text}</script>`
            ).catch(error => console.warn(el.src, error))
        ).get()
        // await Promise.all(head).then(contents => contents.join("\n\n"))
    }

    /**
     * XX Not used at the moment.
     * remove initial space if formatted by the editor
     * The code does not have to be written at line beginnings.
     *          But it can be written
     *          in the middle.
     * @param {*} v
     * @returns
     */
    md(v) {
        const lines = v.split("\n")
        const beginnings = lines.filter(l => l.trim()).map(l => l.match(/^\s+/)?.[0].length || 0)
        const space = Math.min(...(beginnings.length ? beginnings : [0]))
        return this.markdown.makeHtml(lines.map(line => line.substring(space)).join("\n"))
    }

}