const EDITABLE_ELEMENTS = "h1,h2,h3,h4,h5,h6,p,li"
class Frame {
    /**
     *
     * Frame lifecycle is as follows: preload / prepare / enter / leave / left (not guaranteed to run) / unload
     *
     * @param {jQuery} $el
     * @param {?Playback} playback
     */
    constructor($el, playback = null) {
        this.$frame = $el
        /** @type Playback */
        this.playback = playback
        this.$video_pause_listener = null
        /**  @type {?jQuery}         */
        this.$actor = this.$frame.find("video, img").first()
        this.panorama_starter = null
        this.loop_interval = new Interval()

        /**
         * If set, this frame is a subframe.
         * @type {?Frame}
         */
        this.parent = null
        /**
         * Subframes
         * @type {Frame[]}
         */
        this.children = []

        /**
         * @type {Number} Frame counter, starting with 0. Set by the playback.
         */
        this.index

        /**
        * @type {Number} Frame grouped by slides, starting with 0. (Frames nested under a parent frame has the same slide index). Set by the playback.
         */
        this.slide_index

        this.shortcuts = []

        /** @type {Promise[]} All the effects that should hold playback. */
        this.effects = []

        /** @type {?Promise} */
        this.video_finished = null

        /** @type {Array<HtmlElement|Function>} Which elements are to be showed progressivelly.
         * They are grouped by the same data-set: [ [data-step=2, 2], [4], [5,5,5], [12]]
         */
        this.steps = []
        /** Element in this.steps that is going to be shown in the next step. Elements with lower index are already shown. */
        this.step_index = 0
        /** @type {number|null} How long the last active step should last. */
        this.step_duration = null

        /** @type {Promise} Register to this promise to be notified. (It fulfills when preload started, not on the preloaded media onload.)
         */
        this.preloaded = new Promise(r => this._preloaded = r)

        /**
         * @type {Promise} Fulfilled on all media loaded.
        */
        // Apart from all the standard media loaded we await the signal from .preload method that all re-srced media are loaded.
        this.loaded = Promise.all([new Promise(r => this._loaded = r), ...this.$frame.find("video, img").map((_, el) => el.complete || new Promise(r => $(el).one("load", r)))])
    }

    register_parent(frame) {
        this.parent = frame
        this.parent.children.push(this)
    }

    /**
     *  XX not used in the moment
     */
    effect(effect) {
        return
        const TRANS_DURATION = this.prop("transition-duration") * 1000
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


    /**
     * Return closest prop, defined in the DOM.
     * (Zero aware, you can safely set `data-prop=0`.)
     * @param {string} property
     * @param {jQuery|null} $actor What element to check the prop of. If null, frame is checked.
     * @param {any} def Custom default value if not set in DOM (when PROP_DEFAULT default value is not desirable).
     * @returns
     */
    prop(property, $actor = null, def = null) {
        const $el = $actor?.length ? $actor : this.$frame
        return prop(property, $el, def)
    }

    /**
     * Frame is going to be entered right now but is not visible yet.
     */
    prepare() {
        this.children.forEach(f => f.$frame.hide())
        if (this.parent) { // this is a child frame
            this.$frame.show(0) // it was hidden before
        }

        // main media action
        this.loaded.then(() => {
            if (this.$actor.prop("tagName") === "IMG") {
                this.panorama()
            }
        })

        // File name
        this.playback.hud.fileinfo(this)

        // Map
        this.map_prepare()

        // Insert templated header and footer
        // If such template exists, insert it to the current frame if needed (it does not yet contain it)
        const check = (tag, method) => $($("template")[0]?.content).find(tag).clone().attr("data-templated", 1)[method](this.$frame.not(`:has(${tag})`))
        check("header", "prependTo")
        check("footer", "appendTo")

        if (!this.playback.step_disabled) {
            this.steps_prepare()
        }
    }

    steps_prepare() {
        // Sort elements to be stepped through. Some of them might have `data-step=number` (which we honour),
        // those with `data-step` are to be filled around.
        const $steppable = $("[data-step]", this.$frame)
            // [data-step-li] affects all <li>
            .add($("li", this.$frame)
                .filter((_, el) => this.prop("step-li", $(el))))
            // [data-step-points] affects all <img>
            .add($("img", this.$frame)
                .filter((_, el) => !$(el).closest("header, footer").length) // filter out images in header/footer
                .map((_, el) => {
                    // generate multiple steps (dummy <img-temp-animation-step>) for points
                    const $el = $(el)
                    const points = this.prop("step-points", $(el))
                    if (!points?.length) {
                        return
                    }

                    // what is the first zoom position we see
                    // XX When multiple zoomed images at frame (or zooming steps along with classic data-step) are tested,
                    // this will pose a problem. Because this.step_index points to the frame step,
                    // not to the image animation step.
                    const init_point = Array.from(points[this.step_index] || points.slice(-1))
                    if (init_point) {
                        // init point has no transition duration, it's straight there when we come to the frame
                        init_point[3] = 0
                        this.step_duration = this.zoom_set($el, ...init_point) ?? prop("step-duration", $el, null, "duration")
                    }
                    return $.map(points.slice(1), // the init point has already been zoomed into, slice it out
                        (point, index) => $("<img-temp-animation-step/>")
                            // show the next or the previous animation step (we sliced the points due to the init point)
                            .data("callback", shown => this.zoom_set($el, ...shown ? point : points[index]))
                        [0])
                }))

        let index = 0
        let [last_step, pointer] = [null, null]
        this.steps = []
        $steppable
            .attr("data-step", function (_, step) {
                // Conserve the original.
                // Why null? This helps to restore the value through .attr later, having .attr(..., undefined) would be same as reading.
                $(this).data("step-original", step === undefined ? null : step)
                // adds a class, unless step-shown is set
                $(this).addClass(prop("step-shown", $(this)) ? null : prop("step-class", $(this)))
                if (step === '' || step === undefined) { // this element has not its data-step set yet
                    while ($steppable.filter(`[data-step=${++index}]`).length) {
                        // find first free position
                    }
                    step = index
                }
                return step
            })
            .sort((a, b) => $(a).data("step") - $(b).data("step"))
            .map((_, el) => {
                const $el = $(el)
                const step = $el.data("step")
                if (step > last_step) {
                    pointer = []
                    this.steps.push(pointer)
                }
                pointer.push(el)
                last_step = step

                // check if the element should be hidden at the beginning
                if (!$el.is("img-temp-animation-step")) {
                    this.step_process($el, this.steps.length <= this.step_index, true)
                }
            })
    }

    map_prepare() {
        /** @type {MapWidget} */
        let map
        // which map to use?
        if (this.$frame.prop("tagName") === "ARTICLE-MAP") {
            map = this.playback.map
            map.adapt(this)
        } else {
            map = this.playback.hud_map
        }

        /** @type {Place[]} */
        const places = get_places(this)

        if (places.length) {
            const last_places = get_places(this.$frame.prev().data("frame")) || get_places(this.$frame.parent().data("frame"))

            map.engage(places,
                this.prop("map-animate", null, true),
                this.prop("map-geometry-show", null, false),
                this.prop("map-geometry-criterion", null, ""),
                this.prop("map-markers-show", null, true),
                this.prop("map-geometry-clear", null, true),
                this.prop("map-markers-clear", null, true),
                this.prop("map-zoom"),
                last_places)
        }


        /**
         *
         * @param {?Frame} frame
         * @returns {?Place[]}
         */
        function get_places(frame) {
            if (!frame) {
                return null
            }
            const places = []
            const gps = frame.prop("gps", frame.$actor)
            if (gps) {
                places.push(Place.from_coordinates(...gps.split(",")))
            }

            const names = frame.prop("places", frame.$actor)
            if (names) {
                places.push(...names.split(",").map(name => new Place(name)))
            }
            return places
        }
    }

    /**
     *  Preload media; for the case of several thousands file, the perfomarce is important.
     *
     * * data("read-src"): If present, this is the method to re-read the dragged media from the disk.
     * * data-src: Optional attribute for <img>, <video>, holds the original file name.
     *
     * @returns {Promise[]} Fulfilled when src loaded from the memory.
     */
    async preload() {
        const $frame = this.$frame
        if ($frame.attr("data-preloaded")) {
            // When we call playback.reset() (ex: after frame duplication), we get here (to the recreation of the frame) with data-preloaded already true.
            this._preloaded()
            this._loaded()
            return [] // already done
        }
        $frame.attr("data-preloaded", 1) // prevent another preload

        // Process media
        const loaded = $frame.find("img[data-src], video[data-src]").map(async (_, el) => {
            const $el = $(el)
            if (!$el.attr("src")) { // src is not set yet
                const src = (await $el.data(READ_SRC)?.(true)) || $el.data("src")
                if (src) { // there is a place to load src from
                    el.src = src
                    return new Promise(r => el.onload = r)
                }
            }
            return null // src already set or no place to set the src from
        }).get().filter(Boolean)

        // Process markdown
        // XX Not used right now.
        if (this.prop("markdown")) {
            // What to take care of: html entities `&lt;`, html tags `<b>`, non-tags at hash lines `# <class>` (just text, not tag)
            // I think the only chance here is to register a new element <article-md> (inherited from <textarea>).
            // Code editor must not format lines.
            // String `# <class '__main__.Kocicka'>` must not add a pairing `</class>`
            // String `# &#x3C;class &#x27;__main__.Kocicka&#x27;&#x3E;` must be displayed correctly.
            // A wild tag `<b>bold</b>` must remain.
            // <pre>
            // <code>
            // const md = this.$frame.find("pre").html()
            // this.$frame.data("md", md)
            // this.$frame.find("pre").html(this.playback.menu.md(md))
            // Article may begin with a HTML comment. I presume these must not be taken into markdown.
        }

        this._preloaded()
        Promise.all(loaded).then(() => this._loaded())
        return loaded
    }

    /**
     * Opposite of this.preload()
     * Functionality should be duplicated finalize_frames (due to performance reasons).
     */
    unload() {
        const $frame = this.$frame
        $frame.removeAttr("data-preloaded")

        // Remove src if data can be retrieved from the memory data(READ_SRC) or the attribute data-src
        $frame.find("img[data-src], video[data-src]").map((_, el) => Frame.unload_media($(el)))

        // XX Not used right now and missing in the global unload.
        // const md = this.$frame.data("md")
        // if (md) {
        //     this.$frame.find("pre").text(md)
        // }
    }

    /** If there is a place the `[src]` can be re-read, delete it. */
    static unload_media($el, $el_original = null) {
        if (($el_original || $el).data(READ_SRC) || $el.data("src") && $el.data("src") === $el.attr("src")) {
            URL.revokeObjectURL($el.attr("src")) // for the case this is a blob URL given by FrameFactory reader
            $el.removeAttr("src")
        }
    }

    /**
     * Remove auxiliary parameters when exporting.
     * @param {jQuery} $contents Copy of body, containing all frames.
     * @param {jQuery} $articles Original live articles = all frames.
     * @param {Boolean} keep_raw Store raw bytes if possible. If true a there are bytes in the memory,
     *  those are exported; we prefer raw bytes over the filename (the original will not be needed).
     *  False → filename always exported.
     * @param {String} path Path where the presentation file will find the media folder.
     * @param {Function} callback When frame done, call this to increase the progress bar.
     */
    static async finalize_frames($contents, $articles, keep_raw = false, path = "", callback = null) {
        // batch execute operations otherwise done in methods like `unload` or `left`
        $("video[data-autoplay-prevented]", $contents).removeAttr("data-autoplay-prevented").attr("autoplay", "")
        const $frames = $contents.find(FRAME_SELECTOR).removeAttr("data-preloaded")
        $frames.find("[data-templated]").remove()
        Frame.unmake_editable($frames)
        Frame._clean_step($frames.find("[data-step]"))

        // handling media
        const $originals = $articles.find("img[data-src], video[data-src]")
        const $media = $frames.find("img[data-src], video[data-src]")
        let $frame = null
        for (let index = 0; index < $media.length; index++) {
            // process the media files one by one (we cannot use map since it would ignore `await reader()`)
            const $el = $($media[index])
            const $el_original = $($originals[index])

            // progress bar
            const $parent = $el.closest(FRAME_SELECTOR)
            if ($frame !== $parent) {
                Frame.unload_media($el, $el_original) // unload the frame copy
                callback?.()  // this is a new frame, increase
            }
            $frame = $parent

            // summarize attributes
            const reader = $el_original.data(READ_SRC)
            let data_src = $el.data("src")
            if (reader && !data_src.includes("/")) {
                // Store full path to data-src.
                // Dragged in files did not receive an absolute path from the system.
                data_src = $el.attr("data-src", path + data_src).attr("data-src")
            }
            const attr_src = $el.attr("src")

            // desired change
            switch (true) {
                case reader && keep_raw && PREFER_SRC_EXPORT:  // reader to src
                    $el.attr(EXPORT_SRC, await reader())
                    break
                case reader && keep_raw && !PREFER_SRC_EXPORT:  // reader to data-src-bytes
                    $el.attr(EXPORT_SRC_BYTES, await reader())
                    break
                case reader && !keep_raw && PREFER_SRC_EXPORT:
                case !attr_src && data_src && PREFER_SRC_EXPORT:  // move data-src to src
                    $el.attr(EXPORT_SRC, data_src).removeAttr("data-src")
                    break
            }
        }

        // finish counter, since in the current implementation, it counts media only
        // and some frames have no media (no increasing within)
        callback?.(true)
    }

    /**
     * Inherit attributes from the ancestors
     */
    static videoInit($articles) {
        $articles.find("video").each(function () {
            const $el = $(this)
            const attributes = prop("video", $el).replace("autoplay", "data-autoplay-prevented").split(" ") || [] // ex: ["muted", "autoplay"]
            attributes.forEach((k, v) => this[k] = true) // ex: video.muted = true
            // Following line has so more effect since it was already set by JS. However, for the readability
            // we display the attributes in the DOM too. We could skip the JS for the attribute 'controls'
            // but not for 'muted'. If the <video> is not <video muted> by the DOM load,
            // the attribute would have no effect.
            $el.attr(attributes.reduce((k, v) => ({ ...k, [v]: true }), {})) // ex: <video muted=true>

            if ($el[0].hasAttribute("autoplay")) {
                // While doing an export and preloading frame, it might start playing
                // or sometimes a video in a presentation starts playing after load. Prevent this.
                $el.removeAttr("autoplay").attr("data-autoplay-prevented", 1)
            }
        })
    }

    /**
     * The frame is at the viewport.
     */
    enter() {
        const $frame = this.$frame

        // Get main media
        const $actor = this.$actor

        this.effects.length = 0 // flush out any unsettled promises

        // Image frame
        this.loaded.then(() => {
            if ($actor.prop("tagName") === "IMG") {
                Frame.exif($actor)
                this.panorama_starter?.()
                Promise.all(this.effects).then(() => {
                    this.zoom_init(this.$actor)

                    const loop = this.prop("loop")
                    if (loop) {
                        this.loop(loop)
                    }
                })
            }
        })

        // No HTML tag found, fit plain text to the screen size
        const fit = this.prop("fit")
        if (fit === true || fit === 1 || (fit === 'auto' && $frame.children().length === 0)) {
            textFit($frame)
        }

        // Video frame
        if ($actor.prop("tagName") === "VIDEO") {
            this.video_finished = new Promise(r => this.video_enter(r))
        }

        // Editing
        if (this.playback.editing_mode) {
            this.make_editable()
        }

        return this.step_duration ?? this.prop("duration")
    }

    make_editable() {
        $(EDITABLE_ELEMENTS, this.$frame)
            .attr("contenteditable", true)
        this.$frame
            .on("focus", EDITABLE_ELEMENTS, () => [this.playback.shortcuts.general.disable(), this.playback.menu.global_shortcuts.disable()])
            .on("focusout", EDITABLE_ELEMENTS, () => [this.playback.shortcuts.general.enable(), this.playback.menu.global_shortcuts.enable()])
    }

    unmake_editable($container = null) {
        Frame.unmake_editable(this.$frame)
    }
    /**
     * @param {jQuery} $container
     */
    static unmake_editable($container) {
        $(EDITABLE_ELEMENTS, $container).removeAttr("contenteditable")
    }

    video_enter(resolve) {
        const $actor = this.$actor
        $actor.focus() // Focus video controls

        this.playback.hud.discreet_info(this.get_filename().split("#")[1])

        if ($actor.attr("data-autoplay-prevented")) {
            $actor.removeAttr("data-autoplay-prevented").attr("autoplay", "")
        }

        if ($actor.attr("autoplay")) {
            // Video autoplay (when muted in chromium)
            if ($actor[0].readyState > 3) {
                $actor[0].play().catch(e => {
                    this.playback.hud.alert("Interact with the page before the autoplay works.")
                })
            } else {
                console.warn("Not ready for autoplay", $actor[0])
                // However, we might get rid of this warning for the case the video is being preloaded.
                // In such case, it still has the autoplay attribute, which causes it to play.
            }

        }
        $actor[0].playbackRate = this.prop("playback-rate", $actor)
        let next_interval = null

        // Pausing vs playback moving
        this.$video_pause_listener = $actor.on("pause", () => {
            // Normally, when a video ends, we want to move further.
            // However, when we click to the video progress gauge,
            // just before rewinding, a pause event is generated.
            // We cannot distinguish whether a pause is a user-action
            // or an automatic action. So that we wait
            // an if it was a user-action, a play event will follow shortly,
            // with the mouse button up.
            next_interval = new Interval(() => {
                next_interval.stop()
                resolve()
            }, 300)
        }).on("play", () => {
            // the video continues, it has not ended, do not move further
            next_interval?.stop()
        })
            .on("click", () => {
                // the video was manually clicked upod, it has not ended, do not move further
                next_interval?.stop()
                this.playback.play_pause(false)
            }).on("slidershow-leave", () => {
                $actor.off("pause").off("play").off("click")
            })

        // Video shortcuts
        const playback_change = (step) => {
            const r = $actor[0].playbackRate = Math.round(($actor[0].playbackRate + step) * 10) / 10
            this.playback.hud.playback_icon(r + " ×")
        }
        this.shortcuts.push(
            wh.grab("NumpadAdd", "Faster video", () => playback_change(0.1)),
            wh.grab("NumpadSubtract", "Faster video", () => playback_change(-0.1)),
            wh.grab("Alt+m", "Toggle muted", () => $actor[0].muted = !$actor[0].muted)
        )

    }

    loop(loop) {
        const $frame = this.$frame
        const $children = $frame.children().css({ "left": "unset", "top": "unset" }).show()

        function* stepGen(steps) {
            let index = 0;
            while (true) {
                yield steps[index];
                index = (index + 1) % steps.length;
            }
        }
        const gen = stepGen([...$children])

        this.loop_interval
            .fn(() => {
                $children.hide()
                $(gen.next().value).show()
            })
            .start(200)
    }

    /**
     *
     * @param {Number} step How many steps to go further.
     * @returns {Boolean} Step was fullfilled. False if no step was to be done, frame is then complete.
     */
    step(step = 1) {
        const new_step = Math.max(Math.min(this.step_index + step, this.steps.length), 0)
        const range = [this.step_index, new_step]

        const $changed = $(this.steps.slice(Math.min(...range), Math.max(...range)).flat())  // currently affected elements (normally just one)

        this.step_process($changed, step > 0)
        this.step_index = new_step
        return $changed.length  // some change happened
    }

    /*
    playback.previousFrame might contain this:
    this.frame.display_all_steps()

    Show up all steps when going to the frame from the back.

    display_all_steps() {
        this.step_index = this.steps.length
        this.steps.map((_, el) => $(el).show())
    }
    */

    clean_steps() {
        Frame._clean_step($("[data-step]", this.$frame))
        this.steps = []
        // this.step_index = this.steps.length
    }

    /**
     * Show or hide elements in the collection.
     * Or adds them classes or zoom images.
     * @param {jQuery<HTMLElement|Function>} $els
     * @param {boolean} shown
     * @param {boolean} immediate Does not allow animation
     * @returns
     */
    step_process($els, shown, immediate = false) {
        // separate standard frame jQuery elements and img[data-step-animation] elements
        const [$tags, $animations] = [$els.not("img-temp-animation-step"), $els.filter("img-temp-animation-step")]

        // evaluate step duration, either from usual tags or from an img zoom animation step point
        const durations = $animations.map((_, el) => $(el).data("callback")(shown))
            .add(...$tags.map((_, el) => prop("step-duration", $(el), null, "duration"))).get()
        // step-duration is either 0 (if any of the elements sets it) or the max value or the frame default
        // Why checking length? Prevent `Math.max(empty) -> -Infinity`
        this.step_duration = durations.length ? durations.includes(0) ? 0 : Math.max(...durations) : null




        // we have only jQuery elements there
        $tags
            .addClass(shown ? "step-shown" : "step-hidden")
            .removeClass(shown ? "step-hidden" : "step-shown")
        // elements with step-shown are handled differently; they just get a class
        const $usual = $tags.filter((_, el) => {
            const $el = $(el)
            const mark = prop("step-shown", $el)
            return mark ? $el[shown ? "addClass" : "removeClass"](mark) && false : true
        })
        // handle other elements showing/hiding
        if (shown) {
            $usual.show()
        } else if (immediate) {
            $usual.hide()
        } else {
            // Why checking `:animated` when there is default CSS animation?
            // User could change the animation wrongly:
            // [data-step] { animation-name: fadeIn; }
            // Instead of:
            // [data-step].step-shown { animation-name: fadeIn; }
            // Which would cause when going a step back the element to already being faded in
            // and animationend never triggered.
            $usual.map((_, el) => $(el).is(":animated") ?
                $(el).one("animationend", () => $(el).toggle(!$(el).hasClass("step-hidden")))
                : $(el).hide(500)
            )
        }
    }

    /**
     * @returns The data-step attribute of an element displayed in the current step.
     *  This differs from this.step_index (which corresponds to the actual number of user-produced steps)
     *  because data-step do not have to be continuous.
     */
    get_step() {
        return $(this.steps[this.step_index - 1]?.[0]).data("step")
    }

    /**
     * Opposite of this.enter()
     * Functionality should be duplicated finalize_frames (due to performance reasons).
     */
    leave() {
        this.$frame.find("video").each((_, el) => $(el).off("pause") && el.pause())
        this.shortcuts.forEach(s => s.disable())
        this.shortcuts.length = 0

        if (this.$video_pause_listener) {
            this.$video_pause_listener.trigger("slidershow-leave")
            this.$video_pause_listener = null
        }

        this.playback.hud_map?.hide()
        this.unmake_editable()
        return true
    }

    /**
     * Opposite of this.prepare()
     * Clean up because the frame is not visible anymore.
     *
     * This method is not guaranteed to run because of the following usecase:
     * 1. Leave to the next frame
     * 2. Go back before the transition finishes (and `left` could be run)
     * 3. prepare() is run again
     * 4. When transition finished, we are back in the current frame, hence the left() is blocked.
     *
     * Functionality should be duplicated finalize_frames (due to performance reasons).
     */
    left() {
        this.loop_interval?.stop()
        this.$actor.finish()
        this.$frame.find("[data-templated]").remove()
        this.clean_steps()
        this.zoom_destroy()
    }

    /**
     * Clean up step functionality data
     * @param {jQuery} $el
     */
    static _clean_step($el) {
        $el
            .attr("data-step", function () {
                return $(this).data("step-original")
            })
            .removeData("step-original")
            .removeClass("step-hidden step-shown")
            .show()
    }

    delete() {
        const pl = this.playback
        const $frame = pl.frame.$frame
        const $prev = $frame.prev()
        const index = pl.frame.index

        pl.changes.undoable("Inserted new frame",
            () => {
                $frame.detach()
                pl.reset()
                pl.goToFrame(index)
            }, () => {
                $frame.insertAfter($prev)
                pl.reset()
                pl.goToFrame(index)
            })
    }

    panorama() {
        const $actor = this.$actor
        this.panorama_starter = null

        // get image dimensions
        $actor.css({
            width: "unset",
            height: "unset",
            "max-width": "unset",
            "max-height": "unset",
        })
        const [w, h, main_w, main_h] = [$actor.width(), $actor.height(), window.innerWidth, window.innerHeight]
        const small_height = main_w / (w / h)
        const medium_width = w / (h / main_h)
        const trailing_width = Math.round(medium_width - main_w)

        $actor.removeAttr("style")

        if (w > main_w && w / h > this.prop("panorama-threshold", $actor)) {
            // the image is wider than the sceen (would been shrinked) and its proportion looks like a panoramatic
            let speed = Math.min((trailing_width / 100), 5) * 1000 // 100 px / 1s, but max 5 sec

            $actor.css({
                width: "unset",
                height: "unset",
                "max-width": "unset",
                "max-height": main_h,
                "position": "absolute",
                "left": 0
            })
            this.panorama_starter = () => this.add_effect(resolve => {
                $actor.animate({
                    left: - trailing_width,
                }, speed, () => {
                    $actor.animate({
                        left: 0,
                        width: main_w,
                        top: (main_h / 2) - (small_height / 2) + "px"
                    }, 1000, () => {
                        $actor.removeAttr("style")
                        resolve()
                    })
                })
            })
        }
    }

    /**
     *
     * @param {Function} promise
     */
    add_effect(promise) {
        this.effects.push(new Promise(promise))
    }

    zoom_init($el = null) {
        if ($el.data("wzoom")) {
            return $el.data("wzoom") // already initialized
        }
        const maxScale_default = 5
        let last_scale = null
        const wzoom = WZoom.create($el.get()[0], {
            maxScale: maxScale_default,
            minScale: 1,
            speed: 1.5,
            // We can wheel in for ever but keeping maxScale on leash.
            // Because the click takes us to the current bed (and second click zooms out).
            rescale: wzoom => { // the function seems to be called unintuitively with grab moving
                const scale = wzoom.content.currentScale
                wzoom.content.maxScale = Math.max(maxScale_default, scale + 3)
                if (last_scale !== null) {
                    // when created, it directly triggers rescale. Might cause a loop when triggered function
                    // calls zoom_get (which calls zoom_init again)
                    $el.trigger("wzoomed", [last_scale === scale])
                }
                last_scale = scale
            },
            dragScrollableOptions: {
                onDrop: () => $el.trigger("wzoomed")
            }
        })
        // Why correcting viewport? When having data-step-points and calling `zoom_set` from `prepare`,
        // the frame is not at the viewport yet, thus the values are wrong. Such image seem to work
        // but whenever manually zoomed, it vanishes out of the screen.
        // Besides, we should center the image to a parent. However, we do not want to wrap it,
        // this simulates the parent.
        wzoom.viewport.originalLeft = $el.position().left
        wzoom.viewport.originalTop = $el.position().top
        const orig_ratio = $el.prop("naturalHeight") / $el.prop("naturalWidth")
        const refresh_viewport = () => {
            wzoom.viewport.originalWidth = $el.width()
            wzoom.viewport.originalHeight = $el.height()
            // Accessing $el.width seems to be a costly operation. When I did not cache the result, it made the image shake
            // while dragging and setting the point property if and only if the DevTools were open.
            // The space the <img> occupies in the DOM is bigger than the actual image size.
            // Either the width is not fully stretched or the height.
            // The ratio we need to count is then dependent on either dimension that corresponds with the actual image dimension,
            // not the other suppressed.
            const curr_ratio = $el.height() / $el.width()
            const ratio = curr_ratio > orig_ratio ? $el.width() / $el.prop("naturalWidth") : $el.height() / $el.prop("naturalHeight")
            $el.data("wzoom_get_ratio", () => ratio)
        }
        refresh_viewport()
        $(window).on("resize.wzoom", refresh_viewport)

        $el
            .data("wzoom_resize_off", () => $(window).off("resize.wzoom", refresh_viewport))
            // we have zoomed in, do not playback further
            .off("click wheel")
            .on("click wheel", () => this.playback.moving = false)
            // zooming modifiable from the outside
            .attr("data-wzoom", true)
            .data("wzoom", wzoom)
        return wzoom
    }

    // destruct zooming while leaving the frame
    zoom_destroy() {
        $("[data-wzoom]", this.$frame).each((_, el) => {
            const $el = $(el)
            // Maybe no more needed as this method got into .left().
            // setTimeout(() => { // we have to timeout - wzoom bug, has to finish before it can be destroyed
            $el.data("wzoom").destroy()
            $el.data("wzoom_resize_off")()
            $el
                .data("wzoom", null)
                .data("wzoom_get_ratio", null)
                .data("wzoom_resize_off", null)
                .attr("data-wzoom", null)
        })
    }

    zoom_get($el) {
        const { currentLeft, currentTop, currentScale } = this.zoom_init($el).content
        const ratio = $el.data("wzoom_get_ratio")()
        return [currentLeft / ratio / currentScale, currentTop / ratio / currentScale, currentScale]
    }

    /**
     * @param {jQuery} $el Zoomed element
     * @param {number} left
     * @param {number} top
     * @param {number} scale
     * @param {number} transition_duration
     * @param {number} duration
     * @returns {number} After zoom step duration.
    */
    zoom_set($el, left = 0, top = 0, scale = 1, transition_duration = null, duration = null) {
        const wzoom = this.zoom_init($el)
        transition_duration ??= prop("step-transition-duration", $el, null, "transition-duration")
        const ratio = $el.data("wzoom_get_ratio")()
        const orig = wzoom.options.smoothTime
        wzoom.options.smoothTime = transition_duration
        wzoom.transform(top * ratio * scale, left * ratio * scale, scale)
        wzoom.options.smoothTime = orig
        this.add_effect(resolve => $el.on("transitionend", () => resolve()))
        return duration ?? prop("step-duration", $el, null, "duration")
    }

    /**
     * We do not guarantee the frame is preloaded.
     * @returns {string} HTML
     */
    get_preview(suppress_step_animation = true) {
        const $clone = this.$frame.clone().removeAttr("style")
        if (this.panorama_starter) { // remove panorama styling
            $clone.find("video, img").first().removeAttr("style")
        }
        $clone.find("video").removeAttr("autoplay")
        $clone.find("[data-templated]").remove()
        $clone.find("[data-step]").show() // ignore frame steps
        if (suppress_step_animation) {
            Frame._clean_step($clone)
            $clone.addClass("prevent-animation-important")
        }
        // Remove data-preloaded attribute for the case it is there
        return $clone.removeAttr("data-preloaded").prop("outerHTML")
    }

    /**
     * @returns {?string} The comment just before the frame or just inside the frame.
     */
    get_notes() {
        const frame_dom = this.$frame.get()[0]
        const txt = find_comment(frame_dom.previousSibling, "previousSibling") || find_comment(frame_dom.firstChild, "nextSibling")
        return this.playback.menu.markdown.makeHtml(txt)

        /**
         *
         * @param {HTMLElement|Comment|Text} node First node to search.
         * @param {string} crossing Method
         * @returns {?string}
         */
        function find_comment(node, crossing) {
            while (node) {
                switch (node.nodeType) {
                    case Node.COMMENT_NODE:
                        return node.nodeValue.trim()
                    case Node.TEXT_NODE:
                        if (node.nodeValue.trim()) {
                            return
                        }
                        node = node[crossing] // ex: previousSibling
                        continue // there is just empty text, like new line, ignore
                    default:
                        return
                }
            }
        }
    }

    /**
     * Base file name without the directory.
     * There might be base64 data in the real src, hence we prefer the data-src
     * @param {jQuery} $actor
     * @returns {String}
     */
    get_filename($actor = null) {
        $actor = $actor || this.$actor
        return ($actor.data("src") || $actor.attr("src") || $("source", $actor).attr("src"))?.split("/").pop()
    }

    get_position() {
        if (this.playback.debug) {
            const zoom = $main.css("zoom")
            return {
                top: `-${this.$frame.position().top - 300 / zoom}px`,
                left: `-${this.$frame.position().left - 300 / zoom}px`,
            }
        }
        return {
            top: `-${this.$frame.position().top}px`,
            left: `-${this.$frame.position().left}px`,
        }
    }

    check_tag() {
        const $actor = this.$actor
        const name = this.get_filename()
        const tag = localStorage.getItem("TAG: " + name)
        if (tag) {
            $actor.attr("data-tag", tag)
        }
    }

    set_tag(tag) {
        const $actor = this.$actor
        const name = this.get_filename()

        const key = "TAG: " + name
        if (tag) {
            localStorage.setItem(key, tag)
            $actor.attr("data-tag", tag)
        } else {
            localStorage.removeItem(key)
            $actor.removeAttr("data-tag")
        }
        this.playback.hud.tag(tag)
    }

    static exif($el, data = null, callback = null) {
        if (!READ_EXIF || $el.data("exif-done")) {
            callback?.()
            return
        }
        const process = (exif) => {
            const attrs = {}

            const make = exif.Make
            const model = exif.Model
            if (make && model) {
                attrs["data-device"] = `${make} ${model}`
            }

            const dateTime = exif.DateTimeOriginal?.replace(/:/g, "-").replace(/ /g, "T")
            if (dateTime) { attrs["data-dateTime"] = dateTime }

            // convert GPS
            const { GPSLatitude: _lat, GPSLongitude: _lon, GPSLatitudeRef: _latRef, GPSLongitudeRef: _lonRef } = exif
            try {
                const latitude = Frame._convertDMSToDD(_lat[0], _lat[1], _lat[2], _latRef)
                const longitude = Frame._convertDMSToDD(_lon[0], _lon[1], _lon[2], _lonRef)
                if (longitude && latitude) {
                    attrs["data-gps"] = `${longitude}, ${latitude}`
                }
            } catch (e) {
                ; // no gps info
            }

            $el.attr(attrs).data("exif-done", 1)
            callback?.()
        }

        // raises uncatcheable log when CORS encoutered
        EXIF.getData(data || $el.get()[0], function () {
            process(EXIF.getAllTags(this))
        })
    }

    /**
     * GPS DMS -> DD
     */
    static _convertDMSToDD(degrees, minutes, seconds, direction) {
        var dd = degrees + (minutes / 60) + (seconds / 3600)
        if (direction == "S" || direction == "W") {
            dd = dd * -1
        }
        return dd
    }

    /**
     *
     * @returns {jQuery[]}
     */
    static load_all(playback = null) {
        return $(FRAME_SELECTOR).each((_, el) => $(el).data("frame", new Frame($(el), playback)))
    }

    /**
     *
     * @param {jQuery} $frames
     * @returns {Frame[]}
     */
    static frames($frames) {
        return $frames.get().map(frame_dom => $(frame_dom).data("frame"))
    }
}