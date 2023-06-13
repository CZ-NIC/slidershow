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
         * @type {Number} Frame counter, starting with 0. Set by the playback.
         */
        this.index

        /**
        * @type {Number} Frame grouped by slides, starting with 0. (Frames nested under a parent frame has the same slide index). Set by the playback.
         */
        this.slide_index

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
     * @param {string} property
     * @param {any} def Default value if undefined
     * @param {jQuery|null} $actor What element to check the prop of. If null, frame is checked.
     * @returns
     */
    prop(property, def = null, $actor = null) {
        const $el = $actor?.length ? $actor : this.$frame
        return prop(property, def, $el)
    }

    /**
     * Frame is going to be entered right now but is not visible yet.
     */
    prepare() {
        this.children.forEach(f => f.$frame.hide())
        if (this.parent) { // this is a child frame
            this.$frame.show(0) // it was hidden before
        }

        // main media action
        if (this.$actor.prop("tagName") === "IMG") {
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
        const places = get_places(this)

        if (places.length) {
            const last_places = get_places(this.$frame.prev().data("frame")) || get_places(this.$frame.parent().data("frame"))

            map.engage(places,
                this.prop("map-animate", true),
                this.prop("map-geometry-show", false),
                this.prop("map-geometry-criterion", ""),
                this.prop("map-markers-show", true),
                this.prop("map-geometry-clear", true),
                this.prop("map-markers-clear", true),
                this.prop("map-zoom"),
                last_places)
        }


        /**
         *
         * @param {?Frame} frame
         * @returns {?Place[]}
         */
        function get_places(frame) {
            if (!frame) {
                return null
            }
            const places = []
            const gps = frame.prop("gps", null, frame.$actor)
            if (gps) {
                places.push(Place.from_coordinates(...gps.split(",")))
            }

            const names = frame.prop("places", null, frame.$actor)
            if (names) {
                places.push(...names.split(",").map(name => new Place(name)))
            }
            return places
        }
    }

    /**
     *  Preload media; for the case of several thousands file, the perfomarce is important.
     *
     * * data("read-src"): If present, this is the method to re-read the dragged media from the disk.
     * * data-src: Optional attribute for <img>, <video>, holds the original file name.
     *
     * @returns {Promise[]} Fulfilled when src loaded from the memory.
     */
    async preload() {
        const $frame = this.$frame
        if ($frame.attr("data-preloaded")) {
            return [] // already done
        }
        $frame.attr("data-preloaded", 1) // prevent another preload

        return $frame.find("img[data-src], video[data-src]").map(async function () {
            const $el = $(this)
            if (!$el.attr("src")) { // src is not set yet
                const src = (await $el.data(READ_SRC)?.(true)) || $el.data("src")
                if (src) { // there is a place to load src from
                    this.src = src
                    return new Promise(r => this.onload = r)
                }
            }
            return null // src already set or no place to set the src from
        }).get().filter(Boolean)
    }

    unload() {
        const $frame = this.$frame
        $frame.removeAttr("data-preloaded")

        // Remove src if data can be retrieved from the memory data(READ_SRC) or the attribute data-src
        $frame.find("img[data-src], video[data-src]").map((_, el) => Frame.unload_media($(el)))
    }

    /** If there is a place the `[src]` can be re-read, delete it. */
    static unload_media($el, $el_original = null) {
        if (($el_original || $el).data(READ_SRC) || $el.data("src") && $el.data("src") === $el.attr("src")) {
            URL.revokeObjectURL($el.attr("src")) // for the case this is a blob URL given by FrameFactory reader
            $el.removeAttr("src")
        }
    }

    /**
     * Remove auxiliary parameters when exporting.
     * @param {jQuery} $contents Copy of $main, containing all frames.
     * @param {jQuery} $articles Original live articles = all frames.
     * @param {Boolean} keep_raw Store raw bytes if possible. If true a there are bytes in the memory,
     *  those are exported; we prefer raw bytes over the filename (the original will not be needed).
     *  False → filename always exported.
     * @param {String} path Path where the presentation file will find the media folder.
     * @param {Function} callback When frame done, call this to increase the progress bar.
     */
    static async finalize_frames($contents, $articles, keep_raw = false, path = "", callback = null) {
        $("video[data-autoplay-prevented]", $contents).removeAttr("data-autoplay-prevented").attr("autoplay", "")
        const $frames = $contents.find(FRAME_SELECTOR).removeAttr("data-preloaded")
        const $originals = $articles.find("img[data-src], video[data-src]")
        const $media = $frames.find("img[data-src], video[data-src]")
        let $frame = null
        for (let index = 0; index < $media.length; index++) {
            // process the media files one by one (we cannot use map since it would ignore `await reader()`)
            const $el = $($media[index])
            const $el_original = $($originals[index])

            // progress bar
            const $parent = $el.closest(FRAME_SELECTOR)
            if ($frame !== $parent) {
                Frame.unload_media($el, $el_original) // unload the frame copy
                callback?.()  // this is a new frame, increase
            }
            $frame = $parent

            // summarize attributes
            const reader = $el_original.data(READ_SRC)
            let data_src = $el.data("src")
            if (reader && !data_src.includes("/")) {
                // Store full path to data-src.
                // Dragged in files did not receive an absolute path from the system.
                data_src = $el.attr("data-src", path + data_src).attr("data-src")
            }
            const attr_src = $el.attr("src")

            // desired change
            switch (true) {
                case reader && keep_raw && PREFER_SRC_EXPORT:  // reader to src
                    $el.attr(EXPORT_SRC, await reader())
                    break
                case reader && keep_raw && !PREFER_SRC_EXPORT:  // reader to data-src-bytes
                    $el.attr(EXPORT_SRC_BYTES, await reader())
                    break
                case reader && !keep_raw && PREFER_SRC_EXPORT:
                case !attr_src && data_src && PREFER_SRC_EXPORT:  // move data-src to src
                    $el.attr(EXPORT_SRC, data_src).removeAttr("data-src")
                    break
            }
        }
    }

    /**
     * Inherit attributes from the ancestors
     */
    static videoInit($articles) {
        $articles.find("video").each(function () {
            const $el = $(this)
            const attributes = prop("video", "autoplay controls", $el).replace("autoplay", "data-autoplay-prevented").split(" ") || [] // ex: ["muted", "autoplay"]
            attributes.forEach((k, v) => this[k] = true) // ex: video.muted = true
            // Following line has so more effect since it was already set by JS. However, for the readability
            // we display the attributes in the DOM too. We could skip the JS for the attribute 'controls'
            // but not for 'muted'. If the <video> is not <video muted> by the DOM load,
            // the attribute would have no effect.
            $el.attr(attributes.reduce((k, v) => ({ ...k, [v]: true }), {})) // ex: <video muted=true>

            if ($el[0].hasAttribute("autoplay")) {
                // While doing an export and preloading frame, it might start playing
                // or sometimes a video in a presentation starts playing after load. Prevent this.
                $el.removeAttr("autoplay").attr("data-autoplay-prevented", 1)
            }
        })
    }

    /**
     * The frame is at the viewport.
     */
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
        const fit = this.prop("fit", "auto")
        if (fit === true || fit === 1 || (fit === 'auto' && $frame.children().length === 0)) {
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

        if ($actor.attr("data-autoplay-prevented")) {
            $actor.removeAttr("data-autoplay-prevented").attr("autoplay", "")
        }

        if ($actor.attr("autoplay")) {
            // Video autoplay (when muted in chromium)
            if ($actor[0].readyState > 3) {
                $actor[0].play().catch(e => {
                    this.playback.hud.alert("Interact with the page before the autoplay works.")
                })
            } else {
                console.warn("Not ready for autoplay", $actor[0])
                // However, we might get rid of this warning for the case the video is being preloaded.
                // In such case, it still has the autoplay attribute, which causes it to play.
            }

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
        this.$frame.find("video").each((_, el) => $(el).off("pause") && el.pause())
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
        const trailing_width = Math.round(medium_width - main_w)

        $actor.removeAttr("style")

        if (w > main_w && w / h > this.prop("panorama-threshold", 2, $actor)) {
            // the image is wider than the sceen (would been shrinked) and its proportion looks like a panoramatic
            let speed = Math.min((trailing_width / 100), 5) * 1000 // 100 px / 1s, but max 5 sec

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
        const maxScale_default = 3
        const wzoom = WZoom.create($actor.get()[0], {
            maxScale: maxScale_default,
            minScale: 1,
            speed: 1,
            // We can wheel in for ever but keeping maxScale on leash.
            // Because the click takes us to the current bed (and second click zooms out).
            rescale: (wzoom) =>
                wzoom.content.maxScale = Math.max(maxScale_default, wzoom.content.currentScale + 3)
        })

        // we have zoomed in, do not playback further
        $actor.off("click wheel").on("click wheel", () => this.playback.moving = false)

        // destruct zooming while leaving the frame
        $actor.data("wzoom-unload", () => setTimeout(() => { // we have to timeout - wzoom bug, has to finish before it can be destroyed
            wzoom.destroy()
            $actor.data("wzoom-unload", null)
        }))
    }

    /**
     * We do not guarantee the frame is preloaded.
     * @returns {string} HTML
     */
    get_preview() {
        const $clone = this.$frame.clone()
        if(this.panorama_starter) { // remove panorama styling
            $clone.find("video, img").first().removeAttr("style")
        }
        return $clone.html()
    }

    /**
     * @returns {?string} The comment just before the frame or just inside the frame.
     */
    get_notes() {
        const frame_dom = this.$frame.get()[0]
        return find_comment(frame_dom.previousSibling, "previousSibling") || find_comment(frame_dom.firstChild, "nextSibling")

        /**
         *
         * @param {HTMLElement|Comment|Text} node First node to search.
         * @param {string} crossing Method
         * @returns {?string}
         */
        function find_comment(node, crossing) {
            while (node) {
                switch (node.nodeType) {
                    case Node.COMMENT_NODE:
                        return node.nodeValue.trim()
                    case Node.TEXT_NODE:
                        if (node.nodeValue.trim()) {
                            return
                        }
                        console.log("531: n,n.previousSibling", node, node[crossing])

                        node = node[crossing] // ex: previousSibling
                        continue // there is just empty text, like new line, ignore
                    default:
                        return
                }
            }
        }
    }

    /**
     * Base file name without the directory.
     * There might be base64 data in the real src, hence we prefer the data-src
     * @param {jQuery} $actor
     * @returns {String}
     */
    get_filename($actor = null) {
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
            callback?.()
            return
        }
        const process = (exif) => {
            const attrs = {}

            const make = exif.Make
            const model = exif.Model
            if (make && model) {
                attrs["data-device"] = `${make} ${model}`
            }

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
            callback?.()
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

    /**
     *
     * @param {jQuery} $frames
     * @returns {Frame[]}
     */
    static frames($frames) {
        return $frames.get().map(frame_dom => $(frame_dom).data("frame"))
    }
}