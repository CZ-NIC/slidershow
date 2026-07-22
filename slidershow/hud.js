class Hud {

    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        const pl = this.playback = playback
        this.$hud_filename = $("#hud-filename")
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
        this.$hud_tag = $("#hud-tag").on("click", () => {
            const op = this.playback.operation
            this.playback.tagging_mode ? op._nameTagsDialog() : op._filterByTagDialog()
        })
        this.$hud_counter = $("#hud-counter")
        this.$hud_tag_filter = $("#hud-tag-filter").hide().on("click", () => this.playback.set_tag_filter([]))
        this.$hud_menu = $("#hud-menu")
        this.$command_palette = $("#command-palette")
        this.$hud_thumbnails = $("#hud-thumbnails").hide() // by default off
        this.$hud_grid = $("#hud-grid").hide() // by default off
        this.grid = new GridController(this.playback, this, this.$hud_grid)
        this.$hud_selection = $("#hud-selection")
        // "N frames selected" badge shown while a grid selection exists; its buttons proxy the grid clipboard.
        this.$hud_selection.on("click", "button", e => {
            const g = this.grid
            switch (e.currentTarget.dataset.sel) {
                case "copy": g.copySelection(); break
                case "cut": g.cutSelection(); break
                case "paste": g.paste(); break
                case "delete": g.deleteSelection(); break
                case "clear": g.clearSelection(); break
            }
        })
        this.$hud_properties = $("#hud-properties").hide() // by default off
        this.$control_icons = $("#control-icons")
        this.$mobile_nav = $("#mobile-nav")
        // On mobile the bottom nav bar replaces the top icons entirely (bigger, thumb-reachable) – #control-icons
        // is statically `display:none` there (style.css), so only #mobile-nav needs the fade in/out treatment.
        // On desktop it's the other way around: #mobile-nav must never be touched by jQuery show/hide – it would
        // fall back to `display:block` there since the stylesheet keeps it `none` outside `pointer: coarse`,
        // and jQuery's fadeIn always forces *some* visible display.
        this.$hud_hideable = playback.isMobileMode ? this.$mobile_nav : this.$control_icons

        /** @type {Array<{time: string, text: string}>} Bounded history of info()/ok() notifications. */
        this.info_history = []

        /** @type {Map<Frame, string>} Cached lightweight `data-thumb` preview HTML, keyed by the (stable)
         * Frame object so it survives reorder/regroup. Lets a grid scrolled back over already-seen frames
         * skip the clone + image-probe in assureThumbnail. Cleared on reset() (structural/media changes). */
        this.previewCache = new Map()
        this.propertyPanel = new PropertyPanel(this)
        this.palette = new CommandPalette(this)
        this.init_grid()

        // Playback icon shows the menu
        this.playback_icon_interval = new Interval(() => this.$hud_hideable.fadeOut(500, () => this.$playback_icon.html("☰")), 1000)
        this.$playback_icon = $("<div/>", { id: "playback-icon", html: "☰" })
            .appendTo(this.$control_icons)
            // the bottom nav's ☰ button is the same control on mobile – shares the click behavior and
            // mirrors the same transient icon (play/pause, video rate, …)
            .add(this.$mobile_nav.find("[data-role=menu]"))
            .on("click", () => {
                this.toggleMenu()
                this.playback_icon("☰")
            })

        // Loading spinner, revealed while the current frame's full-quality media is still downloading.
        this.$hud_loading = $("<div/>", { id: "hud-loading" }).appendTo("#hud")
        this.$hud_loading_percent = $("<span/>").appendTo(this.$hud_loading)
        this._loading_timer = undefined

        // Countdown-to-next bar (auto-forward). Off by default; toggled via "Countdown bar" (Shift+c),
        // hash-settable (#&state=progress). A pure CSS-transition fill – progress_start() animates the
        // inner bar 0→100% over the auto-forward duration, progress_reset() clears it on every navigation.
        this.$hud_progress = $("#hud-progress")
        this.$hud_progress_bar = $("#hud-progress-bar")

        this.$hud_hideable
            .hide()
            .on("mouseenter", () => this.$playback_icon.html("☰") && this.playback_icon_interval.freeze()) // icon will not disappear on hover
            .on("mouseleave", () => this.playback_icon_interval.unfreeze())
        $(document).on("mousemove touchstart", () => this.playback_icon())
        this.$hud_menu.on("mousemove", "button", e => this.playback_icon(e.target.title)) // menu hover hint

        // Next / prev icons
        $("<div/>", { html: "◁" })
            .appendTo(this.$control_icons)
            .on("click", () => pl.goPrev())
        $("<div/>", { html: "▷" })
            .appendTo(this.$control_icons)
            .on("click", () => pl.goNext())
        $("<div/>", { html: "&#9638;", title: "Grid overview" })
            .appendTo(this.$control_icons)
            .on("click", () => this.toggle_grid())

        // Bottom mobile nav bar (touch devices, see the `pointer: coarse` media query).
        // Its "menu" button is wired above, together with the top ☰ icon.
        // The "tapped" state starts on touchstart (not click, which only fires once the finger lifts –
        // that would make the feedback feel delayed/laggy) and, on prev/next, stays on through the whole
        // switch (cleared in tapFeedback once the new frame has arrived) so it's obvious we're switching.
        this.$mobile_nav
            .on("touchstart", "button", e => $(e.currentTarget).addClass("tapped"))
            .on("touchend touchcancel", "[data-role=grid]", e => $(e.currentTarget).removeClass("tapped"))
            .on("click", "[data-role=prev]", e => { pl.goPrev(); this.tapFeedback(e.currentTarget) })
            .on("click", "[data-role=next]", e => { pl.goNext(); this.tapFeedback(e.currentTarget) })
            .on("click", "[data-role=grid]", () => this.toggle_grid())

        // Events
        this.$hud_gps.on("click", () => {
            pl.hud_map.toggle(true)
        })
        this.$hud_thumbnails.add(this.$hud_grid).on("click", "frame-preview", e => {
            const ref = Number(e.currentTarget.dataset.ref)
            if (this.grid_visible) { // file-manager style modified clicks build a selection
                if (e.ctrlKey || e.metaKey) {
                    this.playback.goToFrame(ref)
                    this.grid.toggleSelect(ref)
                    return
                }
                if (e.shiftKey) {
                    this.grid.extendTo(ref)
                    return
                }
                this.grid.clearSelection() // a plain click resets the selection to just this frame
            }
            this.playback.goToFrame(ref)
        })
    }

    /**
     * Menu buttons were added
     */
    registerMenu() {
        const $m = this.$hud_menu
        this.playback.changes.setButtons(
            $("[data-role~='undo']", $m),
            $("[data-role~='redo']", $m))

        this.$stopEditing = $("[title='Stop editing (Escape)']", $m).prop("disabled", true)
        this.$notVideoButtons = $("[data-role~='not-video']")
        this.$onlyVideoButtons = $("[data-role~='only-video']").prop("disabled", true)

        hideAlternatives("prev-step", "Prev step")
        hideAlternatives("next-step", "Next step")

        function hideAlternatives(selector, title) {
            const attrs = $(`[data-role~='${selector}']`, $m).map((_, el) => $(el).attr("data-hotkey")).get().join(" | ")
            $(`[data-role~='${selector}']`, $m).not(":first").addClass("alwaysHidden") // hide and not be be shown
            $(`[data-role~='${selector}']`, $m).attr("title", `${title} (${attrs})`)
        }
    }

    /**
     * Keeps the nav button in its "tapped" state (set immediately on touchstart) all the way through the
     * switch – no premature reset on touchend – adding a spinner too if the frame doesn't arrive within
     * 200ms (noticeable on a slow real server). Both clear together once the new frame has actually arrived.
     * @param {HTMLElement} btn
     */
    tapFeedback(btn) {
        const $btn = $(btn)
        const spinnerTimer = setTimeout(() => $btn.addClass("btn-loading"), 200)
        this.playback.frame.loaded.then(() => {
            clearTimeout(spinnerTimer)
            $btn.removeClass("tapped btn-loading")
        })
    }

    /**
     * Visual hint of which way a threshold swipe (see the mobile touch handling in playback.js) would go
     * if released right now.
     * @param {?("prev"|"next")} direction Null to clear.
     */
    swipeHint(direction) {
        $("[data-role=prev]", this.$mobile_nav).toggleClass("swipe-hint", direction === "prev")
        $("[data-role=next]", this.$mobile_nav).toggleClass("swipe-hint", direction === "next")
    }

    playback_icon(html = "") {
        if (html) {
            this.$playback_icon.html(html)
        }
        this.$hud_hideable.stop(true).fadeIn(0)
        this.playback_icon_interval.start()
    }

    toggleMenu() {
        const menuVisible = this.$hud_menu.is(":visible")
        const paletteVisible = this.palette.$wrapper.is(":visible")

        if (menuVisible || paletteVisible) {
            this.$hud_menu.fadeOut(500)
            this.palette.$wrapper.fadeOut(500)
        } else {
            this.$hud_menu.fadeIn(500)
            this.palette.$wrapper.fadeIn(500)
        }
    }


    toggle_thumbnails() {
        this.$hud_thumbnails.toggle()
        if (this.thumbnails_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.display_thumbnails()
        }
        this.playback.session.store()
    }

    toggle_grid() {
        let on = false
        this.$hud_grid.toggle()
        if (this.grid_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            on = true
            this.display_grid(true)
        } else {
            // even that the frame was focused, it was not yet prepared and entered
            this.grid.clearSelection() // the selection is a grid-only convenience; drop it on leaving the grid
            this.playback.goToFrame(this.playback.frame.index, false, true)
        }
        this.playback.operation.grid.toggle(on)
        this.playback.session.store()
    }

    toggle_properties() {
        let on = false
        this.$hud_properties.toggle()
        if (this.properties_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            on = true
            this.properties()
        }
        this.playback.operation.properties.toggle(on)
        this.playback.session.store()
    }
    toggle_progress() {
        this.$hud_progress.toggleClass("on")
        if (!this.progress_visible) {
            this.progress_reset()
        }
        this.playback.hud.info(`Countdown bar ${this.progress_visible ? "enabled" : "disabled."}`)
        this.playback.session.store()
    }

    /** Animate the countdown bar 0→100% over `ms`, matching the pending auto-forward timeout.
     * No-op unless the bar is toggled on. */
    progress_start(ms) {
        if (!this.progress_visible || !ms) {
            return
        }
        const bar = this.$hud_progress_bar
        bar.css({ transition: "none", width: "0%" })
        bar[0].offsetWidth // force reflow so the reset width takes before the animated one
        bar.css({ transition: `width ${ms}ms linear`, width: "100%" })
    }

    /** Clear the countdown bar (navigation moved on, or auto-forward paused/stopped). */
    progress_reset() {
        this.$hud_progress_bar.css({ transition: "none", width: "0%" })
    }

    get progress_visible() {
        return this.$hud_progress.hasClass("on")
    }
    get thumbnails_visible() {
        return this.$hud_thumbnails.is(":visible")
    }
    get grid_visible() {
        return this.$hud_grid.is(":visible")
    }
    get properties_visible() {
        return this.$hud_properties.is(":visible")
    }

    /** Grid setup */
    init_grid() {
        this.$hud_grid
            // A second tap on the already-selected photo enters it, like the Enter hotkey – there's no
            // reliable double-tap on mobile to mirror the desktop "grid disappears on double click" below.
            // Must run (and decide) before the general frame-preview click handler updates playback.index
            // to this ref, and stop that handler from then re-navigating now that the grid is closed –
            // this works because handlers on the same element run in registration order, and this one is
            // registered first (init_grid() runs before that handler is set up).
            .on("click", "frame-preview", e => {
                if (this.playback.isMobileMode && Number(e.currentTarget.dataset.ref) === this.playback.index) {
                    this.toggle_grid()
                    e.stopImmediatePropagation()
                }
            })
            // grid disappears on double click
            .on("dblclick", "frame-preview", () => this.toggle_grid())
            // grid section buttons
            .on("click", "section-controller button", e => this.grid.sectionMenuAction($($(e.target.closest("section-controller")).data("section")), e.target.dataset.role, e.target.dataset.param))
            // tag filter dropdown – checking/unchecking applies the filter immediately
            .on("change", ".tag-filter-dropdown input[type=checkbox]", e => {
                const checked = $(e.currentTarget).closest(".tag-filter-dropdown").find("input:checked").map((_, el) => Number($(el).val())).get()
                this.playback.set_tag_filter(checked)
            })
        this.grid.initMarquee() // Shift/Ctrl+drag rubber-band selection
    }

    /**
     * Thumbnail ribbon
     */
    display_thumbnails() {
        const pl = this.playback
        const frame = pl.frame
        const $container = this.$hud_thumbnails

        const THUMBNAIL_COUNT = 6
        // frames matching the active tag_filter (all of them when no filter is set), in order
        const matching = pl.tag_filter.length
            ? pl.$articles.toArray().filter(el => pl.frame_matches_filter($(el).data("frame")))
            : pl.$articles.toArray()
        const currentPos = Math.max(0, matching.indexOf(frame.$frame[0]))
        // visible positions within `matching`
        const middle = Math.ceil(THUMBNAIL_COUNT / 2)
        const positions = Array.from({ length: THUMBNAIL_COUNT }, (_, i) =>
            i + (currentPos + middle >= matching.length ?
                matching.length - THUMBNAIL_COUNT  // keep same thumbnails number at the ribbon end
                : Math.max(0, currentPos - middle)))
            .filter(pos => pos >= 0 && pos < matching.length)
        const frames = positions.map(pos => $(matching[pos]).data("frame"))
        const frameIds = frames.map(f => f.index)

        // remove old unused thumbnails
        $("frame-preview", $container).filter((_, el) => !frameIds.includes(Number(el.dataset.ref))).remove()

        // arrange thumbnails
        frames.forEach(frame => this.assureThumbnail(frame, $container))

        // film-strip should not take excessive height
        const scaleFactorX = $("frame-preview:first", $container).width() / pl.$current.width()
        $container.css({ height: scaleFactorX * 100 + "vh" })

        // highlight current frame preview
        this.makeThumbnailsImportable($container, false) // prevent scrolling which scrolls main frame, not the thumbnails because there are only little of them
    }

    /**
     * Show/update the "N frames selected" badge (top-centre) while a grid selection exists; hide it
     * otherwise. The Paste button is only enabled once something has been copied/cut. Called from
     * GridController._syncSelectionClass on every selection change.
     */
    refresh_selection_info() {
        const grid = this.grid
        if (!this.grid_visible) {
            this.$hud_selection.hide()
            return
        }
        const n = grid.selection.size
        const clip = grid.clipboard
        const clipN = clip?.frames?.length || 0

        // Empty grid → a faint always-there hint that teaches the multi-select affordance.
        if (!n && !clipN) {
            this.$hud_selection.attr("data-mode", "hint").css("display", "flex")
                .find(".sel-count").text("Select frames — Shift/Ctrl-click or drag a box, or Space")
            return
        }

        // Message: how many are on the clipboard (to copy/move) vs. merely selected. When the clipboard
        // is a subset of the current selection, spell out the "N other selected" remainder.
        let text
        if (!clipN) {
            text = `${n} frame${n > 1 ? "s" : ""} selected`
        } else {
            const clipIndices = new Set(clip.frames.map(f => f.index))
            const others = [...grid.selection].filter(i => !clipIndices.has(i)).length
            text = `${clipN} frame${clipN > 1 ? "s" : ""} ${clip.cut ? "to move" : "to copy"}`
            if (others) {
                text += `, ${others} other selected`
            }
        }
        this.$hud_selection.attr("data-mode", "active").css("display", "flex")
            .find(".sel-count").text(text)
        this.$hud_selection.find("[data-sel=paste]").prop("disabled", !clipN)
    }

    /**
     * Reposition grid
     * Grid is called every frame change. Reposition frames accordingly to the current ordering.
     * @param {boolean} scrollToCurrent
     */
    display_grid(scrollToCurrent = false) {
        if (!this.grid.isDisplayed) {
            this.$hud_grid.empty()
            this.grid.load(scrollToCurrent)
        } else {
            this.grid.focusFrame(scrollToCurrent)
        }
    }

    /**
     * Note: When a frame gets unloaded immediately, we might receive no preview. This is the reason only
     * a camera icon stays in a long playlist grid.
     *
     * @param {?Frame} frame
     * @param {JQuery} $container Ribbon or grid
     * @param {boolean} prepend
     */
    assureThumbnail(frame, $container, prepend = false) {
        const pl = this.playback
        let $thumbnail = this.getThumbnail(frame, $container)
        if (!$thumbnail.length) { // this thumbnail does not exist yet
            // go to frame
            $thumbnail = $("<frame-preview/>", { html: "...", "data-ref": frame.index })

            setTimeout(async () => {
                // Element might been removed meanwhile, do not bother to preload.
                // We might ex. keep PageDown hit while scrolling down grid. That way, we scroll 1000 frames / 5 sec, without setTimeout like 400 frames.
                if (!$thumbnail[0].isConnected) return

                // When a data-thumb is configured, use it instead of the full-quality file – the grid may
                // show hundreds of previews at once and should never force-download large originals.
                // The cheap data-thumb HTML is memoized (previewCache), so scrolling back over a frame does
                // not re-clone its subtree and re-probe the thumb image every time it re-enters the grid.
                let html = this.previewCache.get(frame)
                if (html === undefined) {
                    html = await frame.get_preview_thumb()
                    if (html === null) {
                        frame.preload()
                        await frame.loaded
                        html = frame.get_preview() // full preview, not cached (depends on live preload state)
                    } else {
                        this.previewCache.set(frame, html)
                    }
                    if (!$thumbnail[0].isConnected) return // could have been removed while awaiting
                }

                $thumbnail.html(html)
                if (!$thumbnail.text().trim()) {
                    // Strange bug. When having just a full-stretched image in the frame, vertical scrollbar appeared unless font-size or line-height were zero.
                    // When I copied full HTML, no scrollbar was visible, albeit I found no single difference in the DevTools.
                    $("> *", $thumbnail).css("font-size", "0")
                }

                // delete frame
                if (pl.editing_mode) {
                    $thumbnail.append($("<span/>", { html: "&#10006;", class: "delete", title: "Delete frame" }).on("click", () => frame.delete()))
                }

                // tag visible
                if (pl.tagging_mode) {
                    $thumbnail.append($("<span/>", { html: frame.tag_display(), class: "tag", title: "Tag that helps you organize" }))
                }

                // Scale – use the proportions of the full screen but shrink to max thumbnail width.
                // $current can momentarily be a detached (just-deleted) frame with width 0, which would make
                // the scale Infinity and blow the preview out of its cell – fall back to a live frame / the window.
                const fullWidth = pl.$current.width() || pl.$articles.first().width() || $(window).width()
                $(":first", $thumbnail).css({ "scale": String($thumbnail.width() / fullWidth) })
            }, 1)
        }
        if (prepend) {
            $thumbnail.prependTo($container)
        } else {
            $thumbnail.appendTo($container)
        }
        return $thumbnail
    }

    /**
     * Get the corresponding <frame-preview> to the given frame. It was previously generated by assureThumbnail.
     * @param {Frame} frame
     * @param {JQuery} $container
     * @returns
     */
    getThumbnail(frame, $container = null) {
        return $(`frame-preview[data-ref=${frame.index}]`, $container)
    }

    /**
     * draggable and highlighted
     * @param {*} $container
     * @param {*} currentIndex
     */
    makeThumbnailsImportable($container, scroll = true) {
        const pl = this.playback
        // highlight current
        if (pl.frame) {
            $("frame-preview", $container).removeClass("current").filter(this.getThumbnail(pl.frame)).addClass("current")
        }

        // paint the multi-selection (grid only) so freshly scrolled-in thumbnails match this.grid.selection
        if ($container[0] === this.$hud_grid[0]) {
            this.grid._syncSelectionClass()
        }

        // make importable and draggable – only elements not initialized yet. jQuery UI .draggable()
        // re-inits (destroy+recreate) on every element it is called on, and this method runs on every
        // frame change / scroll page while the grid is open, so re-running it over the whole loaded set
        // (hundreds of thumbnails) was pure waste. New elements have no .ui-draggable class yet.
        const $new = $("frame-preview, section-controller", $container).not(".ui-draggable")
        if (!$new.length) {
            return
        }

        pl.menu.importable($new, (frames, target, before) => {
            if (target.tagName === "SECTION-CONTROLLER") {
                pl.section_controller.importFrames(frames, $($(target).data("section")), before ? "prepend" : before)
            } else {
                pl.section_controller.importFrames(frames, $(pl.$articles[target.dataset.ref]), before)
            }
        })
            .draggable({  // re-order thumbnails by dragging
                containment: "parent",
                helper: "clone",
                snapTolerance: 30,
                scroll: scroll,
                drag: (_, ui) => {
                    clean()
                    const [target, before] = underlyingEl(ui)
                    $(target).addClass(`dragging-target dragging-${before ? "before" : "after"}`)
                },
                stop: (_, ui) => {
                    clean()
                    const [target, before] = underlyingEl(ui)
                    if (!target) {
                        return
                    }
                    const index = ui.helper.data("ref")
                    // when the dragged thumbnail is part of a multi-selection, the whole selection travels
                    const multi = this.grid_visible && this.grid.selection.has(Number(index)) && this.grid.selection.size > 1
                    if (target.tagName === "SECTION-CONTROLLER") {
                        const section = $(target).data("section")
                        multi ? this.grid.putSelectionIntoSection(section) : pl.section_controller.putFrameIntoSection(index, section)
                    } else {
                        const ref = target.dataset.ref
                        multi ? this.grid.moveSelectionBeside(ref, before) : pl.section_controller.moveFrame(index, ref, before)
                    }
                }
            })

        function underlyingEl(ui) {
            const target = document.elementsFromPoint(ui.position.left, ui.position.top + $container.prop("offsetTop") - $container.scrollTop())
                .find(el => el.tagName === "FRAME-PREVIEW" || el.tagName === "SECTION-CONTROLLER")
            if (!target) {
                return [null, null]
            }
            const before = ui.offset.left < target.offsetLeft + 10
            return [target, before]
        }

        function clean() {
            $(".dragging-target").removeClass("dragging-target dragging-before dragging-after")
        }
    }

    /**
     * File info block (filename, EXIF device/datetime, GPS, tag).
     * Extracted from refresh() so that late-arriving EXIF data can re-render just this part.
     * @param {Frame} frame
     */
    file_info(frame) {
        const $actor = frame.$actor

        this.$hud_filename.html(frame.get_filename($actor) || "?")
        this.$hud_device.text($actor.data("device") || "")
        this.$hud_datetime.text(prop("datetime", $actor) || "")
        // display the map button only if map was previously blocked by user
        this.$hud_gps.html($actor.data("gps") ? "🗺" : "")
        this.tag(frame)
    }

    /**
     *
     * @param {Frame} frame
     * @param {boolean} scrollToCurrent
     */
    refresh(frame, scrollToCurrent = false) {
        this.file_info(frame)

        // Counter
        const collection_index = frame.$frame.index() + 1
        const collection_max = frame.$frame.siblings().length + 1

        if (collection_max > 1 && collection_max !== frame.playback.slide_count) {
            this.$hud_counter.text(`${collection_index} / ${collection_max} (${frame.slide_index + 1} / ${frame.playback.slide_count})`)
        } else {
            this.$hud_counter.text(`${frame.slide_index + 1} / ${frame.playback.slide_count}`)
        }

        // Thumbnails
        if (this.thumbnails_visible) {
            this.display_thumbnails()
        }
        if (this.grid_visible) {
            this.display_grid(scrollToCurrent)
        }
        if (this.properties_visible) {
            this.properties()
        }
    }

    /**
     * Reveal a loading spinner while `frame`'s full-quality media is still downloading, hide it once loaded.
     * A short delay first avoids a flash on frames that are already cached.
     * For a <video> actor, the spinner also shows the buffered percentage – unlike <img>, <video> exposes
     * download progress natively via the `progress` event and the `buffered` ranges.
     * For an <img> actor, Frame._fetch_with_progress() (see frame.js) fetches the full file itself and
     * triggers `loadprogress.slidershow` with the percentage, since a plain <img src> exposes no progress.
     * @param {Frame} frame
     */
    loading(frame) {
        clearTimeout(this._loading_timer)
        this.$hud_loading.removeClass("active")
        this.$hud_loading_percent.text("")
        this._loading_timer = setTimeout(() => this.$hud_loading.addClass("active"), 150)

        const $video = frame.$actor.is("video") ? frame.$actor : null
        $video?.on("progress.slidershow-load", () => {
            const el = $video[0]
            if (el.duration && isFinite(el.duration) && el.buffered.length) {
                const percent = Math.round(el.buffered.end(el.buffered.length - 1) / el.duration * 100)
                this.$hud_loading_percent.text(percent + "%")
            }
        })

        const $img = frame.$actor.is("img") ? frame.$actor : null
        $img?.on("loadprogress.slidershow", (e, percent) => this.$hud_loading_percent.text(percent + "%"))

        frame.loaded.then(() => {
            $video?.off("progress.slidershow-load")
            $img?.off("loadprogress.slidershow")
            if (this.playback.frame === frame) { // ignore if the user has navigated away meanwhile
                clearTimeout(this._loading_timer)
                this.$hud_loading.removeClass("active")
            }
        })
    }

    /**
     * @param {Frame} frame
     */
    tag(frame) {
        const value = frame.tag_display()
        this.$hud_tag.html(value && !frame.tags_all_named() ? "🏷 " + value : value)
        this.getThumbnail(frame).find(".tag").html(value)
    }

    /**
     * Refresh the small clickable icon next to the frame counter that shows the active tag_filter
     * (click clears it – use the "Filter by tag…" command to change the selection instead).
     */
    refresh_tag_filter_icon() {
        const pl = this.playback
        if (!pl.tag_filter.length) {
            this.$hud_tag_filter.html("").hide()
            return
        }
        const names = pl.frame.tag_names()
        const label = pl.tag_filter.map(t => names[t - 1] || t).join(", ")
        this.$hud_tag_filter.html(`🏷 ${label} ✕`).show()
    }

    /**
     * Popup info
     * @param {string} text
     * @param {boolean} soft If soft, just output into the console
     */
    info(text, soft = false) {
        console.warn(text)
        this._pushHistory(text)
        if (!soft) {
            new $.Zebra_Dialog(text, {
                auto_close: Math.max(2000, 40 * text.length),
                buttons: false,
                modal: false,
                position: ["right - " + (this.properties_visible ? Math.round(this.$hud_properties.width()) + 10 + 20 : 20), "top + 20"]
            })
        }
    }

    /**
     * Ok dialog
     * @param {string} title
     * @param {string} text
     */
    ok(title, text) {
        this._pushHistory(text)
        new $.Zebra_Dialog(text, { type: "information", title: title })
    }

    /**
     * @param {string} text
     */
    _pushHistory(text) {
        this.info_history.push({ time: new Date().toLocaleTimeString(), text })
        if (this.info_history.length > 50) {
            this.info_history.shift()
        }
    }

    /**
     * Show past info()/ok() notifications, newest first (they are easy to miss – auto-closing toasts).
     */
    show_notification_history() {
        const items = this.info_history.length
            ? this.info_history.slice().reverse().map(h => `<div>${h.time} — ${h.text}</div>`).join("")
            : "No notifications yet."
        new $.Zebra_Dialog(items, { type: "information", title: "Notification history" })
    }

    /**
     * Information for the presenter, not for the public.
     */
    discreet_info(text) {
        if (text) {
            console.info("INFO:", text)
        }
    }

    reset() {
        this.previewCache.clear() // media/structure may have changed – drop memoized previews
        this.reset_thumbnails()
        this.$hud_properties.html("")
        this.reset_grid()
    }

    reset_thumbnails() {
        this.$hud_thumbnails.html("")
    }

    reset_grid() {
        const pos = this.grid.isDisplayed ? this.grid.getScrollAnchor() : null

        this.grid.isDisplayed = false
        this.$hud_grid.html("")
        if (this.grid_visible) {
            this.display_grid()
            if (pos) {
                this.grid.scrollToAnchor(pos)
            }
        }
    }

    /**
     * Properties pane
    */
    async properties() {
        await this.fetch_help()
        const pp = this.propertyPanel
        const frame = this.playback.frame
        const $frame = frame.$frame
        const $actor = frame.$actor
        const $props = this.$hud_properties
            .html($("<p/>").html("Properties panel (Alt+P)"))

        // element properties
        if ($actor.length) {
            // handle media properties
            $props.append(["rotate"].map(p => pp.input_ancestored(p, $actor)).flat())

            if ($actor.prop("tagName") === "IMG") {
                // step-points property
                pp
                    .input_ancestored("step-points", $actor)
                    .appendTo($props)
                    .find("input").map((_, el) => new pp.points(this.playback, el, false))
            } else if ($actor.prop("tagName") === "VIDEO") {
                // playback-rate property
                $props.append(["playback-rate"].map(p => pp.input_ancestored(p, $actor, "number")).flat())

                // video-cut property
                const original = frame.get_filename($actor).split("#")[1]?.split("t=")[1]
                $props.append(pp.input("video-cut", $actor, "", original, "text", "START[,STOP]", val => {
                    const src = $actor.attr("src")
                    if (val) {
                        val = "t=" + val // -> "t=START[,STOP]""
                    }
                    if (src) {
                        $actor.attr("src", [src.split("#")[0], val].join("#"))
                    } else {
                        this.info("Not implemented changing this syntax of video URL")
                    }
                }))

                // video-points property
                // NOTE pack input_ancestored to save space (hide inputs unless having value or clicked or something)
                pp
                    .input_ancestored("video-points", $actor)
                    .appendTo($props)
                    .find("input").map((_, el) => new pp.points(this.playback, el, true))

                // video property
                // The `video` attribute can be derived also from the real HTML attributes which is not here implemented to bear.
                $props.append(pp.input_ancestored("video", $actor))
            }
        }

        // frame properties
        // XX step-li might be checkbox, some of them can go to any element, not just its frame
        const props = ["duration", "transition-duration", "step-li", "step-duration", "step-class", "step-shown", "step-transition-duration"]
        $props
            .append(props.map(p => pp.input_ancestored(p, $frame)).flat())
        // XX data-step could be implemented for any focused element
    }

    async fetch_help() {
        if (!this._help) {
            this._help = await $.ajax({
                dataType: "text",
                url: DOCS_URI
            })
        }
    }

    get_help(property, short = false, display = true) {
        let text
        if (!this._help) {
            this.fetch_help()
            text = "Loading docs, try again"
        } else {
            const real_name = "data-" + property
            const rr = short ? `#+ \`${real_name}\`\\n\\n?([\\s\\S]*?)(?=\\n)` : `#+ \`${real_name}\`\\n\\n?([\\s\\S]*?)(?=\\n#)`
            const r = new RegExp(rr, "m")

            const m = this._help.match(r)
            if (m) {
                if (short) {
                    text = m[1]
                } else {
                    const docs_link = `<a href="${HOME_PAGE}#${real_name}">→ docs</a>`
                    // point internal links to the homepage
                    const links = m[1].replaceAll("`](#", "`](" + HOME_PAGE + "#")
                    const markdown = this.playback.menu.markdown.makeHtml(links)
                    text = docs_link + markdown
                }
            }
        }

        const error = `Cannot fetch help for ${property}`
        if (display) {
            if (!text) {
                this.info(error)
            } else {
                this.ok(property, text)
            }
        } else {
            return text || error
        }
    }
}