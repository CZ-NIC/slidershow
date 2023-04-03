const wh = new WebHotkeys()
const $body = $("main")


const TRANS_DURATION = ($("main").data("transition-duration") || 0) * 1000 //* 0// XX do an attribute instead

/**
 * Main menu.
*/
class Menu {
    constructor() {
        // $articles.hide(0) XX pryč
        const $menu = this.$menu = $("menu").show(0)

        const $start = $("#start").focus().click(() => this.start())

        if ($menu.attr("data-skip") !== undefined) {
            this.start()
        }

        wh.press(KEY.ESCAPE, "Go to menu", () => {
            playback.stop()
            $menu.show()
            $start.focus()

            // scroll back
            Playback.resetWindow()
            $body.css({ top: '0px', left: '0px' })
        })

        // Drop new files
        const $drop = $("#drop").on("drop", (ev) => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile().name)
            if (this.appendFiles(items)) {
                $drop.text(`Dropped ${items.length} files.`)
            } else {
                $drop.text('Drop cancelled')
            }
        }).on("dragover", (ev) => {
            $drop.text("Drop")
            ev.preventDefault()
        }).on("dragleave", (ev) => {
            $drop.text($drag.data("placeholder"))
            ev.preventDefault()
        })

        // Input files
        const $file = $("#file").change(() => {
            this.appendFiles([...$file[0].files].map(f => f.name))
        })
    }

    start() {
        this.$menu.hide()
        playback = new Playback()
    }

    appendFiles(items) {
        console.log("49: items", items)
        const folder = prompt("What folder have you taken the files from?", "/home/.../")
        if (folder === null) {
            return
        }

        $articles.remove() // delete old frames
        const $section = $("<section/>").appendTo($body);//.data(defaults)
        ([...(new FormData($("#defaults")[0]))]).map(([key, val]) => $section.attr("data-" + key, val))

        const elements = items.map(item => FrameFactory.file(folder + item, false)).filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        return true
    }
}


/**
 * Append new frame programatically with the static methods.
 */
class FrameFactory {
    static html(html, append = true) {
        const $el = $("<article/>", { html: html })
        if (append) {
            $el.appendTo($body).hide(0)
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
    }

    effect(effect) {
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

    enter(video_finished_clb) {
        const $frame = this.$frame

        // Get main media
        const $actor = $frame.find("video, img").first()

        // Zoomable image
        if ($actor.prop("tagName") === "IMG") {
            $actor.zoom()
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

    /**
     *
     * @returns {jQuery[]}
     */
    static load_all() {
        return $("article,article-map").each((_, el) => $(el).data("frame", new Frame($(el))))
    }
}

/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = null
        /**
         * @type {Frame}
         */
        this.frame
        this.appendEndSlide() // XX gets appended multiple times when playback starts multiple times
        $articles = Frame.load_all()
        this.positionFrames()
        $articles.show()

        this.hud = new Hud()
        this.hud.map_start()


        this.$current = $articles.first()
        this.goToFrame(0, true)
        this.$current.show()

        this.videoInit()
        this.shortcuts()
    }

    stop() {
        clearTimeout(this.moving_timeout)
        $articles.hide()
        console.log("188: Abor",)

        this.promise.aborted = true
    }

    positionFrames() {
        // XX more options
        $articles.each((index, el) => {
            const $el = $(el)
            const frame = $el.data("frame")
            // XXX data("x") might be ZERO. Do not ignore.
            $el.css({
                top: (frame.prop("y") || index) * 100 + "vh",
                left: (frame.prop("x") || index) * 100 + "vw"
            })
        })
    }

    /**
     * Inherit attributes from the ancestors
     */
    videoInit() {
        $articles.find("video").each(function () {
            const attributes = $(this).closest("[data-video]").data("video")?.split(" ") || [] // ex: ["muted", "autoplay"]
            attributes.forEach((k, v) => this[k] = true) // ex: video.muted = true
            // Following line has so more effect since it was already set by JS. However, for the readability
            // we display the attributes in the DOM too. We could skip the JS for the attribute 'controls'
            // but not for 'muted'. If the <video> is not <video muted> by the DOM load,
            // the attribute would have no effect.
            $(this).attr(attributes.reduce((k, v) => ({ ...k, [v]: true }), {})) // ex: <video muted=true>
        })
    }

    appendEndSlide() {
        FrameFactory.text("... end.")
    }

    shortcuts() {
        // Shortcuts
        wh.press(KEY.SPACE, "Next", () => this.notVideoFocus() && this.nextFrame())

        wh.press(KEY.RIGHT, "Next", () => this.notVideoFocus() && this.nextFrame())
        wh.press(KEY.LEFT, "Prev", () => this.notVideoFocus() && this.previousFrame())

        wh.press(KEY.N, "Next", () => this.nextFrame())
        wh.press(KEY.P, "Prev", () => this.previousFrame())

        wh.press(KEY.PageDown, "Next", () => this.nextFrame())
        wh.press(KEY.PageUp, "Prev", () => this.previousFrame())

        wh.press(KEY.Home, "Go to the first", () => this.goToFrame(0))
        wh.press(KEY.End, "Go to end", () => this.goToFrame($articles.length - 2)) // -2 and not -1 due to our artificial end slide

        wh.press(KEY.H, "Show help", () => {
            alert(wh.getText())
        })

    }

    nextFrame() {
        this.goToFrame(this.index + 1, true)
    }
    previousFrame() {
        this.goToFrame(this.index - 1)
    }

    notVideoFocus() {
        return $(":focus").prop("tagName") !== "VIDEO"
    }

    /**
     *
     * @param {Number} index
     */
    goToFrame(index, moving = false) {
        console.log("Frame", index)

        const $last = this.$current

        // Unload the frame
        // lose focus on anything on the past frame (but keep on HUD)
        $(':focus', $last).blur()
        $last.find("video").each((_, el) => $(el).off("pause") && el.pause())

        const next = $articles[index]
        const $current = this.$current = next ? $(next) : $last
        /**
         * @type {Frame}
         */
        const frame = this.frame = $current.data("frame")
        console.log("Transition starts", index)

        this.index = $articles.index($current)

        // preload media
        // for the case of several thousands file, the perfomarce is important
        // XX we should probably implement an unload too
        $current.find("img[data-src]").each(function () {
            $(this).attr("src", $(this).data("src"))
            $(this).removeAttr("data-src")
        })
        $current.find("video[data-src]").each(function () {
            $(this).append("src", $("<source/>", { src: $(this).data("src") }))
            $(this).removeAttr("data-src")
        })

        const $map = $("#map") //XXX
        if ($current.prop("tagName") === "ARTICLE-MAP") { // XXXX asi předělat na frame
            // $map.css({top: $current.position().top, left: $current.position().left})
            console.log("294: zdeee")
            $("#map").show(0)

            // Viz papírek XXXXXXXXXXXX

            // $map.animate({
            //     top: `${$current.position().top}px`,
            //     left: `${$current.position().left}px`,
            // }, TRANS_DURATION)

            this.hud.suggest("Pardubice")
        }

        // start transition
        this.moving = moving
        if (this.moving_timeout) {
            clearTimeout(this.moving_timeout)
        }
        this.promise.aborted = true
        const promise = this.promise = $last[0] === $current[0] ? Promise.resolve() : this.transition($last, $current).promise()
        promise.then(() => {
            // frame is at the viewport now
            if (promise.aborted) { // another frame was raise meanwhile
                console.log("235: ABORTED",)
                return
            }
            console.log("Frame ready")
            const duration = this.frame.enter(() => this.moving && this.nextFrame())

            // Duration
            if (moving && duration) {
                this.moving_timeout = setTimeout(() => this.moving && frame.leave() && this.nextFrame(), duration * 1000)
            }
        })
    }

    transition($last, $current) {
        /**
         * @type {Frame}
         */
        const last = $last.data("frame")
        /**
         * @type {Frame}
         */
        const current = $current.data("frame")
        switch (current.prop("transition")) {
            case "scroll-down": // XX deprec?
                if ($articles.index($last) < $articles.index($current)) {
                    last.effect("go-up")
                    return current.effect("arrive-from-bottom")
                } else {
                    last.effect("go-down")
                    return current.effect("arrive-from-top")
                }
            case "fade": // XX incompatible with body manipulation
                $last.fadeOut(TRANS_DURATION)
                return $current.fadeIn(TRANS_DURATION)
            default:
                Playback.resetWindow()
                return $body.animate({
                    top: `-${$current.position().top}px`,
                    left: `-${$current.position().left}px`,
                }, TRANS_DURATION)
        }
    }

    /**
     * The browser tends to scroll the hidden scrollbar even if we move the body manually
     */
    static resetWindow() {
        $body.stop()
        window.scrollTo(0, 0)
    }
}

/**
 * @type {Object.<string, SMap.Coords>} {query: SMap.Coords}
 */
MapCache = {}

class Hud {
    constructor() {
        this.map = null
    }
    map_start() {
        return
        const center = SMap.Coords.fromWGS84(14.41790, 50.12655)
        const map = this.map = new SMap(JAK.gel("map"), center)
        map.addDefaultLayer(SMap.DEF_BASE).enable()
        map.addDefaultControls()

        // marker layer
        var marker_layer = new SMap.Layer.Marker()
        map.addLayer(marker_layer)
        marker_layer.enable()

        $("#map").hide(0)

    }

    set_center(point) {
        console.log("445: point", point)
        this.map.setCenter(point, true)
        //return SMap.Coords.fromWGS84(this.coordinates.longitude, this.coordinates.latitude)
    }

    suggest(query) {
        return

        return (new SMap.SuggestProvider()).get(query).then((addresses) => {
            if (addresses.length < 1) {
                console.log("Coordinates error", query, addresses)
                return
            }
            console.log("456: addresses[0]", addresses[0])

            MapCache[query] = addresses[0]
            const point = addresses[0]
            const coords = SMap.Coords.fromWGS84(point.longitude, point.latitude)
            this.set_center(coords)
        })
    }
}

// Main
let $articles = Frame.load_all()
/**
 * @type {Playback}
 */
let playback


// export to the dev console
const menu = new Menu()
playback