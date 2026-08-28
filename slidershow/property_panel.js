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
        let original = $el.attr(`sli-${p}`)
        if (original !== undefined && PROP_NONSCALAR[p]) {
            original = JSON.parse(original)
        }
        const element_property = this.input(
            p, $el, name, original, type,
            prop(p, $el.parent()),
            v => {
                // v is "" when user deletes input
                // v is undefined when we undo a change and the original value was undefined
                //  (and not converted to the empty string via <input> value)
                if (v === "" || v === undefined) {
                    $el.removeAttr(`sli-${p}`)
                } else {
                    $el.attr(`sli-${p}`, v)
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
        return this._field(p, $el, name, value, placeholder, change, $("<input />").attr("type", type))
    }

    /**
     * Same as `input()` but multiline – for a property that is prose rather than a value (ex: notes).
     * @param {string} p Property name
     * @param {JQuery} $el Element the property belongs to
     * @param {string} value Initial value.
     * @param {string} placeholder HTML placeholder
     * @param {Function} change Callback applying (and reverting) the value on the DOM element.
     * @param {?string} help Tooltip; when null the <label> queries the docs like `input()` does.
     * @returns
     */
    textarea(p, $el, value, placeholder, change, help = null, rows = 5) {
        return this._field(p, $el, "", value, placeholder, change, $("<textarea/>").attr("rows", rows), help)
    }

    /**
     * The shared <label> + field + undo wiring behind `input()` and `textarea()`.
     * @param {JQuery} $field The bare, unconfigured field element.
     * @param {?string} help Tooltip; when null the <label> queries the docs.
     */
    _field(p, $el, name, value, placeholder, change, $field, help = null) {
        const pl = this.playback
        const original_frame = pl.frame.index


        if (value && PROP_NONSCALAR[p]) {
            value = JSON.stringify(value) // ex: step-points
        }

        const $label = $("<label/>", { "text": `${name ? " - " + name : p}: `, "title": help ?? this.hud.get_help(p, true, false) })
        if (help === null) {
            $label.on("click", () => this.hud.get_help(p))
        }

        return $.merge(
            $label,
            $field
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