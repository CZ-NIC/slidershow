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
        this.$menu.on("drop", async ev => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
            if (await this.appendFiles(items)) {
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

        // "Group by" for imports: which criterion a drop is split into sections by. A personal habit of
        // this browser (it applies to every presentation opened here), not a property of a presentation –
        // hence pref_get/pref_set instead of an sli-* attribute. The resulting sections of course are
        // part of the presentation.
        const stored = pref_get(Menu.GROUP_BY_KEY, "")
        this.$group_by = $("#group-by").val(stored)
            .on("change", e => pref_set(Menu.GROUP_BY_KEY, String($(e.target).val())))
        if (String(this.$group_by.val() ?? "") !== stored) {
            this.$group_by.val("") // a stored value no longer offered (ex. an older version's key)
        }

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

    /** localStorage key of the import "Group by" criterion – a per-browser preference, see the constructor. */
    static get GROUP_BY_KEY() { return "sli:import-group-by" }

    /** @type {string[]} Criteria (`GroupCriterion`s) whose group key is known from the `File` alone (folder, or the
     * date of its `lastModified`). They need no EXIF, so the items can be sorted before a single frame is
     * built and the sections come out finished in one pass. Everything else (Camera, an exact date) has to
     * wait for the asynchronous EXIF reads – see `_regroup_when_settled()`. */
    static get SYNC_GROUP_CRITERIA() { return ["folder", "days", "months", "years"] }

    /** @returns {GroupCriterion|""} The chosen import grouping criterion, "" for none. */
    group_criterion() {
        return /** @type {GroupCriterion|""} */ (String(this.$group_by?.val() || ""))
    }

    /**
     * Insert frames to a new section of the document, sets defaults and show the menu controls
     * @param {File[]} items
     * @returns {Promise<Boolean>} Whether the items were successfully inserted.
     */
    async appendFiles(items) {
        if (!items.length) {
            return false
        }
        const criterion = this.group_criterion()
        const $frames = await this.loadFiles(items, criterion)
        if (!$frames.length) { // nothing usable in the drop
            return false
        }
        const settled = this.last_import_settled

        if ($frames.some($frame => $frame.data("group-key"))) {
            // The criterion was resolvable from the files themselves – the frames come back already
            // ordered by their key, so they only have to be handed to the right sections.
            this._append_grouped($frames)
        } else {
            const $section = this.playback.section_controller.insertNewSection($main)
            $section.hide(0).append($frames).children().hide(0).parent().show(0)
        }
        this.$start_wrapper.show()
        this.$start.focus()
        this.playback.reset()
        // Preload eagerly: goToFrame only guarantees the current+following frame synchronously,
        // the rest queue as background tasks that a later navigation can wipe before they run,
        // leaving a newly appended frame blank until the user revisits it.
        // Only the preload window though – anything further would be unloaded by the very next goToFrame
        // anyway, while a bulk import (thousands of files) would meanwhile exhaust the memory.
        $frames.slice(0, PRELOAD_FORWARD).forEach($frame => $frame.data("frame")?.preload())
        this.start_playback()
        if (criterion && criterion !== "folder") { // a folder never changes once EXIF lands
            this._regroup_when_settled(criterion, $frames, settled) // deliberately not awaited
        }
        return true
    }

    /**
     * Hand freshly built frames over to one <section> per group key (`data("group-key")`, set by
     * `loadFiles()` for the synchronous criteria). Sections are reused by `sli-name`, exactly like a
     * regroup does, so importing the same folder twice does not create a second section for it. The
     * frames arrive sorted by key, hence one ordered pass and one `append()` per section – no frame or
     * section is ever moved afterwards (that shuffling is what used to freeze big regroups).
     * @param {JQuery[]} frames
     */
    _append_grouped(frames) {
        const sc = this.playback.section_controller
        /** @type {Map<string, JQuery>} Sections at this level by their key, kept up to date below. */
        const sections = new Map(sc.getDirectSections($main).toArray()
            .filter(el => el.hasAttribute("sli-name"))
            .map(el => [String(el.getAttribute("sli-name")), $(el)]))
        /** @type {Map<JQuery, JQuery[]>} */
        const batches = new Map()
        /** @type {?JQuery} Catch-all for the files that yielded no key (ex. a photo with no lastModified),
         * the same one a regroup reuses. */
        let $loose = sc.getDirectSections($main).filter("[sli-untagged]").first()

        frames.forEach($frame => {
            const key = String($frame.data("group-key") || "")
            let $section = key ? sections.get(key) : ($loose.length ? $loose : null)
            if (!$section) {
                $section = sc.insertNewSection($main)
                if (key) {
                    $section.attr({ "sli-name": key, "sli-title": key })
                    sections.set(key, $section)
                } else {
                    $section.attr({ "sli-untagged": "", "sli-title": "untagged" })
                    $loose = $section
                }
            }
            const batch = batches.get($section)
            batch ? batch.push($frame) : batches.set($section, [$frame])
        })

        batches.forEach((batch, $section) => {
            batch.forEach($frame => $frame.hide(0)) // shown when navigated to, see Frame.prepare()
            $section.hide(0).append(batch).show(0)
        })
    }

    /**
     * Group an import by a criterion only the EXIF can answer (Camera, an exact date) – ONCE, when the
     * whole batch has settled. Regrouping per file as the reads trickle in would re-shuffle the DOM
     * hundreds of times mid-import, so the presentation jumps at most once instead.
     * For a criterion already applied at import time from `lastModified`, the regroup runs only when the
     * EXIF actually moved a frame to another day/month/year – otherwise nothing happens at all, not even
     * an undo entry.
     * @param {GroupCriterion} criterion
     * @param {JQuery[]} frames
     * @param {Promise} settled Resolves once every frame of the batch reported its EXIF read done.
     */
    async _regroup_when_settled(criterion, frames, settled) {
        await settled
        // Only the frames still in the document – the import may have been undone meanwhile.
        const $frames = $(frames.map($frame => $frame[0]).filter(el => el.isConnected))
        if (!$frames.length) {
            return
        }
        if (Menu.SYNC_GROUP_CRITERIA.includes(criterion) && !this._grouping_stale(criterion, $frames)) {
            return
        }
        this.playback.section_controller.group(criterion, $frames)
        this.playback.hud.info(`Grouped ${$frames.length} frames by ${criterion}`)
    }

    /**
     * @param {GroupCriterion} criterion
     * @param {JQuery} $frames
     * @returns {boolean} Whether any frame's group key – now that the EXIF has landed – differs from the
     * section it was imported into (ex. a photo whose DateTimeOriginal falls on another day than the
     * file's lastModified).
     */
    _grouping_stale(criterion, $frames) {
        const sc = this.playback.section_controller
        return $frames.toArray().some(el => {
            const key = String(sc.groupKey(criterion, $(el).data("frame")).name ?? "")
            return key !== String($(el).closest("section").attr("sli-name") ?? "")
        })
    }

    /**
     * Group keys known without touching the EXIF – the containing folder (`webkitRelativePath`, present
     * only when a whole folder was dropped) or the file's own `lastModified`.
     * @param {File[]} items
     * @param {?GroupCriterion|""} criterion
     * @returns {?string[]} A key per item (aligned with `items`, "" where the file yields none), or null
     * when the criterion needs the EXIF (Camera, an exact date), is none, or when not a single item
     * yields a key (ex. grouping by folder in a plain multi-file drop) – then the import stays ungrouped.
     */
    sync_group_keys(items, criterion) {
        if (!Menu.SYNC_GROUP_CRITERIA.includes(criterion)) {
            return null
        }
        const keys = items.map(item => criterion === "folder"
            ? Menu.item_folder(item)
            : (item.lastModified
                ? this.playback.section_controller._toGroupKey(item.lastModified,
                    /** @type {"days"|"months"|"years"} */(criterion))
                : ""))
        return keys.some(Boolean) ? keys : null
    }

    /**
     * @param {File} item
     * @returns {string} The folder a dropped file came from – the last directory of its
     * `webkitRelativePath` (set by the browser for a folder drop / directory picker only), "" otherwise.
     */
    static item_folder(item) {
        return String(item.webkitRelativePath || "").split("/").slice(0, -1).pop() || ""
    }

    /**
     * Track when a whole import batch has finished its asynchronous EXIF reads: each file reports exactly
     * once through the `FrameFactory.file()` callback. A failed read stays silent in exif-js, so besides
     * counting we also give up after `EXIF_TIMEOUT` of complete silence – the Semaphore in `Frame.exif()`
     * guarantees the next read starts within that window, so a longer gap means nothing else is coming.
     * @param {number} count Files in the batch.
     * @returns {{done: function, promise: Promise<void>}}
     */
    _settle_tracker(count) {
        let pending = count
        /** @type {function} */
        let resolve
        const promise = new Promise(r => resolve = r)
        let timer = null
        const finish = () => {
            clearTimeout(timer)
            resolve()
        }
        const wait = () => {
            clearTimeout(timer)
            timer = setTimeout(finish, EXIF_TIMEOUT)
        }
        pending ? wait() : finish()
        return { done: () => --pending > 0 ? wait() : finish(), promise }
    }

    /**
     * @param {File[]} items
     * @param {?GroupCriterion|""} criterion Import grouping criterion. For the synchronous ones
     * (`Menu.SYNC_GROUP_CRITERIA`) the items are sorted by their group key before a single frame is built,
     * so the sections can be filled in one ordered pass; every frame then carries its key in
     * `data("group-key")`.
     * @returns {Promise<JQuery[]>} frames, in the order they should be inserted. Sets
     * `this.last_import_settled` (always the most recent batch), resolving once every frame of this batch
     * reported its EXIF read done (or timed out) – the moment an EXIF-dependent regroup may run.
     */
    async loadFiles(items, criterion = null) {
        console.log("File items", items)

        const spin = this.display_progress(items.length, this.$drop)
        document.body.classList.add("importing")
        // A huge import (thousands of files) builds every Frame synchronously below – nothing else
        // on the page can run meanwhile, so a small corner spinner is easy to miss and looks like the
        // tab just hung. A full-screen banner makes the freeze itself the visible feedback instead of
        // something to be surprised by.
        const $banner = $("<div/>", { id: "import-banner", text: `Importing ${items.length} files…` }).appendTo(document.body)
        // Give the browser a chance to paint the banner/spinner/cursor before the heavy work starts.
        await new Promise(resolve => setTimeout(resolve))

        // Prepare frames
        const path = $("#defaults [name=path]").val()
        const ram_only = !Boolean(path)
        /** @type {?string[]} */
        const keys = this.sync_group_keys(items, criterion)
        /** Stable sort by the group key: the frames are then built – and appended – already grouped, so
         * not a single section has to be moved around afterwards. */
        const order = items.map((_, i) => i)
        if (keys) {
            order.sort((a, b) => keys[a].localeCompare(keys[b]) || a - b)
        }
        const settle = this._settle_tracker(items.length)
        this.last_import_settled = settle.promise
        const frames = order.map(i => {
            const item = items[i]
            const $frame = FrameFactory.file(path + item.name, false, item, ram_only, () => {
                spin()
                settle.done()
            })
            if (!$frame) {
                return null
            }
            // Remember which folder the file came from (the frame's filename keeps no path) – so a later
            // "regroup by folder" still works, and not only for the import that asked for it.
            const folder = Menu.item_folder(item)
            if (folder) {
                $frame.attr("sli-folder", folder)
            }
            return keys ? $frame.data("group-key", keys[i]) : $frame
        }).filter(x => !!x)
        $banner.remove()
        document.body.classList.remove("importing")
        return frames
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
            .on("drop", async e => {
                const before = clean(e)
                const items = [...e.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
                const frames = await this.loadFiles(items)
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
            max: max,
            textFormat: "percent" // "value/max" overflows the circle once max reaches the thousands
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