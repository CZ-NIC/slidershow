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
        this.map = new MapWidget(fact("map"), this)
        this.hud_map = new MapWidget(fact("map-hud"), this)

        /**
         * @type {Frame} Current frame
        */
        this.frame = new Frame($(), this) // default dummy object
        this.slide_count
        this.$articles = $()

        this.$preblink_prevention = $("#preblink-prevention").off('load error').on('load error', () =>
            this.$preblink_prevention.data('preblinking', false)
        )

        /** Frames that are going to be pre/unloaded.
         * @type {Function[]}
        */
        this.bg_tasks = []

        /** @type {Set<Frame>} Currently-preloaded frames, kept incrementally by Frame.preload()/unload()
         * so navigation doesn't need an O(n) `[data-preloaded]` scan across the whole deck every step. */
        this.preloaded = new Set()

        /** @type {Semaphore} Throttles full-quality media downloads and serves them nearest-frame-first,
         * so a real server is not flooded and the current frame's original is never stuck behind neighbours. */
        this.original_loader = new Semaphore(ORIGINAL_CONCURRENCY)
        /** @type {Semaphore} Throttles the cheap `data-thumb` previews (generous limit). */
        this.thumb_loader = new Semaphore(THUMB_CONCURRENCY)

        /** Preloading tasks background worker */
        this.bg_worker = new Interval(async () => {
            const task = this.bg_tasks.shift()
            if (task) {
                await task()
            } else {
                this.bg_worker.stop()
            }
        }, 1)

        /**
         * @type {JQuery} Current frame DOM
         */
        this.$current = this.frame.$frame  // default dummy object
        this.index = 0

        this.debug = false
        this.tagging_mode = false
        this.editing_mode = false
        // On mobile the authored pan/zoom "flyover" (data-step-points) is disabled by default – just the plain
        // full-screen photo, swipeable/pinch-zoomable, no automatic camera movement.
        this.step_disabled = this.isMobileMode
        /** @type {number[]} Tags to show alone (OR – a frame matches if it carries any of them); empty = no filter. Affects both the grid and normal navigation. */
        this.tag_filter = []

        // Tag names are document-wide (unlike per-file tags, which are already restored per-frame via
        // Frame.check_tag()), so restore them once here – but only if this document doesn't already
        // carry its own data-tag-names (ex. a previously exported/saved file), which must win.
        if (!$main.attr("data-tag-names")) {
            const savedNames = localStorage.getItem("TAG-NAMES: " + docname())
            if (savedNames) {
                $main.attr("data-tag-names", savedNames)
            }
        }

        this.operation = new Operation(this)
        this.section_controller = new SectionController(this)
        this.reset()
        this.session = new Session(this)  // Restore preferences


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

        // Mobile navigation
        const SWIPE_THRESHOLD = 150
        const DRAG_COMPLETION_RATIO = 0.3
        const SNAP_DURATION = 150
        /** @type {Object|null} Live-drag state while dragMode === "live", else null */
        let drag = null
        let touchstartX = 0, touchendX = 0, dragMode = "threshold"

        document.addEventListener('touchstart', event => {
            // Ignore gestures starting over the HUD (menu, panels, grid, palette, ...)
            if ($(event.target).closest('#hud, menu').length || event.touches.length > 1 || this.frame.zoom.keys) {
                dragMode = null
                return
            }
            $main.stop()
            touchstartX = event.touches[0].clientX
            // Live-drag (the frame following the finger) turned out flaky on mobile – neighbours could end
            // up desynced/overlapping mid-gesture. On mobile a swipe now always just acts like tapping the
            // prev/next button once past SWIPE_THRESHOLD (see handleGesture) – only the desktop-authored
            // diagonal layout still gets the finger-following drag.
            const livedrag = !this.isMobileMode && prop("spread-frames", $main) === "diagonal" && this.frame.prop("transition") !== "fade"
            if (!livedrag) {
                dragMode = "threshold"
                return
            }
            dragMode = "live"
            const startY = event.touches[0].clientY
            const original = this.frame.get_position()
            const nextFrame = $(this.$articles[this.index + 1]).data("frame")
            const prevFrame = $(this.$articles[this.index - 1]).data("frame")
            // A dragged-in neighbour is visible mid-gesture well before it becomes "current" (that only
            // happens on touchend, via goNext/goPrev) – without this it would flash in its unrotated state
            // for the whole drag and only snap to rotated once Frame.prepare() finally runs on arrival.
            nextFrame?.refresh_actor("rotate")
            prevFrame?.refresh_actor("rotate")
            drag = {
                startX: touchstartX,
                startY,
                originalTop: parseFloat(original.top),
                originalLeft: parseFloat(original.left),
                nextPosition: nextFrame?.get_position(),
                prevPosition: prevFrame?.get_position(),
                horizontal: false,
                progress: 0,
                direction: 0,
            }
        }, false)

        document.addEventListener('touchmove', event => {
            if (dragMode === "threshold") {
                // No finger-following drag here – just a visual hint of which way a release would go.
                const deltaX = event.touches[0].clientX - touchstartX
                this.hud.swipeHint(Math.abs(deltaX) > 20 ? (deltaX < 0 ? "next" : "prev") : null)
                // Whether the photo itself pans while not zoomed in is handled in frame_zoom.js's `onMove`
                // (stopping WZoom's own drag-scroll here via the event turned out unreliable).
                return
            }
            if (dragMode !== "live" || !drag) {
                return
            }
            if (event.touches.length > 1) {
                // pinch appeared mid-drag, abort
                $main.animate({ top: `${drag.originalTop}px`, left: `${drag.originalLeft}px` }, SNAP_DURATION)
                dragMode = null
                drag = null
                return
            }
            const deltaX = event.touches[0].clientX - drag.startX
            const deltaY = event.touches[0].clientY - drag.startY
            if (!drag.horizontal) {
                if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY)) {
                    return
                }
                drag.horizontal = true
            }
            event.preventDefault()

            drag.direction = deltaX < 0 ? 1 : -1
            const target = drag.direction === 1 ? drag.nextPosition : drag.prevPosition
            if (!target) {
                // no frame in that direction, resist further dragging
                drag.progress = 0
                return
            }
            drag.progress = Math.min(Math.abs(deltaX) / window.innerWidth, 1)
            $main.css({
                top: `${drag.originalTop + (parseFloat(target.top) - drag.originalTop) * drag.progress}px`,
                left: `${drag.originalLeft + (parseFloat(target.left) - drag.originalLeft) * drag.progress}px`,
            })
        }, { passive: false })

        document.addEventListener('touchend', event => {
            if (dragMode === "threshold") {
                this.hud.swipeHint(null)
                touchendX = event.changedTouches[0].clientX
                handleGesture()
                return
            }
            if (dragMode !== "live" || !drag) {
                return
            }
            const target = drag.direction === 1 ? drag.nextPosition : drag.prevPosition
            if (target && drag.progress > DRAG_COMPLETION_RATIO && this.isMobileMode) {
                // Finish the slide smoothly instead of teleporting the rest of the way (goToFrame's own
                // positioning is intentionally instant on mobile – see isMobileMode). By the time the
                // logical frame change runs, $main is already sitting at `target`, so it's a no-op visually.
                // `direction` is captured now – by the time this animate's callback fires, `drag` below has
                // already been reset to null (that reset can't wait for the animation without blocking the
                // next gesture), so reading `drag.direction` there would throw on a null `drag`.
                const direction = drag.direction
                $main.stop(true).animate(target, SNAP_DURATION, () =>
                    direction === 1 ? this.goNext() : this.goPrev())
            } else if (target && drag.progress > DRAG_COMPLETION_RATIO) {
                const indexBefore = this.index
                drag.direction === 1 ? this.goNext() : this.goPrev()
                if (this.index === indexBefore) {
                    // an in-frame step consumed the gesture instead of changing frame; $main was left mid-drag
                    $main.animate(this.frame.get_position(), SNAP_DURATION)
                }
            } else {
                $main.animate({ top: `${drag.originalTop}px`, left: `${drag.originalLeft}px` }, SNAP_DURATION)
            }
            dragMode = null
            drag = null
        }, false)

        const handleGesture = () => {
            if (Math.abs(touchendX - touchstartX) > SWIPE_THRESHOLD) {
                if (touchendX < touchstartX) {
                    this.goNext()
                } else {
                    this.goPrev()
                }
            }
            touchstartX = 0
        }
    }

    /** On a coarse-pointer (touch) device we drop the spiral fly-through for a simple photo-strip feel. */
    get isMobileMode() {
        return matchMedia("(pointer: coarse)").matches
    }

    start() {
        this.$articles.show()
        $hud.show(0)
        this.$current = this.$articles.first()
        this.operation.general.enable()
        this.operation.playthrough.enable()
        this.operation.switches.enable()
        this.session.restore(true)
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
                // Resume restarts the timeout with its previous delay – keep the countdown bar in step.
                this.hud.progress_start(this.moving_timeout._delay)
            } else {
                this.hud.progress_reset() // pausing freezes here; don't let the bar keep filling
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
        prop_invalidate() // frames may have been re-parented (regroup/import) – ancestor resolution changed
        Frame.mediaConvert()
        this.$articles = Frame.load_all(this).show()
        this.$current = this.frame?.$frame ?? this.$articles.first()
        Frame.videoInit(this.$articles)
        this.positionFrames()
        this.hud.reset()
    }

    resetAndGo() {
        this.reset()
        if (this.frame?.index) { // the default dummy frame has no index
            this.goToFrame(this.frame.index)
        }
    }

    positionFrames(x1 = null, x2 = null, x3 = null, x4 = null) {
        prop_invalidate() // re-layout after a structural change; ancestor resolution may have moved
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

            const positioning = this.isMobileMode ? "ribbon" : prop("spread-frames", $main)
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
                case "ribbon":
                    // Mobile: a plain horizontal photo-strip, one frame after another – no diagonal offset.
                    $el.css({ top: "0vh", left: slide_index * 100 + "vw" })
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
     *
     * @param {number} duration [ms] How long should we wait.
     * @returns {Promise} If we are planning to go further, return Promise
     */
    async waitAndGo(duration) {
        if (this.moving && duration) {
            await this.frame.loaded
            await Promise.all(this.frame.effects)
            this.hud.progress_start(duration * 1000)
            return this.moving_timeout.start(duration * 1000)
        }
    }

    doNotWaitAndGo() {
        this.moving_timeout.stop()
        this.hud.progress_reset()
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

    nextFrame(count = 1) {
        let index = this.index + count
        if (index >= this.$articles.length) {
            // Loop mode: a single step past the last frame wraps back to the first (kiosk / exhibition
            // playback). prop("loop-presentation") reads <main data-loop-presentation> – authorable,
            // hash-settable (#&state=loop-presentation), togglable at runtime. (The scope-narrower
            // data-loop is unrelated – that loops images *within* a frame.)
            // Only for count == 1; a multi-frame jump keeps the old clamp below.
            if (count === 1 && prop("loop-presentation", $main)) {
                index = 0
            } else if (count > 1) {
                // why letting out of range for count == 1?
                // When in grid view, we must jump on the existing frame.
                // When not, we try to get out of the range, so that we see 'swiping' effect that this frame does not exist.
                // Setting the existing frame here would mean no action triggered when hitting LeftArrow being in the beginning.
                index = this.$articles.length - 1
            }
        }
        this.goToFrame(index, true) // tag_filter (if any) is enforced centrally in goToFrame
    }
    previousFrame(count = 1) {
        let index = this.index - count
        if (count > 1 && index < 0) {
            // why letting out of range for count == 1? See nextFrame comment.
            index = 0
        }
        this.goToFrame(index)
    }

    /**
     * @param {Frame} frame
     * @returns {boolean} Whether `frame` passes the active tag_filter (always true when no filter is set).
     */
    frame_matches_filter(frame) {
        return !this.tag_filter.length || frame.get_tags().some(t => this.tag_filter.includes(t))
    }

    /**
     * From `index`, walk in `direction` (±1) until a frame passes tag_filter. An index that runs out of
     * range is returned unchanged, so the existing "swipe past the end" out-of-range handling still applies.
     */
    _nextMatchingIndex(index, direction) {
        while (index >= 0 && index < this.$articles.length && !this.frame_matches_filter($(this.$articles[index]).data("frame"))) {
            index += direction
        }
        return index
    }

    /**
     * Show only frames carrying any of `tags` (OR), in both the grid and normal navigation; empty/null clears it.
     * @param {?number[]} tags
     */
    set_tag_filter(tags) {
        this.tag_filter = tags || []
        this.hud.refresh_tag_filter_icon()
        this.hud.reset_grid()
        this.session.store()
        if (!this.hud.grid_visible) {
            this.goToFrame(this.index) // no-op if the current frame still matches; redirects otherwise
        }
    }

    /**
     * Apply tag `n` (toggle; null/0 clears) – to the grid selection as a single undoable when the grid is
     * open with a selection, otherwise to the current frame. The digit hotkeys funnel through here so they
     * do the expected thing in both contexts.
     * @param {?number} n
     */
    tag_current(n) {
        const grid = this.hud.grid
        if (this.hud.grid_visible && grid.hasSelection()) {
            grid.tagSelection(n)
        } else {
            this.frame.set_tag(n)
        }
    }

    nextSection() {
        const $section = this.getSection()
        // A loose frame sits directly under <main> (no wrapping <section>), so its "section" resolves to
        // <main> itself, whose .next() holds no frames — the old code then fell back to the very last slide.
        // Advance to the first following <section> inside <main> instead.
        const $next = $section.is("main")
            ? this.frame.$frame.nextAll("section").first().find(FRAME_TAGS).first()
            : $section.next().find(FRAME_TAGS).first()
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
        prop_invalidate() // fresh frame: drop the previous frame's memoized prop() lookups
        // Central tag_filter enforcement – every navigation path (next/prevFrame, sections, goToSlide,
        // hash restore, ribbon/grid clicks) funnels through here, so redirecting once covers them all.
        if (this.tag_filter.length && this.$articles[index]) {
            if (!this.frame_matches_filter($(this.$articles[index]).data("frame"))) {
                const forward = this._nextMatchingIndex(index, 1)
                const candidate = forward < this.$articles.length ? forward : this._nextMatchingIndex(index, -1)
                if (candidate >= 0 && candidate < this.$articles.length) {
                    index = candidate
                }
            }
        }

        const $last = this.$current
        const next = this.$articles[index]
        const $current = next ? $(next) : $last
        const sameFrame = $last[0] === $current[0]
        /** @type {Frame} */
        const lastFrame = $last.data("frame")

        /** @type {Frame} */
        const frame = this.frame = $current.data("frame")
        this.index = frame.index

        // Change location hash
        this.session.store()

        if(this.hud.grid_visible) {
            console.log("Grid", index)
            this.hud.refresh(this.frame, Boolean(lastFrame))
            return
        }
        console.log("Frame", index)

        // Unload the frame
        // lose focus on anything on the past frame (but keep on HUD)
        $(':focus', $last).trigger("blur")

        this.$current = $current
        if (!sameFrame) {
            lastFrame.leave()
        }
        if (!next) {  // we failed to go to the intended frame
            this.shake()
            this.play_pause(false)
            return
        }



        const followingIndex = this.tag_filter.length ? this._nextMatchingIndex(index + 1, 1) : index + 1
        /** @type {Frame|undefined} */
        const following = $(this.$articles[followingIndex]).data("frame")

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

        // Give visible feedback while the full-quality media downloads (esp. noticeable on a slow real server).
        this.hud.loading(frame)

        // start transition
        frame.prepare(sameFrame ? null : lastFrame)
        this.play_pause(moving)
        this.doNotWaitAndGo()

        if (this.debug) {
            $last.removeClass("debugged")
            $current.addClass("debugged")
        } else {
            $last.removeClass("debugged")
        }

        const trans = sameFrame || supress_transition || this.isMobileMode ? $main.css(frame.get_position()) : this.transition($last, $current)
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
            const duration = frame.enter()
            if (!duration && this.moving && frame.video_finished) {
                // even if data-duration=0, when a video plays, always go to the next frame
                frame.video_finished.then(() => this.tryGoNext())
            } else { // go to the next frame after duration passes
                this.waitAndGo(duration)
            }

            // Work finished, now to the background tasks.
            // Preload future frames and unload those preloaded frames which are far away.
            const nearby = Frame.frames(this.$articles.slice(Math.max(0, index - PRELOAD_BACKWARD), index + PRELOAD_FORWARD))
            this.process_bg_tasks([
                () => new Promise(resolve => setTimeout(resolve, 100)), // since preblink is a costly operation, wait a moment. User might be holding forward arrow (100 photos / 7 secs, do not slow it down).
                () => following?.preblink(),
                ...nearby.filter(f => !this.preloaded.has(f)).map(f => () => f.preload()),
                ...[...this.preloaded].map(f => nearby.includes(f) ? null : () => f.unload()).filter(Boolean),
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
        if (!this.bg_worker.running) {
            this.bg_worker.start()
        }
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

