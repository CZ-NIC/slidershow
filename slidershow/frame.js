const PRELOAD_XXX = false // XXX Nejde mi to stáhnout, když používám preload. Ale jenom když je to na RAMce, bez cesty.

/**
 * Append new frame programatically with the static methods.
 */
class FrameFactory {
    static html(html, append = true) {
        const $el = $("<article/>", { html: html })
        if (append) {
            $el.appendTo($main).hide(0)
        }
        return $el
    }

    static text(text, append = true) {
        return FrameFactory.html(text, append)
    }

    static img(filename, append = true, data = null, ram_only = false, callback = null) {
        // data-src prevents the performance for serveral thousand frames
        const $el = $(`<img src="data:" data-src="${filename}" />`)
        const $frame = FrameFactory.html($el, append)

        if (data) {
            // sets exif
            Frame.exif($el, data, callback)

            if (ram_only) {
                // src preloading (we do not need to know the exact directory)
                FrameFactory._read(data, $el)
            }
        } else {
            callback()
        }
        return $frame
    }

    static video(filename, append = true, data = null, ram_only = false) {
        const $el = $(`<video controls autoplay data-src="${filename}"></video>`)
        const $frame = FrameFactory.html($el, append)
        if (data && ram_only) {
            FrameFactory._read(data, $el)
        }
        return $frame
    }

    static _read(data, $el) {
        if (PRELOAD_XXX) {
            $el
                .attr("data-src-cached", 1)
                .data("src-cached-data", (dom) => {
                    const reader = new FileReader()
                    reader.onload = (e) => dom.src = e.target.result
                    reader.readAsDataURL(data)
                })
        } else {

            const reader = new FileReader()
            reader.onload = (e) => $el
                .attr("data-src-cached", 1)
                .data("src-cached-data", e.target.result)
            reader.readAsDataURL(data)
        }
    }

    /**
     *
     * @param {string} filename
     * @param {bool} append to $main
     * @param {Object} data
     * @param {bool} ram_only We will push the media contents to the RAM
     * @returns {null|jQuery} Null if the file could not be included
     */

    static file(filename, append = true, data = null, ram_only = false, callback = null) {
        const suffix = filename.split('.').pop().toLowerCase()
        switch (suffix) {
            case "mp4":
                callback()
                return FrameFactory.video(filename, append, data, ram_only)
            case "heif":
            case "heic":
            case "gif":
            case "png":
            case "jpg":
                return FrameFactory.img(filename, append, data, ram_only, callback)
            default:
                console.warn("Cannot identify", filename)
                FrameFactory.text("Cannot be identified: " + filename, append)
                return null
        }
    }
}

class Frame {
    /**
     *
     * @param {jQuery} $el
     * @param {Playback|null} playback
     */
    constructor($el, playback = null) {
        this.$frame = $el
        /** @type Playback */
        this.playback = playback
        this.$video_pause_listener = null
        /**  @type {jQuery|null}         */
        this.$actor = null

        this.panorama_callback = null

        /**
         * If set, this frame is a subframe.
         * @type {Frame|null}
         */
        this.parent = null
        /**
         * Subframes
         * @type {Frame[]}
         */
        this.children = []
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
     * @returns
     */
    prop(prop, def = null) {
        const v = this.$frame.closest(`[data-${prop}]`).data(prop)
        if (v === undefined && def !== undefined) {
            return def
        }
        return v
    }

    prepare() {
        const $frame = this.$frame

        this.children.forEach(f => f.$frame.hide())
        if (this.parent) { // this is a child frame
            $frame.show(0) // it was hidden before
        }

        Frame.preload($frame)


        // Get main media
        const $actor = this.$actor = $frame.find("video, img").first()
        if ($actor.prop("tagName") === "IMG") {
            this.panorama()
        }

        // File name
        console.log("186: $actor", $actor, $frame)

        this.playback.hud.fileinfo($actor)
        this.check_tag()

        // Map
        const gps = $actor.data("gps")
        if (gps) {
            this.playback.hud_map.animate_to(...gps.split(","))
        }

        if ($frame.prop("tagName") === "ARTICLE-MAP") {

            const map = this.playback.map
            map.adapt(this)
            map.geometry_layer.clear()
            map.marker_layer.clear()
            const route = $frame.data("route")
            if (route) {
                map.display_route(route.split(","))
            }
            const places = $frame.data("places")
            if (places) {
                map.display_markers(places.split(","))
                // setTimeout(()=>{
                //     map.display_markers(["Sušice"])
                // }, 1500)
            }
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
            if (PRELOAD_XXX) {
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

    enter(video_finished_clb) {
        const $frame = this.$frame

        // Get main media
        const $actor = this.$actor

        // Image frame
        if ($actor.prop("tagName") === "IMG") {
            this.zoom()
            Frame.exif($actor)
            if (this.panorama_callback) {
                this.panorama_callback()
            }
        }

        // No HTML tag found, fit plain text to the screen size
        if ($frame.children().length === 0) {
            textFit($frame)
        }

        // Video frame
        if ($actor.prop("tagName") === "VIDEO") {
            console.log("172: Focusing actionr", $actor)

            $actor.focus() // Focus video controls

            if ($actor.attr("autoplay")) {
                // Video autoplay (when muted in chromium)
                $actor[0].play().catch(() => {
                    alert("Interact with the page before the autoplay works.") // XX -> HUD
                })
            }

            this.$video_pause_listener = $actor.on("pause", () => {
                $actor.off("pause")
                video_finished_clb()
            })
        }

        return $actor.prop("tagName") === "VIDEO" ? this.prop("duration-video") : this.prop("duration")
    }

    leave() {
        if (this.$video_pause_listener) {
            this.$video_pause_listener.off("pause")
            this.$video_pause_listener = null
        }
        this.$actor?.data("wzoom-unload")?.()

        this.playback.hud_map.hide()
        return true
    }

    left() {
        this.$actor.stop(true)
    }

    panorama() {
        const $actor = this.$actor
        this.panorama_callback = null

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

        if (w / h > 2) {
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
            this.panorama_callback = () => {
                $actor.animate({
                    left: - trailing_width,
                }, speed, () => {
                    console.log("255: ANIM CENTRA", $actor)
                    $actor.animate({
                        left: 0,
                        width: main_w,
                        top: (main_h / 2) - (small_height / 2) + "px"
                    }, 1000, () => {
                        $actor.removeAttr("style")
                    })
                })
            }
        }
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

    check_tag() {
        const $actor = this.$actor
        const name = ($actor.data("src") || $actor.attr("src"))?.split("/").pop()
        const tag = localStorage.getItem("TAG: " + name)
        console.log("387: tag", tag)

        if (tag) {
            console.log("390: TAG ZDE", tag)

            $actor.attr("data-tag", tag)
        }
        this.playback.hud.tag(tag)
    }

    tag(tag) {
        console.log("392: anooo")

        const $actor = this.$actor
        const name = ($actor.data("src") || $actor.attr("src"))?.split("/").pop()

        const key = "TAG: " + name
        if (tag) {
            localStorage.setItem(key, tag)
            $actor.attr("data-tag", tag)
        } else {
            localStorage.removeItem(key)
            $actor.removeAttr("data-tag")
        }

        this.check_tag()
    }

    static exif($el, data = null, callback = null) {
        if (!READ_EXIF || $el.data("exif-done")) {
            console.log("367: skip exif",)

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

            // console.log("Exif info", attrs);
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