/**
 * @typedef {[]|[number, number, number]} ShortPoint x, y, zoom
 * @typedef {ShortPoint|[number, number, number, ?number, ?number, ?number]} PointPosition x, y, zoom, transition_duration, duration, rotate
 */

class PropertyPanelPoints {

    /**
     * Step-points GUI
     * @param {Playback} pl
     * @param {HTMLElement|JQuery} input <input> for a [data-step-points] element
     * @param {boolean} videoStep This is a video-step, not a step-point
     */
    constructor(pl, input, videoStep = false) {
        this.$hud = pl.hud.$hud_properties
        const $actor = this.$actor = pl.frame.$actor
        this.zoom = pl.frame.zoom
        this.$input = $(input)

        const $wrap = $("<div />", { "class": "point-wrapper" }).hide().insertAfter(this.$input)
        this.points = PointStep.load(this.$input, videoStep) // load set of points from the given <input>
        if (this.points.length) {
            $wrap.show().append(this.points.map(p => this.new_point(p)))
        }
        this.$input // refresh from either: user editing <input>, user did undo, not from us having edited <input>
            .off("change.step-points undo-performed")
            .on("change.step-points undo-performed", () => {
                $wrap.remove()
                $button.remove()
                $actor.off(".slidershow")
                new PropertyPanelPoints(pl, this.$input, videoStep)
            })

        // new point button
        const $button = this.new_tag("+")
            .on("click", () => {
                this.new_point(PointStep.fromActor(this, $actor, videoStep), true)
                $wrap.show()
            })
            .insertAfter(this.$input)
    }

    /**
     * Register new point.
     * @param {PointStep} point
     * @param {boolean} push Insert after the currently GUI-active element or at the end.
     * @returns {JQuery} Clickable point element
     */
    new_point(point, push = false) {
        if (push) {
            // (As the non-existent index returns -1, the sum is 0 and we use the length.)
            const index = $(".hud-point.active").index() + 1 || this.points.length
            this.points.splice(index, 0, point)
            this.refresh_points()
        }

        return this.new_tag(point)
            .on("click", e => {
                const pt = e.currentTarget
                if ($(pt).hasClass("active")) {
                    this.refresh_points() // save
                    return this.blur()
                }
                $(".hud-point", this.$hud).removeClass("active")
                $(pt).addClass("active")
                $(window).on("resize.wzoom-properties", this.blur)

                point.enter(this, pt)
            })
            .on("dblclick", () => point.remove(this))
    }

    /**
     * Stores variable points to the property $input (and register the undoable action).
     * @param {?HTMLElement} hud_point Element with the point representation.
     *  If set, it means the user just changed one of its parameters and we should reflect it.
     * @param {?PointStep} point
     */
    refresh_points(hud_point = null, point = null) {
        if (hud_point && point) {
            $("span", hud_point).html(point.toString())
        }
        this.$input.val(this.points.length ? PointStep.stringify(this.points) : "")
        // When a hud_point is active, do not trigger the change.
        // That would cause blur and hence point editing stop.
        if (!hud_point) {
            // Why `change.$`? We want to ignore our `change.step-points`
            // that would create a loop and delete this very container.
            this.$input.trigger("change.$")
        }
    }

    blur() {
        $(".hud-point", this.$hud).removeClass("active")
        $(window).off("resize.wzoom-properties")
        this.$actor.off("zoom.slidershow").off("actor.slidershow")
    }

    /**
     * @param {string|PointStep} htmlOrPoint
     * @returns {JQuery} Hud-point
     */
    new_tag(htmlOrPoint) {
        return $("<div />", {
            "html": "<span>" + (htmlOrPoint instanceof PointStep ? htmlOrPoint.toString() : htmlOrPoint) + "</span>",
            "class": "hud-point"
        })
    }

    /**
     * Is the user editing a point?
     */
    static get beingEdited() {
        return $(".hud-point.active").length
    }

    /**
     * Save any ongoing changes.
     */
    static save() {
        $(".hud-point.active").trigger("click")
    }
}

class PointStep {
    /**
     * Deserialize the set of points from the given <input>
     * @param {JQuery} $input
     * @param {boolean} videoStep This is a video-step, not a step-point
     * @returns {PointStep[]}
     */
    static load($input, videoStep) {
        return JSON.parse($input.val() || '[]').map(p => new PointStep(!videoStep && p, videoStep && p))
    }

    /**
     * @param {PointStep[]} points
     */
    static stringify(points) {
        return "[" + points.map(p => p.toString()).join(",") + "]"
    }

    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} zoom
     */
    replacePosition(x, y, zoom) {
        this.position[0] = x
        this.position[1] = y
        this.position[2] = zoom
    }

    /**
     * We might either construct just a position step. Or add a video data (either serialized or not) to control a video.
     * @param {?PointPosition} data
     * @param {?*} videoData
     * @param {?HTMLVideoElement} video
     */
    constructor(data = [], videoData = null, video = null) {
        this.videoStep = Boolean(videoData || video)
        /** @type {PointPosition} */
        this.position = []

        if (data) {
            this.position = data
        }
        if (video) {
            this.startTime = video.currentTime
            if (video.playbackRate !== 1) {
                this.rate = video.playbackRate
            }
            if (video.muted) {
                this.mute = true
            }
        }
        if (videoData) {
            // deserialize video params, ex: [5, "goto:7", "pause", "mute"/"unmute", "point:[classical step zoom point]"]
            this.startTime = videoData[0]
            videoData.slice(1).map(item => {
                const [key, val] = item.split(":")
                switch (key) {
                    case "goto":
                        /** @type {number} */
                        this.goto = val
                        break;
                    case "rate":
                        this.rate = val
                        break;
                    case "pause":
                        this.pause = true
                        break;
                    case "mute":
                        this.mute = true
                        break;
                    case "unmute":
                        this.unmute = true
                        break;
                    case "point":
                        this.position = JSON.parse(val)
                        break;
                    default:
                        break;
                }
            })
        }
    }

    /**
     * @param {PropertyPanelPoints} panel
     * @param {JQuery<HTMLElement>} $actor
     * @param {boolean} videoStep Either consider it as a video-step or a step-point.
     */
    static fromActor(panel, $actor, videoStep) {
        const p = new PointStep(panel.zoom.get($actor), null, videoStep ? $actor[0] : null)
        const rotate = prop("rotate", $actor, null, null, true)
        if (rotate) {
            p.position[5] = rotate
        }
        return p
    }

    /**
     * Is this a default position, with no rotation or any parameter added.
     * @param {PointPosition} point
     * @returns
     */
    _isDefault(point) {
        return point.length === 3 && FrameZoom.isDefault(point)
    }

    toString() {
        if (!this.videoStep) { // step-point is brief
            return this._isDefault(this.position) ? "[]" : JSON.stringify(this.position)
        }
        return JSON.stringify([
            this.startTime].concat([
                this.goto != null ? `goto:${this.goto}` : null,
                this.rate != null ? `rate:${this.rate}` : null,
                this.pause != null ? 'pause' : null,
                this.mute ? 'mute' : null,
                this.unmute ? 'unmute' : null,
                this.position.length && !this._isDefault(this.position) ?
                    `point:${JSON.stringify(this.position)}` : null
            ].filter(Boolean)))
    }

    /**
     * Zoom to given point
     * @param {PropertyPanelPoints} panel
     * @param {HTMLElement} pt Element being clicked on
     */
    enter(panel, pt) {
        const $actor = panel.$actor
        // Modify the actor according to the PointStep
        this.affect($actor, panel.zoom, true)

        // update the PointStep while a user action on the $actor happens
        $actor
            .off(".slidershow")
            .on("zoom.slidershow", (_, minor_move) => {
                // replace only the position part of the point (x,y,zoom)
                this.replacePosition(...panel.zoom.get($actor))
                panel.refresh_points(pt, this)
            })
            .on("actor.slidershow", (_, data) => {
                if (data.rotate !== undefined) {
                    this.position[5] = data.rotate
                }
                if (data.muted !== undefined) {
                    [this.mute, this.unmute] = [data.muted, !data.muted]
                }
                if (data.rate !== undefined) {
                    this.rate = data.rate
                }
                if (data.currentTime) {
                    this.startTime = data.currentTime
                }
                panel.refresh_points(pt, this)
            })
    }


    /**
     * Modify the actor according to the PointStep
     * @param {JQuery} $actor
     * @param {FrameZoom} zoom
     * @param {boolean} full If true, video is set according to the point start.
     *  (This is needed only when managing points, not while playback.)
     */
    affect($actor, zoom, full = false) {
        if (this.videoStep) {
            /** @type {HTMLVideoElement} */
            const video = $actor[0]
            if (full) {
                video.currentTime = this.startTime
            }
            if (this.goto) {
                video.currentTime = this.goto
            }
            if (this.rate) {
                video.playbackRate = this.rate || 1
            }
            if (this.mute) {
                video.muted = true
            }
            if (this.unmute) {
                video.muted = false
            }
            if (this.pause) {
                video.pause()
            }
        }

        setTimeout(() => zoom.set($actor, ...this.position), 0)  // why timeout? This would prevent dblclick
    }

    /**
     * remove given point
     * @param {PropertyPanelPoints} panel
     */
    remove(panel) {
        const index = panel.points.indexOf(this)
        panel.points.splice(index, 1)
        $(panel).fadeOut()
        panel.refresh_points()
    }
}