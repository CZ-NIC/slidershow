/**
 * Main menu.
*/
class Menu {
    constructor() {
        this.aux_window = new AuxWindow()
        this.$menu = $("menu").show(0)
        this.$start_wrapper = $("#start-wrapper")

        this.$start = $("#start").focus().click(() => this.start_playback())

        playback = this.playback = new Playback(this.aux_window) // expose global `playback`


        if (!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
        }

        // Global shortcuts
        wh.pressAlt(KEY.W, "Controlling window", () => this.aux_window.open())
        wh.press(KEY.ESCAPE, "Go to menu", () => !$(":focus").closest(".ZebraDialog").length && this.stop_playback()) // disable when in a dialog
        wh.press(KEY.H, "Show help", () => this.help())
        wh.pressCtrl(KEY.S, "Export presentation", () => this.export_dialog())

        // Shortcuts available only in menu, not in playback
        this.shortcuts = []

        if (prop("start", false, $main)) {
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

        $("[data-role=export]").on("click", () => this.export_dialog())
        $("[data-role=help]").on("click", () => this.help())
        $("[data-role=aux_window]").on("click", () => this.aux_window.open())
        $("[data-role=tagging]").on("click", () => this.playback.hud.alert("Hit Alt+T while presenting to start tagging mode."))

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
        const text = wh.get_info_pairs().map(([shortcut, method]) => shortcut + ": " + method.hint).join("<br>") + "<br><br>Hit H while presenting too see more help."
        new $.Zebra_Dialog(text, { type: "information", title: "Shortcuts" })
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
        $("#progress").remove()
        const $progress = $("<div/>", { id: "progress" }).insertAfter($placement || "h1").circleProgress({
            value: 0,
            max: max
        })
        let progress = 0
        return () => {
            $progress.circleProgress("value", ++progress)
            if (progress === max) {
                $("#progress").fadeOut(2000)
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

    export_dialog() {
        new $.Zebra_Dialog("Will you put the presentation file to the media folder?", {
            type: "question",
            title: "Export",
            buttons: [{ caption: "Same folder (tiny presentation size)", callback: () => this.export() }, {
                caption: "Another folder (tiny presentation size)", callback: () =>
                    new $.Zebra_Dialog("Where will the presentation find the media folder?", {
                        title: "The path to the media folder",
                        default_value: $main.attr("data-path") || "./",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, path) => $main.attr("data-path", path) && this.export(false, path)
                        }]
                    })
            }, {
                // XX estimate the size and how many photos could not be packed (not being dropped previously)
                // XX fix: if imported with a path, those file will not be exported with src=data
                caption: "Pack into one file (huge RAM + disk demand)", callback: () => this.export(true)
            }]
        })
    }

    async export(compact_file = false, path = "") {
        const $contents = $($main.prop('outerHTML'))

        // reduce parameters
        $contents.removeAttr("style")
        $contents.find("*").removeAttr("style")
        await Frame.finalize_frames($contents, this.playback.$articles, compact_file, path, this.display_progress(this.playback.$articles.length))

        const html = $contents.prop("outerHTML")
        if (!html.length) {
            this.playback.hud.alert("Cannot export a single file – too big.")
        }
        const data = `<html>\n<head><meta charset="UTF-8">
<script src="${DIR}slidershow.js"></script>
</head>\n<body>` + html + "\n</body>\n</html>"
        const blob = new Blob([data.replaceAll(EXPORT_SRC, "src")], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "slidershow.html"
        document.body.appendChild(link)
        link.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(link)
    }
}