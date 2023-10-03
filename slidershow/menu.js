/**
 * Main menu.
*/
class Menu {
    constructor() {
        this.aux_window = new AuxWindow()
        this.$menu = $("menu").show(0)
        this.$start_wrapper = $("#start-wrapper")

        this.$start = $("#start").focus().click(() => this.start_playback())

        /** @type {Playback} */
        playback = this.playback = new Playback(this.aux_window) // expose global `playback`

        if (!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
        }

        // Global shortcuts
        wh.pressAlt(KEY.W, "Launch an auxiliary window", () => this.aux_window.open())
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

        // The button in hud menu. (The UX might be done much better.)
        $(document)
            .on("click", "#hud-menu [data-role=export]", () => this.export_dialog())
            .on("click", "#hud-menu [data-role=help]", () => this.help())
            .on("click", "#hud-menu [data-role=aux_window]", () => this.aux_window.open())
            .on("click", "#hud-menu [data-role=thumbnails]", () => this.playback.hud.toggle_thumbnails())
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
        const $progress = $("<div/>", { id: "progress" }).insertAfter($placement || "h1").circleProgress({
            value: 0,
            max: max
        })
        let progress = 0
        return (finish=false) => {
            if(finish) {
                progress = max-1
            }
            $progress.circleProgress("value", ++progress)
            if (progress === max) {
                $progress.fadeOut(2000, ()=>$progress.remove())
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
        // Why to wrap the body inside a div? jQuery seems to handle such fundamental tags differently.
        // We end up with a collection of body children, not with the body itself.
        const $contents = $("<div>" + $("body").prop('outerHTML') + "</div>")

        // reduce parameters
        $contents.removeAttr("style")
        $contents.find("*").removeAttr("style")
        $contents.find("> #map, > #map-hud, > #map-wrapper, > #hud, > menu, > .ZebraDialog, > .ZebraDialogBackdrop").remove()
        await Frame.finalize_frames($contents, this.playback.$articles, compact_file, path, this.display_progress(this.playback.$articles.length))

        const html = $contents.prop("innerHTML")
        if (!html.length) {
            this.playback.hud.alert("Cannot export a single file – too big.")
        }

        // Prepare the original head.
        // Why not use HEAD=document.head.innerHTML cached at the application start in slidershow.js?
        // As the document is not ready yet, it would not show whole header but only the part the parser is it.
        // Consider this head: `<script slidershow.js><link href=custom.css>`
        // While accessing document.head in slidershow.js, link is still invisible. The slidershow.js needed to be
        // the very last tag in the head. Which would cover different problems:
        // CSS order, user might want to add another script accessing slidershow properties...
        let $head = $("<div>" + $("head").prop('outerHTML')+ "</div>")
        $head.find("[data-templated]").remove() // remove all dynamically added libraries
        $head.find("[src^='https://api.mapy.cz'],[href^='https://api.mapy.cz']").remove() // including vendor libraries that does not our honour [data-templated] attr

        // Export the data blob
        const data = `<!DOCTYPE html><html><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"
        const blob = new Blob([data.replaceAll(EXPORT_SRC, "src")], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = this.playback.session.docname
        document.body.appendChild(link)
        link.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(link)
    }
}