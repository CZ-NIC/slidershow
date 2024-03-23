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
        this.$hud_tag = $("#hud-tag")
        this.$hud_counter = $("#hud-counter")
        this.$hud_menu = $("#hud-menu")
        this.$hud_thumbnails = $("#hud-thumbnails").hide() // by default off
        this.$hud_grid = $("#hud-grid").hide() // by default off
        this.$hud_properties = $("#hud-properties").hide() // by default off
        this.$control_icons = $("#control-icons")

        this.previewCache = new Map()
        this.init_grid()

        // Playback icon shows the menu
        this.playback_icon_interval = new Interval(() => this.$control_icons.fadeOut(500, () => this.$playback_icon.html("☰")), 1000)
        this.$playback_icon = $("<div/>", { id: "playback-icon", html: "☰" })
            .appendTo(this.$control_icons)
            .on("click", () => this.$hud_menu.fadeToggle(500) && this.playback_icon("☰"))

        this.$control_icons
            .hide()
            .on("mouseenter", () => this.$playback_icon.html("☰") && this.playback_icon_interval.freeze()) // icon will not disappear on hover
            .on("mouseleave", () => this.playback_icon_interval.unfreeze())
        $(document).on("mousemove", () => this.playback_icon())
        this.$hud_menu.on("mousemove", "button", e => this.playback_icon(e.target.title)) // menu hover hint

        // Next / prev icons
        $("<div/>", { html: "◁" })
            .appendTo(this.$control_icons)
            .on("click", () => pl.goPrev())
        $("<div/>", { html: "▷" })
            .appendTo(this.$control_icons)
            .on("click", () => pl.goNext())

        this.$hud_gps.on("click", () => {
            pl.hud_map.toggle(true)
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

    playback_icon(html = "") {
        if (html) {
            this.$playback_icon.html(html)
        }
        this.$control_icons.stop(true).fadeIn(0)
        this.playback_icon_interval.start()
    }


    toggle_thumbnails() {
        this.$hud_thumbnails.toggle()
        if (this.thumbnails_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.thumbnails()
        }
        this.playback.session.store()
    }

    toggle_grid() {
        this.$hud_grid.toggle()
        if (this.grid_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.grid()
        }
        this.playback.session.store()
    }

    toggle_properties() {
        this.$hud_properties.toggle()
        if (this.properties_visible && this.playback.frame) {
            // when restoring session from the hash, frame is not ready yet
            this.properties()
        }
        this.playback.session.store()
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
        const pl = this.playback
        this.$hud_grid
            // grid disappears on double click
            .on("dblclick", "frame-preview", () => this.toggle_grid())
            // grid section buttons
            .on("click", "section-controller button", e => { // order
                const $section = $($(e.target.closest("section-controller")).data("section"))
                /** @type {JQuery} Frames in the current section  */
                const $frames = $section.children(FRAME_SELECTOR)
                /** @type {JQuery} Current frame (does not have to be in the section) */
                const $frame = pl.frame.$frame
                const cc = pl.changes

                switch (e.target.dataset.role) {
                    case "name-desc":
                        order((frame1, frame2) => frame2.get_filename().localeCompare(frame1.get_filename()))
                        break
                    case "name-asc":
                        order((frame1, frame2) => frame1.get_filename().localeCompare(frame2.get_filename()))
                        break
                    case "date-desc":
                        order((frame1, frame2) => frame2.$actor?.data("datetime") < frame1.$actor?.data("datetime") ? 1 : -1)
                        break
                    case "date-asc":
                        order((frame1, frame2) => frame1.$actor?.data("datetime") < frame2.$actor?.data("datetime") ? 1 : -1)
                        break
                    case "new-frame":
                        pl.operation.insertNewFrame(rightPlace())
                        break
                    case "new-section":
                        pl.operation.insertNewSection()
                        break
                    case "import":
                        $("<input/>", { type: "file" }).change(function () {
                            const frames = pl.menu.loadFiles([...this.files])
                            pl.operation.importFrames(frames, rightPlace(), false)
                            pl.hud.info(`${this.files.length} media imported`)
                        }).click()
                        break
                    default:
                        this.info("Unknown action")
                        break
                }

                /**
                 *
                 * @returns {JQuery} Current frame if in the section, otherwise the last frame of the current section.
                 */
                function rightPlace() {
                    return $frames.is($frame) ? $frame : $frames.slice(-1)
                }

                /**
                 * Order frames
                 * @param {frames} callback
                 * @callback frames
                 * @param {Frame} frame1
                 * @param {Frame} frame2
                 *
                 */
                function order(callback) {
                    const $orig_frames = $frames.map((_, e) => e)
                    $frames.sort((a, b) => callback($(a).data("frame"), $(b).data("frame")))
                    cc.undoable("Sort frames",
                        () => $section.append($frames),
                        () => $section.append($orig_frames),
                        () => pl.resetAndGo())
                }
            })
    }

    /**
     * Thumbnail ribbon
     */
    thumbnails() {
        const pl = this.playback
        const frame = pl.frame
        const $container = this.$hud_thumbnails

        const THUMBNAIL_COUNT = 6
        // visible frames' indices
        const middle = Math.ceil(THUMBNAIL_COUNT / 2)
        const frameIds = Array.from({ length: THUMBNAIL_COUNT }, (_, i) =>
            i + (frame.index + middle >= pl.$articles.length ?
                pl.$articles.length - THUMBNAIL_COUNT  // keep same thumbnails number at the ribbon end
                : Math.max(0, frame.index - middle)))
            .filter(id => id >= 0)

        // remove old unused thumbnails
        $("frame-preview", $container).filter((_, el) => !frameIds.includes(Number(el.dataset.ref))).remove()

        // arrange thumbnails
        this._2frames(frameIds).forEach(frame => this.assureThumbnail(frame, $container))

        // film-strip should not take excessive height
        const scaleFactorX = $("frame-preview:first", $container).width() / pl.$current.width()
        $container.css({ height: scaleFactorX * 100 + "vh" })

        // highlight current frame preview
        this.makeThumbnailsImportable($container, false) // prevent scrolling which scrolls main frame, not the thumbnails because there are only little of them
    }

    /**
     *
     * @param {number[]} indices of frames
     * @returns {Frame[]}
     */
    _2frames(indices) {
        return indices.map(index => $(this.playback.$articles[index]).data("frame"))
    }

    /**
     * Reposition grid
     * Grid is called every frame change. Reposition frames accordingly to the current ordering.
     * @param {?Frame} lastFrame
     */
    grid(lastFrame) {
        let section
        const pl = this.playback
        const $container = this.$hud_grid
        $("section-controller", $container).remove() // sections are not linked to any objects, we might recreate them every time
        $(FRAME_SECTION_SELECTOR).map((_, frameOrSection) => {
            if (frameOrSection.tagName === "SECTION") {
                section = assureSection(section, frameOrSection)
            } else {
                this.assureThumbnail($(frameOrSection).data("frame"), $container)
            }
        })
        this.makeThumbnailsImportable($container)

        // Scroll to the thumbnail if not visible
        setTimeout(() => { // why set timeout? Because the re-ordering DOM changes must flush first.
            // Scroll only when the frame changed.
            // Ex: Hitting 'End' will scroll. But dragging unactive frames around would scroll you out from what you have just dragged.
            if (pl.frame !== lastFrame) {
                const el = this.getThumbnail(pl.frame, $container).get(0)
                const rect = el.getBoundingClientRect()
                if (rect.top < 0 || rect.bottom > document.documentElement.clientHeight) {
                    el.scrollIntoView({ "block": "center" })
                }
            }
        }, 1)

        /**
         * Insert new section to the grid if encountered
         * @param {HTMLElement} lastSection
         * @param {HTMLElement} currentSection
         */
        function assureSection(lastSection, currentSection) {
            if (lastSection !== currentSection) {
                const aa = $(`<section-controller>
                            <button data-role='name-desc'>order by name ⇓</button>
                            <button data-role='name-asc'>order by name ⇑</button>
                            <button data-role='date-desc'>order by date ⇓</button>
                            <button data-role='date-asc'>order by date ⇑</button>
                            <button data-role='import'>add media</button>
                            <button data-role='new-frame'>add text</button>
                            <button data-role='new-section'>add section</button>
                        </section-controller>`)
                    .appendTo($container)
                    .data("section", currentSection)
            }
            return currentSection
        }
    }

    /**
     * Note: When a frame gets unloaded immediately, we might receive no preview. This is the reason only
     * a camera icon stays in a long playlist grid.
     *
     * @param {?Frame} frame
     * @param {JQuery} $container Ribbon or grid
     */
    assureThumbnail(frame, $container) {
        const pl = this.playback
        let $thumbnail = this.getThumbnail(frame, $container)
        if (!$thumbnail.length) { // this thumbnail does not exist yet
            // go to frame
            $thumbnail = $("<frame-preview/>", { html: "...", "data-ref": frame.index }).on("click", () => this.playback.goToFrame(frame.index))

            frame.preload()
            frame.loaded.then(() => {
                $thumbnail.html(frame.get_preview())
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
                    $thumbnail.append($("<span/>", { html: frame.$actor.attr("data-tag"), class: "tag", title: "Tag that helps you organize" }))
                }

                // Scale – use the proportions of the full screen but shrink to max thumbnail width
                const scaleFactorX = $thumbnail.width() / pl.$current.width()
                $(":first", $thumbnail).css({ "scale": String(scaleFactorX) })
            })
        }
        $thumbnail.appendTo($container)
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

        // make importable and draggable
        pl.menu.importable($("frame-preview, section-controller", $container), (frames, target, before) => {
            if (target.tagName === "SECTION-CONTROLLER") {
                pl.operation.importFrames(frames, $($(target).data("section")), "prepend")
            } else {
                pl.operation.importFrames(frames, $(pl.$articles[target.dataset.ref]), before)
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
                    if (target) {
                        const index = ui.helper.data("ref")
                        if (target.tagName === "SECTION-CONTROLLER") {
                            pl.operation.putFrameIntoSection(index, $(target).data("section"))
                        } else {
                            pl.operation.moveFrame(index, target.dataset.ref, before)
                        }
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
     *
     * @param {Frame} frame
     * @param {?Frame} lastFrame
     */
    refresh(frame, lastFrame = null) {
        const $actor = frame.$actor

        this.$hud_filename.html(frame.get_filename($actor) || "?")
        this.$hud_device.text($actor.data("device") || "")
        this.$hud_datetime.text($actor.data("datetime") || "")
        // display the map button only if map was previously blocked by user
        this.$hud_gps.html($actor.data("gps") ? "🗺" : "")
        this.tag($actor.attr("data-tag"))

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
            this.thumbnails()
        }
        if (this.grid_visible) {
            this.grid(lastFrame)
        }
        if (this.properties_visible) {
            this.properties()
        }
    }

    tag(tag = "") {
        this.$hud_tag.html(tag ? "TAG: " + tag : "")
        this.getThumbnail(this.playback.frame).find(".tag").html(tag)
    }

    /**
     * Popup info
     * @param {string} text
     * @param {boolean} soft If soft, just output into the console
     */
    info(text, soft = false) {
        console.warn(text)
        if (!soft) {
            new $.Zebra_Dialog(text, {
                auto_close: 2000,
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
        new $.Zebra_Dialog(text, { type: "information", title: title })
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
        this.reset_thumbnails()
        this.$hud_properties.html("")
        // No need to reset the grid here as it is re-run on frame change.
    }

    reset_thumbnails() {
        this.$hud_thumbnails.html("")
    }

    reset_grid() {
        this.$hud_grid.html("")
    }

    /**
     * Properties pane
    */
    async properties() {
        await this.fetch_help()
        const pp = new PropertyPanel(this)
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
                // TODO missing from readme. Write about video-points interference.
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
                // TODO readme, tutorial, functionality
                // TODO pack input_ancestored to save space (hide inputs unless having value or clicked or something)
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
