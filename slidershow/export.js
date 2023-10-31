class Export {
    /**
     *
     * @param {Menu} menu
     */
    constructor(menu) {
        this.menu = menu
        this.playback = menu.playback

        this.file_handler_allowed = Boolean(window.showSaveFilePicker)
        this.file_handler_wanted = this.file_handler_allowed
        this.file_handler = null
    }

    file_handler_checkbox() {
        if (!this.file_handler_allowed) {
            return "(In this browser, you are not allowed to rewrite local files.)"
        }
        return $("<label />",
            { "text": "Rewrite local file next time? (Chrome only)" })
            .prepend(
                $("<input />", { "type": "checkbox", "checked": this.file_handler_wanted })
                    .on("click", (e) => {
                        this.file_handler_wanted = $(e.target).prop("checked")
                    })
            )
    }


    export_dialog() {
        new $.Zebra_Dialog({
            message: "Will you put the presentation file to the media folder?<br>",
            source: { inline: this.file_handler_checkbox() },
            type: "question",
            title: "Export",
            buttons: [{
                caption: "Same folder (tiny presentation size)", callback: () => this.export()
            }, {
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
        await Frame.finalize_frames($contents, this.playback.$articles, compact_file, path, this.menu.display_progress(this.playback.$articles.length))

        const html = $contents.prop("innerHTML").replaceAll(EXPORT_SRC, "src")
        if (!html.length) {
            this.playback.hud.ok("Export failed", "Cannot export a single file – too big.")
            return
        }

        // Prepare the original head.
        // Why not use HEAD=document.head.innerHTML cached at the application start in slidershow.js?
        // As the document is not ready yet, it would not show whole header but only the part the parser is it.
        // Consider this head: `<script slidershow.js><link href=custom.css>`
        // While accessing document.head in slidershow.js, link is still invisible. The slidershow.js needed to be
        // the very last tag in the head. Which would cover different problems:
        // CSS order, user might want to add another script accessing slidershow properties...
        let $head = $("<div>" + $("head").prop('outerHTML') + "</div>")
        $head.find("[data-templated]").remove() // remove all dynamically added libraries
        $head.find("[src^='https://api.mapy.cz'],[href^='https://api.mapy.cz']").remove() // including vendor libraries that does not our honour [data-templated] attr

        // Export the data blob
        const data = `<!DOCTYPE html><html><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"

        if (this.file_handler_wanted && window.showSaveFilePicker) {
            const newHandle = await this.assure_handler()
            const fileStream = await newHandle.createWritable()
            await fileStream.write(data)
            fileStream.close()
            this.menu.playback.hud.alert("Saved")
        } else {
            this.download(data)
        }

        // Changes saved, allow leaving
        this.playback.changes.unblock_unload()
    }

    async assure_handler() {
        if (!this.file_handler) {
            this.file_handler = await window.showSaveFilePicker({suggestedName: this.playback.session.docname}) // ask once for the path – then keep newHandle
        }
        return this.file_handler
    }

    download(data) {
        const blob = new Blob([data], { type: "text/plain" })
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