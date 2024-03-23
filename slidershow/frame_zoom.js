class FrameZoom {

    static DEFAULT_ZOOM = [0, 0, 1]

    /**
     * @param {Frame} frame
     */
    constructor(frame) {
        this.frame = frame
        this.playback = frame.playback
        /** @type {?HotkeyGroup} */
        this.keys = null
        /** @type {?function} */
        this._keydown = null
        /** @type {?function} */
        this._keyup = null
    }

    /** @param {JQuery<HTMLImageElement|HTMLMediaElement>} $el */
    init($el) {
        if ($el.data("wzoom")) {
            return $el.data("wzoom") // already initialized
        }
        const maxScale_default = 5
        let last_scale = null
        const image = $el.prop("tagName") === "IMG"

        const wzoom = WZoom.create($el.get()[0], {
            maxScale: maxScale_default,
            minScale: 1,
            // 'image' might work better for <img>, however <video> seems to need size autodetection
            type: image ? "image" : "html",
            // <video> uses click for start/stop
            zoomOnClick: image,
            zoomOnDblClick: false,
            speed: 1.5,
            // We can wheel in for ever but keeping maxScale on leash.
            // Because the click takes us to the current bed (and second click zooms out).
            rescale: wzoom => { // the function seems to be called unintuitively with grab moving
                const scale = wzoom.content.currentScale
                if (scale === 1) {
                    this.destroy_keys()
                } else {
                    this.init_keys(wzoom)
                }


                wzoom.content.maxScale = Math.max(maxScale_default, scale + 3)
                if (last_scale !== null) {
                    // when created, it directly triggers rescale. Might cause a loop when triggered function
                    // calls zoom_get (which calls zoom_init again)
                    $el.trigger("zoom.slidershow", [last_scale === scale])
                }
                last_scale = scale
            },
            dragScrollableOptions: {
                onDrop: () => $el.trigger("zoom.slidershow")
            }
        })
        // Why correcting viewport? When having data-step-points and calling `zoom_set` from `prepare`,
        // the frame is not at the viewport yet, thus the values are wrong. Such image seem to work
        // but whenever manually zoomed, it vanishes out of the screen.
        // Besides, we should center the image to a parent. However, we do not want to wrap it,
        // this simulates the parent.
        wzoom.viewport.originalLeft = $el.position().left
        wzoom.viewport.originalTop = $el.position().top
        const orig_ratio = nat($el, "Height") / nat($el, "Width")
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
            const ratio = curr_ratio > orig_ratio ? $el.width() / nat($el, "Width") : $el.height() / nat($el, "Height")
            $el.data("wzoom_get_ratio", () => ratio)
        }
        refresh_viewport()
        $(window).on("resize.wzoom", refresh_viewport)

        $el
            .data("wzoom_resize_off", () => $(window).off("resize.wzoom", refresh_viewport))
            // zooming modifiable from the outside
            .attr("data-wzoom", true)
            .data("wzoom", wzoom)

        if (image) {// we have zoomed in, do not playback further
            // These events trigger zooming. We cannot detect zooming itself
            // because we might have zoomed by ex: step-points – playback stop is not wanted.
            // This does not happen on playing video because this would interfere
            // with the click = play/pause (might be fixed by returning true)
            // but the video stops the playback nevertheless.
            const ev = "click.slidershow wheel.slidershow"
            $el.off(ev).on(ev, () => this.playback.moving = false)
        }

        return wzoom

        function nat($el, prop) {
            if ($el[0] instanceof HTMLImageElement) {
                return $el.prop("natural" + prop)
            } else if ($el[0] instanceof HTMLVideoElement) {
                return $el.prop("video" + prop)
            } else {
                throw new Error("Slidershow> Unknown element type")
            }
        }
    }

    /**
     * If zooming is active, allow keyboard navigation
     * @param {WZoom} wzoom
     */
    init_keys(wzoom) {
        if (this.keys) {
            return
        }
        const jump = 50
        const pressed = { "ArrowUp": 0, "ArrowDown": 0, "ArrowLeft": 0, "ArrowRight": 0 }

        // We use WH to suppress default application arrow shortcuts.
        // However as we need to monitor two arrow presses,
        // we use custom keyup methods. These needs to be deregistered.
        // Which would be a piece of cake with jQuery, however,
        // the WH would consume the event and jQuery events would have never triggered.
        // So, we have to use native addEventListener that needs references
        // to real functions, hence the attributes. (We cannot use methods as the functions
        // use local scope.)
        this.keys = wh.group("Frame navigation", [
            ["ArrowLeft", "Navigate left", () => { }],
            ["ArrowRight", "Navigate right", () => { }],
            ["ArrowUp", "Navigate up", () => { }],
            ["ArrowDown", "Navigate down", () => { }],
        ])

        const guard = ({ key, altKey, metaKey, shiftKey, ctrlKey }) =>
            ((altKey || metaKey || shiftKey || ctrlKey) === false)
            && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)

        this._keydown = e => {
            if (guard(e)) {
                pressed[e.key] = 1
                const { currentScale: scale, currentLeft: left, currentTop: top } = wzoom.content
                // goniometry keeps ArrowLeft horizontal even when rotated
                // const angle = prop("rotate", this.frame.$actor, 0, null, true) * (Math.PI / 180) // deg → rad
                // const cos = Math.cos(angle)
                // const sin = Math.sin(angle)
                // const vertic = pressed["ArrowUp"] * jump + pressed["ArrowDown"] * -jump
                // const horiz = pressed["ArrowLeft"] * jump + pressed["ArrowRight"] * -jump
                //         wzoom.transform(
                //             top + cos * vertic + -sin * horiz,
                //             left + cos * horiz + sin * vertic,
                //             scale)
                wzoom.transform(
                    top + (pressed["ArrowUp"] * jump) + (pressed["ArrowDown"] * -jump),
                    left + (pressed["ArrowLeft"] * jump) + (pressed["ArrowRight"] * -jump),
                    scale)
            }
        }
        this._keyup = e => {
            if (guard(e)) {
                pressed[e.key] = 0
            }
        }
        document.addEventListener('keydown', this._keydown, true)
        document.addEventListener('keyup', this._keyup, true)
    }

    // destruct zooming while leaving the frame
    destroy() {
        $("[data-wzoom]", this.frame.$frame).each((_, el) => {
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
            this.destroy_keys()
        })
    }

    destroy_keys() {
        if (this.keys) {
            this.keys.disable()
            this.keys.length = 0
            this.keys = null

            document.removeEventListener("keydown", this._keydown, true)
            document.removeEventListener("keyup", this._keyup, true)
        }
    }

    /**
     * @param {JQuery} $el
     * @returns {[number, number, number]} x, y, zoom
     */
    get($el) {
        const { currentLeft, currentTop, currentScale } = this.init($el).content
        const ratio = $el.data("wzoom_get_ratio")()
        return [currentLeft / ratio / currentScale, currentTop / ratio / currentScale, currentScale].map(n => Math.round(n * 10) / 10)
    }

    /**
     * @param {JQuery} $el Zoomed element
     * @param {number} left
     * @param {number} top
     * @param {number} scale
     * @param {?number} transition_duration
     * @param {?number} duration
     * @param {?number} rotate
     * @returns {number} After zoom step duration.
    */
    set($el, left = 0, top = 0, scale = 1, transition_duration = null, duration = null, rotate = 0) {
        const wzoom = this.init($el)
        transition_duration ??= prop("step-transition-duration", $el, null, "transition-duration")
        const ratio = $el.data("wzoom_get_ratio")()
        const orig = wzoom.options.smoothTime
        wzoom.options.smoothTime = transition_duration
        wzoom.transform(top * ratio * scale, left * ratio * scale, scale)
        wzoom.options.smoothTime = orig
        this.frame.add_effect(r => $el.on("transitionend", () => r()))
        this.init_keys(wzoom)

        // rotation
        if (rotate || prop("rotate", $el, null, null, true) !== null) { // set new rotation or unset rotation
            $el.attr("data-rotate", rotate)
            this.frame.add_effect(r =>
                $el.animate({ rotate: rotate + "deg" }, transition_duration * 1000,
                    () => r()))
        }
        return duration ?? prop("step-duration", $el, null, "duration")
    }

}