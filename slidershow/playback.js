/**
 * Frame playback controller.
 */
class Playback {

    /**
     * @param {Menu} menu
     * @param {AuxWindow} aux_window
     */
    constructor(menu, aux_window) {
        this.menu = menu
        this.aux_window = aux_window
        this.hud = new Hud(this)
        this.changes = new Changes(this)
        /** Transition promise */
        this.promise = {}
        /** @type {Boolean} Application is running */
        this.moving = true
        /** @type {Interval} */
        this.moving_timeout = new Interval(() => {
            this.moving_timeout.stop()
            const hudTimeouted = Promise.race([this.hud_map.finished, new Promise(r => setTimeout(() => r(), 5000))])
            Promise.all([this.frame.video_finished, this.map.finished, hudTimeouted]).then(() => this.tryGoNext())
        }).stop()

        const fact = id => $("<div/>", { id: id }).prependTo("body")
        this.map = new MapWidget(fact("map"), this).map_start()
        this.hud_map = new MapWidget(fact("map-hud"), this).map_start()

        /**
         * @type {Frame} Current frame
        */
        this.frame = new Frame($(), this) // default dummy object
        this.slide_count
        this.$articles = $()
        /**
         * @type {JQuery} Current frame DOM
         */
        this.$current = this.frame.$frame  // default dummy object
        this.index = 0

        this.debug = false
        this.tagging_mode = false
        this.editing_mode = false
        this.step_disabled = false

        this.operation = new Operation(this)
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

        // Restore preferences
        /** @type {Session} */
        this.session = new Session(this)


        // Importable
        this.menu.importable($main, frames => {
            const $target = this.$current
            this.changes.undoable("Import files after current frame",
                () => $target.after(frames),
                () => frames.forEach($frame => $frame.detach()),
                () => {
                    this.reset()
                    this.goToFrame(this.frame.index)
                }
            )
        })
    }

    start() {
        this.$articles.show()
        $hud.show(0)
        this.$current = this.$articles.first()
        this.session.restore(true)
        this.operation.general.enable()
        this.operation.playthrough.enable()
        this.operation.switches.enable()
    }

    stop() {
        this.frame.leave()
        this.frame.left()
        this.doNotWaitAndGo()
        this.$articles.hide()
        $hud.hide(0)
        this.hud_map.hide()
        this.operation.general.disable()
        this.operation.playthrough.disable()
        this.operation.switches.disable()
    }
    destroy() {
        this.map.destroy()
        this.hud_map.destroy()
    }

    /**
     *
     * @param {boolean} moving
     */
    play_pause(moving) {
        if (this.moving !== moving) {
            this.hud.playback_icon(moving ? (this.frame?.getDuration() ? "▶" : "") : "&#9612;&#9612;")
            if (moving) {
                this.moving_timeout.start()
            }
        }
        this.moving = moving
    }

    /** Refresh frames from the DOM. Reposition.
     *
     *  Does not thrash out underlying Frame objects.
     *
     */
    reset() {
        const last_index = this.frame?.index || Infinity
        this.$articles = Frame.load_all(this).show()
        this.$current = $(this.$articles.get(last_index) ?? this.$articles.first())
        Frame.videoInit(this.$articles)
        this.positionFrames()
        this.hud.reset()
    }

    resetAndGo() {
        this.reset()
        if (this.frame) {
            this.goToFrame(this.frame.index)
        }
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

            const $preview = this.hud.getThumbnail(frame)
            const old_index = frame.index
            frame.index = ++frame_index
            frame.slide_index = slide_index

            // Prepare corresponding previews to an index change.
            // We do not set the index directly because the values interefere.
            $preview.data("ref-temp", frame.index)

            const positioning = prop("spread-frames", $main)
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
                        top: frame.prop("y", null, slide_index) * 100 + "vh",
                        left: frame.prop("x", null, slide_index) * 100 + "vw",
                    })
                    break;
                default:
                    this.hud.info(`Unknown spread-frames: ${positioning}`)
            }

            // load tags from localStorage
            frame.check_tag()
        })

        this.slide_count = slide_index + 1

        // Set the new indices to corresponding previews.
        $(`frame-preview`).each((_, el) => {
            const $el = $(el)
            const ref = $el.data("ref-temp")
            if (ref === undefined) { // remove previews of removed frames.
                $el.remove()
            } else {
                $el.attr("data-ref", ref)
                $el.removeData("ref-temp")
            }
        })
    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     */
    group() {
        /** @type {function[]} */
        const redos = []
        /** @type {JQuery[]} */
        const added = []
        this.changes.undoable("Group frames",
            () => {
                redos.length = 0
                added.length = 0
                this.$articles.each((_, el) => {
                    const $frame = $(el)
                    /** @type {Frame} */
                    const frame = $frame.data("frame")

                    redos.push(this.operation.redoForMoving($frame))

                    const tag = frame.$actor.attr("data-tag") || 0
                    let $section = $(`section[data-tag=${tag}]`)
                    if (!$section.length) {
                        $section = $("<section/>", { "data-tag": tag }).prependTo($main)
                        added.push($section)
                    }
                    $frame.appendTo($section)
                })
                this.positionFrames()
                this.goToFrame(this.$current.data("frame").index - 1) // keeps you on the same frame (woorks badly)
            },
            () => {
                redos.reverse().map(f => f())
                added.map(el => $(el).remove())
            },
            () => this.resetAndGo()
        )
    }

    /**
     *
     * @param {number} duration [ms] How long should we wait.
     * @returns {Promise} If we are planning to go further, return Promise
     */
    async waitAndGo(duration) {
        if (this.moving && duration) {
            await this.frame.loaded
            await Promise.all(this.frame.effects)
            return this.moving_timeout.start(duration * 1000)
        }
    }

    doNotWaitAndGo() {
        this.moving_timeout.stop()
        this.promise.aborted = true
    }

    tryGoNext() {
        if (this.moving && !this.promise.aborted) {
            this.goNext()
        }
    }

    /**
     * Go to the next step in the frame or to the next frame.
     */
    goNext() {
        if (this.frame.step(1)) {
            this.play_pause(true)
            this.moving_timeout.stop()
            // unabort the promise: we can go back in steps, then restore the auto-step with goNext
            this.promise.aborted = false
            this.waitAndGo(this.frame.step_duration)
            this.aux_window.update_step(this.frame)
        } else {
            this.nextFrame()
        }
    }
    /**
     * Go to the previous step in the frame on to the previous frame.
    */
    goPrev() {
        if (this.frame.step(-1)) {
            // while frame effects promise finishes, this.moving_timeout would be started
            // and we would proceed to the next step
            this.doNotWaitAndGo()
            this.aux_window.update_step(this.frame)
        } else {
            this.previousFrame()
        }
    }

    nextFrame() {
        this.goToFrame(this.index + 1, true)
    }
    previousFrame() {
        this.goToFrame(this.index - 1)
    }

    nextSection() {
        // XX Inintuitive. When being at the first article at <main><article /><section /><article last>,
        // next sections puts you to the last, skipping all the sections.
        const $next = this.getSection().next().find(FRAME_TAGS).first()
        this.goToArticle($next.length ? $next : this.$articles.last(), true)
    }
    previousSection() {
        const $section = this.getSection()
        const $first = $(FRAME_TAGS, $section).first()
        if ($first.data("frame").index === this.frame.index) {
            const $previous = $section.prev().find(FRAME_TAGS).first()
            this.goToArticle($previous.length ? $previous : this.$articles.first())
        } else {
            this.goToArticle($first)
        }
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
        this.hud.info("Cannot find given slide number " + slide_number)
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
     * @param {Number} index
     * @param {Boolean} moving Auto-playback
     * @param {Boolean} supress_transition Block animation to the frame
     */
    goToFrame(index, moving = false, supress_transition = false) {
        console.log("Frame", index)

        const $last = this.$current

        // Unload the frame
        // lose focus on anything on the past frame (but keep on HUD)
        $(':focus', $last).trigger("blur")

        const next = this.$articles[index]
        const $current = this.$current = next ? $(next) : $last
        const sameFrame = $last[0] === $current[0]
        /** @type {Frame} */
        const lastFrame = $last.data("frame")
        if (!sameFrame) {
            lastFrame.leave()
        }
        if (!next) {  // we failed to go to the intended frame
            this.shake()
            this.play_pause(false)
            return
        }

        /** @type {Frame} */
        const frame = this.frame = $current.data("frame")
        this.index = frame.index

        // Change location hash
        this.session.store()

        /** @type {Frame|undefined} */
        const following = $(this.$articles[index + 1]).data("frame")

        // Make sure that current frame was preloaded.
        // We moved the playback position, old preloading tasks are no more valid, clear them.
        // If we move ahead too quickly, all the preloading frames would make the last and only visible frame
        // to wait all the previous to finish loading.
        // That way (using a tiny interval), if going too fast, passing frames are not being preloaded.
        this.process_bg_tasks([
            () => frame.preload(),
            () => following?.preload(),
            () => this.aux_window.info(frame, following)  // send the new info to the aux-window
        ], true)

        // start transition
        frame.prepare(lastFrame)
        this.play_pause(moving)
        this.doNotWaitAndGo()

        if (this.debug) {
            $last.removeClass("debugged")
            $current.addClass("debugged")
        } else {
            $last.removeClass("debugged")
        }

        const trans = sameFrame || supress_transition ? $main.css(frame.get_position()) : this.transition($last, $current)
        const promise = this.promise = trans.promise()
        promise.then(() => {  // frame is at the viewport now
            if (lastFrame !== this.frame) {
                // we cannot use `same_frame` here because this.frame might have changed meanwhile
                // (the user might have gone back meanwhile)
                lastFrame.left()
            }
            if (promise.aborted) { // another frame was raised meanwhile
                return
            }

            // Enter the frame
            // TODO tady !this.waitAndGo has no sense, as waitAndGo is a promise
            if (!this.waitAndGo(frame.enter()) && this.moving && frame.video_finished) { // always go to the next frame when video ends, ignoring data-duration
                frame.video_finished.then(() => this.tryGoNext())
            }

            // Work finished, now to the background tasks.
            // Preload future frames and unload those preloaded frames which are far away.
            const nearby = Frame.frames(this.$articles.slice(Math.max(0, index - PRELOAD_BACKWARD), index + PRELOAD_FORWARD))
            this.process_bg_tasks([
                ...nearby.filter(f => f.$frame.not("[data-preloaded]").length).map(f => () => f.preload()),
                ...Frame.frames(this.$articles.filter("[data-preloaded]")).map(f => nearby.includes(f) ? null : () => f.unload()).filter(Boolean)
            ])
        })
    }

    toggle_steps() {
        // XX Zoom out from a stepped picture when steps disabled.
        this.step_disabled = !this.step_disabled
        this.hud.info("Presentation steps were " + (this.step_disabled ? "disabled" : "enabled"))
        if (this.step_disabled) {
            this.frame.clean_steps()
        }
        this.session.store()
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
        const TRANS_DURATION = current.prop("transition-duration") * 1000

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

    /**
     * @returns {JQuery|null}
     */
    getFocused() {
        const $el = $(":focus", "main")
        return $el.length ? $el : null
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

