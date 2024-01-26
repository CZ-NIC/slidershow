class Hud {

    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
        this.$hud_filename = $("#hud-filename").on("mouseenter", () => this.$hud_menu.show(500))
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
        this.$hud_tag = $("#hud-tag")
        this.$hud_counter = $("#hud-counter")
        this.$hud_menu = $("#hud-menu")
        this.$hud_thumbnails = $("#hud-thumbnails").hide() // by default off
        this.$hud_properties = $("#hud-properties").hide() // by default off
    }

    playback_icon(html) {
        $("#playback-icon").remove()
        $("<div/>", { id: "playback-icon", html: html }).appendTo($hud).delay(1000).fadeOut(500, function () {
            $(this).remove()
        })
    }


    toggle_thumbnails() {
        this.$hud_thumbnails.toggle()
        if (this.thumbnails_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.thumbnails(this.playback.frame)
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
    get properties_visible() {
        return this.$hud_properties.is(":visible")
    }

    /**
     * Thumbnail ribbon
     * @param {Frame} frame
     */
    thumbnails(frame) {
        const THUMBNAIL_COUNT = 6
        // const THUMBNAIL_COUNT = 60 // TODO GRID
        const index = frame.index  // current frame index
        const indices = Array.from({ length: THUMBNAIL_COUNT }, (_, i) => i + Math.max(0, index - Math.ceil(THUMBNAIL_COUNT / 2)))  // visible frames' indices
        const pl = this.playback
        const cc = pl.changes

        // remove old unused thumbnails
        $("frame-preview", this.$hud_thumbnails).each(function () {
            if (!indices.includes(Number(this.dataset.ref))) {
                $(this).remove()
            }
        })

        // arrange thumbnails
        for (let i of indices) {
            let $thumbnail = $(`[data-ref=${i}]`, this.$hud_thumbnails)
            if (!$thumbnail.length) { // this thumbnail does not exist yet
                /** @type {?Frame} */
                const frame = $(pl.$articles[i]).data("frame")
                if (!frame) {
                    break
                }

                // go to frame
                $thumbnail = $("<frame-preview/>", { html: "...", "data-ref": frame.index }).on("click", () => this.playback.goToFrame(frame.index))

                frame.preloaded.then(() => {
                    $thumbnail.html(frame.get_preview())

                    // delete frame
                    if (pl.editing_mode) {
                        $thumbnail.append($("<span/>", { html: "&#10006;", class: "delete", title: "Delete frame" }).on("click", () => frame.delete()))
                    }

                    // Scale – use the proportions of the full screen but shrink to max thumbnail width
                    const scaleFactorX = $thumbnail.width() / pl.$current.width()
                    $(":first", $thumbnail).css({ "scale": String(scaleFactorX) })
                    // film-strip should not take excessive height
                    this.$hud_thumbnails.css({ height: scaleFactorX * 100 + "vh" }) // TODO GRID -> comment
                })
            }
            this.$hud_thumbnails.append($thumbnail)


        }

        // draggable and highlighted
        pl.menu.importable($("frame-preview", this.$hud_thumbnails), (frames, target) =>
            cc.undoable("Import files to thumbnail ribbon",
                () => $(pl.$articles[target.dataset.ref]).before(frames),
                () => frames.forEach($frame => $frame.detach()),
                () => {
                    pl.reset()
                    pl.goToFrame(pl.frame.index)
                }
            )
        )
            .draggable({  // drag them
                snap: "frame-preview",
                containment: "parent",
                helper: "clone",
                snapTolerance: 30,
                scroll: false, // this scrolls main frame, not the thumbnails
                start: (_, ui) => ui.helper.data('originalPosition', ui.helper.position()),
                stop: (_, ui) => {
                    const targetPosition = findClosestSnapPosition(ui.position.left, ui.position.top)[2]
                    pl.operation.insertFrameBefore(ui.helper.data("ref"), targetPosition.dataset.ref)
                }
            })
            .removeClass("current").filter(`[data-ref=${index}]`).addClass("current")  // highlight current frame preview

        function findClosestSnapPosition(x0, y0) {
            let [closestSnapPosition, closestDistance] = [null, Infinity]
            for (const [x, y, el] of $('frame-preview:not(.ui-draggable-dragging)').toArray().map(el => { const { left, top } = $(el).position(); return [left, top, el] })) {
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
        this.$hud_menu.hide() // hud menu hides by default with every frame change

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
        this.$hud_properties.html("")
    }

    reset_thumbnails() {
        this.$hud_thumbnails.html("")
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
                    // TODO check XSS risk
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