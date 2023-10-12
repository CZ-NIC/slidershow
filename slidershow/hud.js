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
        if (this.properties_visible) {
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
    properties(frame) {
        const pl = this.playback
        const $frame = frame.$frame
        const props = ["duration", "transition-duration"]
        this.$hud_properties
            .html($("<p/>").html("Properties panel (Alt+P)"))
            .append(
                props.map(p => generate_fields(p, $frame)).flat())

        /**
         *
         * @param {string} p Property name
         * @param {jQuery} $el $frame or its parents up to main (elements having properties)
         * @param {string} name Parent name, prepended to the property <label>.
         * @returns
         */
        function generate_fields(p, $el, name = "") {
            const element_property = [
                $("<label/>", { "text": `${name} ${p}: ` }),
                $("<input />")
                    .attr("type", "number")
                    .attr("placeholder", prop(p, null, $el.parent()))
                    .attr("name", `${name}${p}`)
                    .val($el.data(p))
                    .on("change", function () {
                        const [v, a, prev, name] = [$(this).val(), `data-${p}`, $el.data(p), $(this).attr("name")]
                        change(v)
                        pl.change_controller.change(() => {
                            // Why accessing via name?
                            // Since we could changed the slide (and refreshed the panel HTML),
                            // the original element does not have to exist.
                            $(`[name=${name}]`).val(prev)
                            change(prev)
                        })

                        function change(v) {
                            if (v === "") {
                                $el.removeAttr(a)
                                $el.removeData(p)
                            } else {
                                $el.attr(a, v)
                                $el.data(p, v)
                            }
                        }
                    }),
                "<br>"
            ]

            if ($el.parent().length && !$el.is("main")) {
                $.merge(element_property, generate_fields(p, $el.parent(), $el.parent().prop("tagName")))
            }
            return element_property
        }
    }
}