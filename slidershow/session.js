class Session {
    /** @param {Playback} playback */
    constructor(playback) {
        this.playback = playback
    }

    restore(init = false) {
        const pl = this.playback
        const hash = window.location.hash.substring(1)
        const [indexPart, paramsPart] = hash.split("?")

        // Parse state from URLSearchParams (e.g., #6?duration=5&progress&editing)
        if (paramsPart) {
            this.restore_state(new URLSearchParams(paramsPart))
        }

        pl.index = Math.min(Math.max(0, Number(indexPart) - 1), pl.$articles.length - 1)

        // a real DOM element ID attribute in hash, not a frame number
        if (isNaN(pl.index)) {  // ex : #foo <section id=foo>
            // Why the reg? For security feeling, leave just signs allowed in the ID attr.
            let $anchor = $("#" + indexPart.replace(/[^a-zA-Z0-9_\-\.]/g, ''))
            pl.goToArticle($anchor.is("section") ? $anchor.find(FRAME_TAGS) : $anchor)
            return
        }

        if (init) {
            pl.goToFrame(pl.index, true, true)
        } else {
            pl.goToFrame(pl.index)
        }
    }

    /** @param {URLSearchParams} searchParams */
    restore_state(searchParams) {
        const pl = this.playback
        let tag_filter_values = []

        // Iterate over all parameters; keys may appear multiple times (e.g. tag-filter=1&tag-filter=2)
        for (const [key, value] of searchParams) {
            switch (key) {
                case "duration":
                    // Auto-forward from the hash. Overrides the authored default by
                    // setting `sli-duration` on <main>, where prop() ends its walk.
                    if (!isNaN(parseFloat(value))) {
                        $main.attr("sli-duration", parseFloat(value))
                        prop_invalidate()
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
                    // Collect all tag-filter values (may appear multiple times)
                    const tagId = Number(value)
                    if (!isNaN(tagId)) {
                        tag_filter_values.push(tagId)
                    }
                    break;
                case "tag-names":
                    $main.attr("sli-tag-names", value)
                    prop_invalidate()
                    break;
                case "loop-presentation":
                    // Wrap from the last frame back to the first (kiosk playback). Sets the same
                    // <main sli-loop-presentation> the toggle command and the menu "Kiosk" button write.
                    $main.attr("sli-loop-presentation", "true")
                    prop_invalidate()
                    break;
                case "progress":
                    // Countdown-to-next bar. Off by default; presetting it from the hash mirrors thumbnails/grid.
                    if (!pl.hud.progress_visible) {
                        pl.hud.toggle_progress()
                    }
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
                case "grid-tile":
                    // Grid tile shape (GridController.cycleTileShape). Session-only by design: a view
                    // preference of whoever is browsing, never written into the presentation itself.
                    pl.hud.grid.setTileShape(value)
                    break;
                case "grid-labels":
                    pl.hud.grid.setTileLabels(value)
                    break;
                case "grid-fit":
                    pl.hud.grid.setTileFit(value)
                    break;
                case "map-disabled":
                    // already handled at program start
                    // NOTE undocumented feature: Append this to file name to disable maps `#6?map-disabled`
                    break;
                case "start":
                    // Hash-triggered autostart flag (actual start happens in Menu constructor to skip splash)
                    break;
                default:
                    console.warn("[slidershow] Unknown hash key:" + key)
                    break;
            }
        }

        // Apply collected tag-filter values (replace, don't append)
        if (tag_filter_values.length) {
            pl.tag_filter = tag_filter_values
            pl.hud.refresh_tag_filter_icon()
        }
    }


    store() {
        const index = this.playback.index + 1
        const params = new URLSearchParams()

        const duration = $main.attr("sli-duration")
        if (duration !== undefined) {
            params.set("duration", duration)
        }
        if (prop("loop-presentation", $main)) {
            params.set("loop-presentation", "")
        }
        if (this.playback.hud.progress_visible) {
            params.set("progress", "")
        }
        if (this.playback.editing_mode) {
            params.set("editing", "")
        }
        if (this.playback.tagging_mode) {
            params.set("tagging", "")
        }
        if (this.playback.tag_filter.length) {
            this.playback.tag_filter.forEach(tagId => {
                params.append("tag-filter", tagId)
            })
        }
        if (this.playback.frame.tag_names().length) {
            // Pipe-delimited with backslash-escape (see formatPipeList in static.js)
            params.set("tag-names", formatPipeList(this.playback.frame.tag_names()))
        }
        if (this.playback.step_disabled) {
            params.set("no-steps", "")
        }
        if (this.playback.hud.$hud_thumbnails.is(":visible")) {
            params.set("thumbnails", "")
        }
        if (this.playback.hud.$hud_grid.is(":visible")) {
            params.set("grid", "")
        }
        if (this.playback.hud.$hud_properties.is(":visible")) {
            params.set("properties", "")
        }
        // The grid's view options – all three are the browsing person's, never the presentation's (see
        // GridController.tile_shape), so they ride in the hash and only when off their default.
        const grid = this.playback.hud.grid
        if (grid.tile_shape) {
            params.set("grid-tile", grid.tile_shape)
        }
        if (grid.tile_labels !== "off") {
            params.set("grid-labels", grid.tile_labels)
        }
        if (grid.tile_fit !== "cover") {
            params.set("grid-fit", grid.tile_fit)
        }
        if (!MAP_ENABLE) {
            params.set("map-disabled", "")
        }

        const paramString = params.toString()
        // update the hash without triggering hashchange event
        history.replaceState(null, null, document.location.pathname + document.location.search + '#' + index + (paramString ? `?${paramString}` : ""))
    }

    get docname() {
        return docname()
    }

    /** Name for the exported/downloaded file – follows the presentation name (see `export_filename()`). */
    get export_filename() {
        return export_filename()
    }

}