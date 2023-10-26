class PropertyPanel {
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
        const $wrap = $("<div />").insertAfter($input)
        const cc = this.playback.change_controller
        const $actor = frame.$actor
        const points = JSON.parse($input.val() || '[]')  // load set of points from the given <input>

        $wrap.append(points.map(p => new_point(p)))
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
            .on("click", () => {
                const $new_point = new_point(frame.zoom_get($actor), true).trigger("click").appendTo($wrap)
                cc.change(() => $new_point.trigger("dblclick"))
            })
            .insertAfter($wrap)

        function new_point(point, push = false) {
            if (push) {
                points.push(point)
            }

            const $point = new_tag(point, true)
                .on("click", function () { // zoom to given point
                    if ($(this).hasClass("active")) { // blur
                        $("div", $wrap).removeClass("active")
                        $actor.off("wzoomed")
                        return
                    }
                    $("div", $wrap).removeClass("active")
                    $(this).addClass("active")
                    $actor
                        .off("wzoomed")
                        .on("wzoomed", (_, wzoom, minor_move) => {
                            const { currentLeft, currentTop, currentScale } = wzoom.content
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
                    cc.change(() => {
                        points.splice(index, 0, point)
                        $(this).fadeIn()
                        refresh_points()
                    })
                })
            return $point

            function refresh_points(minor_move = false) {
                // Why `change.$`? We want to ignore our `change.step-points`
                // that would create a loop and delete this very container.
                $input.val(JSON.stringify(points))
                if (!minor_move) {
                    $input.trigger("change.$")
                }
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
                    $el.data(p, $el.data("hud-stringified") ? JSON.parse(v) : v)
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
     * @param {jQuery} $el $frame or its parents up to main (elements having properties)
     * @param {string} name Tag name, prepended to the property <label>
     * @param {string} value Initial value.
     * @param {string} type <input> type, like "text"
     * @param {string} placeholder HTML placeholder
     * @param {Function} change Callback to revert changes
     * @returns
     */
    input(p, $el, name, value, type, placeholder, change) {
        const pl = this.playback
        const original_frame = pl.frame.index

        if (typeof value === "object") {
            $el.data("hud-stringified", true)
            value = JSON.stringify(value) // ex: step-points
        }

        return [
            $("<label/>", { "text": `${name ? " - " + name : p}: `, "title": this.hud.get_help(p, true, false) })
                .on("click", () => this.hud.get_help(p)),
            $("<input />")
                .attr("type", type)
                .attr("placeholder", placeholder)
                .attr("name", `${name}${p}`)
                .attr("data-property", p)
                .val(value)
                .on("change", function (_) {
                    const previous = value
                    value = $(this).val()
                    change($(this).val()) // change the property in the DOM
                    pl.change_controller.change(() => { // undo change
                        // Other frame contents was changed. We have to return there first.
                        // Note that we do not return in case of a common <section> or <main>.
                        const $fr = pl.frame.$frame
                        if (!($fr.closest($el).length || $fr.find($el).length)) {
                            pl.goToFrame(original_frame)

                        }
                        // Change the properties panel <input> back
                        // Why accessing via name?
                        // Since we could changed the slide (and refreshed the panel HTML),
                        // the original element does not have to exist.
                        $(`[name=${$(this).attr("name")}]`).val(previous).focus()
                        change(previous)
                        value = previous
                        $(this).trigger("undo-performed")
                    })
                }),
            "<br>"
        ]
    }
}