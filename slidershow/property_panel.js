class PropertyPanel {
    /**
     *
     * @param {Hud} hud
     */
    constructor(hud) {
        this.hud = hud
        this.playback = hud.playback
        this.points = PropertyPanelPoints
    }

    /**
     * Generate <input type=number> into the Properties panel.
     * Recursively generate such input for the ancestors (<section>) too.
     * @param {string} p Property name (ex: 'duration')
     * @param {JQuery} $el $frame or its parents up to main (elements having properties)
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
     * @param {JQuery} $el $frame or its parent up to main (element having the property)
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

                    pl.changes.change(`Changing ${p} ${previous} → ${value}`,
                        val => { // undo change
                            // Other frame contents was changed. We have to return there first.
                            // Note that we do not return in case of a common <section> or <main>.
                            const $fr = pl.frame.$frame
                            if (!($fr.closest($el).length || $fr.find($el).length)) {
                                pl.goToFrame(original_frame)
                            }
                            // Change the DOM back
                            change(val) // change the property in the DOM
                            // Change the properties panel <input> back
                            // Why accessing via name?
                            // Since we could changed the slide (and refreshed the panel HTML),
                            // the original element does not have to exist.
                            // Besides, as the element can be nested under two <section> tags,
                            // we filter by .data("target") too.
                            $($(`[name=${$(this).attr("name")}]`)
                                .get()
                                .find(input => $(input).data("target") === $el[0]))
                                .val(val)
                                .data("previous", val)
                                .trigger("undo-performed")
                                .focus()

                            // if the property affected the actor, refresh it
                            pl.frame.refresh_actor(p)
                        }, value, previous)
                })
        ).wrapAll($("<div/>")).parent()
    }
}