class PropertyPanel {
    /**
     *
     * @param {Hud} hud
     */
    constructor(hud) {
        this.hud = hud
        this.playback = hud.playback
    }


    /**
     * Step-points GUI
     * @param {Frame} frame
     * @param {jQuery} $input <input> for a [data-step-points] element
     */
    gui_step_points(frame, $input) {
        const $wrap = $("<div />", { "class": "point-wrapper" }).hide().insertAfter($input)
        const $hud = this.hud.$hud_properties
        const cc = this.playback.changes
        const $actor = frame.$actor
        const points = JSON.parse($input.val() || '[]')  // load set of points from the given <input>
        if (points.length) {
            $wrap.show().append(points.map(p => new_point(p)))
        }
        $input // refresh from either: user editing <input>, user did undo, not from us having edited <input>
            .off("change.step-points undo-performed")
            .on("change.step-points undo-performed", () => {
                $wrap.remove()
                $button.remove()
                $actor.off("wzoomed")
                this.gui_step_points(frame, $input)
            })

        // new point button
        const $button = new_tag("+")
            .on("click", () => new_point(frame.zoom_get($actor), true)
                .trigger("click")
                .appendTo($wrap.show()))
            .insertAfter($input)

        function new_point(point, push = false) {
            if (push) {
                points.push(point)
                refresh_points()
            }

            const $point = new_tag(point, true)
                .on("click", function () { // zoom to given point
                    if ($(this).hasClass("active")) {
                        return blur()
                    }
                    $(".hud-point", $hud).removeClass("active")
                    $(this).addClass("active")
                    $(window).on("resize.wzoom-properties", blur)
                    $actor
                        .off("wzoomed")
                        .on("wzoomed", (_, minor_move) => {
                            const [currentLeft, currentTop, currentScale] = frame.zoom_get($actor)
                            point[0] = Math.round(currentLeft)
                            point[1] = Math.round(currentTop)
                            point[2] = Math.round(currentScale)
                            $("span", this).html(JSON.stringify(point))
                            refresh_points(minor_move)
                        })

                    // why timeout? This would prevent dblclick
                    setTimeout(() => frame.zoom_set($actor, ...point), 0)
                })
                .on("dblclick", function () { // remove given point
                    const index = points.indexOf(point)
                    points.splice(index, 1)
                    $(this).fadeOut()
                    refresh_points()
                })
            return $point

            function refresh_points(minor_move = false) {
                $input.val(points.length ? JSON.stringify(points) : "")
                if (!minor_move) {
                    // Why `change.$`? We want to ignore our `change.step-points`
                    // that would create a loop and delete this very container.
                    $input.trigger("change.$")
                }
            }

            function blur() {
                $(".hud-point", $hud).removeClass("active")
                $(window).off("resize.wzoom-properties")
                $actor.off("wzoomed")
            }
        }
        function new_tag(html, stringify = false) {
            return $("<div />", {
                "html": "<span>" + (stringify ? JSON.stringify(html) : html) + "</span>",
                "class": "hud-point"
            })
        }
    }


    /**
     * Generate <input type=number> into the Properties panel.
     * Recursively generate such input for the ancestors (<section>) too.
     * @param {string} p Property name (ex: 'duration')
     * @param {jQuery} $el $frame or its parents up to main (elements having properties)
     * @param {string} name Tag name, prepended to the property <label>
     * @returns
     */
    input_ancestored(p, $el, type = "text", name = "") {
        const original = $el.data(p)
        const element_property = this.input(
            p, $el, name, original, type,
            prop(p, $el.parent()),
            v => {
                // v is "" when user deletes input
                // v is undefined when we undo a change and the original value was undefined
                //  (and not converted to the empty string via <input> value)
                if (v === "" || v === undefined) {
                    $el.removeAttr(`data-${p}`)
                    $el.removeData(p)
                } else {
                    $el.attr(`data-${p}`, v)
                    $el.data(p, PROP_NONSCALAR[p] ? JSON.parse(v) : v)
                }
            })

        // Ask all the parents to the same property (duplicating the <input>)
        if ($el.parent().length && !$el.is("main")) {
            $.merge(element_property, this.input_ancestored(p, $el.parent(), type, $el.parent().prop("tagName")))
        }
        return element_property
    }

    /**
     * Generate <input> into the Properies panel.
     * @param {string} p Property name (ex: 'duration')
     * @param {jQuery} $el $frame or its parent up to main (element having the property)
     * @param {string} name Tag name, prepended to the property <label>
     * @param {string} value Initial value.
     * @param {string} type <input> type, like "text"
     * @param {string} placeholder HTML placeholder
     * @param {Function} change Callback to revert changes, i.e. on the DOM element.
     * @returns
     */
    input(p, $el, name, value, type, placeholder, change) {
        const pl = this.playback
        const original_frame = pl.frame.index

        if (PROP_NONSCALAR[p]) {
            value = JSON.stringify(value) // ex: step-points
        }

        return $.merge(
            $("<label/>", { "text": `${name ? " - " + name : p}: `, "title": this.hud.get_help(p, true, false) })
                .on("click", () => this.hud.get_help(p)),
            $("<input />")
                .attr("type", type)
                .attr("placeholder", placeholder)
                .attr("name", `${name}${p}`)
                .attr("data-property", p)
                .data("target", $el[0])
                .data("previous", value)
                .val(value)
                .on("change", function (_) {
                    // Determine the previous value.
                    // Since the $input gets deleted while changing frame,
                    // we have to store the value in the element data instead in a closure variable
                    // i.e. like `const previous = value`.
                    // Do not allow undefined because that would make .data("previous", undefined)
                    //  a reading operation. We prefer "" as this is an <input> text.
                    const _p = $(this).data("previous")
                    const previous = _p === undefined ? "" : _p
                    value = $(this).val()

                    if (previous === value) {
                        return
                    }

                    $(this).data("previous", value)

                    change(value) // change the property in the DOM
                    pl.changes.change(`Changing ${p} ${previous} → ${value}`,
                        (previous) => { // undo change
                            // Other frame contents was changed. We have to return there first.
                            // Note that we do not return in case of a common <section> or <main>.
                            const $fr = pl.frame.$frame
                            if (!($fr.closest($el).length || $fr.find($el).length)) {
                                pl.goToFrame(original_frame)
                            }
                            // Change the DOM back
                            change(previous)
                            // Change the properties panel <input> back
                            // Why accessing via name?
                            // Since we could changed the slide (and refreshed the panel HTML),
                            // the original element does not have to exist.
                            // Besides, as the element can be nested under two <section> tags,
                            // we filter by .data("target") too.
                            $($(`[name=${$(this).attr("name")}]`)
                                .get()
                                .find(input => $(input).data("target") === $el[0]))
                                .val(previous)
                                .data("previous", previous)
                                .trigger("undo-performed")
                                .focus()
                        }, value, previous)
                })
        ).wrapAll($("<div/>")).parent()
    }
}