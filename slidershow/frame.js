


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

    static img(filename, append = true) {
        // data-src prevents the performance for serveral thousand frames
        return FrameFactory.html(`<img src="data:" data-src="${filename}" />`, append)
    }
    static video(filename, append = true) {
        return FrameFactory.html(`<video controls autoplay data-src="${filename}"></video>`, append)
    }

    /**
     *
     * @param {*} filename
     * @returns {null|jQuery} Null if the file could not be included
     */
    static file(filename, append = true) {
        const suffix = filename.split('.').pop().toLowerCase()
        switch (suffix) {
            case "mp4":
                return FrameFactory.video(filename, append)
            case "heif":
            case "heic":
            case "gif":
            case "png":
            case "jpg":
                return FrameFactory.img(filename, append)
            default:
                console.warn("Cannot identify", filename)
                FrameFactory.text("Cannot be identified: " + filename, append)
                return null
        }
    }
}

class Frame {
    constructor($el) {
        this.$frame = $el
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
        const TRANS_DURATION = 1000
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
        $frame.find("img[data-src]").each(function () {
            $(this).attr("src", $(this).data("src"))
            $(this).removeAttr("data-src")
        })
        $frame.find("video[data-src]").each(function () {
            $(this).append("src", $("<source/>", { src: $(this).data("src") }))
            $(this).removeAttr("data-src")
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

            // Exif

            var img1 = $actor.get()
            console.log("153: 1", 1)

            EXIF.getData(img1, function () {
                console.log("157: ", 555)

                var make = EXIF.getTag(this, "Make");
                var model = EXIF.getTag(this, "Model");
                var makeAndModel = document.getElementById("makeAndModel");
                console.log(`${make} ${model}`);
            });
            console.log("153: 2", 1)

            // var img2 = document.getElementById("img2");
            // EXIF.getData(img2, function () {
            //     var allMetaData = EXIF.getAllTags(this);
            //     var allMetaDataSpan = document.getElementById("allMetaDataSpan");
            //     allMetaDataSpan.innerHTML = JSON.stringify(allMetaData, null, "\t");
            // });
        }

        // No HTML tag found, fit plain text to the screen size
        if ($frame.children().length === 0) {
            // textFit($frame) // XXXXXX pusť to zas
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

    /**
     *
     * @returns {jQuery[]}
     */
    static load_all() {
        return $("article,article-map").each((_, el) => $(el).data("frame", new Frame($(el))))
    }
}