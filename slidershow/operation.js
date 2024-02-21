class Operation {
    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
        this.global_shortcuts = this.globalInit()
        this.switches = this.switchesInit()
        this.general = this.generalInit()
        this.tagging = this.taggingInit()
        this.editing = this.editingInit()

        this.playback.hud.registerMenu()
    }

    _button(group_name) {
        const $group = $("<div/>", { "data-hotkey-group": group_name }).appendTo(this.playback.hud.$hud_menu)
        return ([hotkey, symbol, hint, fn, role = null]) => [hotkey,
            $("<button/>", { "title": hint, "data-hotkey": hotkey, "html": symbol, "data-role": role })
                .click(fn)
                .appendTo($group)[0]
        ]
    }

    taggingInit() {
        const pl = this.playback
        return wh.group("Tagging", [ // hotkey duplicates without GUI buttons
            ["Digit0", "Tag 0", () => pl.frame.set_tag(null)],
            ["Digit1", "Tag 1", () => pl.frame.set_tag(1)],
            ["Digit2", "Tag 2", () => pl.frame.set_tag(2)],
            ["Digit3", "Tag 3", () => pl.frame.set_tag(3)],
            ["Digit4", "Tag 4", () => pl.frame.set_tag(4)],
            ["Digit5", "Tag 5", () => pl.frame.set_tag(5)],
            ["Digit6", "Tag 6", () => pl.frame.set_tag(6)],
            ["Digit7", "Tag 7", () => pl.frame.set_tag(7)],
            ["Digit8", "Tag 8", () => pl.frame.set_tag(8)],
            ["Digit9", "Tag 9", () => pl.frame.set_tag(9)],
            ...[
                ["Alt+Shift+g", "🔀", "Group frames according to their tag", () => pl.group()],
                ["Numpad0", "⛔", "Tag 0", () => pl.frame.set_tag(null)],
                ["Numpad1", "1", "Tag 1", () => pl.frame.set_tag(1)],
                ["Numpad2", "2", "Tag 2", () => pl.frame.set_tag(2)],
                ["Numpad3", "3", "Tag 3", () => pl.frame.set_tag(3)],
                ["Numpad4", "4", "Tag 4", () => pl.frame.set_tag(4)],
                ["Numpad5", "5", "Tag 5", () => pl.frame.set_tag(5)],
                ["Numpad6", "6", "Tag 6", () => pl.frame.set_tag(6)],
                ["Numpad7", "7", "Tag 7", () => pl.frame.set_tag(7)],
                ["Numpad8", "8", "Tag 8", () => pl.frame.set_tag(8)],
                ["Numpad9", "9", "Tag 9", () => pl.frame.set_tag(9)],
                ["Alt+Numpad0", "10", "Tag 10", () => pl.frame.set_tag(10)],
                ["Alt+Numpad1", "11", "Tag 11", () => pl.frame.set_tag(11)],
                ["Alt+Numpad2", "12", "Tag 12", () => pl.frame.set_tag(12)],
                ["Alt+Numpad3", "13", "Tag 13", () => pl.frame.set_tag(13)],
                ["Alt+Numpad4", "14", "Tag 14", () => pl.frame.set_tag(14)],
                ["Alt+Numpad5", "15", "Tag 15", () => pl.frame.set_tag(15)],
                ["Alt+Numpad6", "16", "Tag 16", () => pl.frame.set_tag(16)],
                ["Alt+Numpad7", "17", "Tag 17", () => pl.frame.set_tag(17)],
                ["Alt+Numpad8", "18", "Tag 18", () => pl.frame.set_tag(18)],
                ["Alt+Numpad9", "19", "Tag 19", () => pl.frame.set_tag(19)]
            ].map(this._button("Tagging"))
        ]).toggle(pl.tagging_mode)
    }

    editingInit() {
        const pl = this.playback
        const cc = pl.changes
        return wh.group("Editing", [
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
            ["Alt+n", "➕", "Insert new frame", () => this.insertNewFrame()],
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
        ].map(this._button("Editing"))).toggle(pl.editing_mode)
    }

    generalInit() {
        const pl = this.playback
        return wh.group("General", [
            ["Ctrl+Space", "Play/Pause", () => { // undocumented
                pl.play_pause(!pl.moving)
            }],
            ...[
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
                }, "not-video"],
                ["ArrowRight", "▷", "Next step", () => pl.goNext(), "next-step not-video"],
                ["PageDown", "▷", "Next step", () => pl.goNext(), "next-step"],
                ["n", "▷", "Next step", () => pl.goNext(), "next-step"],
                ["Shift+PageDown", "▶", "Next frame", () => pl.nextFrame()],
                ["Alt+PageDown", "▶▶", "Next section", () => pl.nextSection()],
                ["End", "⏭", "Go to end", () => pl.goToFrame(pl.$articles.length - 1)],

                ["m", "🗺", "Toggle hud map", () => pl.hud_map.toggle(true), "not-video"],
                ["f", "ℹ", "Toggle file info", () => $("#hud-fileinfo").toggle()],
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
                }]
            ].map(this._button("General"))]).disable()
    }

    switchesInit() {
        const pl = this.playback
        return wh.group("Switches", [
            ["Ctrl+Alt+d", "Debug", () => { // undocumented
                const zoom = $main.css("zoom")
                $main.css({ "zoom": zoom == "1" ? "0.05" : "1" })
                pl.debug = !pl.debug
            }],
            ...[
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
                        pl.hud.thumbnails()
                    }
                    pl.hud.reset_grid()
                    if (pl.hud.grid_visible) {
                        pl.hud.grid()
                    }
                    pl.hud.info(`Editing mode ${pl.editing_mode ? "enabled" : "disabled."}`)
                    pl.session.store()
                }],
                ["Alt+t", "&#128204;", "Tagging mode", () => {
                    pl.tagging_mode = !pl.tagging_mode
                    // when there will be interfering shortcuts like numbers, we have retag the previous shortcuts
                    pl.operation.tagging.toggle(pl.tagging_mode)
                    pl.hud.reset_thumbnails()
                    if (pl.hud.thumbnails_visible) {
                        pl.hud.thumbnails()
                    }
                    if (pl.hud.grid_visible) {
                        pl.hud.reset_grid()
                    }
                    pl.hud.grid()
                    pl.hud.info(`Tagging mode ${pl.tagging_mode ? "enabled" : "disabled."}`)
                    pl.session.store()
                }]
            ].map(this._button("Switches"))
        ]).disable()
    }

    globalInit() {
        const menu = this.playback.menu
        return wh.group("Global", [
            ["Escape", "☰", "Show menu", () => this.playback.hud.$playback_icon.click()],
            ["Alt+m", "🧰", "Show splashscreen", () => menu.stop_playback()],
            ["Alt+w", "&#127916;", "Auxiliary window", () => menu.aux_window.open()],
            ['Ctrl+s', "&#128190;", "Export", () => menu.export.export_dialog()],
            ['F1', "&#9432;", "Help", () => menu.help()],
        ].map(this._button("Global")))
    }

    /**
     *
     * @param {jQuery} $root Frame to place the new frame after. Otherwise, playback.frame will be used.
     */
    insertNewFrame($root) {
        const pl = this.playback
        $root ??= pl.frame.$frame
        const $frame = $("<article/>").html("<h1>Title</h1><ul><li>contents</li></ul>")

        pl.changes.undoable("Insert new frame",
            () => {
                $frame.insertAfter($root)
                pl.reset()
                pl.goToArticle($frame)
            }, () => {
                $frame.remove()
                pl.reset()
                pl.goToArticle($root)
            })
    }

    /**
     * Appends a new section to the $main and write the default options as attributes.
     * @returns {jQuery} Section
     */
    insertNewSection() {
        const pl = this.playback
        const formData = new FormData($("#defaults")[0])
        formData.delete('path') // path does not belong to <section>
        const $section = $("<section/>", Object.fromEntries(formData)).appendTo($main)
        pl.changes.undoable("Insert new section",
            () => $section.appendTo($main),
            () => $section.detach(),
            () => pl.resetAndGo()
        )
        return $section
    }

    /**
     *
     * @param {number} frameIndex Initial frame
     * @param {number} rootIndex Target frame
     * @param {boolean} before Insert before or after the root frame
     * @returns
     */
    moveFrame(frameIndex, rootIndex, before) {
        if (frameIndex === rootIndex) {
            return
        }
        const pl = this.playback
        const $frame = $(pl.$articles[frameIndex])
        pl.changes.undoable("Move frame",
            () => $frame[before ? "insertBefore" : "insertAfter"](pl.$articles[rootIndex]),
            this.redoForMoving($frame),
            () => pl.resetAndGo()
        )
    }

    putFrameIntoSection(frameIndex, section) {
        const pl = this.playback
        const $frame = $(pl.$articles[frameIndex])
        pl.changes.undoable("Prepend to section",
            () => $frame.prependTo(section),
            this.redoForMoving($frame),
            () => pl.resetAndGo())
    }

    /**
     * @param {jQuery} $frame
     * @returns {function} Call to position the $frame to the previous location.
     */
    redoForMoving($frame) {
        return $frame.prev().length ?
            (root => () => $frame.insertAfter(root))($frame.prev())
            : (root => () => $frame.prependTo(root))($frame.parent())
    }

    /**
     *
     * @param {jQuery[]} frames Frames not yet inserted into the DOM.
     * @param {jQuery} $target Element to append the frames.
     * @param {boolean|string} before Boolean or "append". Inserted before or after the element or prepend to an element.
     * @returns
     */
    importFrames(frames, $target, before) {
        const pl = this.playback
        return pl.changes.undoable("Import files",
            () => $target[before === "prepend" ? "prepend" : before ? "before" : "after"](frames),
            () => frames.forEach($frame => $frame.detach()),
            () => pl.resetAndGo()
        )
    }
}
