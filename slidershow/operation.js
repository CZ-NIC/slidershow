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
                [["Numpad0", "Digit0"], "⛔", "Tag 0", () => pl.frame.set_tag(null)],
                [["Numpad1", "Digit1"], "1", "Tag 1", () => pl.frame.set_tag(1)],
                [["Numpad2", "Digit2"], "2", "Tag 2", () => pl.frame.set_tag(2)],
                [["Numpad3", "Digit3"], "3", "Tag 3", () => pl.frame.set_tag(3)],
            ],
            [
                ["Pojmenovat tagy…", () => this._nameTagsDialog(), () => true, "Name tags"],
                ["Filtrovat grid podle tagu…", () => this._filterGridDialog(), () => true, "Filter grid by tag"],
            ]).toggle(pl.tagging_mode)
    }

    /**
     * Prompt for a tag number to show alone in the grid (non-destructive album preview); empty clears the filter.
     */
    _filterGridDialog() {
        const pl = this.playback
        const current = pl.hud.grid.filterTag
        new $.Zebra_Dialog("Tag number to show in the grid, empty to show all", {
            title: "Filtrovat grid podle tagu",
            type: "prompt",
            default_value: current == null ? "" : String(current),
            buttons: ["Cancel", {
                caption: "Ok",
                default_confirmation: true,
                callback: (_, value) => {
                    const tag = value ? Number(value) : null
                    pl.hud.grid.setFilter(Number.isFinite(tag) ? tag : null)
                }
            }]
        })
    }

    /**
     * Prompt for the tag names list (`<main data-tag-names="rodiče,vedoucí">`), undoable.
     */
    _nameTagsDialog() {
        const pl = this.playback
        const current = ($main.attr("data-tag-names") || "").split(",").join(", ")
        new $.Zebra_Dialog("Tag names, comma separated, position = digit 1, 2, …", {
            title: "Pojmenovat tagy",
            type: "prompt",
            default_value: current,
            buttons: ["Cancel", {
                caption: "Ok",
                default_confirmation: true,
                callback: (_, value) => {
                    const names = (value || "").split(",").map(s => s.trim()).filter(Boolean).join(",")
                    const before = $main.attr("data-tag-names") || ""
                    pl.changes.undoable("Name tags",
                        () => $main.attr("data-tag-names", names),
                        () => before ? $main.attr("data-tag-names", before) : $main.removeAttr("data-tag-names"))
                }
            }]
        })
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
                ["Historie notifikací", () => pl.hud.show_notification_history(), () => true, "Notification history"],
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
            ['F1', "&#9432;", "Help", () => menu.help()],
        ])
    }
}
