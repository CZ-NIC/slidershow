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
        playback = this.playback = new Playback(this, this.aux_window) // expose global `playback`
        this.export = new Export(this)

        if (!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
        }

        // Global shortcuts
        this.global_shortcuts = wh.group("Global", [
            ["Alt+w", "Launch an auxiliary window", () => this.aux_window.open()],
            ["Escape", "Go to menu", () => !$(":focus").closest(".ZebraDialog").length && this.stop_playback()], // disabled when in a dialog
            ["?", "Show help", () => this.help()],
            ["Ctrl+s", "Export presentation", () => this.export.export_dialog()],
        ])

        // Shortcuts available only in menu, not in playback
        this.shortcuts = []

        if (prop("start", $main)) {
            this.start_playback()
        }

        // Drop new files
        const $drop = this.$drop = $("#drop").on("drop", (ev) => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile())
            if (this.appendFiles(items)) {
                $drop.text(`Dropped ${items.length} files.`)
            } else {
                $drop.text('Drop cancelled')
            }
        }).on("dragover", (ev) => {
            $drop.text("Drop")
            ev.preventDefault()

        }).on("dragleave", (ev) => {
            $drop.text($drop.data("placeholder"))
            ev.preventDefault()
        })

        // Input files
        const $file = $("#file").change(() => {
            this.appendFiles([...$file[0].files])
        })

        // The button in hud menu. (The UX might be done much better.)
        $(document)
            .on("click", "#hud-menu [data-role=export]", () => this.export.export_dialog())
            .on("click", "#hud-menu [data-role=help]", () => this.help())
            .on("click", "#hud-menu [data-role=aux_window]", () => this.aux_window.open())
            .on("click", "#hud-menu [data-role=thumbnails]", () => this.playback.hud.toggle_thumbnails())
            .on("click", "#hud-menu [data-role=steps]", () => this.playback.toggle_steps())
            .on("click", "#hud-menu [data-role=properties]", () => this.playback.hud.toggle_properties())
            .on("click", "#hud-menu [data-role=tagging]", () => this.playback.hud.alert("Hit Alt+T while presenting to start tagging mode."))

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

    appendFiles(items) {
        console.log("File items", items) // XX we might use item.size too

        const $section = $("<section/>").appendTo($main)
        const formData = new FormData($("#defaults")[0])
        const path = formData.get("path") // data-path does not belong to <section>
        formData.delete('path');
        [...formData].map(([key, val]) => $section.attr("data-" + key, val))

        const ram_only = !Boolean(path)
        const spin = this.display_progress(items.length, this.$drop)

        const elements = items.map(item =>
            FrameFactory.file(path + item.name, false, item, ram_only, spin))
            .filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        this.$start_wrapper.show()
        this.$start.focus()
        this.playback.reset()
        return true
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
}