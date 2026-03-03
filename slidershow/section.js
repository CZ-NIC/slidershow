// Group the frames to sections, ex. by tags
class SectionController {
    /**
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
    }

    getSectionName($section) {
        const name = $section.data("name")
        return `${name ? name + " " : ""}(${$section.children().length})`
    }

    getSubsectionCount($section) {
        return `(${$section.children("section").length})`
    }

    /**
     *
     * @param {?JQuery} $root Frame to place the new frame after. Otherwise, playback.frame will be used.
     */
    insertNewFrame($root = null) {
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
     * @param {JQuery<HTMLElement>} $supersection
     * @param {boolean} prepend
     * @returns {JQuery} Section
     */
    insertNewSection($supersection, prepend = false) {
        const pl = this.playback
        const formData = new FormData($("#defaults")[0])
        formData.delete('path') // path does not belong to <section>
        const $section = $("<section/>", Object.fromEntries(Array.from(formData)
            .map(([key, value]) => [`data-${key}`, value])
            .filter(([key, value]) => value !== '')))
            .appendTo($main)
        pl.changes.undoable("Insert new section",
            () => prepend ? $section.prependTo($supersection) : $section.appendTo($supersection),
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
        const name = $frame.data("frame").get_filename()
        pl.changes.undoable(`Move frame ${name}`,
            () => $frame[before ? "insertBefore" : "insertAfter"](pl.$articles[rootIndex]),
            this.redoForMoving($frame),
            () => pl.resetAndGo()
        )
    }

    putFrameIntoSection(frameIndex, section) {
        const pl = this.playback
        const $frame = $(pl.$articles[frameIndex])
        pl.changes.undoable(`Prepend to section ${this.getSectionName($(section))}`,
            () => $frame.prependTo(section),
            this.redoForMoving($frame),
            () => pl.resetAndGo())
    }

    /**
     * @param {JQuery} $frame
     * @returns {function} Call to position the $frame to the previous location.
     */
    redoForMoving($frame) {
        return $frame.prev().length ?
            (root => () => $frame.insertAfter(root))($frame.prev())
            : (root => () => $frame.prependTo(root))($frame.parent())
    }

    /**
     *
     * @param {JQuery[]} frames Frames not yet inserted into the DOM.
     * @param {JQuery} $target Element to append the frames.
     * @param {boolean|string} before Boolean or "prepend". Inserted before or after the element or prepend to an element.
     * @returns
     */
    importFrames(frames, $target, before) {
        const pl = this.playback
        return pl.changes.undoable(`Import files (${frames.length})`,
            () => $target[before === "prepend" ? "prepend" : before ? "before" : "after"](frames),
            () => frames.forEach($frame => $frame.detach()),
            () => pl.resetAndGo()
        )
    }

    deleteSection($section) {
        const pl = this.playback
        const $frames = $section.children(FRAME_SELECTOR)

        const $prev = $section.prev()
        const sectionReinsert = $prev.length ? [$prev, "after"] : [$section.parent(), "prepend"]

        pl.changes.undoable("Delete section " + pl.section_controller.getSectionName($section),
            () => $section.detach(),
            () => sectionReinsert[0][sectionReinsert[1]]($section),
            () => {
                pl.reset()
                const deletedIndices = $frames.map((_, el) => $(el).data("frame").index).get()
                const currentDetached = deletedIndices.includes(pl.frame.index) && !pl.frame.$frame.parent().length
                pl.goToFrame(
                    (currentDetached ?
                        $(pl.$articles[pl.frame.index] ?? pl.$articles[pl.$articles.length - 1]).data("frame")
                        : pl.frame)
                        .index)
            })
    }

    flattenSubsections($main) {
        const pl = this.playback
        const $subsections = $main.children("section")

        if (!$subsections.length) {
            pl.hud.info("No subsections to flatten")
            return
        }


        // Remember the original section position and contents
        const snapshots = $subsections.map((_, section) => {
            const $section = $(section)
            const $prev = $section.prev()
            const sectionReinsert = $prev.length ? [$prev, "after"] : [$section.parent(), "prepend"]
            const $children = $section.children()
            return { $section, sectionReinsert, $children }
        }).get()

        pl.changes.undoable("Flatten subsections " + pl.section_controller.getSubsectionCount($main),
            () => {
                snapshots.forEach(({ $section, $children }) => {
                    $section.before($children)  // move contents before the section
                    $section.detach()           // remove empty section
                })
            },
            () => {
                snapshots.forEach(({ $section, sectionReinsert, $children }) => {
                    sectionReinsert[0][sectionReinsert[1]]($section)  // restore section
                    $section.append($children)                         // restore its contents
                })
            },
            () => pl.reset()
        )
    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     * @param {"tags"|"hours"|"days"|"weeks"|"months"|"years"} criterion
    * @param {?JQuery<HTMLElement>} $frames If none, all frames are regrouped.
    */
    group(criterion = "tags", $frames = null) {
        const pl = this.playback
        /** @type {function[]} */
        const redos = []
        /** @type {JQuery[]} */
        const added = []

        if (!$frames) {
            $frames = pl.$articles
        }

        pl.changes.undoable(`Group ${$frames.length} frames by ${criterion}`,
            () => {
                redos.length = 0
                added.length = 0
                $frames.each((_, el) => {
                    const $frame = $(el)
                    /** @type {Frame} */
                    const frame = $frame.data("frame")

                    const name = criterion == "tags" ? frame.$actor.attr("data-tag") : this._toGroupKey(frame.$actor.data("datetime"), criterion)
                    if (!name) { // leave in the former section
                        return
                    }
                    redos.push(this.redoForMoving($frame))

                    // find or create section to put the frame to (to its end)
                    let $section = $(`section[data-name=${name}]`)
                    if (!$section.length) {
                        $section = $("<section/>", { "data-name": name }).prependTo($main)
                        added.push($section)
                    }
                    $frame.appendTo($section)
                })
                pl.positionFrames()
                pl.goToFrame(pl.$current.data("frame").index - 1) // keeps you on the same frame (works badly)
            },
            () => {
                redos.reverse().map(f => f())
                added.map(el => $(el).remove())
            },
            () => pl.resetAndGo()
        )
    }

    /**
     * @param {Date} date
     */
    _toWeekFormat(date) {
        const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);

        return `${tmp.getUTCFullYear()}-week${String(week).padStart(2, '0')}`;
    }

    /**
 * @param {string | number | Date} dateStr
 * @param {"hours"|"days"|"weeks"|"months"|"years"} granularity
 * @returns {string} Group key for the given granularity
 */
    _toGroupKey(dateStr, granularity) {
        const date = new Date(dateStr)
        if (isNaN(date)) return `unknown-${granularity}`

        switch (granularity) {
            case "hours": return date.toISOString().slice(0, 13)          // "2024-03-15T14"
            case "days": return date.toISOString().slice(0, 10)          // "2024-03-15"
            case "weeks": return this._toWeekFormat(date)                 // "2024-week11"
            case "months": return date.toISOString().slice(0, 7)           // "2024-03"
            case "years": return String(date.getFullYear())               // "2024"
        }
    }

}