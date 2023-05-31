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
        this.slide_count
        this.$articles

        this.$current
        this.index = 0

        this.shortcuts = this.shortcutsInit().map(s => s.disable() || s)

        this.debug = false
        this.tagging_mode = false
        this.reset()

        /** Frames that are going to be pre/unloaded.
         * @type {Function[]}
         */
        this.bg_tasks = []

        /** Preloading tasks background worker */
        this.bg_worker = new Interval(async () => {
            const task = this.bg_tasks.shift()
            if (task) {
                await task()
            } else {
                this.bg_worker.stop()
            }
        }, 1)
    }

    start() {
        this.$articles.show()
        $hud.show(0)
        this.$current = this.$articles.first()
        this.goToFrame(this.index, true)
        this.shortcuts.forEach(s => s.enable())
    }

    stop() {
        this.frame.leave()
        this.frame.left()
        this.moving_timeout.stop()
        this.$articles.hide()
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

    reset() {
        this.$articles = Frame.load_all(this)
        Frame.videoInit(this.$articles)
        this.positionFrames()
    }

    positionFrames(x1 = null, x2 = null, x3 = null, x4 = null) {
        let slide_index = -1
        let frame_index = -1

        let clockwise = true
        let sectionCount = 0

        this.$articles.each((_, el) => {
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
    }

    shortcutsInit() {
        const tagging = [
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

            wh.pressAlt(KEY.Numpad0, "Tag 10", () => this.frame.set_tag(10)),
            wh.pressAlt(KEY.Numpad1, "Tag 11", () => this.frame.set_tag(11)),
            wh.pressAlt(KEY.Numpad2, "Tag 12", () => this.frame.set_tag(12)),
            wh.pressAlt(KEY.Numpad3, "Tag 13", () => this.frame.set_tag(13)),
            wh.pressAlt(KEY.Numpad4, "Tag 14", () => this.frame.set_tag(14)),
            wh.pressAlt(KEY.Numpad5, "Tag 15", () => this.frame.set_tag(15)),
            wh.pressAlt(KEY.Numpad6, "Tag 16", () => this.frame.set_tag(16)),
            wh.pressAlt(KEY.Numpad7, "Tag 17", () => this.frame.set_tag(17)),
            wh.pressAlt(KEY.Numpad8, "Tag 18", () => this.frame.set_tag(18)),
            wh.pressAlt(KEY.Numpad9, "Tag 19", () => this.frame.set_tag(19))]
        tagging.forEach(s => s.disable())

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

        wh.pressAlt(KEY.PageDown, "Next section", () => this.nextSection()),
        wh.pressAlt(KEY.PageUp, "Prev section", () => this.previousSection()),

        wh.press(KEY.Home, "Go to the first", () => this.goToFrame(0)),
        wh.press(KEY.End, "Go to end", () => this.goToFrame(this.$articles.length - 1)),

        wh.press(KEY.M, "Toggle hud map", () => this.notVideoFocus() && this.hud_map.toggle()),

        wh.press(KEY.F, "Toggle file info", () => $("#hud-fileinfo").toggle()),

        wh.pressAlt(KEY.T, "Toggle tagging mode", () => {
            this.tagging_mode = !this.tagging_mode
            // when there will be interfering shortcuts like numbers, we have retag the previous shortcuts
            tagging.forEach(s => this.tagging_mode ? s.enable() : s.disable())
            this.hud.alert(`Tagging mode ${this.tagging_mode ? "enabled, see H for shortcuts help" : "disabled."}`)
        }),



        // wh.pressAlt(KEY.T, "Thumbnails", () => this.thumbnails()),

        wh.pressAlt(KEY.D, "Debug", () => {
            const zoom = $main.css("zoom")
            $main.css({ "zoom": zoom == "1" ? "0.05" : "1" })
            this.debug = !this.debug
        }),

        wh.press(KEY.G, "Go to frame", () => {
            new $.Zebra_Dialog(`You are now at ${this.frame.slide_index + 1} / ${this.slide_count}`, {
                title: "Go to slide number",
                type: "prompt",
                buttons: ["Cancel", {
                    caption: "Ok",
                    default_confirmation: true,
                    callback: (_, slide_number) => this.goToSlide(slide_number)
                }]
            })
        }),
        ]

    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     */
    group() {
        this.$articles.each((_, el) => {
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
        if ($first.data("frame").index === this.frame.index) {
            const $previous = $section.prev().find(FRAME_SELECTOR).first()
            this.goToArticle($previous)
        } else {
            this.goToArticle($first)
        }
    }

    notVideoFocus() {
        return $(":focus").prop("tagName") !== "VIDEO"
    }

    getSection() {
        return this.frame.$frame.closest("section, main")
    }

    /**
     * Frame has an absolute index. If they are nested and become subframes, the still have the same slide_index.
     * @param {Number|String} slide_index
     */
    goToSlide(slide_number) {
        const slide_index = Number(slide_number) - 1
        for (let i = slide_index; i < this.$articles.length; i++) {
            const frame = this.$articles.eq(i).data("frame")
            if (slide_index === frame.slide_index) {
                return this.goToFrame(frame.index)
            }
        }
        this.hud.alert("Cannot find given slide number " + slide_number)
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

        const next = this.$articles[index]
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
        if (!next) {  // we failed to go to the intended frame
            this.shake()
            moving = false
        }

        // Make sure that current frame was preloaded.
        // We moved the playback position, old preloading tasks are no more valid, clear them.
        // If we move ahead too quickly, all the preloading frames would make the last and only visible frame
        // to wait all the previous to finish loading.
        // That way (using a tiny interval), if going too fast, passing frames are not being preloaded.
        this.process_bg_tasks([() => frame.preload()], true)

        // start transition
        frame.prepare()
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
            if (!same_frame) {
                $last.data("frame").left()
            }
            if (promise.aborted) { // another frame was raise meanwhile
                return
            }
            const duration = frame.enter()


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

            // Work finished, now to the background tasks.
            // Preload future frames and unload those preloaded frames which are far away.
            const nearby = Frame.frames(this.$articles.slice(Math.max(0, index - PRELOAD_BACKWARD), index + PRELOAD_FORWARD))
            this.process_bg_tasks([
                ...nearby.filter(f => f.$frame.not("[data-preloaded]").length).map(f => () => f.preload()),
                ...Frame.frames($("[data-preloaded]")).map(f => nearby.includes(f) ? null : () => f.unload()).filter(Boolean)
            ])
        })
    }

    process_bg_tasks(tasks, clear = false) {
        if (clear) {
            this.bg_tasks.length = 0
        }
        this.bg_tasks.push(...tasks)
        this.bg_worker.start()
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
                if (this.$articles.index($last) < this.$articles.index($current)) {
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

