


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

    static img(filename, append = true, data = null, ram_only = false) {
        // data-src prevents the performance for serveral thousand frames
        console.log("22: data", data)

        const $el = $(`<img src="data:" data-src="${filename}" />`)
        const $frame = FrameFactory.html($el, append)

        if (data) {
            // sets exif
            Frame.exif($el, data)

            if (ram_only) {
                // src preloading (we do not need to know the exact directory)
                FrameFactory._read(data, $el)
            }
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
        const reader = new FileReader()
        reader.onload = (e) => $el
            .attr("data-src-cached", 1)
            .data("src-cached-data", e.target.result)
        reader.readAsDataURL(data)
    }

    /**
     *
     * @param {string} filename
     * @param {bool} append to $main
     * @param {Object} data
     * @param {bool} ram_only We will push the media contents to the RAM
     * @returns {null|jQuery} Null if the file could not be included
     */

    static file(filename, append = true, data = null, ram_only = false) {
        const suffix = filename.split('.').pop().toLowerCase()
        switch (suffix) {
            case "mp4":
                return FrameFactory.video(filename, append, data, ram_only)
            case "heif":
            case "heic":
            case "gif":
            case "png":
            case "jpg":
                return FrameFactory.img(filename, append, data, ram_only)
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
        this.playback = playback
        this.$video_pause_listener = null
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

    prop(prop) {
        return this.$frame.closest(`[data-${prop}]`).data(prop)
    }

    /**
     *
     * @param {MapWidget} map
     */
    prepare(map) {
        const $frame = this.$frame

        this.children.forEach(f => f.$frame.hide())
        if (this.parent) { // this is a child frame
            $frame.show(0) // it was hidden before
        }

        // preload media
        // for the case of several thousands file, the perfomarce is important
        // XX we should probably implement an unload too

        // Attribute preload – file src is held in the attribute
        $frame.find("img[data-src]").each(function () {
            $(this).attr("src", $(this).data("src"))
            $(this).removeAttr("data-src")
        })
        $frame.find("video[data-src]").each(function () {
            $(this).empty().append($("<source/>", { src: $(this).data("src") }))
        })

        // Memory preload – we hold all data in the memory
        $frame.find("img[data-src-cached]").each(function () {
            $(this).attr("src", $(this).data("src-cached-data"))
        })
        $frame.find("video[data-src-cached]").each(function () {
            $(this).empty().append($("<source/>", { src: $(this).data("src-cached-data") }))
        })



        if ($frame.prop("tagName") === "ARTICLE-MAP") {


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

    enter(video_finished_clb) {
        const $frame = this.$frame

        // Get main media
        const $actor = $frame.find("video, img").first()


        // Image frame
        if ($actor.prop("tagName") === "IMG") {
            this.zoom($actor)
            Frame.exif($actor)
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
        return true
    }

    left() {

    }

    zoom($actor) {
        // Zoomable image
        // XX works bad with object fit
        // const scale_init = 1
        // $actor.wrap('<span style="display:inline-block"></span>')
        //     .css('display', 'block')
        //     .parent()
        //     .zoom({ "magnify": scale_init, "on": "grab" })
        //     .on("dblclick", function () { // exit zooming
        //         $(this).data("current-zoom", 0)
        //         $(this).trigger('zoom.destroy')
        //     })
        //     .on('wheel', function (e) {
        //         e.preventDefault()
        //         const scaleDelta = e.originalEvent.deltaY > 0 ? -.1 : .1;
        //         let scale = ($(this).data("current-zoom") || scale_init) + scaleDelta
        //         if (scale < 0.3) {
        //             $(this).trigger('zoom.destroy')
        //             return
        //         }
        //         $(this).data("current-zoom", scale)
        //         $(this).trigger('zoom.destroy')
        //         $(this).zoom({
        //             magnify: scale
        //         })
        //     })
    }

    static exif($el, data = null, callback = null) {
        if (!READ_EXIF) {
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



            console.log("Exif info", attrs);
            $el.attr(attrs)  // XX these attrs are not used in the moment
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
        return $("article,article-map").each((_, el) => $(el).data("frame", new Frame($(el), playback)))
    }
}