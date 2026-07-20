const EDITABLE_ELEMENTS = "h1,h2,h3,h4,h5,h6,p,li"
// EXIF (APP1) lives at the very start of a JPEG, so this leading slice is enough to read all metadata –
// no need to materialize a whole 10s-of-MB File as an ArrayBuffer just to fetch the camera/date/GPS tags.
const EXIF_HEADER_BYTES = 256 * 1024
class Frame {
    /**
     *
     * Frame lifecycle is as follows:
     *  – preload
     *  – preblink
     *  – prepare (might run multiple times)
     *  – enter (might run multiple times)
     *  – leave
     *  – left (not guaranteed to run)
     *  – unload
     *
     * Why some of them run multiple times without calling .leave()?
     * After calling playback.reset(), ex: moving another frames in the grid.
     * Or after window resize. Or after frame import. To handle this, we use ._entered check.
     * XX But if we identify what has to be restored after size change (textFit, new frame size?),
     * this might solve some future bugs.
     * (After import, at least HUD refresh is needed so that is it seen in the thumbnails.)
     *
     * @param {JQuery} $el
     * @param {Playback} playback
     */
    constructor($el, playback) {
        this.$frame = $el
        /** @type Playback */
        this.playback = playback
        this.$video_pause_listener = null
        /**  @type {JQuery} Main media element of the frame. Might be empty if there is none, just text. */
        this.$actor = this.$frame.find("video, img").first()
        this.panorama_starter = null
        this.loop_interval = new Interval()
        this.zoom = new FrameZoom(this)

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

        /** @type {Promise[]} All the effects that should hold playback. Await this.loaded first.*/
        this.effects = []

        /** @type {?Promise} */
        this.video_finished = null

        /** @type {Array<HTMLElement|Function>} Which elements are to be showed progressivelly.
         * They are grouped by the same data-set: [ [data-step=2, 2], [4], [5,5,5], [12]]
         */
        this.steps = []
        /** Element in this.steps that is going to be shown in the next step. Elements with lower index are already shown. */
        this.step_index = 0
        /** @type {number|null} How long the last active step should last. */
        this.step_duration = null
        /** Check the lifecycle. The .enter passed but not yet .leave.
         * It would be better to solve lifecycle issues (see the constructor comment,
         * enter called twice) than using this var.
         */
        this._entered = false
        /** Resolves loaded */
        this._loaded = null

        /**
         * @type {Promise} Fulfilled on all media loaded.
        */
        // Apart from all the standard media loaded we await the signal from .preload method that all re-srced media are loaded.
        this.loaded = Promise.all([
            new Promise(r => this._loaded = r),
            ...this.$frame.find("img").map((_, el) => el.complete || new Promise(r => $(el).one("load", r))),
            ...this.$frame.find("video").map((_, el) => el.readyState >= 2 || new Promise(r => $(el).one("loadeddata", r)))
        ])
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
        // const TRANS_DURATION = this.prop("transition-duration") * 1000
        // const $el = this.$frame
        // const winHeight = $(window).height() + "px"
        // switch (effect) {
        //     case "go-up":
        //         return $el.animate({ top: `-${$el.height()}px` }, TRANS_DURATION,
        //             () => $el.hide(0).css("top", "0px"))
        //     case "go-down":
        //         return $el.animate({ top: winHeight }, TRANS_DURATION,
        //             () => $el.hide(0).css("top", "0px"))
        //     case "arrive-from-bottom":
        //         return $el.css("top", winHeight).show(0).animate({ top: "0px" }, TRANS_DURATION)
        //     case "arrive-from-top":
        //         return $el.css("top", `-${$el.height()}px`).show(0).animate({ top: "0px" }, TRANS_DURATION)
        //     default:
        //         console.error("Unknown effect: " + effect)
        // }
    }


    /**
     * Return closest prop, defined in the DOM.
     * (Zero aware, you can safely set `data-prop=0`.)
     * @param {string} property
     * @param {JQuery|null} $actor What element to check the prop of. If null, frame is checked.
     * @param {any} def Custom default value if not set in DOM (when PROP_DEFAULT default value is not desirable).
     * @returns
     */
    prop(property, $actor = null, def = null) {
        const $el = $actor?.length ? $actor : this.$frame
        return prop(property, $el, def)
    }

    /**
     * Frame is going to be entered right now but is not visible yet.
     * (Might run multiple times before leave.)
     * @param {?Frame} lastFrame The frame we are coming from. (If not set, it means eg. window/font size change.) It's never set to this frame.
     */
    prepare(lastFrame = null) {
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
        // XX We might come here twice. Sometimes, it's not good, sometimes, it is-
        // What would vanish when second refresh? Video shortcuts that were added.
        // But we need to refresh ex: thumbnails after frame import.
        this.playback.hud.refresh(this, Boolean(lastFrame))

        // Map
        this.map_prepare()

        // Insert templated header and footer
        // If such template exists, insert it to the current frame if needed (it does not yet contain it)
        const check = (tag, method) => $($("template")[0]?.content).find(tag).clone().attr("data-templated", 1)[method](this.$frame.not(`:has(${tag})`))
        check("header", "prependTo")
        check("footer", "appendTo")

        this.loaded.then(() => {
            this.refresh_actor()
            if (!this.playback.step_disabled) {
                this.steps_prepare(lastFrame)
            }
        })
    }

    /**
     * @param {boolean|string} propertyName
     * @param {*} oldVal If this is a user direct change, we might use the old value to compensate the change.
     */
    refresh_actor(propertyName = true, oldVal = null) {
        prop_invalidate() // a property write (rotate, fit, …) typically precedes a refresh – re-read fresh
        if (this.$actor.length) {
            if (propertyName === true || propertyName === "rotate") {
                const old = this.zoom.get(this.$actor)
                const rotate = this.prop("rotate", this.$actor)
                this.$actor.css("rotate", rotate + "deg") // sets immediately, preventing the animated set in the zoom
                let transition_duration = null

                if (oldVal !== null) {
                    // An old value is needed to compensate the rotate change.
                    // The image rotate by its center. However, we want visually stick to a place, i.g. a face.
                    // Therefore, we edit the translation accordingly.
                    // This does not look smooth while having a transition, there is a jumpy behaviour which is hard to suppress.
                    transition_duration = 0 // as there is an old value, this is a user direct change, do not animate

                    const angle = (rotate - oldVal) * (Math.PI / 180) // deg → rad
                    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
                    const [horiz, vertic] = [old[0], old[1]]
                    old[0] = cos * horiz + -sin * vertic
                    old[1] = cos * vertic + sin * horiz
                }

                this.zoom.set(this.$actor, ...old, transition_duration, null, rotate)
                this.$actor.trigger('actor.slidershow', { rotate: rotate })
            }
        }
    }

    /**
     * Sort elements to be stepped through. Some of them might have `data-step=number` (which we honour),
     * those with `data-step` are to be filled around.
     *
     * @param {?Frame} last_frame
     */
    steps_prepare(last_frame = null) {
        // Prepare the elements eligible for being step through
        const $steppable = $("[data-step]", this.$frame)
            // [data-step-li] affects all <li>
            .add($("li", this.$frame)
                .filter((_, el) => this.prop("step-li", $(el))))
            // [data-step-points] affects all <img>
            .add(this.getImagesWithStepPoints()
                .map((_, el) => {
                    // generate multiple steps (dummy <img-temp-animation-step>) for points
                    const $el = $(el)
                    const points = this.prop("step-points", $(el))
                    if (points.length === 1) {
                        // There is an image with a single step.
                        // Normally, the first step is already active. However, the author defined only a single one.
                        // Let's assume they wanted just one frame state, not multiple steps.
                        // When the user proceeds to the next step, they end up in a different frame.
                        this.zoom.set($el, ...points[0])
                        return []
                    } else {
                        return $.map(points.slice(1), // the init point will already be zoomed into (thanks to the data(callback)), slice it out
                            (point, index) => $("<img-temp-animation-step/>")
                                // show the next or the previous animation step (we sliced the points due to the init point)
                                .data("callback", shown => this.zoom.set($el, ...shown ? point : points[index]))
                            [0])
                    }
                }))

        // Finalize [data-step]
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

        // Adjust initial step (either the first or the last).
        if (last_frame) {
            // last_frame might not be set. Eg. when no frame change happened on window resize or font size change
            if (last_frame.index < this.index) { // went forward to the frame (or direct entry)
                this.step_index = 0
                this.step_process($(this.steps.slice(0, 1).flat()), false)
            } else { // went backwards to the frame
                this.step_index = this.steps.length
                this.step_process($(this.steps.slice(this.steps.length - 1).flat()), true)
            }
        }
    }

    getImagesWithStepPoints() {
        return $("img", this.$frame)
            .filter((_, el) => !$(el).closest("header, footer").length) // filter out images in header/footer
            .filter((_, el) => this.prop("step-points", $(el))?.length) // only elements with (inherited) step-points
    }

    map_prepare() {
        /** @type {MapWidget} */
        let map
        // which map to use?
        if (this.$frame.prop("tagName") === "ARTICLE-MAP") {
            map = this.playback.map
            if (!MAP_ENABLE) {
                this.playback.hud.info("Map disabled in the URL")
                return
            }
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
                this.prop("map-markers-show", null, false),
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
     * Prevent blinking.
     * When going forward, a big image will blink, a black frame will appear for a moment before the image is loaded.
     * To prevent this, we load the image to a hidden placeholder before the frame is entered so that the browser is forced to decompile it on schedule.
     */
    async preblink() {
        if (this.playback.hud.grid_visible || this.playback.hud.thumbnails_visible) {
            // Thumbnails already display the image, so no need to do it again.
            this.playback.$preblink_prevention.hide()
        }
        else if (this.$actor) {
            const $placeholder = this.playback.$preblink_prevention
            if ($placeholder.data('preblinking')) {
                return
            }
            $placeholder.data('preblinking', true)
            $placeholder.attr("src", this.$actor.attr("src")).show()
        }
    }

    /**
     *  Preload media; for the case of several thousands file, the perfomarce is important.
     *
     * * data("read-src"): If present, this is the method to re-read the dragged media from the disk.
     * * data-src: Optional attribute for <img>, <video>, holds the original file name.
     * * data-thumb: Optional inherited template for a lightweight preview, shown while data-src downloads. See Frame.get_thumb_src.
     *
     * @returns {Promise} Fulfilled when src loaded from the memory.
     */
    async preload() {
        const $frame = this.$frame
        if ($frame.attr("data-preloaded")) {
            // When we call playback.reset() (ex: after frame duplication, which clones the attribute along
            // with the DOM but gets a brand new Frame object), we get here with data-preloaded already true
            // but this particular Frame instance possibly never added to playback.preloaded yet – fix that up.
            this.playback.preloaded.add(this)
            return [this.loaded] // might be already done (or might be still running when preload called twice at the same moment)
        }
        $frame.attr("data-preloaded", 1) // prevent another preload
        this.playback.preloaded.add(this)

        // Process media
        const loaded = $frame.find("img[data-src], video[data-src]").map((_, el) => {
            const $el = $(el)
            if ($el.attr("src") && !$el.attr("data-thumb-shown")) { // src already fully set, nothing to do
                return null
            }
            return Frame._load_media($el, el, this)
        }).get().filter(Boolean)

        // Process markdown
        // XX Not used right now. + Check XSS risk if used.
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

        const current_loaded = this._loaded // Why storing it outside? Might be unloaded before finish.
        Promise.all(loaded).then(() => current_loaded())
        return loaded
    }

    /**
     * Load a single <img>/<video> `src`, showing the inherited `data-thumb` preview first (if it resolves
     * to a working URL) so the frame is not blank while the full-quality file downloads.
     *
     * The expensive full-quality fetches are throttled through `playback.original_loader` and the cheap thumbnails
     * through `playback.thumb_loader`, both ordered by the frame's distance from the current one. The current frame
     * (distance 0) bypasses the limiters entirely, so its request never waits behind a neighbour's preload –
     * not in our queue, and not in the browser's per-host connection pool either.
     * @param {JQuery} $el
     * @param {HTMLImageElement|HTMLVideoElement} el
     * @param {?Frame} frame The owning frame, used to resolve the concurrency limiters and the current distance.
     * @returns {Promise}
     */
    static async _load_media($el, el, frame = null) {
        const src = (await $el.data(READ_SRC)?.(true)) || $el.data("src")
        if (!src) { // no place to set the src from
            return null
        }

        const playback = frame?.playback
        const distance = () => (playback && frame ? Math.abs(frame.index - playback.index) : 0)
        // The current frame (distance 0) loads immediately; everything else queues on the given limiter.
        const gate = sem => (sem && distance() > 0 ? sem.acquire(distance) : Promise.resolve(() => { }))

        const isImg = el.tagName === "IMG"
        const thumb = !$el.attr("src") && Frame.get_thumb_src($el)

        if (thumb && isImg) {
            // The cheap thumbnail (generous limiter) and the expensive full-quality file (stricter limiter) load
            // independently, so the full fetch of the current frame – whose slot is free – never waits for the
            // thumbnail probe. `full_shown` guards the rare case the full file wins the race (ex: already cached),
            // so the thumbnail is not painted over the sharper image.
            let full_shown = false

            const thumb_task = (async () => {
                const release = await gate(playback?.thumb_loader)
                try {
                    if (await Frame.probe_image(thumb) && !full_shown) {
                        $el.attr("src", thumb).attr("data-thumb-shown", 1)
                    }
                } finally {
                    release()
                }
            })()

            const full_task = (async () => {
                const release = await gate(playback?.original_loader)
                try {
                    let final_src
                    try {
                        final_src = await Frame.probe_image_with_progress($el, src, percent => $el.trigger("loadprogress.slidershow", [percent]))
                    } catch (e) {
                        if (e.name === "AbortError") { // frame was unloaded mid-fetch – nothing left to do
                            return
                        }
                        throw e
                    }
                    if (!final_src) { // browser could not decode the original (ex: HEIC/HEIF) – try data-fallback candidates in order
                        for (const fallback of Frame.get_fallback_src($el)) {
                            if (await Frame.probe_image(fallback)) {
                                final_src = fallback
                                break
                            }
                        }
                    }
                    if (final_src) {
                        full_shown = true
                        $el.attr("src", final_src).removeAttr("data-thumb-shown") // instant cache hit, no second request
                        // Wait for the visible element too – `loaded` must not resolve while it still displays the thumbnail
                        // (Chrome keeps el.complete false for a moment even on a cache hit, which made Frame.exif bail out).
                        await new Promise(r => { el.onload = r; el.onerror = r })
                    } else if (distance() === 0) { // the thumbnail (if any) stays visible; only warn for the frame actually being viewed
                        playback?.hud?.info(`Unsupported or unreadable file: ${src}`)
                    }
                } finally {
                    release()
                }
            })()

            await Promise.all([thumb_task, full_task])
            return
        }

        if (thumb) { // VIDEO: <video poster> is swapped out by the browser itself once the real frame is ready.
            gate(playback?.thumb_loader).then(async release => {
                if (await Frame.probe_image(thumb)) {
                    $el.attr("poster", thumb)
                }
                release()
            })
        }

        // Full file (a video, or an image without a thumbnail template), throttled by the stricter limiter.
        const release = await gate(playback?.original_loader)
        try {
            const await_load = () => new Promise(r => {
                if (isImg) {
                    el.onload = () => r(true)
                    el.onerror = () => r(false)
                } else {
                    el.onloadeddata = () => r(true)
                    el.onerror = () => r(false)
                }
            })

            let loaded = false
            if (isImg) { // try a progress-tracked fetch first, so the HUD spinner can show a percentage
                let blob_src
                try {
                    blob_src = await Frame._fetch_with_progress($el, src, percent => $el.trigger("loadprogress.slidershow", [percent]))
                } catch (e) {
                    if (e.name === "AbortError") { // frame was unloaded mid-fetch – nothing left to do
                        return
                    }
                    throw e
                }
                if (blob_src) {
                    el.src = blob_src
                    loaded = await await_load()
                    if (!loaded) { // fetched fine but the browser could not decode it (ex: HEIC/HEIF)
                        URL.revokeObjectURL(blob_src)
                    }
                }
            }
            if (!loaded) {
                el.src = src
                loaded = await await_load()
            }
            if (!loaded) { // browser could not load/decode the file – try data-fallback candidates in order
                let ok = false
                for (const fallback of Frame.get_fallback_src($el)) {
                    el.src = fallback
                    if (await await_load()) {
                        ok = true
                        break
                    }
                }
                if (!ok && distance() === 0) { // only warn for the frame actually being viewed, not background preloads
                    playback?.hud?.info(`Unsupported or unreadable file: ${src}`)
                }
            }
        } finally {
            release()
        }
    }

    /**
     * Resolve the thumbnail URL for a media element from the inherited `data-thumb` template.
     * Placeholders (derived from the element's data-src): {dir} {file} {name} {ext}.
     * A template without placeholders (ex: set directly on one <img data-thumb="...">) is used verbatim,
     * which lets a single attribute act both as a presentation-wide convention and a per-file override.
     * @param {JQuery} $el
     * @returns {?string}
     */
    static get_thumb_src($el) {
        const template = prop("thumb", $el, "")
        return Frame._resolve_placeholders(template, $el)
    }

    /**
     * Resolve the fallback URL candidate(s) for a media element from the inherited `data-fallback`
     * template, used when the browser fails to load/decode `data-src` (ex: HEIC/HEIF photos Chrome
     * cannot render). Same placeholder syntax as `data-thumb` – see get_thumb_src().
     *
     * Several space-separated templates may be given, ex: `"{dir}{file}.jpg {dir}{file}.mp4"` — tried
     * in order by the caller (see load()), first one that actually loads/decodes wins. Useful when
     * `data-fallback` is set high up (ex: on `<main>`) for a presentation mixing photos and videos: the
     * two need differently-named (and differently-typed) replacement files, so a single candidate could
     * not cover both, but the caller does not need to know which one applies to a given file.
     * @param {JQuery} $el
     * @returns {string[]} Empty when data-fallback is not set.
     */
    static get_fallback_src($el) {
        const template = prop("fallback", $el, "")
        return template.split(/\s+/).filter(Boolean)
            .map(t => Frame._resolve_placeholders(t, $el))
            .filter(Boolean)
    }

    /**
     * Substitutes {dir}/{file}/{name}/{ext} (derived from the element's data-src) into one template.
     * A template without placeholders (ex: set directly on one <img data-thumb="...">) is used verbatim,
     * which lets a single attribute act both as a presentation-wide convention and a per-file override.
     * @param {string} template
     * @param {JQuery} $el
     * @returns {?string}
     */
    static _resolve_placeholders(template, $el) {
        const src = $el.data("src")
        if (!template || !src) {
            return null
        }
        const slash = src.lastIndexOf("/")
        const dir = slash >= 0 ? src.slice(0, slash + 1) : ""
        const file = slash >= 0 ? src.slice(slash + 1) : src
        const dot = file.lastIndexOf(".")
        const name = dot >= 0 ? file.slice(0, dot) : file
        const ext = dot >= 0 ? file.slice(dot + 1) : ""
        const tokens = { "{dir}": dir, "{file}": file, "{name}": name, "{ext}": ext }
        return template.replace(/{dir}|{file}|{name}|{ext}/g, m => tokens[m])
    }

    /**
     * @param {string} src
     * @returns {Promise<boolean>} True when the image loads successfully.
     *  Relies on native <img> load/error events (not fetch/XHR), so it works the same over file:// and http(s)://.
     */
    static probe_image(src) {
        return new Promise(resolve => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = src
        })
    }

    /**
     * Like probe_image(), but downloads through Frame._fetch_with_progress() first (reporting progress
     * via `onProgress`) so the HUD spinner can show a percentage – falls back to the plain, progress-less
     * probe_image() when progress-tracked fetching is not possible (file://, no Content-Length, network
     * error) or when the fetched bytes turn out undecodable (ex: HEIC/HEIF – the caller's data-fallback
     * loop then takes over).
     * @param {JQuery} $el
     * @param {string} src
     * @param {Function} onProgress Called with an integer percent (0-100) as bytes arrive.
     * @returns {Promise<?string>} A usable src (object URL or the original `src`), or null when undecodable.
     * @throws {DOMException} AbortError when the frame was unloaded (Frame.unload_media()) mid-fetch.
     */
    static async probe_image_with_progress($el, src, onProgress) {
        const blob_src = await Frame._fetch_with_progress($el, src, onProgress)
        if (blob_src) {
            if (await Frame.probe_image(blob_src)) {
                return blob_src
            }
            URL.revokeObjectURL(blob_src) // fetched fine but the browser could not decode it (ex: HEIC/HEIF)
        }
        return await Frame.probe_image(src) ? src : null
    }

    /**
     * Downloads `src` via fetch(), reporting an integer percent (0-100) to `onProgress` as chunks arrive –
     * unlike a plain <img src>, which exposes no progress. The AbortController is stashed on $el's jQuery
     * data so Frame.unload_media() can cancel an in-flight download when the frame is skipped/unloaded
     * before it finishes.
     * @param {JQuery} $el
     * @param {string} src
     * @param {Function} onProgress
     * @returns {Promise<?string>} An object URL for the downloaded blob, or null when progress-tracked
     *  fetching is not applicable (non-http(s) scheme, ex: file:///data:/blob:) or the response has no
     *  usable Content-Length (ex: chunked/compressed transfer – percent could not be computed) or failed.
     * @throws {DOMException} AbortError when aborted via Frame.unload_media() mid-fetch.
     */
    static async _fetch_with_progress($el, src, onProgress) {
        let protocol
        try {
            protocol = new URL(src, location.href).protocol
        } catch (e) {
            return null
        }
        if (protocol !== "http:" && protocol !== "https:") {
            return null
        }

        const controller = new AbortController()
        $el.data("progress-abort", controller)
        try {
            const response = await fetch(src, { signal: controller.signal })
            const total = Number(response.headers.get("Content-Length")) || 0
            if (!response.ok || !response.body || !total) {
                return null
            }
            const reader = response.body.getReader()
            const chunks = []
            let loaded = 0
            for (; ;) {
                const { done, value } = await reader.read()
                if (done) {
                    break
                }
                chunks.push(value)
                loaded += value.length
                onProgress(Math.round(loaded / total * 100))
            }
            return URL.createObjectURL(new Blob(chunks))
        } catch (e) {
            if (e.name === "AbortError") {
                throw e
            }
            return null // network/CORS failure – caller falls back to the plain <img src>
        } finally {
            $el.removeData("progress-abort")
        }
    }

    /**
     * Opposite of this.preload()
     * Functionality should be partially duplicated finalize_frames (due to performance reasons).
     * Somewhere the duplication has no sense, like putting video[data-autoplay-prevented]
     *  which is removed in finalize_frames (export might not use slidershow and hence be rendered as an errant argument)
     *  but here is added on the contrary.
     *  (We do not want the video to autoplay when re-preloaded while going backwards in the presentation.)
     */
    unload() {
        const $frame = this.$frame
        $frame.removeAttr("data-preloaded")
        this.playback.preloaded.delete(this)

        // The frame is no more loaded
        this.loaded = new Promise(r => this._loaded = r)

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
        $el.data("progress-abort")?.abort() // cancel Frame._fetch_with_progress() if it is still in flight
        if ($el.attr("data-thumb-shown")) {
            // The full-quality file never finished loading; drop the thumbnail too so a future preload() starts over
            // instead of finding a (thumbnail) `src` already present and skipping the load.
            $el.removeAttr("src data-thumb-shown")
        } else if (($el_original || $el).data(READ_SRC) || $el.data("src") && $el.data("src") === $el.attr("src")
            || $el.attr("src")?.startsWith("blob:")) {
            URL.revokeObjectURL($el.attr("src")) // for the case this is a blob URL (FrameFactory reader, or Frame._fetch_with_progress())
            $el.removeAttr("src")
        }
        if ($el.is("video") && $el.attr("autoplay")) {
            $el.removeAttr("autoplay").attr("data-autoplay-prevented", 1)
        }
    }

    /**
     * Remove auxiliary parameters when exporting.
     * @param {JQuery} $contents Copy of body, containing all frames.
     * @param {JQuery} $articles Original live articles = all frames.
     * @param {Boolean} keep_raw Store raw bytes if possible. If true a there are bytes in the memory,
     *  those are exported; we prefer raw bytes over the filename (the original will not be needed).
     *  False → filename always exported.
     * @param {String} path Path where the presentation file will find the media folder.
     * @param {?Function} callback When frame done, call this to increase the progress bar.
     */
    static async finalize_frames($contents, $articles, keep_raw = false, path = "", callback = null) {
        // batch execute operations otherwise done in methods like `unload` or `left`
        $("video[data-autoplay-prevented]", $contents).removeAttr("data-autoplay-prevented").attr("autoplay", "")
        $("[data-wzoom]", $contents).removeAttr("data-wzoom")
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
     * A generator may not know the file type of a medium. An `<article data-src>` (no `<img>`/`<video>` inside)
     * gets an `<img data-src>` or `<video data-src>` child created by the file extension.
     * Must run before the Frame objects are created – Frame stores its $actor at construction.
     */
    static mediaConvert() {
        $main.find(FRAME_TAGS).filter("[data-src]:not(:has(img,video))").each((_, el) => {
            const ext = el.getAttribute("data-src").split(/[?#]/)[0].split(".").pop().toLowerCase()
            $("<" + (VIDEO_EXTENSIONS.includes(ext) ? "video" : "img") + "/>", { "data-src": el.getAttribute("data-src") }).prependTo(el)
            el.removeAttribute("data-src")
        })
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
     * (Might run multiple times before leave.)
     */
    enter() {
        const $frame = this.$frame

        // Get main media
        const $actor = this.$actor

        this.effects.length = 0 // flush out any unsettled promises

        // Image frame
        this.loaded.then(() => {
            const tag = $actor.prop("tagName")
            if (tag === "IMG") {
                // when EXIF arrives late, refresh the HUD file info – unless the user already moved on
                Frame.exif($actor, null, () => this === this.playback.frame && this.playback.hud.file_info(this))
                this.panorama_starter?.()
                Promise.all(this.effects).then(() => {
                    this.zoom.init(this.$actor, true)

                    const loop = this.prop("loop")
                    if (loop) {
                        this.loop(loop)
                    }
                })
            } else if (tag === "VIDEO") {
                this.zoom.init($actor, true)
            }
        })

        // Shortcuts for media
        this.playback.operation.media.toggle($actor.length)

        // No HTML tag found, fit plain text to the screen size
        const fit = this.prop("fit")
        if (fit === true || fit === 1 || (fit === 'auto' && $frame.children().length === 0)) {
            textFit($frame)
        }

        if (!this._entered) {
            // Video frame
            if ($actor.prop("tagName") === "VIDEO") {
                this.video_finished = new Promise(r => this.video_enter(r, $actor))
            }

            // Editing
            if (this.playback.editing_mode) {
                this.make_editable()
            }

        }
        this._entered = true
        return this.getDuration()
    }

    /**
     * @returns {number} How long the last active step or whole frame should last
     */
    getDuration() {
        return this.step_duration ?? this.prop("duration")
    }

    make_editable() {
        $(EDITABLE_ELEMENTS, this.$frame)
            .attr("contenteditable", true)
        this.$frame
            .on("focus", EDITABLE_ELEMENTS, () => {
                this.playback.hud.$stopEditing.prop("disabled", false)
                this.playback.operation.general.disable()
                this.playback.operation.playthrough.disable()
            })
            .on("focusout", EDITABLE_ELEMENTS, () => {
                this.playback.hud.$stopEditing.prop("disabled", true)
                this.playback.operation.general.enable()
                this.playback.operation.playthrough.enable()
            })
    }

    unmake_editable() {
        Frame.unmake_editable(this.$frame)
        this.$frame
            .off("focus", EDITABLE_ELEMENTS)
            .off("focusout", EDITABLE_ELEMENTS)
            .trigger("focusout")
    }
    /**
     * @param {JQuery} $container
     */
    static unmake_editable($container) {
        $(EDITABLE_ELEMENTS, $container).removeAttr("contenteditable")
    }

    /**
     * @param {function} resolve Promise resolve function
     * @param {JQuery<HTMLVideoElement>} $actor
     */
    video_enter(resolve, $actor) {
        const hud = this.playback.hud
        const video = $actor[0]
        $actor.trigger("focus") // Focus video controls

        hud.discreet_info(this.get_filename().split("#")[1])

        if ($actor.attr("data-autoplay-prevented")) {
            $actor.removeAttr("data-autoplay-prevented").attr("autoplay", "")
        }

        if ($actor.attr("autoplay")) {
            // Video autoplay (when muted in chromium)
            if (video.readyState > 3) {
                video.play().catch(e => {
                    hud.info("Interact with the page before the autoplay works.")
                })
            } else {
                console.warn("Not ready for autoplay", video)
                // However, we might get rid of this warning for the case the video is being preloaded.
                // In such case, it still has the autoplay attribute, which causes it to play.
            }

        }
        video.playbackRate = this.prop("playback-rate", $actor)

        // Pausing vs playback moving
        this.$video_pause_listener?.off(".slidershow-video")
        this.$video_pause_listener = $actor.on("pause.slidershow-video", () => {
            // Normally, when a video ends, we want to move further.
            // However, when we click to the video progress gauge,
            // just before rewinding, a pause event is generated (yet before the mouse button up).
            // We need to distinguish whether a pause is a user-action
            // or an automatic action.
            // Either we check actor.ended if the video is at its end
            // or we consider it ended even if it paused due to HTMLMediaElement endtime (ex: `#t=10,20`).
            // Note that the actor.currentTime differs the endtime a little bit (like 20.12 s).
            const endTime = getEndTimeFromURL(video.src)
            if (video.ended || endTime
                && (video.currentTime - endTime > 0) && (video.currentTime - endTime < 0.5)) {
                resolve()
            }
        }).on("click.slidershow-video", () => {
            this.playback.play_pause(false)
        })

        // Video points
        const videoPoints = (this.prop("video-points", $actor) || []).map(p => new PointStep(null, p, null))
        if (videoPoints.length) {
            /** @type {PointStep} */
            let videoPoint = videoPoints.shift()
            let videoPointOutput = false
            $actor.on('timeupdate.slidershow-video', () => {
                if (!this.playback.hud.propertyPanel.points.beingEdited) {
                    if (video.currentTime >= videoPoint?.startTime) {
                        videoPoint.affect($actor, this.zoom)
                        let msg = `Video point: ${videoPoint}`
                        videoPoint = videoPoints.shift()
                        if (videoPoint) {
                            msg += `→ ⌛ ${videoPoint}`
                        }
                        this.playback.aux_window.display_message(msg)
                    } else if (!videoPointOutput) {
                        this.playback.aux_window.display_message(`Video point: → ⌛ ${videoPoint}`)
                    }
                    videoPointOutput = true
                }
                if (this.playback.hud.propertyPanel.points.beingEdited) {
                    // Why checking being edited? Due to performance reasons, we do not want to flood the trigger with no sense.
                    $actor.trigger('actor.slidershow', { currentTime: video.currentTime })
                }
            })
        }

        // Shortcuts
        hud.$notVideoButtons.prop("disabled", true)  // default video controls (arrows) must not interfere with the shortcuts
        hud.$onlyVideoButtons.prop("disabled", false)
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
     * @param {number} step How many steps to go further.
     * @returns {boolean} Step was fullfilled. False if no step was to be done, frame is then complete.
     */
    step(step = 1) {
        const new_step = Math.max(Math.min(this.step_index + step, this.steps.length), 0)
        const range = [this.step_index, new_step]

        const $changed = $(this.steps.slice(Math.min(...range), Math.max(...range)).flat())  // currently affected elements (normally just one)

        this.step_process($changed, step > 0)
        this.step_index = new_step
        return Boolean($changed.length)  // some change happened
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
        // These images might have been zoomed by a step.
        // Either when we suddenly jumped to another frame (without completing steps one by one) or when there is an image with a single step.
        this.getImagesWithStepPoints().each((_, el) => this.zoom.set($(el), ...FrameZoom.DEFAULT_ZOOM))
    }

    /**
     * Show or hide step.
     * Or adds them classes or zoom images.
     * @param {JQuery<HTMLElement|Function>} $els The collection of elements that represents the step.
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
     * Functionality has to be duplicated in `finalize_frames()` due to performance reasons.
     *
     */
    leave() {
        this._entered = false
        this.$frame.find("video").each((_, el) => $(el).off("pause") && el.pause())
        this.shortcuts.forEach(s => s.disable())
        this.shortcuts.length = 0

        if (document.activeElement?.closest(FRAME_SELECTOR) === this.$frame[0]) {
            document.activeElement.blur() // do not stay stuck on the video gauge (which prevents shortcuts)
        }

        if (this.$video_pause_listener?.off(".slidershow-video")) {
            this.$video_pause_listener = null
            this.playback.hud.$notVideoButtons.prop("disabled", false)
            this.playback.hud.$onlyVideoButtons.prop("disabled", true)
        }

        this.playback.hud_map?.hide()
        this.playback.hud.propertyPanel.points.save() // this is not duplicated in finalize_frames, I do not know how
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
        this.$actor.finish() // remove the panorama effect
        this.$frame.find("[data-templated]").remove()
        this.clean_steps()
        this.zoom.destroy()
    }

    /**
     * Clean up step functionality data
     * @param {JQuery} $el
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
        const $frame = this.$frame
        const reinsert = $frame.prev().length ? [$frame.prev(), "after"] : [$frame.parent(), "prepend"]

        pl.changes.undoable("Delete frame",
            () => $frame.detach(),
            () => reinsert[0][reinsert[1]]($frame),
            () => {
                pl.reset()
                pl.goToFrame( // if we deleted current frame, go on a nearest one
                    (this === pl.frame && !this.$frame.parent().length ?
                        $(pl.$articles[this.index] ?? pl.$articles[pl.$articles.length - 1]).data("frame")
                        : pl.frame) // or stay on the current frame (unrelated to the deletion)
                        .index)
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
            if (this.getImagesWithStepPoints().length) {
                console.debug("Panorama disabled due to step points")
                return
            }
            // the image is wider than the sceen (would been shrinked) and its proportion looks like a panoramatic
            // 100 px / 1s, for wider panoramas 200 px / 1 s but max 15 sec
            const speed = (trailing_width < 500 ? trailing_width / 100 : Math.min((trailing_width / 200), 15)) * 1000

            $actor.css({
                width: "unset",
                height: "unset",
                "max-width": "unset",
                "max-height": main_h,
                "position": "absolute",
                "left": 0
            })
            const quickEnd = () => this.$actor.finish()
            this.panorama_starter = () => this.add_effect(resolve => $actor
                .on("click", quickEnd)
                .animate({
                    left: -trailing_width,
                }, speed, () => $actor
                    .animate({
                        left: 0,
                        width: main_w,
                        top: (main_h / 2) - (small_height / 2) + "px"
                    }, 1000, () => {
                        $actor
                            .removeAttr("style")
                            .off("click", quickEnd)
                        resolve()
                    })))
        }
    }

    /**
     *
     * @param {Function} promise
     */
    add_effect(promise) {
        this.effects.push(new Promise(promise))
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

        if (this.$actor.is("video")) {
            $clone.addClass("video-thumbnail")
        }
        $clone.find("video").removeAttr("autoplay controls") // even if the main $actor in not video, disable all the videos
        $clone.find("[data-templated]").remove()
        $clone.find("[data-step]").show() // ignore frame steps
        if (suppress_step_animation) {
            Frame._clean_step($clone)
            $clone.addClass("prevent-animation-important")
        }

        // Why we do not rather capture a video thumbnail?
        // On local domain due to CORS, we cannot make a blob, just canvas. We cannot pass that tainted canvas to an aux window.
        // When the video has not yet shown, the canvas stays blank with no exception thrown but as we cannot access the data,
        // we cannot find out. (And canvas cannot have a CSS pseudoclass.)
        //
        // const video = this.$actor[0]
        // const $canvas = $("<canvas/>", { width: "100%", height: "100%" })
        // const canvas = $canvas[0]
        // canvas.width = video.videoWidth
        // canvas.height = video.videoHeight
        // const context = canvas.getContext('2d')
        // context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)
        // return $("<article/>", { "class": "video-thumbnail" }).append($canvas)

        // Remove data-preloaded attribute for the case it is there
        return $clone.removeAttr("data-preloaded").prop("outerHTML")
    }

    /**
     * Lightweight grid/ribbon preview built from the `data-thumb` image alone – it never triggers
     * (or waits for) a full-quality preload, so browsing thousands of large photos in the grid stays cheap.
     * @returns {Promise<?string>} HTML, or null when there is no usable thumbnail (caller should fall back to preload() + get_preview()).
     */
    async get_preview_thumb() {
        if (!this.$actor.length) {
            return null
        }
        const thumb = Frame.get_thumb_src(this.$actor)
        if (!thumb || !(await Frame.probe_image(thumb))) {
            return null
        }

        const $clone = this.$frame.clone().removeAttr("style")
        $clone.find("[data-templated]").remove()
        $clone.find("[data-step]").show() // ignore frame steps
        Frame._clean_step($clone)
        $clone.addClass("prevent-animation-important")

        const $actor = $clone.find("video, img").first()
        if ($actor.is("video")) {
            $clone.addClass("video-thumbnail")
            $("<img/>", { src: thumb, class: $actor.attr("class") }).replaceAll($actor)
        } else {
            $actor.removeAttr("data-src").attr("src", thumb)
        }
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
         * @returns {string|undefined}
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
     * Base file name without the directory. Or empty string when there is no media inside.
     * There might be base64 data in the real src, hence we prefer the data-src
     * @param {?JQuery} $actor
     * @returns {String}
     */
    get_filename($actor = null) {
        $actor = $actor || this.$actor
        return ($actor.data("src") || $actor.attr("src") || $("source", $actor).attr("src"))?.split("/").pop() || ""
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

    /**
     * Currently set tags (`data-tag` is a space-separated token list of digits).
     * @param {?JQuery} $actor
     * @returns {number[]}
     */
    get_tags($actor = null) {
        $actor = $actor || this.$actor
        return ($actor.attr("data-tag") || "").split(/\s+/).filter(Boolean).map(Number)
    }

    /**
     * Tag names, position = digit 1, 2, … (`<main data-tag-names="rodiče,vedoucí">`). Defaults to
     * `$main` rather than the frame's own `$actor` – it's document-wide, not per-frame, and `$actor` is
     * an empty jQuery on the splashscreen's dummy frame (before the first goToFrame), which would
     * otherwise make prop()'s upward walk find nothing.
     * @param {?JQuery} $actor
     * @returns {string[]}
     */
    tag_names($actor = null) {
        $actor = $actor || $main
        const raw = prop("tag-names", $actor, "")
        return raw ? String(raw).split(",") : []
    }

    /**
     * Display string joining tag names (or bare digits when unnamed) with " · ".
     * @param {?JQuery} $actor
     * @returns {string}
     */
    tag_display($actor = null) {
        $actor = $actor || this.$actor
        const names = this.tag_names($actor)
        return this.get_tags($actor).map(t => names[t - 1] || t).join(" · ")
    }

    /**
     * Whether every currently set tag has a name – bare digits need a "🏷" hint to read as a tag at all,
     * whereas names are self-explanatory on their own.
     * @param {?JQuery} $actor
     * @returns {boolean}
     */
    tags_all_named($actor = null) {
        $actor = $actor || this.$actor
        const names = this.tag_names($actor)
        const tags = this.get_tags($actor)
        return tags.length > 0 && tags.every(t => names[t - 1])
    }

    /**
     * Toggle tag `n` membership; `0`/`null` clears all tags. Undoable.
     * @param {?number} tag
     */
    set_tag(tag) {
        const name = this.get_filename()
        const before = this.get_tags()
        const after = !tag ? [] : before.includes(tag)
            ? before.filter(t => t !== tag)
            : [...before, tag].sort((a, b) => a - b)

        this.playback.changes.undoable(`Tag ${tag ?? "clear"} on ${name}`,
            () => this.write_tags(after),
            () => this.write_tags(before))
    }

    /**
     * Persist a tag token list to `data-tag` + localStorage and refresh the frame's badge. Not undoable
     * on its own – callers (set_tag, bulk untag) wrap it in a `changes.undoable`.
     * @param {number[]} tokens
     */
    write_tags(tokens) {
        const key = "TAG: " + this.get_filename()
        const value = tokens.join(" ")
        if (value) {
            localStorage.setItem(key, value)
            this.$actor.attr("data-tag", value)
        } else {
            localStorage.removeItem(key)
            this.$actor.removeAttr("data-tag")
        }
        this.playback.hud.tag(this)
    }

    static exif($el, data = null, callback = null) {
        if (!READ_EXIF || $el.data("exif-done")) {
            callback?.()
            return
        }
        const el = $el.get()[0]
        if (!data && el instanceof HTMLImageElement && !el.complete) {
            // EXIF.getData silently ignores an <img> that has not finished loading
            el.addEventListener("load", () => Frame.exif($el, data, callback), { once: true })
            return
        }
        const process = (exif) => {
            const attrs = {}

            const make = exif.Make
            const model = exif.Model
            if (make && model) {
                attrs["data-device"] = `${make} ${model}`
            }

            const dateTime = exif.DateTimeOriginal?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(/ /g, "T")
            if (dateTime) { attrs["data-datetime"] = dateTime }

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
            // EXIF resolves async; if it wrote data-datetime, drop this actor's memoized prop() lookups so a
            // stale (pre-EXIF) value isn't served. Per-element (not global) to keep a bulk import's cache warm.
            if (attrs["data-datetime"]) { prop_invalidate_el(el) }
            callback?.()
        }

        // A File/Blob is read by exif-js via FileReader – slice off just the header so a large photo
        // isn't fully read into an ArrayBuffer only to extract a few metadata tags. A bare element (no
        // File, ex. a served presentation) keeps the original behaviour (exif-js fetches it itself).
        const source = data instanceof Blob ? data.slice(0, EXIF_HEADER_BYTES) : (data || el)
        // raises uncatcheable log when CORS encoutered
        EXIF.getData(source, function () {
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
     * @param {?Playback} playback
     * @returns {JQuery} Collection of frames
     */
    static load_all(playback = null) {
        return $(FRAME_SELECTOR).each((_, el) => { // creates a frame if not existed before
            if (!$(el).data("frame")) {
                $(el).data("frame", new Frame($(el), playback))
            }
        })
    }

    /**
     *
     * @param {JQuery} $frames
     * @returns {Frame[]}
     */
    static frames($frames) {
        return $frames.get().map(frame_dom => $(frame_dom).data("frame"))
    }
}