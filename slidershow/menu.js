/**
 * Main menu.
*/
class Menu {
    constructor() {
        this.$menu = $("menu").show(0)
        this.$start_wrapper = $("#start-wrapper")
        this.$export = $("#export")

        this.$start = $("#start").focus().click(() => this.start_playback())

        playback = this.playback = new Playback() // expose global `playback`

        if(!$(FRAME_SELECTOR).length) {
            this.$start_wrapper.hide()
            this.$export.hide()
        }

        // Global shortcuts
        wh.press(KEY.ESCAPE, "Go to menu", () => this.stop_playback())
        wh.press(KEY.H, "Show help", () => {
            alert(wh.getText())
        })
        wh.pressCtrl(KEY.S, "Export presentation", () => this.export())

        // Shortcuts available only in menu, not in playback
        this.shortcuts = []

        if ($main.attr("data-start") !== undefined) {
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

        $("#export").on("click", () => this.export())
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

    clean_playback() { // XX not used right now
        if (this.playback) {
            this.playback.destroy()
            this.playback = playback = null
        }
        $(FRAME_SELECTOR).remove()  // delete old frames
    }

    appendFiles(items) {
        console.log("File items", items)

        let ram_only = false
        let folder = prompt("Do you want to specify folder?\nCancel – no, just display (RAM consuming)\nEmpty – the page folder", "")
        if (folder === null) {
            ram_only = true
            folder = ""
        }

        // this.clean_playback()
        const $section = $("<section/>").appendTo($main);
        [...(new FormData($("#defaults")[0]))].map(([key, val]) => $section.attr("data-" + key, val))


        let progress = 0
        $("#progress").remove()
        const $progress = $("<div/>", { id: "progress" }).insertAfter(this.$drop).circleProgress({
            value: 0,
            max: items.length
        })

        const elements = items.map(item =>
            FrameFactory.file(folder + item.name, false, item, ram_only, () =>
                $progress.circleProgress("value", ++progress)))
            .filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        this.$start_wrapper.show()
        this.$export.show()
        this.playback.reset()
        return true
    }

    export() {
        const $contents = $($main.prop('outerHTML'))

        // reduce parameters
        $contents.removeAttr("style")
        $contents.find("*").removeAttr("style")
        $contents.find(FRAME_SELECTOR).each(function () { Frame.preload($(this), true) })

        const data = `<html>\n<head>
<script src="${DIR}slidershow.js"></script>
</head>\n<body>` + $contents.prop("outerHTML") + "\n</body>\n</html>"
        const blob = new Blob([data], { type: "text/plain" })
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