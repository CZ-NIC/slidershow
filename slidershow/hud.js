class Hud {

    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
        this.$hud_filename = $("#hud-filename")
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
        this.$hud_tag = $("#hud-tag")
        this.$hud_counter = $("#hud-counter")
        this.$hud_menu = $("#hud-menu")
        this.$hud_thumbnails = $("#hud-thumbnails").hide() // by default off
        this.$hud_grid = $("#hud-grid").hide() // by default off
        this.$hud_properties = $("#hud-properties").hide() // by default off

        // grid disappears on double click
        this.$hud_grid.on("dblclick", "frame-preview", () => this.toggle_grid())

        // Playback icon shows the menu
        this.playback_icon_interval = new Interval(() => this.$playback_icon.fadeOut(500, () => this.$playback_icon.html("☰")), 1000)
        this.$playback_icon = $("<div/>", { id: "playback-icon", html: "☰" })
            .appendTo($hud)
            .hide()
            .on("click", () => this.$hud_menu.fadeToggle(500) && this.playback_icon("☰"))
            .on("mouseenter", () => this.playback_icon_interval.freeze()) // icon will not disappear on hover
            .on("mouseleave", () => this.playback_icon_interval.unfreeze())
        $(document).on("mousemove", () => this.playback_icon())
        this.$hud_menu.on("mousemove", "button", e => this.playback_icon(e.target.title)) // menu hover hint
    }

    playback_icon(html = null) {
        if (html) {
            this.$playback_icon.html(html)
        }
        this.$playback_icon.stop(true).fadeIn(0)
        this.playback_icon_interval.start()
    }


    toggle_thumbnails() {
        this.$hud_thumbnails.toggle()
        if (this.thumbnails_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.thumbnails(this.playback.frame)
        }
        this.playback.session.store()
    }

    toggle_grid() {
        this.$hud_grid.toggle()
        if (this.grid_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.grid(this.playback.frame)
        }
        this.playback.session.store()
    }

    toggle_properties() {
        this.$hud_properties.toggle()
        if (this.properties_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.properties(this.playback.frame)
        }
        this.playback.session.store()
    }
    get thumbnails_visible() {
        return this.$hud_thumbnails.is(":visible")
    }
    get grid_visible() {
        return this.$hud_grid.is(":visible")
    }
    get properties_visible() {
        return this.$hud_properties.is(":visible")
    }

    /**
     * Thumbnail ribbon
     * @param {Frame} frame
     */
    thumbnails(frame) {
        const pl = this.playback
        const $container = this.$hud_thumbnails

        const THUMBNAIL_COUNT = 6
        // visible frames' indices
        const frameIds = Array.from({ length: THUMBNAIL_COUNT }, (_, i) => {
            const middle = Math.ceil(THUMBNAIL_COUNT / 2)
            // keep same thumbnails number at the ribbon end
            return i + (frame.index + middle >= pl.$articles.length ? pl.$articles.length - THUMBNAIL_COUNT : Math.max(0, frame.index - middle))
        })

        // remove old unused thumbnails
        $("frame-preview", $container).filter((_, el) => !frameIds.includes(Number(el.dataset.ref))).remove()

        // arrange thumbnails
        frameIds.forEach(index => this.assure_thumbnail(index, $container))

        // film-strip should not take excessive height
        const scaleFactorX = $("frame-preview:first", $container).width() / pl.$current.width()
        $container.css({ height: scaleFactorX * 100 + "vh" })

        // highlight current frame preview
        this.make_thumbnails_importable($container, frame.index, false) // prevent scrolling which scrolls main frame, not the thumbnails because there are only little of them
    }

    grid(frame) {
        const pl = this.playback
        const $container = this.$hud_grid
        Array.from(pl.$articles).map((_, i) => this.assure_thumbnail(i, $container))
        this.make_thumbnails_importable($container, frame.index)
    }

    assure_thumbnail(index, $container) {
        const pl = this.playback
        let $thumbnail = $(`[data-ref=${index}]`, $container)
        if (!$thumbnail.length) { // this thumbnail does not exist yet
            /** @type {?Frame} */
            const frame = $(pl.$articles[index]).data("frame")
            if (!frame) {
                return this.alert("unknown frame index", index)
            }

            // go to frame
            $thumbnail = $("<frame-preview/>", { html: "...", "data-ref": frame.index }).on("click", () => this.playback.goToFrame(frame.index))

            frame.preload()
            frame.loaded.then(() => {
                $thumbnail.html(frame.get_preview())
                if (!$thumbnail.text()) {
                    // Strange bug. When having just a full-stretched image in the frame, vertical scrollbar appeared unless font-size or line-height were zero.
                    // When I copied full HTML, no scrollbar was visible, albeit I found no single difference in the DevTools.
                    $("> *", $thumbnail).css("font-size", "0")
                }

                // delete frame
                if (pl.editing_mode) {
                    $thumbnail.append($("<span/>", { html: "&#10006;", class: "delete", title: "Delete frame" }).on("click", () => frame.delete()))
                }

                // Scale – use the proportions of the full screen but shrink to max thumbnail width
                const scaleFactorX = $thumbnail.width() / pl.$current.width()
                $(":first", $thumbnail).css({ "scale": String(scaleFactorX) })
            })
        }
        $container.append($thumbnail)
    }

    /**
     * draggable and highlighted
     * @param {*} $container
     * @param {*} currentIndex
     */
    make_thumbnails_importable($container, currentIndex, scroll = true) {
        const pl = this.playback
        // highlight current
        $("frame-preview", $container).removeClass("current").filter(`[data-ref=${currentIndex}]`).addClass("current")

        // make importable and draggable
        pl.menu.importable($("frame-preview", $container), (frames, target) =>
            pl.changes.undoable("Import files to thumbnail ribbon",
                () => $(pl.$articles[target.dataset.ref]).before(frames),
                () => frames.forEach($frame => $frame.detach()),
                () => {
                    pl.reset()
                    pl.goToFrame(pl.frame.index)
                }
            )
        )
            .draggable({  // re-order thumbnails by dragging
                snap: "frame-preview",
                containment: "parent",
                helper: "clone",
                snapTolerance: 30,
                scroll: scroll,
                drag: (_, ui) => {
                    const target = findClosestSnapPosition(ui.position.left, ui.position.top)[2]
                    $(".draggable-target").removeClass("draggable-target")
                    $(target).addClass("draggable-target")
                },
                stop: (_, ui) => {
                    const target = findClosestSnapPosition(ui.position.left, ui.position.top)[2]
                    // This can be used to re-order thumbnails,
                    // however undoing does not work and reset will wipe all $container content.
                    // $(target).before($(`[data-ref=${ui.helper.data("ref")}]`,$container))
                    pl.operation.insertFrameBefore(ui.helper.data("ref"), target.dataset.ref)
                }
            })

        function findClosestSnapPosition(x0, y0) {
            let [closestSnapPosition, closestDistance] = [null, Infinity]
            const positions = $('frame-preview:not(.ui-draggable-dragging)', $container).toArray().map(el => {
                const { left, top } = $(el).position()
                return [left, top + $container.scrollTop(), el]
            })
            for (const [x, y, el] of positions) {
                const distance = Math.sqrt((x - x0) ** 2 + (y - y0) ** 2)
                if (distance < closestDistance) {
                    [closestSnapPosition, closestDistance] = [[x, y, el], distance]
                }
            }
            return closestSnapPosition
        }
    }

    /**
     *
     * @param {Frame} frame
     */
    fileinfo(frame) {
        // this.$hud_menu.hide() // hud menu hides by default with every frame change TODO

        const $actor = frame.$actor
        if (!$actor) {
            $actor = { data: () => null }
        }

        const name = frame.get_filename($actor) || "?"

        this.$hud_filename.html(name)

        this.$hud_device.text($actor.data("device"))
        this.$hud_datetime.text($actor.data("datetime"))
        this.$hud_gps.text($actor.data("gps"))
        this.tag($actor.attr("data-tag"))

        // Counter
        const collection_index = frame.$frame.index() + 1
        const collection_max = frame.$frame.siblings().length + 1

        if (collection_max > 1 && collection_max !== frame.playback.slide_count) {
            this.$hud_counter.text(`${collection_index} / ${collection_max} (${frame.slide_index + 1} / ${frame.playback.slide_count})`)
        } else {
            this.$hud_counter.text(`${frame.slide_index + 1} / ${frame.playback.slide_count}`)
        }

        // Thumbnails
        if (this.thumbnails_visible) {
            this.thumbnails(frame)
        }
        if (this.grid_visible) {
            this.grid(frame)
        }
        if (this.properties_visible) {
            this.properties(frame)
        }
    }

    tag(tag = "") {
        this.$hud_tag.html(tag ? "TAG: " + tag : "")
    }

    alert(text, soft = false) {
        console.warn(text)
        if (!soft) {
            new $.Zebra_Dialog(text, {
                auto_close: 2000,
                buttons: false,
                modal: false,
                position: ["right - " + (this.properties_visible ? Math.round(this.$hud_properties.width()) + 10 + 20 : 20), "top + 20"]
            })
        }
    }

    /**
     * Ok dialog
     * @param {string} title
     * @param {string} text
     */
    ok(title, text) {
        new $.Zebra_Dialog(text, { type: "information", title: title })
    }

    /**
     * Information for the presenter, not for the public.
     */
    discreet_info(text) {
        if (text) {
            console.info("INFO:", text)
        }
    }

    reset() {
        this.reset_thumbnails()
        this.reset_grid()
        this.$hud_properties.html("")
    }

    reset_thumbnails() {
        this.$hud_thumbnails.html("")
    }

    reset_grid() {
        this.$hud_grid.html("")
    }

    /**
     * Thumbnail ribbon
     * @param {Frame} frame
    */
    async properties(frame) {
        await this.fetch_help()
        const pp = new PropertyPanel(this)
        const $frame = frame.$frame
        const $actor = frame.$actor
        const $props = this.$hud_properties
            .html($("<p/>").html("Properties panel (Alt+P)"))

        // undo button
        this.$hud_properties.append(this.playback.changes.get_button(), this.playback.changes.get_button_redo(), "<br>")

        // element properties
        if ($actor.length) {
            if ($actor.prop("tagName") === "IMG") {
                // handle [data-property=step-points]
                pp
                    .input_ancestored("step-points", $actor)
                    .appendTo($props)
                    .find("input").map((_, el) => pp.gui_step_points(frame, $(el)))
            } else if ($actor.prop("tagName") === "VIDEO") {
                $props.append(["playback-rate"].map(p => pp.input_ancestored(p, $actor, "number")).flat())

                const original = frame.get_filename($actor).split("#")[1]

                $props.append(pp.input("video-cut", $actor, "", original, "text", "t=START[,STOP]", val => {
                    const src = $actor.attr("src")
                    if (src) {
                        $actor.attr("src", [src.split("#")[0], val].join("#"))
                    } else {
                        this.alert("Not implemented changing this syntax of video URL")
                    }
                }))

                // The `video` attribute can be derived also from the real HTML attributes which is not here implemented to bear.
                $props.append(pp.input_ancestored("video", $actor))
            }
        }

        // frame properties
        // XX step-li might be checkbox, some of them can go to any element, not just its frame
        const props = ["duration", "transition-duration", "step-li", "step-duration", "step-class", "step-shown", "step-transition-duration"]
        $props
            .append(props.map(p => pp.input_ancestored(p, $frame)).flat())
        // XX data-step could be implemented for any focused element
    }

    async fetch_help() {
        if (!this._help) {
            this._help = await $.ajax({
                dataType: "text",
                url: DOCS_URI
            })
        }
    }

    get_help(property, short = false, display = true) {
        let text
        if (!this._help) {
            this.fetch_help()
            text = "Loading docs, try again"
        } else {
            const real_name = "data-" + property
            const rr = short ? `#+ \`${real_name}\`\\n\\n?([\\s\\S]*?)(?=\\n)` : `#+ \`${real_name}\`\\n\\n?([\\s\\S]*?)(?=\\n#)`
            const r = new RegExp(rr, "m")

            const m = this._help.match(r)
            if (m) {
                if (short) {
                    text = m[1]
                } else {
                    const docs_link = `<a href="${HOME_PAGE}#${real_name}">→ docs</a>`
                    // point internal links to the homepage
                    const links = m[1].replaceAll("`](#", "`](" + HOME_PAGE + "#")
                    const markdown = this.playback.menu.markdown.makeHtml(links)
                    text = docs_link + markdown
                }
            }
        }

        const error = `Cannot fetch help for ${property}`
        if (display) {
            if (!text) {
                this.alert(error)
            } else {
                this.ok(property, text)
            }
        } else {
            return text || error
        }
    }
}