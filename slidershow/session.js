class Session {
    constructor(playback) {
        /** @type {Playback} */
        this.playback = playback
    }

    restore(init = false) {
        const pl = this.playback
        const [index, state] = window.location.hash.substring(1).split("&") // #6&state=thumbnails
        pl.index = Math.max(0, Number(index) - 1)

        // a real DOM element ID attribute in hash, not a frame number
        if (isNaN(pl.index)) {  // ex : #foo <section id=foo>
            // Why the reg? For security feeling, leave just signs allowed in the ID attr.
            let $anchor = $("#" + index.replace(/[^a-zA-Z0-9_\-\.]/g, ''))
            pl.goToArticle($anchor.is("section") ? $anchor.find(FRAME_TAGS) : $anchor)
            return
        }

        if (init) {
            pl.goToFrame(pl.index, true, true)
        } else {
            pl.goToFrame(pl.index)
        }

        if (state) {
            state.split("=")[1].split(",").forEach(key => {
                switch (key) {
                    case "editing":
                        pl.editing_mode = true
                        pl.shortcuts.editing.enable()
                        break;
                    case "tagging":
                        pl.tagging_mode = true
                        pl.shortcuts.tagging.enable()
                        break;
                    case "thumbnails":
                        if (!pl.hud.thumbnails_visible) {
                            pl.hud.toggle_thumbnails()
                        }
                        break;
                    case "properties":
                        if (!pl.hud.properties_visible) {
                            pl.hud.toggle_properties()
                        }
                        break;
                    default:
                        console.warn("[slidershow] Unknown hash key:" + key)
                        break;
                }
            })
        }
    }


    store() {
        const index = this.playback.index + 1

        const state = [
            this.playback.editing_mode ? "editing" : "",
            this.playback.tagging_mode ? "tagging" : "",
            this.playback.hud.$hud_thumbnails.is(":visible") ? "thumbnails" : "",
            this.playback.hud.$hud_properties.is(":visible") ? "properties" : ""
        ].filter(Boolean).join(",")

        // update the hash without triggering hashchange event
        history.replaceState(null, null, document.location.pathname + '#' + index + (state ? `&state=${state}` : ""))
    }

    /**
     * "http://example.com/" -> example.com
     * "http://example.com/foo" -> foo.html
     * "http://example.com/foo/" -> foo.html
     * "http://example.com/foo/bar.htm" -> bar.htm
     */
    get docname() {
        let name
        const url = window.location.pathname.split("/")
        while (!name && url.length) {
            name = url.pop()
        }
        if (!name) {
            name = "slidershow.html"
        }
        if (!/(\.html|\.htm)$/i.test(name)) {
            name += ".html";
        }
        return name
    }

}