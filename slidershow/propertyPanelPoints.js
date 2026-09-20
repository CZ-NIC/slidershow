/**
 * @typedef {[]|[number, number, number]} ShortPoint x, y, zoom
 * @typedef {ShortPoint|[number, number, number, ?number, ?number, ?number]} PointPosition x, y, zoom, transition_duration, duration, rotate
 */

class PropertyPanelPoints {

    /**
     * Step-points GUI
     * @param {Playback} pl
     * @param {HTMLElement|JQuery} input <input> for a [sli-step-points] element
     * @param {boolean} videoStep This is a video-step, not a step-point
     */
    constructor(pl, input, videoStep = false) {
        this.pl = pl
        this.$hud = pl.hud.$hud_properties
        const $actor = this.$actor = pl.frame.$actor
        this.zoom = pl.frame.zoom
        this.$input = $(input)
        this.videoStep = videoStep
        /** @type {?PointStep} The point currently in live-drag "state 2", if any. */
        this.activePoint = null
        /** @type {?PointStep} A point added this session, not yet touched – its detail row stays open once. */
        this.justAddedPoint = null
        /** @type {boolean} A video paused just for the editing of a point is resumed on blur(). */
        this.resumeAfterEdit = false

        const $wrap = this.$wrap = $("<div />", { "class": "point-wrapper" }).hide().insertAfter(this.$input)
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
                const replacement = new PropertyPanelPoints(pl, this.$input, videoStep)
                // Every commit to this <input> (even one this very instance made, ex: a duration
                // field's own "change") re-triggers this rebuild synchronously – PropertyPanel._field()
                // immediately self-invokes its undo callback to register the undo step, which re-syncs
                // via `undo-performed`. Carry the state-2/just-added tracking over by index (the old
                // PointStep objects are gone, replaced by a fresh parse), or a rebuild mid-edit would
                // silently drop the badge's active pill / details row.
                if (this.activePoint) {
                    replacement.activePoint = replacement.points[this.points.indexOf(this.activePoint)] ?? null
                }
                if (this.justAddedPoint) {
                    replacement.justAddedPoint = replacement.points[this.points.indexOf(this.justAddedPoint)] ?? null
                }
                replacement.resumeAfterEdit = this.resumeAfterEdit
                // Keep the Alt+s / Alt+v shortcuts pointed at a live instance – this one is being torn down.
                if (pl.hud.ownStepPoints === this) {
                    pl.hud.ownStepPoints = replacement
                }
                if (pl.hud.ownVideoPoints === this) {
                    pl.hud.ownVideoPoints = replacement
                }
            })

        // new point button
        const $button = this.new_tag("+")
            // A video point needs its rules asked for, see pointDialog(); a step-point is just a position.
            .on("click", () => videoStep ? this.pointDialog() : this.addPoint())
            .insertAfter(this.$input)
    }

    /**
     * Add a new point at the actor's current position/time and reveal the point list.
     * Shared by the "+" button and the Alt+s / Alt+v keyboard shortcuts (operation.js).
     */
    addPoint() {
        const point = PointStep.fromActor(this, this.$actor, this.videoStep)
        const index = this._insertIndex()
        this.new_point(point, true) // commits – may synchronously replace `this`, see the constructor
        this.$wrap.show()
        const live = this.live // reading back from a possibly rebuilt instance
        live.justAddedPoint = live.points[index] ?? null
    }

    /**
     * Whichever instance is the live one now – `this`, unless a commit (or an undo) has meanwhile
     * rebuilt it, see the constructor. Anything that outlives a single call (a deferred callback, a
     * document-wide listener) has to go through this, or it would act on a dead instance's points.
     * @returns {PropertyPanelPoints}
     */
    get live() {
        return (this.videoStep ? this.pl.hud.ownVideoPoints : this.pl.hud.ownStepPoints) ?? this
    }

    /**
     * Index a new point would be inserted at – after the point being edited, or at the end.
     * (As the non-existent index returns -1, the sum is 0 and we use the length.)
     */
    _insertIndex() {
        return $(".hud-point.active").index() + 1 || this.points.length
    }

    /**
     * Playback rate and muted state the points before `index` have already put in effect.
     * The dialog pre-fills a rule only when the video really differs from this – repeating
     * a rate/mute that is already in force would just be noise in the point list.
     * @param {number} index
     */
    _stateBefore(index) {
        let rate = 1
        let muted = false
        for (const p of this.points.slice(0, index)) {
            if (p.rate != null) {
                rate = Number(p.rate)
            }
            if (p.mute) {
                muted = true
            }
            if (p.unmute) {
                muted = false
            }
        }
        return { rate, muted }
    }

    /**
     * A *new* video point is a whole rule set (`[startTime, "goto:…", "rate:…", …]`), which a plain
     * snapshot of what the video happens to be doing cannot express. Pause the video and ask,
     * so the point can be given its rules right where it is marked; resume afterwards so that
     * marking points does not interrupt the watching.
     *
     * Only new points: an existing one is edited in place, in the point list / corner badge (see
     * `Hud._pointDetails()`), which keeps the video itself visible while its rules are tuned. The
     * one question this dialog asks that an existing point cannot be asked – whether the marked
     * time is a point of its own or the missing half of the cut before it – exists at creation only.
     */
    pointDialog() {
        const pl = this.pl
        const video = /** @type {HTMLVideoElement} */ (this.$actor[0])
        let wasPlaying = !video.paused
        video.pause()

        const round = PointStep.roundTime
        const index = this._insertIndex()
        const before = this._stateBefore(index)
        const time = round(video.currentTime)

        // Cutting a video into excerpts takes pairs of times: the earlier point says when to jump
        // away, this one says where to. So a freshly marked time is often not a point of its own but
        // the missing half of the one before – offer that whenever the previous one still lacks a target.
        const prev = this.points[index - 1]
        const canContinue = prev?.videoStep && prev.goto == null && Number(prev.startTime) < time
        const $mode = canContinue ? this._modeRadios(prev, time) : null

        const $time = $("<input/>", { type: "number", step: 0.01, value: time })
        const $gotoOn = $("<input/>", { type: "checkbox" })
        const $goto = $("<input/>", { type: "number", step: 0.01, value: "", placeholder: "s" })
        const rate = video.playbackRate !== before.rate ? round(video.playbackRate) : null
        const $rateOn = $("<input/>", { type: "checkbox", checked: rate != null })
        const $rate = $("<input/>", { type: "number", step: 0.1, value: rate ?? video.playbackRate })
        const sound = video.muted === before.muted ? "" : video.muted ? "mute" : "unmute"
        const $sound = $("<select/>").append(
            $("<option/>", { value: "", text: "keep as is" }),
            $("<option/>", { value: "mute", text: "mute" }),
            $("<option/>", { value: "unmute", text: "unmute" }))
            .val(sound)
        const $pause = $("<input/>", { type: "checkbox" })

        // Zoom: the view the point should move to – the current one, when the user has zoomed in
        // before marking the point.
        /** @type {PointPosition} */
        let position = PointStep.fromActor(this, this.$actor, false).position
        const zoomable = !PointStep.prototype._isDefault(position) && position.length
        const $zoomOn = $("<input/>", { type: "checkbox", checked: !!zoomable })
        const $zoom = $("<code/>", { text: zoomable ? JSON.stringify(position) : "none" })
        const $take = $("<button/>", { type: "button", text: "Take current view" })
            .on("click", () => {
                position = PointStep.fromActor(this, this.$actor, false).position
                $zoom.text(JSON.stringify(position))
                $zoomOn.prop("checked", true)
            })

        const row = (/** @type {string|JQuery} */ label, /** @type {JQuery[]} */ ...content) =>
            $("<label/>").append($("<span/>", { class: "vp-label" }).append(label), ...content)

        const mnemonic = this._mnemonic.bind(this)
        $take.empty().append(mnemonic("Take current view", "t", $take))

        const $list = $("<div/>", { class: "video-point-dialog" }).append(
            $mode ?? [],
            row(mnemonic("At time", "a", $time), $time, $("<span/>", { text: " s" })),
            $("<div/>", { class: "vp-rules" }).append(
                row("", $gotoOn, mnemonic(" jump to ", "j", $gotoOn), $goto, $("<span/>", { text: " s" })),
                row("", $rateOn, mnemonic(" playback rate ", "r", $rateOn), $rate),
                row("", $pause, mnemonic(" pause", "p", $pause)),
                row(mnemonic("Sound", "s", $sound), $sound),
                row("", $zoomOn, mnemonic(" zoom to ", "z", $zoomOn), $zoom, $take),
            ))

        // In "continue" mode nothing but the time is used – it only fills in the previous point's goto.
        const continued = () => $mode ? $("input:checked", $mode).val() === "continue" : false
        const refreshMode = () => {
            $(".vp-rules", $list).toggleClass("disabled", continued())
            $mode?.trigger("time-changed", Number($time.val()))
        }
        $mode?.on("change", refreshMode)
        $time.on("input", refreshMode)
        refreshMode()

        const apply = () => {
            const t = Number($time.val())
            const cut = continued()
            if (cut) {
                prev.goto = t
            } else {
                const p = new PointStep(null, [t], null)
                p.startTime = t
                p.goto = $gotoOn.prop("checked") && $goto.val() !== "" ? Number($goto.val()) : undefined
                p.rate = $rateOn.prop("checked") && $rate.val() !== "" ? Number($rate.val()) : undefined
                p.pause = $pause.prop("checked") || undefined
                p.mute = $sound.val() === "mute"
                p.unmute = $sound.val() === "unmute"
                p.position = $zoomOn.prop("checked") ? position : []
                this.points.splice(index, 0, p)
            }
            this.$wrap.show()
            this.refresh_points() // commits – may synchronously replace `this`, see the constructor
            // The point the user just shaped keeps its detail row open (a cut filled in the previous one).
            const live = this.live
            live.justAddedPoint = live.points[cut ? index - 1 : index] ?? null
            pl.hud.refresh_points_badge()
        }

        // The pills' live editing (zoom the video and the point follows) is the only way to fine-tune
        // a position – hand over to it instead of duplicating it here.
        const zoomLive = () => {
            wasPlaying = false
            apply()
            const panel = pl.hud.ownVideoPoints
            const i = continued() ? index - 1 : index
            // Whichever list the user is actually looking at – the corner badge, or the panel's own
            // one while the panel is open (the two are never up at the same time).
            const $list = pl.hud.$hud_points.is(":visible") ? pl.hud.$hud_points : panel?.$wrap
            const el = $(".hud-point:not(.hud-point-add)", $list).get(i)
            if (el) {
                panel._activate(panel.points[i], el)
            }
        }

        pl.operation._confirmOnEnter($list)
        const resume = pl.operation.suspendHotkeys()
        new $.Zebra_Dialog({
            source: { inline: $list },
            type: "question",
            title: "Video point",
            onClose: () => {
                resume()
                if (wasPlaying) {
                    video.play()
                }
            },
            buttons: [
                "Cancel",
                { caption: "Zoom live", callback: zoomLive },
                { caption: "Ok", default_confirmation: true, callback: apply },
            ]
        })
        $time.focus().select()
    }

    /**
     * Underlines the first occurrence of `key` in `text` and wires `key` as the accesskey of
     * `$target`, so Alt+<key> activates the control the underlined letter belongs to.
     * @param {string} text
     * @param {string} key
     * @param {JQuery} $target
     * @returns {JQuery}
     */
    _mnemonic(text, key, $target) {
        $target.attr("accesskey", key)
        const i = text.toLowerCase().indexOf(key.toLowerCase())
        if (i === -1) {
            return $("<span/>", { text })
        }
        return $("<span/>").append(
            text.slice(0, i),
            $("<u/>", { text: text.slice(i, i + 1) }),
            text.slice(i + 1))
    }

    /**
     * "New point" / "fill in the previous point's jump target" choice – see pointDialog().
     * Defaults to continuing when the previous point carries nothing but its time; such a point
     * does nothing on its own, so it is almost certainly the start of a cut waiting to be finished.
     * @param {PointStep} prev
     * @param {number} time
     */
    _modeRadios(prev, time) {
        const bare = prev.rate == null && !prev.pause && !prev.mute && !prev.unmute && !prev.position.length
        const key = { "new": "n", "continue": "c" }
        const label = (/** @type {number} */ t) => ({
            "new": `New point at ${t} s`,
            "continue": `Cut: jump from ${prev.startTime} s here (previous point gets goto:${t})`
        })
        const radio = (/** @type {string} */ value, /** @type {boolean} */ checked) => {
            const $input = $("<input/>", { type: "radio", name: "vp-mode", value, checked })
            return $("<label/>").append($input, " ", this._mnemonic(label(time)[value], key[value], $input))
        }
        return $("<div/>", { class: "vp-mode" })
            .append(radio("new", !bare), radio("continue", bare))
            // both captions quote the time, which the "At time" field may still change
            .on("time-changed", (e, t) => {
                $("label", $(e.currentTarget)).each((_, el) => {
                    const value = String($("input", el).val())
                    $("span", el).replaceWith(this._mnemonic(label(t)[value], key[value], $("input", el)))
                })
            })
    }

    /**
     * Register new point.
     * @param {PointStep} point
     * @param {boolean} push Insert after the currently GUI-active element or at the end.
     * @returns {JQuery} Clickable point element
     */
    new_point(point, push = false) {
        if (push) {
            this.points.splice(this._insertIndex(), 0, point)
            this.refresh_points()
        }

        return this.new_tag(point)
            .attr("draggable", "true")
            .on("dragstart", e => {
                this._dragged = point
                $(e.currentTarget).addClass("dragging")
                e.originalEvent.dataTransfer.effectAllowed = "move"
            })
            .on("dragend", e => $(e.currentTarget).removeClass("dragging"))
            .on("dragover", e => e.preventDefault()) // allow drop
            .on("drop", e => {
                e.preventDefault()
                this.reorderPoint(this._dragged, point)
            })
            .on("click", e => {
                const pt = e.currentTarget
                if ($(pt).hasClass("active")) {
                    this.refresh_points() // save
                    return this.blur()
                }
                this.justAddedPoint = null
                this._activate(point, pt)
            })
            .on("dblclick", () => {
                if (this.activePoint === point) {
                    this.activePoint = null
                }
                if (this.justAddedPoint === point) {
                    this.justAddedPoint = null
                }
                point.remove(this)
                this.pl.hud.refresh_points_badge()
            })
    }

    /**
     * Both containers a `.hud-point` pill can live in – the panel's own list (only relevant while
     * the panel is manually opened) and the HUD corner badge mirror (the normal, panel-closed path).
     */
    get $hudAll() {
        return this.$hud.add(this.pl.hud.$hud_points)
    }

    /**
     * Start the live editing of a point: the actor jumps there and follows every zoom/rotate
     * (and, for a video, every rate/mute change) until the pill is clicked again or the user
     * clicks anywhere outside a pill and outside the actor being edited.
     *
     * Also makes this point "current" (state 1) right away – the actor is now sitting at it, and
     * this is what a `blur()` (leaving state 2) is expected to settle back into. This also demotes
     * whichever other pill used to be "current" back to a plain one, immediately (not just on the
     * next unrelated `refresh_points_badge()` rebuild).
     * @param {PointStep} point
     * @param {HTMLElement} pt Its pill element.
     */
    _activate(point, pt) {
        if (this.videoStep) {
            const video = /** @type {HTMLVideoElement} */ (this.$actor[0])
            // Editing a video point means typing into fields that describe one exact moment – a
            // running playback would carry that moment away (and the live sync `enter()` installs
            // keeps the point at the playhead, so it would overwrite the very time being edited).
            this.resumeAfterEdit = !video.paused
            video.pause()
        }
        $(".hud-point", this.$hudAll).removeClass("active current")
        $(".hud-point-details", this.$hudAll).remove()
        $(pt).addClass("active current")
        this.activePoint = point
        this.justAddedPoint = null
        this.pl.frame.currentPointIndex = this.points.indexOf(point)
        $(window).on("resize.wzoom-properties", () => this.live.blur())
        // Deferred: activation can be triggered by a click that isn't itself on a pill (ex: the
        // video dialog's "Zoom live" button) – binding synchronously would catch that same click
        // as it keeps bubbling to `document` and immediately undo the activation.
        setTimeout(() => {
            $(document).on("click.point-blur", e => {
                // Panning/zooming the actor to live-edit the point ends in a native "click" too (the
                // WZoom library cannot stop its propagation, see frame_zoom.js's onDrop comment) –
                // that must not itself end state 2, only a click genuinely elsewhere should.
                if ($(e.target).closest(".hud-point").length || $(e.target).closest(this.$actor).length) {
                    return
                }
                // Through `live`: a click may have changed the points before reaching us – WebHotkeys
                // runs a shortcut by clicking its HUD button, so Ctrl+Alt+Z's own click lands here
                // right after the undo, and a dead instance would write its pre-undo points back.
                const live = this.live
                live.refresh_points() // save whatever dragging changed before leaving state 2
                live.blur()
            })
        }, 0)
        this._showDetails(point, pt)

        point.enter(this, pt)
    }

    /**
     * Insert the transition/duration/remove details row right after `pt`, in place, without a full
     * `refresh_points_badge()` rebuild – that would replace `pt` mid live-drag (breaking the label
     * updates `PointStep.enter()` writes into it) and could race an in-progress double-click.
     * @param {PointStep} point
     * @param {HTMLElement} pt
     */
    _showDetails(point, pt) {
        const $pt = $(pt)
        this.pl.hud._pointDetails(this, point, $pt, this.videoStep ? "video-points" : "step-points").insertAfter($pt)
    }

    /**
     * Move a dragged point next to the one it was dropped on and persist the new order.
     * Reordering only touches array order (not any point's own data), so it reuses the same
     * <input> value-diffing undo path as every other point edit – no separate Changes wiring needed.
     * @param {?PointStep} dragged
     * @param {PointStep} target
     */
    reorderPoint(dragged, target) {
        if (!dragged || dragged === target) {
            return
        }
        const from = this.points.indexOf(dragged)
        const to = this.points.indexOf(target)
        if (from === -1 || to === -1) {
            return
        }
        this.points.splice(from, 1)
        this.points.splice(to, 0, dragged)
        this.refresh_points()
        // refresh_points() only rewrites the <input> value – rebuild the pills in the new order too
        this.$wrap.empty().append(this.points.map(p => this.new_point(p)))
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
            // do not let the focus to be stuck to the <input>
            // (which is just technical and not very user friendly fallback)
            this.$input.trigger("blur")
        }
    }

    blur() {
        // Just the active state, not a full refresh_points_badge() rebuild – that would replace the
        // very pill a double-click's second "click" (which lands here, see new_point()) is about to
        // fire "dblclick" on, silently swallowing the removal.
        $(".hud-point", this.$hudAll).removeClass("active")
        $(".hud-point-details", this.$hudAll).remove()
        if (this.resumeAfterEdit) { // the video was playing when the editing started, see _activate()
            this.resumeAfterEdit = false
            const video = /** @type {HTMLVideoElement} */ (this.$actor[0])
            video.play()
        }
        this.activePoint = null
        $(window).off("resize.wzoom-properties")
        $(document).off("click.point-blur")
        this.$actor.off("zoom.slidershow").off("actor.slidershow")
    }

    /**
     * @param {string|PointStep} htmlOrPoint
     * @returns {JQuery} Hud-point
     */
    new_tag(htmlOrPoint) {
        return $("<div />", {
            "html": "<span class=\"hud-point-label\">" + (htmlOrPoint instanceof PointStep ? htmlOrPoint.toString() : htmlOrPoint) + "</span>",
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
     * Round a video time the way a point stores it: to hundredths. Fine enough to place a cut
     * within a frame or two, coarse enough that a typed `3` stays `3` – seeking there reports back
     * a slightly-off time (3.0000001) that would otherwise be written into the point.
     * @param {number} v
     * @returns {number}
     */
    static roundTime(v) {
        return Math.round(v * 100) / 100
    }

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
                    this.startTime = PointStep.roundTime(data.currentTime)
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
                // While managing the point, stay at it. Following its own goto would jump the video
                // away – and the live editing, which keeps the point at the playhead, would then
                // overwrite the point's startTime with that goto target.
                video.currentTime = this.startTime
            } else if (this.goto) {
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