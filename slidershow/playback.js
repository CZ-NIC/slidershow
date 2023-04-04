
/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = null

        this.map = new MapWidget().map_start()

        /**
         * @type {Frame}
         */
        this.frame
        this.appendEndSlide() // XX gets appended multiple times when playback starts multiple times
        $articles = Frame.load_all(this)
        this.positionFrames()

        this.$current
        this.index = 0

        this.start()
        // this.$current.show()
        this.videoInit()
        this.shortcuts()

    }

    start() {
        $articles.show()
        this.$current = $articles.first()
        this.goToFrame(this.index, true)
    }

    stop() {
        clearTimeout(this.moving_timeout)
        $articles.hide()
        this.promise.aborted = true
        // return this.index
    }

    positionFrames() {
        // XX more options
        let index = -1
        $articles.each((_, el) => {
            const $el = $(el)
            /** @type {Frame} */
            const frame = $el.data("frame")

            if ($el.parent().is("article,article-map")) {
                frame.register_parent($el.parent().data("frame"))
            } else {
                index += 1
            }
            // XXX data("x") might be ZERO. Do not ignore.
            $el.css({
                top: (frame.prop("y") || index) * 100 + "vh",
                left: (frame.prop("x") || index) * 100 + "vw",
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

        frame.prepare()

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
            const duration = frame.enter(() => this.moving && this.nextFrame())

            if ($last[0] !== $current[0]) {
                $last.data("frame").left()
            }

            // Duration
            if (moving && duration) {
                this.moving_timeout = setTimeout(() => this.moving && frame.leave() && this.nextFrame(), duration * 1000)
            }
        })
    }

    /**
     * @returns {Object} that we can call promise() to
     */
    transition($last, $current) {
        /** @type {Frame} */
        const last = $last.data("frame")
        /** @type {Frame} */
        const current = $current.data("frame")
        const TRANS_DURATION = current.prop("transition-duration") * 1000

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
                if (
                    $main.position().top === -$current.position().top &&
                    $main.position().left === -$current.position().left
                ) {
                    // skip the animation as the frame is already at position
                    return { promise: () => Promise.resolve() } // this is just a dummy object
                } else {
                    Playback.resetWindow()
                    return $main.animate({
                        top: `-${$current.position().top}px`,
                        left: `-${$current.position().left}px`,
                    }, TRANS_DURATION)
                }
        }
    }

    /**
     * The browser tends to scroll the hidden scrollbar even if we move the body manually
     */
    static resetWindow() {
        $main.stop()
        window.scrollTo(0, 0)
    }
}

