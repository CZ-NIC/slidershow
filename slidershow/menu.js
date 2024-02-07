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

        if (!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
        }

        // Shortcuts available only in menu, not in playback
        this.shortcuts = [] // none right now

        if (prop("start", $main)) {
            this.start_playback()
        }

        // Drop new files
        const $drop = this.$drop = $("#drop").on("drop", ev => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
            if (this.appendFiles(items)) {
                $drop.text(`Dropped ${items.length} files.`)
            } else {
                $drop.text('Drop cancelled')
            }
        }).on("dragover", ev => {
            $drop.text("Drop")
            ev.preventDefault()

        }).on("dragleave", ev => {
            $drop.text($drop.data("placeholder"))
            ev.preventDefault()
        })

        // Input files
        const $file = $("#file").change(() => {
            this.appendFiles([...$file[0].files])
        })

        // ShortcutsController.global(this)

        // Load defaults from the main tag
        $("input", "#defaults").each(function () {
            const $el = $(this)
            const def = $main.data($el.attr("name"))
            if (def) {
                $el.val(def)
            }
        })
    }

    start_playback() {
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
     */
    appendFiles(items) {
        const $section = this.playback.operation.insertNewSection()
        const $frames = this.loadFiles(items)

        $section.hide(0).append($frames).children().hide(0).parent().show(0)
        this.$start_wrapper.show()
        this.$start.focus()
        this.playback.reset()
        this.start_playback()
        return true
    }

    /**
     * @param {File[]} items
     * @returns {jQuery[]} frames
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
     * @param {jQuery} $el
     * @param {onDropCallback} onDrop Called on successful drop.
     * @returns {jQuery}
     * @callback onDropCallback
     * @param {jQuery[]} frames Frames not yet inserted into the DOM.
     * @param {HTMLElement} target Element being dropped on.
     * @param {boolean} before Dragged before or after the element
     */
    importable($el, onDrop) {
        $el.off("drop dragover dragleave")
            .on("drop", e => {
                const before = clean(e)
                const items = [...e.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
                const frames = this.loadFiles(items)
                if (frames.length) {
                    onDrop(frames, e.currentTarget, before) // we should insert them into DOM
                } else {
                    this.playback.hud.info("Drop cancelled")
                }
            }).on("dragover", e => $(e.currentTarget).addClass(`importable-target dragging-target dragging-${clean(e) ? "before" : "after"}`)
            ).on("dragleave", e => {
                clean(e)
            })
        return $el

        function clean(e) {
            e.preventDefault()
            e.stopPropagation()
            $(e.currentTarget).removeClass("importable-target dragging-target dragging-before dragging-after")
            return e.offsetX < e.target.offsetWidth / 2
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