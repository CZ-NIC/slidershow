/**
 * Main menu.
*/
class Menu {
    constructor() {
        // $articles.hide(0) XX pryč
        const $menu = this.$menu = $("menu").show(0)

        const $start = $("#start").focus().click(() => this.start())

        this.playback = null

        if ($menu.attr("data-skip") !== undefined) {
            this.start()
        }

        wh.press(KEY.ESCAPE, "Go to menu", () => {
            this.playback.stop()
            $menu.show()
            $start.focus()

            // scroll back
            Playback.resetWindow()
            $main.css({ top: '0px', left: '0px' })

            this.export() // XXXX
        })

        wh.pressCtrl(KEY.S, "Export presentation", () => this.export())

        // Drop new files
        const $drop = $("#drop").on("drop", (ev) => {
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
    }

    start() {
        this.$menu.hide()
        if (!this.playback) {
            this.playback = playback = new Playback()
        } else {
            this.playback.start()
        }
    }

    clean_playback() {
        if (this.playback) {
            this.playback.destroy()
            this.playback = playback = null
        }
        $articles.remove() // delete old frames
    }

    appendFiles(items) {
        console.log("49: items", items)

        let ram_only = false
        let folder = prompt("Do you want to specify folder?\nCancel – no, just display (RAM consuming)\nEmpty – the page folder", "")
        if (folder === null) {
            ram_only = true
            folder = ""
        }

        this.clean_playback()
        const $section = $("<section/>").appendTo($main);
        [...(new FormData($("#defaults")[0]))].map(([key, val]) => $section.attr("data-" + key, val))

        const elements = items.map(item => FrameFactory.file(folder + item.name, false, item, ram_only)).filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        return true
    }

    export() {
        const $contents = $($main.html())

        $contents.find("*").removeAttr("style")
        $contents.find(FRAME_SELECTOR).each(function () { Frame.preload($(this), true) })
        // $contents.find("*").each(function () {
        //     $(this).removeAttr("style")
        // })
        // reduce parameters
        console.log("96: $contents.html()", $contents.html())

        // return
        var data = `<html>\n<head>
<script src="./slidershow.js"></script>
</head>\n<body>\n<main>` + $contents.html() + "\n</main>\n</body>\n</html>"
        var blob = new Blob([data], { type: "text/plain" })
        var url = URL.createObjectURL(blob)
        var link = document.createElement("a")
        link.href = url
        link.download = "slidershow.html"
        document.body.appendChild(link)
        link.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(link)
    }
}