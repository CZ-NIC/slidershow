// Group the frames to sections, ex. by tags
class SectionController {
    /**
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
    }

    /**
     * @param {JQuery} $section
     * @param {string} fallbackLabel Shown instead of a title when the section has none (ex. "Presentation" for <main>).
     * @returns {string} "‹title or fallback› (‹counts›)" – counts are "N sections, M frames" when the
     * section directly contains subsections, otherwise just the frame count.
     */
    getSectionName($section, fallbackLabel = "Section") {
        const title = $section.data("title") || $section.data("name")
        // Sections: only the direct subsections (the outline at this level). Frames: the TOTAL all the way
        // down (every frame in every nested subsection), so a header answers "how big is this group".
        const sectionCount = this.getDirectSections($section).length
        const frameCount = this.getTotalFrameCount($section)
        const counts = sectionCount
            ? `${sectionCount} section${sectionCount === 1 ? "" : "s"}, ${frameCount} frame${frameCount === 1 ? "" : "s"}`
            : String(frameCount)
        return `${title || fallbackLabel} (${counts})`
    }

    /**
     * @param {JQuery} $section
     * @returns {number} Every frame anywhere inside $section, recursively – across div wrappers AND nested
     * subsections. Plain find() (native querySelectorAll), fine even on large presentations.
     */
    getTotalFrameCount($section) {
        return $section.find(FRAME_TAGS).length
    }

    /**
     * @param {JQuery} $section
     * @returns {JQuery<HTMLElement>} <section>s "directly" inside $section – seeing through transparent
     * wrapper elements (any plain <div>, ex. a layout wrapper for centering, or a shared-duration group)
     * but not crossing another <section>/frame boundary. Single find() (native traversal), not manual
     * recursion.
     */
    getDirectSections($section) {
        return $section.find("section").filter((_, el) => $(el).parentsUntil($section, this._boundarySelector()).length === 0)
    }

    /**
     * @param {JQuery} $section
     * @returns {JQuery<HTMLElement>} Frames "directly" inside $section at this logical level – seeing
     * through transparent <div> wrappers (layout/shared-duration groups) but NOT descending into nested
     * <section>s (those own their frames). Mirror of getDirectSections; use it for section-level ops
     * (regroup, navigation) so a frame wrapped in a <div data-duration> is not overlooked.
     */
    getDirectFrames($section) {
        return $section.find(FRAME_TAGS).filter((_, el) => $(el).parentsUntil($section, "section").length === 0)
    }

    _boundarySelector() {
        return "section, " + FRAME_TAGS
    }

    getSubsectionCount($section) {
        return `(${this.getDirectSections($section).length})`
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

    /**
     * Clear every tag from all frames inside $section (recursively). One undoable for the whole batch.
     * @param {JQuery} $section A <section> or <main>.
     */
    untagAll($section) {
        const pl = this.playback
        const label = $section.is("main") ? "presentation" : this.getSectionName($section)
        /** @type {{frame: Frame, before: number[]}[]} Only frames that actually carry tags. */
        const tagged = $section.find(FRAME_TAGS).toArray()
            .map(el => $(el).data("frame"))
            .filter(frame => frame.get_tags().length)
            .map(frame => ({ frame, before: frame.get_tags() }))

        if (!tagged.length) {
            pl.hud.info("No tags to remove")
            return
        }

        pl.changes.undoable(`Untag ${tagged.length} frames in ${label}`,
            () => tagged.forEach(({ frame }) => frame.write_tags([])),
            () => tagged.forEach(({ frame, before }) => frame.write_tags(before))
        )
    }

    deleteSection($section) {
        const pl = this.playback
        // Every frame that disappears with the section – recursively, incl. nested subsections and
        // div-wrapped frames – so the post-delete navigation lands on a frame that still exists.
        const $frames = $section.find(FRAME_TAGS)

        const $prev = $section.prev()
        const $parent = $section.parent()

        pl.changes.undoable("Delete section " + pl.section_controller.getSectionName($section),
            () => $section.detach(),
            () => $prev.length ? $section.insertAfter($prev) : $section.prependTo($parent),
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
        const $subsections = this.getDirectSections($main)

        if (!$subsections.length) {
            pl.hud.info("No subsections to flatten")
            return
        }


        // Remember the original section position and contents
        const snapshots = $subsections.map((_, section) => {
            const $section = $(section)
            const $prev = $section.prev()
            const $parent = $section.parent()
            const reinsert = () => $prev.length ? $section.insertAfter($prev) : $section.prependTo($parent)
            const $children = $section.children()
            return { $section, reinsert, $children }
        }).get()

        pl.changes.undoable("Flatten subsections " + pl.section_controller.getSubsectionCount($main),
            () => {
                snapshots.forEach(({ $section, $children }) => {
                    $section.before($children)  // move contents before the section
                    $section.detach()           // remove empty section
                })
            },
            () => {
                snapshots.forEach(({ reinsert, $section, $children }) => {
                    reinsert()                    // restore section
                    $section.append($children)    // restore its contents
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
        /** @type {string[]} */
        const multiTagged = []
        /** @type {{el: HTMLElement, prev: ?Element}[]} Every section that existed before this regroup, with
         * its original preceding sibling – lets undo reattach the ones we emptied and revert the numeric sort. */
        let sectionsBefore = []

        if (!$frames) {
            $frames = pl.$articles
        }

        pl.changes.undoable(`Group ${$frames.length} frames by ${criterion}`,
            () => {
                redos.length = 0
                added.length = 0
                multiTagged.length = 0
                sectionsBefore = this.getDirectSections($main).toArray()
                    .map(el => ({ el, prev: el.previousElementSibling }))
                /** @type {JQuery} Catch-all for frames without a group key; reused across regroups so it never duplicates. */
                let $looseSection = this.getDirectSections($main).filter("[data-untagged]").first()
                $frames.each((_, el) => {
                    const $frame = $(el)
                    /** @type {Frame} */
                    const frame = $frame.data("frame")

                    let name, title
                    if (criterion == "tags") {
                        const tags = frame.get_tags()
                        name = tags[0]
                        title = name ? frame.tag_names()[name - 1] || null : null
                        if (tags.length > 1) {
                            multiTagged.push(`${frame.get_filename()} → ${tags.join(", ")}`)
                        }
                    } else {
                        name = this._toGroupKey(prop("datetime", frame.$actor), criterion)
                        title = name
                    }
                    if (!name) {
                        // No group key (untagged, ex. cleared with "0", or no datetime): collect every such
                        // frame into a single catch-all section. Previously only frames sitting loose directly
                        // under <main> were gathered, so photos untagged inside an existing section stayed
                        // scattered there after a regroup; now they all land in one place.
                        redos.push(this.redoForMoving($frame))
                        if (!$looseSection.length) {
                            $looseSection = $("<section/>", { "data-untagged": "", "data-title": "untagged" }).appendTo($main)
                            added.push($looseSection)
                        }
                        $frame.appendTo($looseSection)
                        return
                    }
                    redos.push(this.redoForMoving($frame))

                    // find or create section to put the frame to (to its end)
                    // quoted + escaped: a hand-authored tag may contain spaces or quotes
                    let $section = $(`section[data-name="${String(name).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`)
                    if (!$section.length) {
                        $section = $("<section/>", { "data-name": name }).prependTo($main)
                        added.push($section)
                    }
                    // data-title is the resolved display label (ex. a tag's name) at grouping time, kept
                    // separate from data-name (the stable key sections are matched/reused by) – renaming
                    // a tag later only refreshes data-title on the next regroup, data-name never changes.
                    if (title) {
                        $section.attr("data-title", title)
                    } else {
                        $section.removeAttr("data-title")
                    }
                    $frame.appendTo($section)
                })
                // Drop sections this regroup emptied out (frames all moved elsewhere), so no ghost zero-frame
                // sections linger. Kept in `sectionsBefore`, so undo reattaches them.
                this.getDirectSections($main).filter((_, sec) => !$(sec).find(FRAME_TAGS).length).detach()
                if (criterion == "tags") {
                    // Order the resulting sections by tag number (1, 2, 3…) instead of by the order frames
                    // happened to appear; the untagged catch-all (no numeric name) sinks to the end.
                    this.getDirectSections($main).toArray()
                        .sort((a, b) => this._tagSortKey(a) - this._tagSortKey(b))
                        .forEach(section => $(section).parent().append(section))
                }
                pl.positionFrames()
                pl.goToFrame(pl.$current.data("frame").index - 1) // keeps you on the same frame (works badly)
                if (multiTagged.length) {
                    pl.hud.ok("Group by tags", `${multiTagged.length} frames have more than one tag — grouped by the first one only:<br>${multiTagged.slice(0, 5).join("<br>")}`)
                }
            },
            () => {
                // Restore each pre-existing section to its original position first (reattaches the ones we
                // emptied, reverts the numeric sort), so frames can then move back into containers that exist.
                sectionsBefore.forEach(({ el, prev }) =>
                    prev && prev.parentNode ? prev.after(el) : $main[0].prepend(el))
                redos.reverse().map(f => f())
                added.map(el => $(el).remove())
            },
            () => pl.resetAndGo()
        )
    }

    /**
     * @param {HTMLElement} section
     * @returns {number} Numeric sort key from a section's data-name (a tag number). Non-numeric names
     * (ex. the nameless untagged catch-all) sort to the end.
     */
    _tagSortKey(section) {
        const n = parseFloat($(section).attr("data-name"))
        return isNaN(n) ? Infinity : n
    }

    /**
     * Sort sections inside <main> alphabetically by their data-name attribute
     */
    sortSections(order = "asc") {
        const pl = this.playback

        let originalOrder
        pl.changes.undoable(`Sort sections alphabetically`,
            () => {
                // Save original order for undo
                originalOrder = this.getDirectSections($main).map((_, el) => el).get()

                // Sort sections alphabetically by data-name
                const sorted = originalOrder.slice().sort((a, b) => {
                    const nameA = ($(a).attr("data-name") || "").toLowerCase()
                    const nameB = ($(b).attr("data-name") || "").toLowerCase()
                    return order === "asc"
                        ? nameA.localeCompare(nameB)
                        : nameB.localeCompare(nameA)
                })

                // Re-append in sorted order (preserving articles inside). Appending to each section's own
                // current parent – not unconditionally $main – keeps it inside whatever wrapper div it
                // actually lives in (ex. a layout wrapper around all sections).
                sorted.forEach(section => $(section).parent().append(section))
            },
            () => {
                // Undo: restore original order
                originalOrder.forEach(section => $(section).parent().append(section))

            },
            () => {
                pl.positionFrames()
                pl.goToFrame(pl.$current.data("frame").index - 1)
                pl.resetAndGo()
            }
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