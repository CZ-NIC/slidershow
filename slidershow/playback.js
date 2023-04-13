const POSITIONING_EXPERIMENTAL = true
const MAP_ENABLE = true

/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = null



        const fact = (id) => $("<div/>", { id: id }).prependTo("body")
        this.hud = new Hud(this)

        if (MAP_ENABLE) {
            this.map = new MapWidget(fact("map"), this).map_start()
            this.hud_map = new MapWidget(fact("map-hud"), this).map_start(false)
        }

        /**
         * @type {Frame}
         */
        this.frame
        this.appendEndSlide() // XX gets appended multiple times when playback starts multiple times
        this.frame_count
        this.$articles
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

    /**
     *
     * @param {bool} moving
     */
    play_pause(moving) {
        if (this.moving !== moving) {
            this.hud.playback_icon(moving ? "▶" : "&#9612;&#9612;")
        }
        this.moving = moving
    }

    positionFrames(x1 = null, x2 = null, x3 = null, x4 = null) {
        $articles = this.$articles = Frame.load_all(this)
        console.log("68: $articles", $articles)

        let index = -1
        let clockwise = true
        let sectionCount = 0

        $articles.each((_, el) => {
            const $el = $(el)
            /** @type {Frame} */
            const frame = $el.data("frame")

            // set position to frames
            // XX more options
            if ($el.parent().is(FRAME_SELECTOR)) {
                frame.register_parent($el.parent().data("frame"))
            } else {
                index += 1
            }

            frame.index = index + 1
            // console.log("82: frame,index", frame.$actor, frame.index, index)


            if (!POSITIONING_EXPERIMENTAL) {
                $el.css({
                    top: frame.prop("y", index) * 100 + "vh",
                    left: frame.prop("x", index) * 100 + "vw",
                })
            } else {

                function generateSpiralPosition(index, nextCircle = false) {
                    if (nextCircle) {
                        sectionCount++
                    }
                    const angleStep = clockwise ? -(x2 || 0.1) : (x2 || 0.1); // krok úhlu, závisí na směru
                    const radiusStep = x1 || 0.5; // krok poloměru

                    const bonus = (index < 10) ? index : 10 // the distance is too narrow in the beginning

                    let index_r = index + bonus + sectionCount * 3
                    console.log("124: bonus", index_r, sectionCount, bonus)
                    const angle = angleStep * (index_r * (x3 || 4)); // uprav úhel o aktuální kruh
                    const radius = radiusStep * Math.sqrt((index_r) * (x4 || 0.25));  // uprav poloměr o aktuální kruh
                    const x = radius * Math.cos(angle);
                    const y = radius * Math.sin(angle);
                    const top = (15000 + y * 450) + 'vh';
                    const left = (15000 + x * 450) + 'vw';
                    return { top, left };
                }

                let is_new_section = $el.is(":first") && $el.parent().is("section") && $el.parent().parent().is("main")
                // if (index % 6 === 0) {
                //     is_new_section = true
                // }
                const pos = generateSpiralPosition(index, is_new_section)
                console.log("131: pos", pos)

                $el.css(pos)
            }

            // load tags from localStorage
            frame.check_tag()
        })


        this.frame_count = index
        return $articles
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
        return [wh.press(KEY.SPACE, "Next", (e) => {
            if (this.notVideoFocus()) {
                return this.nextFrame()
            } else {
                this.play_pause(false)
                return false
            }
        }),

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

        // XX Tagging is an undocumented feature
        wh.pressAlt(KEY.G, "Group frames according to their tag", () => this.group()),
        wh.press(KEY.N0, "Tag 0", () => this.frame.set_tag(null)),
        wh.press(KEY.N1, "Tag 1", () => this.frame.set_tag(1)),
        wh.press(KEY.N2, "Tag 2", () => this.frame.set_tag(2)),
        wh.press(KEY.N3, "Tag 3", () => this.frame.set_tag(3)),
        wh.press(KEY.N4, "Tag 4", () => this.frame.set_tag(4)),
        wh.press(KEY.N5, "Tag 5", () => this.frame.set_tag(5)),
        wh.press(KEY.N6, "Tag 6", () => this.frame.set_tag(6)),
        wh.press(KEY.N7, "Tag 7", () => this.frame.set_tag(7)),
        wh.press(KEY.N8, "Tag 8", () => this.frame.set_tag(8)),
        wh.press(KEY.N9, "Tag 9", () => this.frame.set_tag(9)),

        wh.press(KEY.Numpad0, "Tag 0", () => this.frame.set_tag(null)),
        wh.press(KEY.Numpad1, "Tag 1", () => this.frame.set_tag(1)),
        wh.press(KEY.Numpad2, "Tag 2", () => this.frame.set_tag(2)),
        wh.press(KEY.Numpad3, "Tag 3", () => this.frame.set_tag(3)),
        wh.press(KEY.Numpad4, "Tag 4", () => this.frame.set_tag(4)),
        wh.press(KEY.Numpad5, "Tag 5", () => this.frame.set_tag(5)),
        wh.press(KEY.Numpad6, "Tag 6", () => this.frame.set_tag(6)),
        wh.press(KEY.Numpad7, "Tag 7", () => this.frame.set_tag(7)),
        wh.press(KEY.Numpad8, "Tag 8", () => this.frame.set_tag(8)),
        wh.press(KEY.Numpad9, "Tag 9", () => this.frame.set_tag(9)),

        wh.pressAlt(KEY.Numpad1, "Tag 10", () => this.frame.set_tag(10)),
        wh.pressAlt(KEY.Numpad2, "Tag 11", () => this.frame.set_tag(11)),
        wh.pressAlt(KEY.Numpad3, "Tag 12", () => this.frame.set_tag(12)),
        wh.pressAlt(KEY.Numpad4, "Tag 13", () => this.frame.set_tag(13)),
        wh.pressAlt(KEY.Numpad5, "Tag 14", () => this.frame.set_tag(14)),
        wh.pressAlt(KEY.Numpad6, "Tag 15", () => this.frame.set_tag(15)),
        wh.pressAlt(KEY.Numpad7, "Tag 16", () => this.frame.set_tag(16)),
        wh.pressAlt(KEY.Numpad8, "Tag 17", () => this.frame.set_tag(17)),
        wh.pressAlt(KEY.Numpad9, "Tag 18", () => this.frame.set_tag(18)),

        wh.pressAlt(KEY.PageDown, "Next section", () => this.nextSection()),
        wh.pressAlt(KEY.PageUp, "Prev section", () => this.previousSection()),

            // wh.pressAlt(KEY.T, "Thumbnails", () => this.thumbnails()),
        ]

    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     */
    group() {
        $articles.each((_, el) => {
            const $frame = $(el)
            /** @type {Frame} */
            const frame = $frame.data("frame")

            const tag = frame.$actor.attr("data-tag") || 0
            // if(!tag) { // XX delete element without tag (not working)
            //     console.log("214: delete", )
            //     $frame.remove()
            //     return
            // }

            let $section = $(`section[data-tag=${tag}]`)
            console.log("202: tag, $section.length", tag, $section.length)
            if (!$section.length) {
                $section = $("<section/>", { "data-tag": tag }).prependTo($main)
            }
            $frame.appendTo($section)
        })
        this.positionFrames()
        this.goToFrame(this.$current.data("frame").index - 1) // keeps you on the same frame (woorks badly)
    }

    nextFrame() {
        this.goToFrame(this.index + 1, true)
    }
    previousFrame() {
        this.goToFrame(this.index - 1)
    }

    nextSection() {
        const $next = this.frame.$frame.closest("section, main").next().find(FRAME_SELECTOR).first()
        console.log("242: $next", $next, $next.data("frame").index)

        this.goToFrame($next.data("frame").index - 1, true)
    }
    previousSection() {
        const $previous = this.frame.$frame.closest("section, main").prev().find(FRAME_SELECTOR).first()
        console.log("242: $previous", $previous, $previous.data("frame").index)

        this.goToFrame($previous.data("frame").index - 1)
    }

    notVideoFocus() {
        return $(":focus").prop("tagName") !== "VIDEO"
    }

    /**
     * // XX expose to a shortcut
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

        const trans = same_frame ? $main.css(frame.get_position()) : this.transition($last, $current)
        const promise = this.promise = trans.promise()
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
                    return $main.animate(current.get_position(), TRANS_DURATION)
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

