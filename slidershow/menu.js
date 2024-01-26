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
     *
     * @param {File[]} items
     */
    appendFiles(items) {
        const $section = $("<section/>").appendTo($main)
        const $frames = this.loadFiles(items, $section)

        // Insert frames to the new section of the document and show the controls
        $section.hide(0).append($frames).children().hide(0).parent().show(0)
        this.$start_wrapper.show()
        this.$start.focus()
        this.playback.reset()
        this.start_playback()
        return true
    }

    /**
     * @param {File[]} items
     * @param {?jQuery} $container If set, the default options will be written inside as attributes.
     * @returns {jQuery[]} frames
     */
    loadFiles(items, $container = null) {
        console.log("File items", items) // XX we might use item.size too

        // Process options
        const formData = new FormData($("#defaults")[0])
        const path = formData.get("path") // data-path does not belong to <section>
        formData.delete('path')
        if ($container) {
            [...formData].map(([key, val]) => $container.attr("data-" + key, val))
        }

        // Prepare frames
        const ram_only = !Boolean(path)
        const spin = this.display_progress(items.length, this.$drop)
        return items.map(item =>
            FrameFactory.file(path + item.name, false, item, ram_only, spin))
            .filter(x => !!x)
    }

    /**
     * Make the element importable = able to receive the files being dropped on.
     * @param {jQuery} $el
     * @param {requestCallback} onDrop Called on successful drop.
     * @returns {jQuery}
     * @callback requestCallback
     * @param {jQuery[]} frames Frames not yet inserted into the DOM.
     * @param {HTMLElement} target Element being dropped on.
     */
    importable($el, onDrop) {
        $el.on("drop", e => {
            e.preventDefault()
            e.stopPropagation()
            $(e.currentTarget).removeClass("dragover")
            const items = [...e.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
            const frames = this.loadFiles(items)
            if (frames) {
                console.log(`Dropped ${items.length} files.`)
                onDrop(frames, e.currentTarget) // we should insert them into DOM
            } else {
                this.playback.hud.alert("Drop cancelled")
            }
        }).on("dragover", e => {
            e.preventDefault()
            e.stopPropagation()
            $(e.currentTarget).addClass("dragover")
        }).on("dragleave", e => {
            e.preventDefault()
            e.stopPropagation()
            $(e.currentTarget).removeClass("dragover")
        })
        return $el
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