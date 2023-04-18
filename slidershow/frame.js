class Frame {
    /**
     *
     * @param {jQuery} $el
     * @param {?Playback} playback
     */
    constructor($el, playback = null) {
        this.$frame = $el
        /** @type Playback */
        this.playback = playback
        this.$video_pause_listener = null
        /**  @type {?jQuery}         */
        this.$actor = this.$frame.find("video, img").first()
        this.panorama_starter = null
        this.loop_interval = null

        /**
         * If set, this frame is a subframe.
         * @type {?Frame}
         */
        this.parent = null
        /**
         * Subframes
         * @type {Frame[]}
         */
        this.children = []

        /**
         * @type {Number} Frame counter. Set by the playback.
         */
        this.index

        this.shortcuts = []

        /** @type {Promise[]} All the effects that should hold playback. */
        this.effects = []

        /** @type {?Promise} */
        this.video_finished = null
    }

    register_parent(frame) {
        this.parent = frame
        this.parent.children.push(this)
    }

    /**
     *  XX not used in the moment
     */
    effect(effect) {
        return
        const TRANS_DURATION = this.prop("transition-duration") * 1000
        const $el = this.$frame
        const winHeight = $(window).height() + "px"
        switch (effect) {
            case "go-up":
                return $el.animate({ top: `-${$el.height()}px` }, TRANS_DURATION,
                    () => $el.hide(0).css("top", "0px"))
            case "go-down":
                return $el.animate({ top: winHeight }, TRANS_DURATION,
                    () => $el.hide(0).css("top", "0px"))
            case "arrive-from-bottom":
                return $el.css("top", winHeight).show(0).animate({ top: "0px" }, TRANS_DURATION)
            case "arrive-from-top":
                return $el.css("top", `-${$el.height()}px`).show(0).animate({ top: "0px" }, TRANS_DURATION)
            default:
                console.error("Unknown effect: " + effect)
        }
    }

    /**
     * Return closest prop, defined in the DOM.
     * (Zero aware, you can safely set `data-prop=0`.)
     * @param {string} prop
     * @param {any} def Default value if undefined
     * @param {jQuery|null} $actor What element to check the prop of. If null, frame is checked.
     * @returns
     */
    prop(prop, def = null, $actor = null) {
        const $el = $actor?.length ? $actor : this.$frame
        const v = $el.closest(`[data-${prop}]`).data(prop)
        switch (v) {
            case "false": // <main data-start='false'> -> false
                return false
            case "": // mere presence of an attribute resolves to true: <main data-start>
                if ($el[0].getAttribute(`data-${prop}`) === "") {
                    // <main data-start=''> -> false
                    return false;
                }
            // <main data-start> -> true
            case "true": // <main data-start='true'> -> true
                return true;
            case undefined:
                if (def !== undefined) {
                    return def
                }
            default:
                return v;
        }

    }

    prepare() {
        const $frame = this.$frame

        this.children.forEach(f => f.$frame.hide())
        if (this.parent) { // this is a child frame
            $frame.show(0) // it was hidden before
        }

        Frame.preload($frame)


        // Get main media
        const $actor = this.$actor
        if ($actor.prop("tagName") === "IMG") {
            this.panorama()
        }

        // File name
        this.playback.hud.fileinfo(this)

        // Map
        this.map_prepare()
    }

    map_prepare() {
        /** @type {MapWidget} */
        let map
        // which map to use?
        if (this.$frame.prop("tagName") === "ARTICLE-MAP") {
            map = this.playback.map
            map.adapt(this)
        } else {
            map = this.playback.hud_map
        }

        /** @type {Place[]} */
        const places = []

        const gps = this.prop("gps", null, this.$actor)
        if (gps) {
            places.push(Place.from_coordinates(...gps.split(",")))
        }

        const names = this.prop("places")
        if (names) {
            places.push(...names.split(",").map(name => new Place(name)))
        }

        if (places.length) {
            map.engage(places,
                this.prop("map-animate", true),
                this.prop("map-geometry-show", false) /* XXroute|polyline*/,
                this.prop("map-markers-show", true),
                this.prop("map-geometry-clear", true),
                this.prop("map-markers-clear", true),
                this.prop("map-zoom"))
        }
    }

    /**
     *   preload media
     *   for the case of several thousands file, the perfomarce is important
     *   XX we should probably implement an unload too
     * @param {jQuery} $frame
     * @param {bool} one_way Remove helper attributes but prevents further preload call
     */
    static preload($frame, one_way = false) {
        // Attribute preload – file src is held in the attribute
        $frame.find("img[data-src]").each(function () {
            $(this).attr("src", $(this).data("src"))

            if (one_way) {
                $(this).removeAttr("data-src")
            }
        })
        $frame.find("video[data-src]").each(function () {
            $(this).empty().append($("<source/>", { src: $(this).data("src") }))
        })

        // Memory preload – we hold all data in the memory
        $frame.find("img[data-src-cached]").each(function () {
            if (PRELOAD_EXPERIMENTAL) {
                // .removeAttr("data-src-cached")
                $(this).data("src-cached-data")(this)
            } else {
                $(this).attr("src", $(this).data("src-cached-data"))
            }
        })
        $frame.find("video[data-src-cached]").each(function () {
            $(this).empty().append($("<source/>", { src: $(this).data("src-cached-data") }))
        })
    }

    enter() {
        const $frame = this.$frame

        // Get main media
        const $actor = this.$actor

        this.effects.length = 0 // flush out any unsettled promises

        // Image frame
        if ($actor.prop("tagName") === "IMG") {
            this.zoom()
            Frame.exif($actor)
            this.panorama_starter?.()
            const loop = this.prop("loop")
            if (loop) {
                this.loop(loop)
            }
        }

        // No HTML tag found, fit plain text to the screen size
        if ($frame.children().length === 0 || this.prop("fit")) {
            textFit($frame)
        }

        // Video frame
        if ($actor.prop("tagName") === "VIDEO") {
            this.video_finished = new Promise((resolve) => this.video_enter(resolve))
        }
        return this.get_duration()
    }

    video_enter(resolve) {
        const $actor = this.$actor
        $actor.focus() // Focus video controls

        this.playback.hud.discreet_info(this.get_filename().split("#")[1])

        if ($actor.attr("autoplay")) {
            // Video autoplay (when muted in chromium)
            $actor[0].play().catch(() => {
                this.playback.hud.alert("Interact with the page before the autoplay works.")
            })

        }
        $actor[0].playbackRate = this.prop("playback-rate", 1, $actor)
        let next_interval = null

        // Pausing vs playback moving
        this.$video_pause_listener = $actor.on("pause", () => {
            // Normally, when a video ends, we want to move further.
            // However, when we click to the video progress gauge,
            // just before rewinding, a pause event is generated.
            // We cannot distinguish whether a pause is a user-action
            // or an automatic action. So that we wait
            // an if it was a user-action, a play event will follow shortly,
            // with the mouse button up.
            next_interval = new Interval(() => {
                next_interval.stop()
                resolve()
            }, 300)
        }).on("play", () => {
            // the video continues, it has not ended, do not move further
            next_interval?.stop()
        })
            .on("click", () => {
                // the video was manually clicked upod, it has not ended, do not move further
                next_interval?.stop()
                this.playback.play_pause(false)
            }).on("slidershow-leave", () => {
                $actor.off("pause").off("play").off("click")
            })

        // Video shortcuts
        const playback_change = (step) => {
            const r = $actor[0].playbackRate = Math.round(($actor[0].playbackRate + step) * 10) / 10
            this.playback.hud.playback_icon(r + " ×")
        }
        this.shortcuts.push(
            wh.press(KEY.KP_Add, "Faster video", () => playback_change(0.1)),
            wh.press(KEY.KP_Subtract, "Faster video", () => playback_change(-0.1)),
            wh.pressAlt(KEY.M, "Toggle muted", () => $actor[0].muted = !$actor[0].muted)
        )

    }

    loop(loop) {
        const $frame = this.$frame
        const $children = $frame.children().css({ "left": "unset", "top": "unset" }).show()

        function* stepGen(steps) {
            let index = 0;
            while (true) {
                yield steps[index];
                index = (index + 1) % steps.length;
            }
        }
        const gen = stepGen([...$children])

        this.loop_interval = new Interval(() => {
            $children.hide()
            $(gen.next().value).show()
        }, 200)
    }

    get_duration() {
        return this.prop("duration", 0)
        // return this.$actor.prop("tagName") === "VIDEO" ? this.prop("duration-video", 0) : this.prop("duration", 0)
    }

    leave() {
        this.shortcuts.forEach(s => s.disable())
        this.shortcuts.length = 0

        if (this.$video_pause_listener) {
            this.$video_pause_listener.trigger("slidershow-leave")
            this.$video_pause_listener = null
        }
        this.$actor?.data("wzoom-unload")?.()

        this.playback.hud_map.hide()
        return true
    }

    left() {
        this.loop_interval?.stop()
        this.$actor.stop(true)
    }

    panorama() {
        const $actor = this.$actor
        this.panorama_starter = null

        // get image dimensions
        $actor.css({
            width: "unset",
            height: "unset",
            "max-width": "unset",
            "max-height": "unset",
        })
        const [w, h, main_w, main_h] = [$actor.width(), $actor.height(), window.innerWidth, window.innerHeight]
        const small_height = main_w / (w / h)
        const medium_width = w / (h / main_h)
        const trailing_width = medium_width - main_w

        $actor.removeAttr("style")

        if (w / h > PANORAMA_THRESHOLD) {
            let speed = Math.min((trailing_width / 100), 5) * 1000 // 100 px / 1s, but max 5 sec
            // speed = 1000
            $actor.css({
                width: "unset",
                height: "unset",
                "max-width": "unset",
                "max-height": main_h,
                "position": "absolute",
                "left": 0
            })
            this.panorama_starter = () => this.add_effect(resolve => {
                $actor.animate({
                    left: - trailing_width,
                }, speed, () => {
                    $actor.animate({
                        left: 0,
                        width: main_w,
                        top: (main_h / 2) - (small_height / 2) + "px"
                    }, 1000, () => {
                        $actor.removeAttr("style")
                        resolve()
                    })
                })
            })
        }
    }

    add_effect(promise) {
        this.effects.push(new Promise(promise))
    }

    zoom() {
        const $actor = this.$actor
        $actor.off("click wheel").on("click wheel", () => {
            if ($actor.data("wzoom-unload")) {
                return
            }
            const maxScale_default = 5
            const wzoom = WZoom.create($actor.get()[0], {
                maxScale: maxScale_default,
                minScale: 1,
                speed: 1,
                // We can wheel in for ever but keeping maxScale on leash.
                // Because the click takes us to the current bed (and second click zooms out).
                rescale: (wzoom) =>
                    wzoom.content.maxScale = Math.max(maxScale_default, wzoom.content.currentScale + 3)
            })
            wzoom.zoomUp() // compensate the click already been consumed


            $actor.data("wzoom-unload", () => setTimeout(() => { // we have to timeout - wzoom bug, has to finish before it can be destroyed
                wzoom.destroy()
                $actor.data("wzoom-unload", null).off("dblclick")
            })).on("dblclick", () => $actor.data("wzoom-unload")())

            this.playback.moving = false
        })
    }

    get_filename($actor = null) {
        // there might be base64 data in the real src, hence we prefer the data-src
        $actor = $actor || this.$actor
        return ($actor.data("src") || $actor.attr("src") || $("source", $actor).attr("src"))?.split("/").pop()
    }

    get_position() {
        if (this.playback.debug) {
            const zoom = $main.css("zoom")
            return {
                top: `-${this.$frame.position().top - 300 / zoom}px`,
                left: `-${this.$frame.position().left - 300 / zoom}px`,
            }
        }
        return {
            top: `-${this.$frame.position().top}px`,
            left: `-${this.$frame.position().left}px`,
        }
    }

    check_tag() {
        const $actor = this.$actor
        const name = this.get_filename()
        const tag = localStorage.getItem("TAG: " + name)
        if (tag) {
            $actor.attr("data-tag", tag)
        }
    }

    set_tag(tag) {
        const $actor = this.$actor
        const name = this.get_filename()

        const key = "TAG: " + name
        if (tag) {
            localStorage.setItem(key, tag)
            $actor.attr("data-tag", tag)
        } else {
            localStorage.removeItem(key)
            $actor.removeAttr("data-tag")
        }
        this.playback.hud.tag(tag)
    }

    static exif($el, data = null, callback = null) {
        if (!READ_EXIF || $el.data("exif-done")) {
            return
        }
        const process = (exif) => {
            const attrs = {}

            const make = exif.Make
            const model = exif.Model
            if (make && model) {
                attrs["data-device"] = `${make} ${model}`
            }

            // získání dat o datumu a času pořízení fotografie
            const dateTime = exif.DateTimeOriginal?.replace(/:/g, "-").replace(/ /g, "T")
            if (dateTime) { attrs["data-dateTime"] = dateTime }

            // convert GPS
            const { GPSLatitude: _lat, GPSLongitude: _lon, GPSLatitudeRef: _latRef, GPSLongitudeRef: _lonRef } = exif
            try {
                const latitude = Frame._convertDMSToDD(_lat[0], _lat[1], _lat[2], _latRef)
                const longitude = Frame._convertDMSToDD(_lon[0], _lon[1], _lon[2], _lonRef)
                if (longitude && latitude) {
                    attrs["data-gps"] = `${longitude}, ${latitude}`
                }
            } catch (e) {
                ; // no gps info
            }

            $el.attr(attrs).data("exif-done", 1)
            if (callback) {
                callback()
            }
        }

        // raises uncatcheable log when CORS encoutered
        EXIF.getData(data || $el.get()[0], function () {
            process(EXIF.getAllTags(this))
        })
    }

    /**
     * GPS DMS -> DD
     */
    static _convertDMSToDD(degrees, minutes, seconds, direction) {
        var dd = degrees + (minutes / 60) + (seconds / 3600)
        if (direction == "S" || direction == "W") {
            dd = dd * -1
        }
        return dd
    }

    /**
     *
     * @returns {jQuery[]}
     */
    static load_all(playback = null) {
        return $(FRAME_SELECTOR).each((_, el) => $(el).data("frame", new Frame($(el), playback)))
    }
}