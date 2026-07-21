class Operation {
    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
        this.global_shortcuts = this.globalInit()
        this.switches = this.switchesInit()
        this.playthrough = this.playthroughInit()
        this.general = this.generalInit()
        this.tagging = this.taggingInit()
        this.editing = this.editingInit()
        this.media = this.mediaInit()
        this.properties = this.propertiesInit()
        this.grid = this.gridInit()

        this.playback.hud.registerMenu()
    }

    /**
     * @param {string} group_name
     * @returns {function} Will create the button and return values suitable for a Hotkey
     */
    _button(group_name) {
        const $group = $("<div/>", { "data-hotkey-group": group_name }).appendTo(this.playback.hud.$hud_menu)
        /**@param {Button} button */
        return ([hotkey, symbol, hint, fn, role = null]) => [hotkey,
            $("<button/>", { "title": hint, "data-hotkey": hotkey, "html": symbol, "data-role": role })
                .on("click", fn)
                .appendTo($group)[0]
        ]
    }

    /**
     *
     * @typedef {[hotkey: string|string[], symbol: string, hint: string, fn: Function, role?: string|null]} Button
     * @typedef {[hotkey: string|string[], hint: string, fn: Function]} Shortcut
     * @typedef {[hint: string, fn: Function, isEnabled: Function, group_name: string]} Command
     *
     * Register a shortcut in the command palette, as hotkeys, and possibly as a GUI button
     *
     * @param {string} group_name
     * @param {?Shortcut[]} shortcuts Shortcuts without a GUI button
     * @param {Button[]} buttons Shortcuts with a GUI button.
     * @param {?Command[]} commands Commands without shortcuts.
     * @returns
     */
    _group(group_name, shortcuts, buttons, commands = null) {
        if (!shortcuts) {
            shortcuts = []
        } else {
            // separate shortcuts with multiple hotkeys into two shortcuts
            shortcuts = shortcuts.flatMap(shortcut => {
                const [hotkey, hint, fn] = shortcut
                if (Array.isArray(hotkey)) {
                    return hotkey.map(hk => [hk, hint, fn])
                }
                return [shortcut]
            })
        }

        // separate buttons with multiple hotkeys:
        // first hotkey will become button, other shortcuts
        // Ex. ['/', '?'] -> Button with '/', alternate shortcut with '/'
        const normalizedButtons = buttons.map(button => {
            const [hotkey, symbol, hint, fn, role = null] = button
            if (Array.isArray(hotkey)) {
                const [primaryHotkey, ...otherHotkeys] = hotkey
                otherHotkeys.forEach(hk => shortcuts.push([hk, hint, fn]))
                return [primaryHotkey, symbol, hint, fn, role]
            }
            return button
        })

        const group = wh.group(group_name, normalizedButtons.map(this._button(group_name)))
        if (shortcuts.length) {
            wh.group(group_name, shortcuts)
        }
        for (const hotkey of group) {
            const callback = hotkey.element ? () => hotkey.element.click() : hotkey.action
            this.playback.hud.palette.register(hotkey.hint, callback, () => hotkey.enabled, hotkey.getClue(), group_name)
        }
        for (const cmd of commands || []) {
            this.playback.hud.palette.register(cmd[0], cmd[1], cmd[2], null, group_name + " > " + cmd[3])
        }
        return group
    }

    taggingInit() {
        const pl = this.playback
        return this._group("Tagging", [
            [["Numpad4", "Digit4"], "Tag 4", () => pl.frame.set_tag(4)],
            [["Numpad5", "Digit5"], "Tag 5", () => pl.frame.set_tag(5)],
            [["Numpad6", "Digit6"], "Tag 6", () => pl.frame.set_tag(6)],
            [["Numpad7", "Digit7"], "Tag 7", () => pl.frame.set_tag(7)],
            [["Numpad8", "Digit8"], "Tag 8", () => pl.frame.set_tag(8)],
            [["Numpad9", "Digit9"], "Tag 9", () => pl.frame.set_tag(9)],
            ["Alt+Numpad0", "Tag 10", () => pl.frame.set_tag(10)],
            ["Alt+Numpad1", "Tag 11", () => pl.frame.set_tag(11)],
            ["Alt+Numpad2", "Tag 12", () => pl.frame.set_tag(12)],
            ["Alt+Numpad3", "Tag 13", () => pl.frame.set_tag(13)],
            ["Alt+Numpad4", "Tag 14", () => pl.frame.set_tag(14)],
            ["Alt+Numpad5", "Tag 15", () => pl.frame.set_tag(15)],
            ["Alt+Numpad6", "Tag 16", () => pl.frame.set_tag(16)],
            ["Alt+Numpad7", "Tag 17", () => pl.frame.set_tag(17)],
            ["Alt+Numpad8", "Tag 18", () => pl.frame.set_tag(18)],
            ["Alt+Numpad9", "Tag 19", () => pl.frame.set_tag(19)],
        ],
            [
                ["Alt+Shift+g", "🔀", "Group frames according to their tag", () => pl.section_controller.group()],
                ["Alt+Shift+t", "🏷", "Name tags…", () => this._nameTagsDialog()],
                [["Numpad0", "Digit0"], "⛔", "Tag 0", () => pl.frame.set_tag(null)],
                [["Numpad1", "Digit1"], "1", "Tag 1", () => pl.frame.set_tag(1)],
                [["Numpad2", "Digit2"], "2", "Tag 2", () => pl.frame.set_tag(2)],
                [["Numpad3", "Digit3"], "3", "Tag 3", () => pl.frame.set_tag(3)],
            ],
            [
                ["Filter by tag…", () => this._filterByTagDialog(), () => true, "Filter by tag"],
            ]).toggle(pl.tagging_mode)
    }

    /**
     * Suspend every hotkey group while a Zebra_Dialog with its own inputs/checkboxes is open.
     * WebHotkeys deliberately lets single-char keys (Space, digits, letters…) through when a checkbox
     * is focused (it only special-cases text inputs/contenteditable) – without this, Space would toggle
     * "Next frame" instead of the checkbox, and non-text hotkeys like Alt+combos fire even while typing
     * in a text field. Pass the returned resume() as the dialog's `onClose` (fires on every close path –
     * Ok, Cancel, the × button, Escape).
     * @returns {function(): void}
     */
    suspendHotkeys() {
        const groups = [this.global_shortcuts, this.switches, this.playthrough, this.general,
            this.tagging, this.editing, this.media, this.properties, this.grid]
        const wasEnabled = groups.map(g => g.some(h => h.enabled))
        groups.forEach(g => g.disable())
        return () => groups.forEach((g, i) => wasEnabled[i] && g.enable())
    }

    /**
     * Enter confirms the dialog (clicks its "Ok" button) even when focus is on a checkbox. Zebra_Dialog's
     * own Enter-confirms-default-button wiring listens for `keypress`, which browsers don't reliably fire
     * for Enter while a checkbox is focused (unlike a text input) – `keydown` always fires.
     * @param {JQuery} $container The dialog's inline content (passed as `source: {inline: ...}`).
     */
    _confirmOnEnter($container) {
        $container.on("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault()
                $container.closest(".ZebraDialog").find("a").filter((_, el) => $(el).text().trim() === "Ok").trigger("click")
            }
        })
    }

    /**
     * Arrow Up/Down move focus between `selector` elements inside $container – dialog rows are plain
     * <label> wrappers (not a native <select>/radio-group), so the browser gives no such navigation for free.
     * @param {JQuery} $container
     * @param {string} selector
     */
    _arrowNavigate($container, selector) {
        $container.on("keydown", e => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
                return
            }
            const $items = $container.find(selector)
            const i = $items.index(document.activeElement)
            if (i === -1) {
                return
            }
            e.preventDefault()
            $items.eq((i + (e.key === "ArrowDown" ? 1 : -1) + $items.length) % $items.length).focus()
        })
    }

    /**
     * All tag digits currently applied to at least one frame, ascending.
     * @returns {number[]}
     */
    _usedTags() {
        const set = new Set()
        this.playback.$articles.each((_, el) => $(el).data("frame").get_tags().forEach(t => set.add(t)))
        return [...set].sort((a, b) => a - b)
    }

    /**
     * Number of frames carrying each tag digit.
     * @returns {Map<number, number>}
     */
    _tagCounts() {
        const counts = new Map()
        this.playback.$articles.each((_, el) =>
            $(el).data("frame").get_tags().forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
        return counts
    }

    /**
     * Checkbox list (one per used tag) to show only frames carrying any of the checked tags (OR) –
     * applies to both the grid and normal navigation, see Playback.set_tag_filter. A "Clear filter"
     * button resets it; the small icon next to the frame counter does the same in one click.
     */
    _filterByTagDialog() {
        const pl = this.playback
        const usedTags = this._usedTags()
        if (!usedTags.length) {
            pl.hud.ok("Filter by tag", "No tags are used yet.")
            return
        }
        const names = pl.frame.tag_names()
        const $list = $("<div/>", { class: "tag-filter-list" })
        usedTags.forEach(t => {
            const label = names[t - 1] ? `${names[t - 1]} (${t})` : String(t)
            $("<label/>").append(
                $("<input/>", { type: "checkbox", value: t, checked: pl.tag_filter.includes(t) }),
                document.createTextNode(" " + label)
            ).appendTo($list)
        })

        this._confirmOnEnter($list)
        this._arrowNavigate($list, "input[type=checkbox]")

        new $.Zebra_Dialog({
            message: "Show only frames carrying any of the checked tags:",
            source: { inline: $list },
            type: "question",
            title: "Filter by tag",
            onClose: this.suspendHotkeys(),
            buttons: [
                { caption: "Clear filter", callback: () => pl.set_tag_filter([]) },
                "Cancel",
                {
                    caption: "Ok",
                    default_confirmation: true,
                    callback: () => pl.set_tag_filter($("input:checked", $list).map((_, el) => Number($(el).val())).get())
                }
            ]
        })
        $("input", $list).first().focus()
    }

    /**
     * Column of number+name inputs (`<main data-tag-names="rodiče,vedoucí">`), undoable. Rows cover every
     * currently used tag and every already-named tag, so a name is never silently dropped.
     */
    _nameTagsDialog() {
        const pl = this.playback
        const existing = ($main.attr("data-tag-names") || "").split(",")
        const counts = this._tagCounts()
        const maxTag = Math.max(9, existing.length, ...this._usedTags())
        const $list = $("<div/>", { class: "tag-names-list" })
        for (let t = 1; t <= maxTag; t++) {
            const count = counts.get(t) || 0
            $("<label/>").append(
                document.createTextNode(t + ": "),
                $("<input/>", { type: "text", value: existing[t - 1] || "" }),
                $("<span/>", { class: "tag-count", text: count ? ` (${count})` : "" })
            ).appendTo($list)
        }

        const apply = () => {
            const names = $("input", $list).map((_, el) => String($(el).val()).trim()).get()
            while (names.length && !names[names.length - 1]) {
                names.pop() // trim trailing empty rows
            }
            // / \ and , break the comma-joined data-tag-names storage; : & and + break the #hash=state
            // encoding (tag-names:a+b, key:value pairs split on ":", entries split on "&"/",").
            const invalid = names.filter(n => /[/\\,:&+]/.test(n))
            if (invalid.length) {
                pl.hud.ok("Name tags", `Remove / \\ , : & or + from: ${invalid.join(", ")}.`)
                return
            }
            const value = names.join(",")
            const before = $main.attr("data-tag-names") || ""
            const key = "TAG-NAMES: " + docname()
            pl.changes.undoable("Name tags",
                () => {
                    $main.attr("data-tag-names", value)
                    value ? localStorage.setItem(key, value) : localStorage.removeItem(key)
                    prop_invalidate()
                },
                () => {
                    if (before) {
                        $main.attr("data-tag-names", before)
                        localStorage.setItem(key, before)
                    } else {
                        $main.removeAttr("data-tag-names")
                        localStorage.removeItem(key)
                    }
                    prop_invalidate()
                })
        }
        this._confirmOnEnter($list)

        new $.Zebra_Dialog({
            message: "Name your tags (position = digit):",
            source: { inline: $list },
            type: "question",
            title: "Name tags",
            onClose: this.suspendHotkeys(),
            buttons: ["Cancel", {
                caption: "Ok",
                default_confirmation: true,
                callback: apply
            }]
        })
        $("input", $list).first().focus()
    }

    editingInit() {
        const pl = this.playback
        const cc = pl.changes
        return this._group("Editing", null, [
            ["Alt+d", "🐐🐐", "Duplicate frame", () => {
                const f = pl.frame
                f.leave() // assure the frame is fully unloaded so that we do not inherit ex: common wzoom object
                f.left()
                f.unload()
                const $root = f.$frame
                const $frame = f.$frame.clone()

                cc.undoable("Duplicating frame",
                    () => {
                        $frame.insertAfter($root)
                        pl.reset()
                        pl.goToArticle($frame)
                    }, () => {
                        $frame.remove()
                        pl.reset()
                        pl.goToArticle($root)
                    })
            }],
            ["Alt+n", "➕", "Insert new frame", () => pl.section_controller.insertNewFrame()],
            ["Enter", "📑", "Insert new &lt;li&gt;", () => {
                const $el = pl.getFocused()
                if ($el) {
                    if (!$el.attr("contenteditable")) {
                        return false
                    }
                    const $new = $("<li/>").attr("contenteditable", true)
                    cc.undoable("Inserted new &lt;li&gt;",
                        () => $new.insertAfter($el).focus(),
                        () => $new.detach() && $el.focus()
                    )
                } else {
                    return false
                }
            }],
            ["Shift+Delete", "❌", "Remove element even if not empty", () => {
                const $el = pl.getFocused()
                if ($el) {
                    $el.next().focus()
                    const $parent = $el.parent()
                    const originalIndex = $el.index()

                    cc.undoable("Deleted item " + $el.text().substring(0, 10),
                        () => $el.hide(cc.HIDE_DURATION, () => $el.detach()),
                        () => {
                            pl.goToArticle($parent.closest(FRAME_SELECTOR))
                            pl.promise.then(() => {
                                const $position = $parent.children().eq(originalIndex)
                                const $inserted = $position.length ? $el.insertBefore($position) : $el.appendTo($parent)
                                $inserted.show(cc.HIDE_DURATION).focus()
                            })
                        })
                } else {
                    pl.shake()
                }
            }],
            ["Delete", "❎", "Remove element", () => {
                const $el = pl.getFocused()
                if ($el?.text().trim() === "") {
                    wh.simulate("Shift+Delete")
                } else if (!$el) { // Removing frame
                    pl.frame.delete()
                }
            }],
            ["Escape", "✔️", "Stop editing", () => $(":focus").blur(), "stop-editing"]
        ]).toggle(pl.editing_mode)
    }

    playthroughInit() {
        const pl = this.playback
        return this._group("Playthrough", [
            ["Ctrl+Space", "Play/Pause", () => { // undocumented
                pl.play_pause(!pl.moving)
            }]],
            [
                ["Home", "⏮", "Go to the first", () => pl.goToFrame(0)],
                ["Alt+PageUp", "◀◀", "Prev section", () => pl.previousSection()],
                ["Shift+PageUp", "◀", "Prev frame", () => pl.previousFrame()],
                ["p", "◁", "Prev step", () => pl.goPrev(), "prev-step"],
                ["PageUp", "◁", "Prev step", () => pl.goPrev(), "prev-step"],
                ["ArrowLeft", "◁", "Prev step", () => pl.goPrev(), "prev-step not-video"],
                ["Space", "⏯", "Next", () => {
                    if (pl.frame.$actor.is(':animated')) { // skips the panorama
                        pl.frame.$actor.finish()
                    } else if (!pl.frame.getDuration()) { // the frame would stay indefinitely, go straight further
                        pl.goNext()
                    } else { // toggle play and pause
                        pl.play_pause(!pl.moving)
                    }
                }, "not-video mobile"],
                ["Shift+Alt+f", "⌚", "Set auto-forward", () => {
                    const durMain = prop("duration", $main)
                    const dur = pl.frame.getDuration()
                    let text = "How many seconds to auto-forward?"
                    if (durMain !== undefined) {
                        text += ` Current is ${durMain} s.`
                    }
                    if (dur && dur !== durMain) {
                        text += ` But current frame inherits ${dur} s.`
                    }
                    text += "<small><br>Note: this sets the `duration` property of the MAIN. Use properties panel (Alt+P) to configure sections etc.</small>"
                    new $.Zebra_Dialog(text, {
                        title: "Set auto-forward",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, seconds) => {
                                // If playback was moving, no icon would be displayed.
                                // If not, this icon will be replaced by pl.play_pause internally.
                                pl.hud.playback_icon(`▶`)
                                $main.attr("data-duration", parseFloat(seconds))
                                pl.goNext()
                            }
                        }]
                    })
                }],
                ["ArrowRight", "▷", "Next step", () => pl.goNext(), "next-step not-video"],
                ["PageDown", "▷", "Next step", () => pl.goNext(), "next-step"],
                ["n", "▷", "Next step", () => pl.goNext(), "next-step"],
                ["Shift+PageDown", "▶", "Next frame", () => pl.nextFrame()],
                ["Alt+PageDown", "▶▶", "Next section", () => pl.nextSection()],
                ["End", "⏭", "Go to end", () => pl.goToFrame(pl.$articles.length - 1)],
            ]).disable()
    }

    generalInit() {
        const pl = this.playback
        return this._group("General", null,
            [
                ["m", "🗺", "Toggle hud map", () => pl.hud_map.toggle(true), "not-video mobile"],
                ["i", "ℹ", "Toggle file info", () => $("#hud-fileinfo").toggle(), "mobile"],
                ["z", "🔍", "Photo or video zoom (cycle)", () => zoom()],
                ["Shift+z", "🔍", "Photo or video little zoom in", () => zoom(true), "magnify-little"],
                ["Shift+x", "🔎", "Photo or video little zoom out", () => zoom(-1), "magnify-little"],
                ["Shift+Alt+z", "🔎", "Zoom out", () => zoom(false), "crossed"],
                ["Alt+g", "⇗", "Go to frame", () => {
                    new $.Zebra_Dialog(`You are now at ${pl.frame.slide_index + 1} / ${pl.slide_count}`, {
                        title: "Go to slide number",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, slide_number) => pl.goToSlide(slide_number)
                        }]
                    })
                }],
                // Sets the same `data-rotate` property the Properties panel would set on <main> – every
                // frame's actor inherits it (prop() cascade) and rotates itself the same way "Rotate right
                // 90°" rotates a single photo, zoom-compensated. Refresh the current one right away; frames
                // navigated to afterwards pick it up on their own via Frame.prepare() → refresh_actor().
                ["Alt+r", "🔄", "Rotate whole view 90°", () => {
                    const old = Number($main.attr("data-rotate")) || 0
                    $main.attr("data-rotate", (old + 90) % 360)
                    pl.frame.refresh_actor("rotate")
                }, "mobile"],
            ],
            [
                ["Notification history", () => pl.hud.show_notification_history(), () => true, "Notification history"],
            ]).disable()

        function zoom(little) {
            const wzoom = pl.frame.$actor?.data("wzoom")
            if (little === true) {
                wzoom.zoomUp()
            } else if (little === -1) {
                wzoom.zoomDown()
            } else if (little === false) {
                wzoom.maxZoomDown()
            } else if (wzoom) { // zoom several times, then unzoom
                if (wzoom.content.currentScale <= 8) {
                    wzoom.maxZoomUp()
                } else {
                    wzoom.maxZoomDown()
                }
            }
        }
    }

    mediaInit() {
        const pl = this.playback
        return this._group("Media", null,
            [
                ["NumpadAdd", "🐰", "Faster video", () => playback_change(0.1), "only-video"],
                ["NumpadSubtract", "🐢", "Slower video", () => playback_change(-0.1), "only-video"],
                ["Alt+m", "🔇", "Toggle muted", () => {
                    act().trigger('actor.slidershow', { muted: act()[0].muted = !act()[0].muted })
                }, "only-video"],
                ["Shift+r", "⤿", "Rotate left", () => rotate(-5)],
                ["Shift+Alt+r", "⤾", "Rotate right", () => rotate(5)],
                ["r", "⊾", "Rotate right 90°", () => rotate(90)],
            ]).disable()

        function act() {
            return pl.frame.$actor
        }

        function playback_change(step) {
            const r = act()[0].playbackRate = Math.round((act()[0].playbackRate + step) * 10) / 10
            pl.hud.playback_icon(r + " ×")
            act().trigger('actor.slidershow', { rate: r })
        }

        function rotate(deg) {
            const old = prop("rotate", act(), null, null, true)
            const val = old + deg
            act().attr("data-rotate", val % 360)
            pl.frame.refresh_actor("rotate", old)
        }
    }

    propertiesInit() {
        const pl = this.playback
        return this._group("Properties", null,
            [
                // NOTE: If you change the frame with the property panel closed,
                // the shortcut still triggers the button on the old frame
                // causing the browser to go back and register unzoomed position as a data-point.
                ["Alt+s", "📸", "Add step point", () =>
                    $(".hud-point", pl.hud.$hud).eq(1).trigger("click")
                ],
            ]).disable()
    }

    gridInit() {
        const pl = this.playback
        return this._group("Grid", [
            ["Enter", "Enter the frame (hides the grid)", () => this.playback.hud.toggle_grid()],

            // NOTE we may implement selections. In that case, these shortcuts should be hidden or moved to a command palette. Too much of them!
            // ["Shift+ArrowRight", "select right", "Add right frame to selection", () => pl.section_controller.moveFrame(pl.index, pl.index+1, false)],
            ["Ctrl+ArrowUp", "Move up", () => pl.section_controller.moveFrame(pl.index, pl.hud.grid.getFrameIndexInNextRow(-1), true)],
            ["Ctrl+ArrowDown", "Move down", () => pl.section_controller.moveFrame(pl.index, pl.hud.grid.getFrameIndexInNextRow(1), false)],
            ["Ctrl+ArrowLeft", "Move left", () => pl.section_controller.moveFrame(pl.index, pl.index - 1, true)],
            ["Ctrl+ArrowRight", "Move right", () => pl.section_controller.moveFrame(pl.index, pl.index + 1, false)],

            ["ArrowUp", "Go up", () => pl.goToFrame(pl.hud.grid.getFrameIndexInNextRow(-1))],
            ["ArrowDown", "Go down", () => pl.goToFrame(pl.hud.grid.getFrameIndexInNextRow(1))],
            ["ArrowLeft", "Go left", () => pl.previousFrame()], // normally, left arrow triggers next step but this would block the grid, we need next frame
            ["ArrowRight", "Go right", () => pl.nextFrame()],

            ["PageUp", "Page up", () => pl.goToFrame(pl.hud.grid.getFrameIndexInNextPage(-1))],
            ["PageDown", "Page down", () => pl.goToFrame(pl.hud.grid.getFrameIndexInNextPage(1))],
        ],
            [
                ["Alt+?", "✥", "Navigation help", () =>
                    new $.Zebra_Dialog("Use arrows to navigate.<br>Ctrl+Arrow to move.<br>PageUp/Down.<br>Home/End.<br>Enter to access the frame.", {
                        title: "Grid navigation help",
                        buttons: false
                    })],
                ["NumpadAdd", "+", "More thumbnails on a row", () => pl.hud.grid.changeColumnsCount(1)],
                ["NumpadSubtract", "-", "Less thumbnails on a row", () => pl.hud.grid.changeColumnsCount(-1)],

            ], pl.hud.grid.getHotkeys()).disable()
    }

    switchesInit() {
        const pl = this.playback
        return this._group("Switches", [
            ["Ctrl+Alt+d", "Debug", () => { // undocumented
                const zoom = $main.css("zoom")
                $main.css({ "zoom": zoom == "1" ? "0.05" : "1" })
                pl.debug = !pl.debug
            }]],
            [
                ["Ctrl+Alt+z", "⟲", "Undo change", () => pl.changes.undo(), "undo"],
                ["Ctrl+Alt+Shift+z", "⟳", "Redo change", () => pl.changes.redo(), "redo"],
                ["j", "&#127895;", "Thumbnails", () => pl.hud.toggle_thumbnails()],
                ["g", "&#119584;", "Grid", () => pl.hud.toggle_grid()],
                ["Alt+p", "&#127920;", "Properties", () => pl.hud.toggle_properties()],
                ["Ctrl+Alt+s", "&#128095;", "Steps", () => pl.toggle_steps()],
                ["Alt+e", "&#9998;", "Editing mode", () => {
                    pl.editing_mode = !pl.editing_mode
                    // when there will be interfering shortcuts like numbers, we have retag the previous shortcuts
                    pl.operation.editing.toggle(pl.editing_mode)
                    pl.editing_mode ? pl.frame.make_editable() : pl.frame.unmake_editable()
                    pl.hud.reset_thumbnails()
                    if (pl.hud.thumbnails_visible) {
                        pl.hud.display_thumbnails()
                    }
                    pl.hud.reset_grid()
                    pl.hud.info(`Editing mode ${pl.editing_mode ? "enabled" : "disabled."}`)
                    pl.session.store()
                }],
                ["Alt+t", "&#128204;", "Tagging mode", () => {
                    pl.tagging_mode = !pl.tagging_mode
                    // when there will be interfering shortcuts like numbers, we have retag the previous shortcuts
                    pl.operation.tagging.toggle(pl.tagging_mode)
                    pl.hud.reset_thumbnails()
                    if (pl.hud.thumbnails_visible) {
                        pl.hud.display_thumbnails()
                    }
                    pl.hud.reset_grid()
                    pl.hud.info(`Tagging mode ${pl.tagging_mode ? "enabled" : "disabled."}`)
                    pl.session.store()
                }]
            ]).disable()
    }

    globalInit() {
        const menu = this.playback.menu
        return this._group("Global", null, [
            ["Escape", "☰", "Toggle menu", () => this.playback.hud.toggleMenu()],
            [["/", "?"], "🎨", "Command palette", () => this.playback.hud.palette.focus()],
            ["Alt+m", "🧰", "Show splashscreen", () => menu.stop_playback()],
            ["Alt+w", "&#127916;", "Auxiliary window", () => menu.aux_window.open()],
            ['Ctrl+s', "&#128190;", "Export", () => menu.export.export_dialog()],
            ['Ctrl+Shift+s', "&#128193;", "Export albums to folders…", () => menu.export.export_albums_dialog()],
            ['F1', "&#9432;", "Help", () => menu.help()],
        ])
    }
}
