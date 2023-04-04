/**
 * Main menu.
*/
class Menu {
    constructor() {
        // $articles.hide(0) XX pryč
        const $menu = this.$menu = $("menu").show(0)

        const $start = $("#start").focus().click(() => this.start())

        if ($menu.attr("data-skip") !== undefined) {
            this.start()
        }

        wh.press(KEY.ESCAPE, "Go to menu", () => {
            playback.stop()
            $menu.show()
            $start.focus()

            // scroll back
            Playback.resetWindow()
            $main.css({ top: '0px', left: '0px' })
        })

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
        playback = new Playback()
    }

    appendFiles(items) {
        console.log("49: items", items)

        let ram_only = false
        let folder = prompt("Do you want to specify folder?\nCancel – no, just display (RAM consuming)\nEmpty – the page folder", "")
        if (folder === null) {
            ram_only = true
            folder = ""
        }

        $articles.remove() // delete old frames
        const $section = $("<section/>").appendTo($main);
        [...(new FormData($("#defaults")[0]))].map(([key, val]) => $section.attr("data-" + key, val))

        const elements = items.map(item => FrameFactory.file(folder + item.name, false, item, ram_only)).filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        return true
    }
}