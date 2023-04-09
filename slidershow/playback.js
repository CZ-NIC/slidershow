/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = null



        const fact = (id) => $("<div/>", { id: id }).prependTo("body")
        this.map = new MapWidget(fact("map"), this).map_start()
        this.hud = new Hud()
        this.hud_map = new MapWidget(fact("map-hud"), this).map_start(false)

        /**
         * @type {Frame}
         */
        this.frame
        this.appendEndSlide() // XX gets appended multiple times when playback starts multiple times
        $articles = Frame.load_all(this)
        this.positionFrames()

        this.$current
        this.index = 0

        // this.$current.show()
        this.shortcuts = this.shortcutsInit()
        this.start()
        this.videoInit()

    }

    start() {
        $articles.show()
        $hud.show(0)
        this.$current = $articles.first()
        this.goToFrame(this.index, true)
        this.shortcuts.forEach(s => s.enable())
    }

    stop() {
        clearTimeout(this.moving_timeout)
        $articles.hide()
        $hud.hide(0)
        this.promise.aborted = true
        this.hud_map.hide()
        this.shortcuts.forEach(s => s.disable())
    }
    destroy() {
        console.log("47: this.map.map", this.map.map)

        this.map.destroy()
        this.hud_map.destroy()
    }

    play_pause(moving) {
        if (this.moving !== moving) {
            this.hud.playback_icon(moving ? "▶" : "&#9612;&#9612;")
        }
        this.moving = moving
    }

    positionFrames() {
        // XX more options
        let index = -1
        $articles.each((_, el) => {
            const $el = $(el)
            /** @type {Frame} */
            const frame = $el.data("frame")

            if ($el.parent().is(FRAME_SELECTOR)) {
                frame.register_parent($el.parent().data("frame"))
            } else {
                index += 1
            }
            $el.css({
                top: frame.prop("y", index) * 100 + "vh",
                left: frame.prop("x", index) * 100 + "vw",
            })
        })


        /* XXX
        function generateSpiralPosition(index, nextCircle=false) {
  const angleStep = clockwise ? -0.1 : 0.1; // krok úhlu, závisí na směru
  const radiusStep = 0.1; // krok poloměru

  if (index === 0) { // pokud je index 0, nastav aktuální kruh na 0
    currentCircle = 0;
  } else if (index % 4 === 0) { // každý 4. div, zvyš aktuální kruh o 1
  // XX if (nextCircle)
    currentCircle++;
  }

  const angle = angleStep * (index + currentCircle * 4); // uprav úhel o aktuální kruh
  const radius = radiusStep * Math.sqrt(index + currentCircle); // uprav poloměr o aktuální kruh
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const top = (50 + y * 45) + 'vh';
  const left = (50 + x * 45) + 'vw';
  return { top, left };
}

// Funkce pro změnu směru spirály
function changeSpiralDirection() {
  clockwise = !clockwise; // změna směru
  currentCircle++; // zvýšení aktuálního kruhu o 1
}*/
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

    shortcutsInit() {
        return [wh.press(KEY.SPACE, "Next", () => this.notVideoFocus() && this.nextFrame()),

        wh.press(KEY.RIGHT, "Next", () => this.notVideoFocus() && this.nextFrame()),
        wh.press(KEY.LEFT, "Prev", () => this.notVideoFocus() && this.previousFrame()),

        wh.press(KEY.N, "Next", () => this.nextFrame()),
        wh.press(KEY.P, "Prev", () => this.previousFrame()),

        wh.press(KEY.PageDown, "Next", () => this.nextFrame()),
        wh.press(KEY.PageUp, "Prev", () => this.previousFrame()),

        wh.press(KEY.Home, "Go to the first", () => this.goToFrame(0)),
        wh.press(KEY.End, "Go to end", () => this.goToFrame($articles.length - 2)), // -2 and not -1 due to our artificial end slide

        wh.press(KEY.M, "Toggle hud map", () => this.notVideoFocus() && this.hud_map.toggle()),

        wh.press(KEY.F, "Toggle file info", () => $("#hud-fileinfo").toggle()),

        wh.press(KEY.N0, "Tag 0", () => this.frame.tag(null)),
        wh.press(KEY.N1, "Tag 1", () => this.frame.tag(1)),
        wh.press(KEY.N2, "Tag 2", () => this.frame.tag(2)),
        wh.press(KEY.N3, "Tag 3", () => this.frame.tag(3)),
        wh.press(KEY.N4, "Tag 4", () => this.frame.tag(4)),
        wh.press(KEY.N5, "Tag 5", () => this.frame.tag(5)),
        wh.press(KEY.N6, "Tag 6", () => this.frame.tag(6)),
        wh.press(KEY.N7, "Tag 7", () => this.frame.tag(7)),
        wh.press(KEY.N8, "Tag 8", () => this.frame.tag(8)),
        wh.press(KEY.N9, "Tag 9", () => this.frame.tag(9)),

        wh.press(KEY.Numpad0, "Tag 0", () => this.frame.tag(null)),
        wh.press(KEY.Numpad1, "Tag 1", () => this.frame.tag(1)),
        wh.press(KEY.Numpad2, "Tag 2", () => this.frame.tag(2)),
        wh.press(KEY.Numpad3, "Tag 3", () => this.frame.tag(3)),
        wh.press(KEY.Numpad4, "Tag 4", () => this.frame.tag(4)),
        wh.press(KEY.Numpad5, "Tag 5", () => this.frame.tag(5)),
        wh.press(KEY.Numpad6, "Tag 6", () => this.frame.tag(6)),
        wh.press(KEY.Numpad7, "Tag 7", () => this.frame.tag(7)),
        wh.press(KEY.Numpad8, "Tag 8", () => this.frame.tag(8)),
        wh.press(KEY.Numpad9, "Tag 9", () => this.frame.tag(9)),

        wh.pressAlt(KEY.Numpad1, "Tag 10", () => this.frame.tag(10)),
        wh.pressAlt(KEY.Numpad2, "Tag 11", () => this.frame.tag(11)),
        wh.pressAlt(KEY.Numpad3, "Tag 12", () => this.frame.tag(12)),
        wh.pressAlt(KEY.Numpad4, "Tag 13", () => this.frame.tag(13)),
        wh.pressAlt(KEY.Numpad5, "Tag 14", () => this.frame.tag(14)),
        wh.pressAlt(KEY.Numpad6, "Tag 15", () => this.frame.tag(15)),
        wh.pressAlt(KEY.Numpad7, "Tag 16", () => this.frame.tag(16)),
        wh.pressAlt(KEY.Numpad8, "Tag 17", () => this.frame.tag(17)),
        wh.pressAlt(KEY.Numpad9, "Tag 18", () => this.frame.tag(18)),
        ]

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

        const same_frame = $last[0] === $current[0]
        if (!same_frame) {
            $last.data("frame").leave()
        }
        frame.prepare()

        // start transition
        this.play_pause(moving)
        if (this.moving_timeout) {
            clearTimeout(this.moving_timeout)
        }
        this.promise.aborted = true
        const promise = this.promise = same_frame ? Promise.resolve() : this.transition($last, $current).promise()
        promise.then(() => {
            // frame is at the viewport now
            if (promise.aborted) { // another frame was raise meanwhile
                console.log("235: ABORTED",)
                return
            }
            console.log("Frame ready")
            const duration = frame.enter(() => this.moving && this.nextFrame())

            if (!same_frame) {
                $last.data("frame").left()
            }


            // Duration
            if (moving && duration) {
                this.moving_timeout = setTimeout(() => this.moving && this.nextFrame(), duration * 1000)
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

