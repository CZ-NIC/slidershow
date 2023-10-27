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
        if (this.thumbnails_visible) {
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
        const index = frame.index  // current frame index
        const indices = Array.from({ length: THUMBNAIL_COUNT }, (_, i) => i + Math.max(0, index - Math.ceil(THUMBNAIL_COUNT / 2)))  // visible frames' indices

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
                const frame = $(this.playback.$articles[i]).data("frame")
                if (!frame) {
                    break
                }

                $thumbnail = $("<frame-preview/>", { html: "...", "data-ref": frame.index }).on("click", () => this.playback.goToFrame(frame.index))

                frame.preloaded.then(() => {
                    $thumbnail.html(frame.get_preview())

                    // Scale – use the proportions of the full screen but shrink to max thumbnail width
                    const scaleFactorX = $thumbnail.width() / this.playback.$current.width()
                    $(":first", $thumbnail).css({ "scale": String(scaleFactorX) })
                    // film-strip should not take excessive height
                    this.$hud_thumbnails.css({ height: scaleFactorX * 100 + "vh" })
                })
            }
            this.$hud_thumbnails.append($thumbnail)


        }

        // highlight current
        $("frame-preview", this.$hud_thumbnails).removeClass("current").filter(`[data-ref=${index}]`).addClass("current")
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
                position: ["right - 20", "top + 20"]
            })
        }
    }

    /**
     * Information for the presenter, not for the public.
     */
    discreet_info(text) {
        if (text) {
            console.log("INFO:", text)
        }
    }

    reset() {
        this.$hud_thumbnails.html("")
        this.$hud_properties.html("")
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
        this.$hud_properties.append(this.playback.change_controller.get_button(), this.playback.change_controller.get_button_redo(), "<br>")

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
                new $.Zebra_Dialog(text, { type: "information", title: property })
            }
        } else {
            return text || error
        }
    }
}