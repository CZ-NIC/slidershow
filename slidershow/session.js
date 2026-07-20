class Session {
    /** @param {Playback} playback */
    constructor(playback) {
        this.playback = playback
    }

    restore(init = false) {
        const pl = this.playback
        const [index, state] = window.location.hash.substring(1).split("&") // #6&state=thumbnails
        if (state) {
            this.restore_state(state)
        }
        pl.index = Math.min(Math.max(0, Number(index) - 1), pl.$articles.length - 1)

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
    }

    restore_state(state) {
        const pl = this.playback
        state.split("=")[1].split(",").forEach(entry => {
            // A key may carry a value: `duration:5`. Plain flags have no `:`.
            const [key, value] = entry.split(":")
            switch (key) {
                case "duration":
                    // Auto-forward from the hash. Overrides the authored default by
                    // setting `data-duration` on <main>, where prop() ends its walk.
                    if (!isNaN(parseFloat(value))) {
                        $main.attr("data-duration", parseFloat(value))
                    }
                    break;
                case "editing":
                    pl.editing_mode = true
                    pl.operation.editing.enable()
                    break;
                case "tagging":
                    pl.tagging_mode = true
                    pl.operation.tagging.enable()
                    break;
                case "tag-filter":
                    pl.tag_filter = (value || "").split("+").filter(Boolean).map(Number)
                    pl.hud.refresh_tag_filter_icon()
                    break;
                case "tag-names":
                    $main.attr("data-tag-names", (value || "").split("+").join(","))
                    break;
                case "no-steps":
                    pl.step_disabled = true
                    break
                case "thumbnails":
                    if (!pl.hud.thumbnails_visible) {
                        pl.hud.toggle_thumbnails()
                    }
                    break;
                case "grid":
                    if (!pl.hud.grid_visible) {
                        pl.hud.toggle_grid()
                    }
                    break;
                case "properties":
                    if (!pl.hud.properties_visible) {
                        pl.hud.toggle_properties()
                    }
                    break;
                case "map-disabled":
                    // already handled at program start
                    // NOTE undocumented feature: Append this to file name to disable maps `#&state=map-disabled`
                    break;
                default:
                    console.warn("[slidershow] Unknown hash key:" + key)
                    break;
            }
        })
    }


    store() {
        const index = this.playback.index + 1

        const duration = $main.attr("data-duration")
        const state = [
            this.playback.editing_mode ? "editing" : "",
            this.playback.tagging_mode ? "tagging" : "",
            this.playback.tag_filter.length ? `tag-filter:${this.playback.tag_filter.join("+")}` : "",
            this.playback.frame.tag_names().length ? `tag-names:${this.playback.frame.tag_names().join("+")}` : "",
            this.playback.step_disabled ? "no-steps" : "",
            this.playback.hud.$hud_thumbnails.is(":visible") ? "thumbnails" : "",
            this.playback.hud.$hud_grid.is(":visible") ? "grid" : "",
            this.playback.hud.$hud_properties.is(":visible") ? "properties" : "",
            !MAP_ENABLE ? "map-disabled" : "",
            duration !== undefined ? `duration:${duration}` : "",
        ].filter(Boolean).join(",")

        // update the hash without triggering hashchange event
        history.replaceState(null, null, document.location.pathname + document.location.search + '#' + index + (state ? `&state=${state}` : ""))
    }

    get docname() {
        return docname()
    }

}