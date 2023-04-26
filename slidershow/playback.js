const MAP_ENABLE = true

/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = new Interval().stop()



        const fact = (id) => $("<div/>", { id: id }).prependTo("body")
        this.hud = new Hud(this)

        if (MAP_ENABLE) {
            this.map = new MapWidget(fact("map"), this).map_start()
            this.hud_map = new MapWidget(fact("map-hud"), this).map_start()
        }

        /**
         * @type {Frame}
         */
        this.frame
        this.appendEndSlide() // XX gets appended multiple times when playback starts multiple times
        this.slide_count
        this.$articles
        this.positionFrames()

        this.$current
        this.index = 0

        // this.$current.show()
        this.shortcuts = this.shortcutsInit()
        this.start()
        this.videoInit()

        this.debug = false
    }

    start() {
        $articles.show()
        $hud.show(0)
        this.$current = $articles.first()
        this.goToFrame(this.index, true)
        this.shortcuts.forEach(s => s.enable())
    }

    stop() {
        this.moving_timeout.stop()
        $articles.hide()
        $hud.hide(0)
        this.promise.aborted = true
        this.hud_map.hide()
        this.shortcuts.forEach(s => s.disable())
    }
    destroy() {
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

        let slide_index = -1
        let frame_index = -1

        let clockwise = true
        let sectionCount = 0

        $articles.each((_, el) => {
            const $el = $(el)
            /** @type {Frame} */
            const frame = $el.data("frame")

            // check nested frames
            if ($el.parent().is(FRAME_SELECTOR)) {
                frame.register_parent($el.parent().data("frame"))
            } else {
                slide_index += 1
            }

            frame.index = ++frame_index
            frame.slide_index = slide_index

            const positioning = prop("spread-frames", true, $main)
            switch (positioning) {
                case "spiral":
                case true:
                    function generateSpiralPosition(index, nextCircle = false) {
                        if (nextCircle) {
                            sectionCount++
                        }
                        const angleStep = clockwise ? -(x2 || 0.1) : (x2 || 0.1); // krok úhlu, závisí na směru
                        const radiusStep = x1 || 0.5; // krok poloměru

                        const bonus = (index < 10) ? index : 10 // the distance is too narrow in the beginning

                        let index_r = index + bonus + sectionCount * 3
                        const angle = angleStep * (index_r * (x3 || 4)); // uprav úhel o aktuální kruh
                        const radius = radiusStep * Math.sqrt((index_r) * (x4 || 0.25));  // uprav poloměr o aktuální kruh
                        const x = radius * Math.cos(angle);
                        const y = radius * Math.sin(angle);
                        const top = (15000 + y * 450) + 'vh';
                        const left = (15000 + x * 450) + 'vw';
                        // console.log("124: bonus", index_r, sectionCount, bonus, top, left)
                        return { top, left };
                    }

                    let is_new_section = $el.is(":first-child") && $el.parent().is("section") && $el.parent().parent().is("main")
                    // console.log("126: $l", $el, $el.is(":first-child"), $el.parent().is("section"), $el.parent().parent().is("main"), $el.is(":first") && $el.parent().is("section") && $el.parent().parent().is("main"))

                    // if (index % 6 === 0) {
                    //     is_new_section = true
                    // }
                    const pos = generateSpiralPosition(slide_index, is_new_section)
                    $el.css(pos)
                    break;
                case "diagonal":
                    $el.css({
                        top: frame.prop("y", slide_index) * 100 + "vh",
                        left: frame.prop("x", slide_index) * 100 + "vw",
                    })
                    break;
                default:
                    this.hud.alert(`Unknown spread-frames: ${positioning}`)
            }

            // load tags from localStorage
            frame.check_tag()
        })


        this.slide_count = slide_index + 1
        return $articles
    }

    /**
     * Inherit attributes from the ancestors
     */
    videoInit() {
        $articles.find("video").each(function () {
            const attributes = prop("video", "autoplay controls", $(this)).split(" ") || [] // ex: ["muted", "autoplay"]
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

        wh.press(KEY.A, "Play/Pause", () => { // XX undocumented, replace by the space
            this.play_pause(!this.moving)
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

        wh.pressAlt(KEY.D, "Debug", () => {
            const zoom = $main.css("zoom")
            $main.css({ "zoom": zoom == "1" ? "0.05" : "1" })
            this.debug = !this.debug
        }),
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
        const $next = this.getSection().next().find(FRAME_SELECTOR).first()
        this.goToArticle($next, true)
    }
    previousSection() {
        const $section = this.getSection()
        const $first = $(FRAME_SELECTOR, $section).first()
        console.log("289: $first", $first)

        if ($first.data("frame").index === this.frame.index) {
            const $previous = $section.prev().find(FRAME_SELECTOR).first()
            this.goToArticle($previous)
        } else {
            console.log("295: zde",)

            this.goToArticle($first)
        }
    }

    notVideoFocus() {
        return $(":focus").prop("tagName") !== "VIDEO"
    }

    getSection() {
        return this.frame.$frame.closest("section, main")
    }

    goToArticle($frame, moving = false) {
        const frame = $frame.data("frame")
        if (!frame) {
            this.shake()
        } else {
            this.goToFrame(frame.index, moving)
        }
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
        this.index = frame.index

        const same_frame = $last[0] === $current[0]
        /** @type {Frame} */
        const last_frame = $last.data("frame")
        if (!same_frame) {
            last_frame.leave()
        }
        frame.prepare()

        // start transition
        this.play_pause(moving)
        this.moving_timeout.stop()
        this.promise.aborted = true

        if (this.debug) {
            $last.css({ "background": "unset" })
            $current.css({ "background": "blue" })
        } else {
            $last.css({ "background": "unset" })
        }


        const trans = same_frame ? $main.css(frame.get_position()) : this.transition($last, $current)
        const promise = this.promise = trans.promise()
        const all_done = () => !promise.aborted && this.moving && this.nextFrame()
        promise.then(() => {
            // frame is at the viewport now
            if (promise.aborted) { // another frame was raise meanwhile
                return
            }
            console.log("Frame ready")
            const duration = frame.enter()

            if (!same_frame) {
                $last.data("frame").left()
            }


            // Duration
            // XX If stopped because of the duration, give info.
            // if(moving && !duration && last_frame.get_duration()) {
            //     console.log("343: CHANGE", last_frame.get_duration(), duration)
            //     this.hud.playback_icon("(&#9612;&#9612;)")
            // }
            if (this.moving && duration) {
                Promise.all(frame.effects).then(() =>
                    this.moving_timeout.fn(() => {
                        this.moving_timeout.stop()
                        Promise.all([frame.video_finished, this.map.finished, this.hud_map.finished]).then(all_done)
                    }).start(duration * 1000)
                )
            } else if (this.moving && frame.video_finished) { // always go to the next frame when video ends, ignoring data-duration
                frame.video_finished.then(all_done)
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
        const TRANS_DURATION = current.prop("transition-duration", 0) * 1000

        switch (current.prop("transition")) {
            // XX document * `data-transition`: `fade` (default), `scroll-down`
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

    shake() {
        const left_init = $main.position().left
        const f = left => $main.animate({ left: left_init + left }, 100).promise()
        f(-100).then(() => f(100).then(() => f(0)))
    }

    /**
     * The browser tends to scroll the hidden scrollbar even if we move the body manually
     */
    static resetWindow() {
        $main.stop()
        window.scrollTo(0, 0)
    }
}

