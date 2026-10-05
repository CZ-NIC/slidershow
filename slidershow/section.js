/**
 * How frames are split into sections. "folder"/"camera" and the date granularities are also offered at
 * import time (see the "Group by" select in the append panel and `Menu.appendFiles()`).
 * @typedef {"tags"|"folder"|"camera"|"hours"|"days"|"weeks"|"months"|"years"} GroupCriterion
 */

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
     * @returns {string} The section's own display title – `sli-title`, falling back to the stable
     * `sli-name` grouping key (ex. a tag's digit, shown until the tag itself gets a name) – or "" if
     * neither is set. Kept separate from `getSectionName()` so the grid's inline rename input can be
     * prefilled with just the editable part, not the fallback/counts baked into the full label.
     */
    getSectionTitle($section) {
        return String($section.attr("sli-title") || $section.attr("sli-name") || "")
    }

    /**
     * @param {JQuery} $section
     * @returns {string} "N sections, M frames" when the section directly contains subsections,
     * otherwise just the frame count. Sections: only the direct subsections (the outline at this
     * level). Frames: the TOTAL all the way down (every frame in every nested subsection), so a
     * header answers "how big is this group". A ", K hidden" suffix is appended when the tag-hiding
     * feature currently hides any of them – shown alongside the real total (not folded into it), since
     * the grid is an editing view where you want to see the true size and how much of it is hidden.
     */
    getSectionCounts($section) {
        const sectionCount = this.getDirectSections($section).length
        const frameCount = this.getTotalFrameCount($section)
        const hiddenCount = this.getHiddenFrameCount($section)
        const hiddenSuffix = hiddenCount ? `, ${hiddenCount} hidden` : ""
        return sectionCount
            ? `${sectionCount} section${sectionCount === 1 ? "" : "s"}, ${frameCount} frame${frameCount === 1 ? "" : "s"}${hiddenSuffix}`
            : `${frameCount}${hiddenSuffix}`
    }

    /**
     * @param {JQuery} $section
     * @param {string} fallbackLabel Shown instead of a title when the section has none (ex. "Presentation" for <main>).
     * @returns {string} "‹title or fallback› (‹counts›)".
     */
    getSectionName($section, fallbackLabel = "Section") {
        return `${this.getSectionTitle($section) || fallbackLabel} (${this.getSectionCounts($section)})`
    }

    /**
     * Rename a section's display title (the grid's inline rename input). Writes `sli-title` only –
     * `sli-name` (the stable key a tag-based section is matched/reused by) is never touched, same rule
     * a regroup's own title refresh follows (see the `sli-title`/`sli-name` split noted on `group()`).
     * @param {JQuery} $section
     * @param {string} name Trimmed new title; empty removes `sli-title` (falls back to `sli-name`/label).
     */
    renameSection($section, name) {
        const pl = this.playback
        name = String(name).trim()
        const old = $section.attr("sli-title") || ""
        if (name === old) {
            return
        }
        pl.changes.undoable(`Rename section ${this.getSectionName($section)}`,
            () => name ? $section.attr("sli-title", name) : $section.removeAttr("sli-title"),
            () => old ? $section.attr("sli-title", old) : $section.removeAttr("sli-title"),
            () => pl.reset())
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
     * @returns {number} Frames anywhere inside $section (same reach as getTotalFrameCount) currently
     * treated as hidden by the tag-hiding feature (Playback.frame_is_tag_hidden) – always 0 in "show" mode.
     */
    getHiddenFrameCount($section) {
        const pl = this.playback
        let count = 0
        $section.find(FRAME_TAGS).each((_, el) => {
            const frame = $(el).data("frame")
            if (frame && pl.frame_is_tag_hidden(frame)) {
                count++
            }
        })
        return count
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
     * (regroup, navigation) so a frame wrapped in a <div sli-duration> is not overlooked.
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
        const formData = new FormData(/** @type {HTMLFormElement} */ ($("#defaults")[0]))
        formData.delete('path') // path does not belong to <section>
        // The import "Group by" select shares the #defaults form for layout only – it is a personal
        // preference of this browser (see Menu.GROUP_BY_KEY), not a property of the new section.
        formData.delete('group-by')
        const $section = $("<section/>", Object.fromEntries(Array.from(formData)
            .map(([key, value]) => [`sli-${key}`, value])
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
        if ($section.is("main")) {
            // <main> is the presentation root, not a removable element – "delete" on it clears its
            // content (direct children) instead of detaching the section itself.
            return this.clearSection($section)
        }
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

    /** Detach every direct child of $section (used for <main>, where "delete" can't remove the
     * section itself – see deleteSection). */
    clearSection($section) {
        const pl = this.playback
        const $children = $section.children()
        if (!$children.length) {
            pl.hud.info("Already empty")
            return
        }

        pl.changes.undoable(`Clear ${this.getSectionName($section, "Presentation")}`,
            () => $children.detach(),
            () => $children.appendTo($section),
            () => {
                pl.reset()
                pl.goToFrame(0)
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
            () => withDetached($main[0], () => {
                snapshots.forEach(({ $section, $children }) => {
                    $section.before($children)  // move contents before the section
                    $section.detach()           // remove empty section
                })
            }),
            () => withDetached($main[0], () => {
                snapshots.forEach(({ reinsert, $section, $children }) => {
                    reinsert()                    // restore section
                    $section.append($children)    // restore its contents
                })
            }),
            () => pl.reset()
        )
    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     * @param {GroupCriterion} criterion
    * @param {?JQuery<HTMLElement>} $frames If none, all frames are regrouped.
    */
    group(criterion = "tags", $frames = null) {
        const pl = this.playback
        /** @type {string[]} */
        const multiTagged = []
        /** @type {Map<Node, Node[]>} One snapshot of the child lists of everything a regroup can touch
         * (<main>, every frame's ancestors) – the whole undo, instead of one closure per frame. */
        let before = new Map()

        if (!$frames) {
            $frames = pl.$articles
        }

        pl.changes.undoable(`Group ${$frames.length} frames by ${criterion}`,
            () => {
                multiTagged.length = 0
                before = snapshotChildren($frames.toArray(), $main[0])
                /** @type {JQuery} Catch-all for frames without a group key; reused across regroups so it never duplicates. */
                let $looseSection = this.getDirectSections($main).filter("[sli-untagged]").first()
                /** @type {Map<string, HTMLElement>} Sections at this level by their sli-name, kept up to
                 * date as new ones are created below – a `$('section[sli-name=...]')` document-wide
                 * selector re-run for every single frame made a big regroup (thousands of frames) O(n²),
                 * same class of freeze as the thumbnail lookup fixed in Hud.getThumbnail(). */
                const sectionsByName = new Map(
                    this.getDirectSections($main).toArray()
                        .filter(el => el.hasAttribute("sli-name"))
                        .map(el => [el.getAttribute("sli-name"), el])
                )
                /** @typedef {{section: HTMLElement, frames: HTMLElement[], title: ?string}} Bucket */
                /** @type {Map<string, Bucket>} Frames to put into each section, in their final order. */
                const buckets = new Map()
                /** @type {HTMLElement[]} Sections created by this regroup, in creation order. */
                const created = []
                /** @type {?HTMLElement} */
                let looseCreated = null
                /** @type {?Bucket} */
                let looseBucket = null
                $frames.each((_, el) => {
                    /** @type {Frame} */
                    const frame = $(el).data("frame")

                    const { name, title, tags } = this.groupKey(criterion, frame)
                    if (tags.length > 1) {
                        multiTagged.push(`${frame.get_filename()} → ${tags.join(", ")}`)
                    }
                    if (!name) {
                        // No group key (untagged, ex. cleared with "0", or no datetime): collect every such
                        // frame into a single catch-all section. Previously only frames sitting loose directly
                        // under <main> were gathered, so photos untagged inside an existing section stayed
                        // scattered there after a regroup; now they all land in one place.
                        if (!looseBucket) {
                            if (!$looseSection.length) {
                                looseCreated = $("<section/>", { "sli-untagged": "", "sli-title": "untagged" })[0]
                                $looseSection = $(looseCreated)
                            }
                            looseBucket = { section: $looseSection[0], frames: [], title: null }
                        }
                        looseBucket.frames.push(el)
                        return
                    }

                    // find or create section to put the frame to (to its end)
                    const key = String(name)
                    let section = sectionsByName.get(key)
                    if (!section) {
                        section = $("<section/>", { "sli-name": name })[0]
                        sectionsByName.set(key, section)
                        created.push(section)
                    }
                    let bucket = buckets.get(key)
                    if (!bucket) {
                        buckets.set(key, bucket = { section, frames: [], title: null })
                    }
                    bucket.frames.push(el)
                    bucket.title = title
                })
                // Fill every target section while it is detached from the document: moving a frame into a
                // section that is part of the laid-out presentation costs ~0.3 ms each (seconds for
                // thousands of frames), into a detached one next to nothing. Existing sections keep their
                // identity and place (a placeholder marks it) and go back in with one insertion each.
                /**
                 * @param {Bucket} bucket
                 * @param {boolean} refreshTitle
                 */
                const fill = ({ section, frames, title }, refreshTitle) => {
                    const placeholder = document.createComment("")
                    const attached = Boolean(section.parentNode)
                    if (attached) {
                        section.replaceWith(placeholder)
                    }
                    const fragment = document.createDocumentFragment()
                    frames.forEach(el => fragment.appendChild(el))
                    section.appendChild(fragment)
                    // sli-title is the resolved display label (ex. a tag's name) at grouping time, kept
                    // separate from sli-name (the stable key sections are matched/reused by) – renaming
                    // a tag later only refreshes sli-title on the next regroup, sli-name never changes.
                    if (refreshTitle) {
                        title ? section.setAttribute("sli-title", title) : section.removeAttribute("sli-title")
                    }
                    if (attached) {
                        placeholder.replaceWith(section)
                    }
                }
                // <main> itself is taken out of the document for the duration too: frames leaving a laid-out
                // container are as costly as frames entering one.
                withDetached($main[0], () => {
                    buckets.forEach(bucket => fill(bucket, true))
                    if (looseBucket) {
                        fill(looseBucket, false)
                    }
                    // New sections go to the front of <main> (the latest created first), the catch-all to its end.
                    if (created.length) {
                        $main[0].prepend(...created.reverse())
                    }
                    if (looseCreated) {
                        $main[0].append(looseCreated)
                    }
                })
                // Drop sections this regroup emptied out (frames all moved elsewhere), so no ghost zero-frame
                // sections linger. Undo restores them from `before`.
                this.getDirectSections($main).filter((_, sec) => !$(sec).find(FRAME_TAGS).length).detach()
                if (criterion == "tags") {
                    // Order the resulting sections by tag number (1, 2, 3…) instead of by the order frames
                    // happened to appear; the untagged catch-all (no numeric name) sinks to the end.
                    const sorted = this.getDirectSections($main).toArray()
                        .sort((a, b) => this._tagSortKey(a) - this._tagSortKey(b))
                    withDetached($main[0], () => appendGroupedByParent(sorted))
                }
                // positionFrames() + goToFrame() come from resetAndGo() below – running them here as well
                // paid a second restyle of the whole presentation.
                if (multiTagged.length) {
                    pl.hud.ok("Group by tags", `${multiTagged.length} frames have more than one tag — grouped by the first one only:<br>${multiTagged.slice(0, 5).join("<br>")}`)
                }
            },
            () => restoreChildren(before, $main[0]),
            () => pl.resetAndGo()
        )
    }

    /**
     * Which section a frame belongs to under `criterion` – the single place a grouping key is derived,
     * shared by `group()` and by the import-time grouping in `Menu.appendFiles()`.
     * @param {GroupCriterion} criterion
     * @param {Frame} frame
     * @returns {{name: ?string, title: ?string, tags: number[]}} `name` is the stable key sections are
     * matched by (`sli-name`), `title` the display label (`sli-title`); a null/empty name means "no
     * group" (the frame lands in the untagged catch-all). `tags` is filled for the "tags" criterion only.
     */
    groupKey(criterion, frame) {
        switch (criterion) {
            case "tags": {
                const tags = frame.get_tags()
                const tag = tags[0]
                return { name: tag ? String(tag) : null, title: tag ? frame.tag_names()[tag - 1] || null : null, tags }
            }
            case "folder": {
                // The folder the media came from: `sli-folder`, written at import time from the dropped
                // File's webkitRelativePath (the frame's own filename keeps no path), else the directory
                // part of sli-src for a presentation that references media by path.
                const src = String(frame.$actor.attr("sli-src") || frame.$actor.attr("src") || "")
                const dir = String(prop("folder", frame.$actor) || "")
                    || src.split("/").slice(0, -1).filter(p => p && p !== "." && p !== "..").pop() || ""
                return { name: dir || null, title: dir || null, tags: [] }
            }
            case "camera": {
                // sli-device is `Make Model`, written by the (asynchronous) EXIF read – see Frame.exif.
                const device = String(prop("device", frame.$actor) || "")
                return { name: device || null, title: device || null, tags: [] }
            }
            default: {
                const name = this._toGroupKey(prop("datetime", frame.$actor), criterion)
                return { name, title: name, tags: [] }
            }
        }
    }

    /**
     * @param {HTMLElement} section
     * @returns {number} Numeric sort key from a section's sli-name (a tag number). Non-numeric names
     * (ex. the nameless untagged catch-all) sort to the end.
     */
    _tagSortKey(section) {
        const n = parseFloat($(section).attr("sli-name"))
        return isNaN(n) ? Infinity : n
    }

    /**
     * Sort $section's direct subsections alphabetically by their sli-name attribute
     * @param {string} order "asc" or "desc"
     * @param {JQuery} $section A <section> or <main> whose direct subsections get sorted; defaults to <main>.
     */
    sortSections(order = "asc", $section = $main) {
        const pl = this.playback

        let originalOrder
        pl.changes.undoable(`Sort sections alphabetically`,
            () => {
                // Save original order for undo
                originalOrder = this.getDirectSections($section).map((_, el) => el).get()

                // Sort sections alphabetically by sli-name
                const sorted = originalOrder.slice().sort((a, b) => {
                    const nameA = ($(a).attr("sli-name") || "").toLowerCase()
                    const nameB = ($(b).attr("sli-name") || "").toLowerCase()
                    return order === "asc"
                        ? nameA.localeCompare(nameB)
                        : nameB.localeCompare(nameA)
                })

                // Re-append in sorted order (preserving articles inside). Grouped by each section's own
                // current parent – not unconditionally $main, since a section may sit inside a wrapper
                // div (ex. a layout wrapper) rather than directly under $section – and appended once per
                // parent rather than one DOM move per section, so a big sort does not reflow n times.
                // And with <main> out of the document, see withDetached().
                withDetached($main[0], () => appendGroupedByParent(sorted))
            },
            () => withDetached($main[0], () => appendGroupedByParent(originalOrder)),
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
        const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

        return `${tmp.getUTCFullYear()}-week${String(week).padStart(2, '0')}`;
    }

    /**
 * @param {string | number | Date} dateStr
 * @param {"hours"|"days"|"weeks"|"months"|"years"} granularity
 * @returns {string} Group key for the given granularity
 */
    _toGroupKey(dateStr, granularity) {
        // `formatDateMs()` writes a file's lastModified as "2019-06-01T12-30-00" (hyphens in the time
        // part, not colons) – V8 rejects that outright, so every EXIF-less photo used to group as
        // "unknown-days". Normalize it back to an ISO time before parsing.
        const date = new Date(typeof dateStr === "string"
            ? dateStr.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3")
            : dateStr)
        if (isNaN(date.getTime())) return `unknown-${granularity}`

        switch (granularity) {
            case "hours": return date.toISOString().slice(0, 13)          // "2024-03-15T14"
            case "days": return date.toISOString().slice(0, 10)          // "2024-03-15"
            case "weeks": return this._toWeekFormat(date)                 // "2024-week11"
            case "months": return date.toISOString().slice(0, 7)           // "2024-03"
            case "years": return String(date.getFullYear())               // "2024"
        }
    }

}

/**
 * Re-append `elements` to the DOM in the given order, one `.append()` call per distinct current
 * parent instead of one per element – a plain `elements.forEach(el => $(el).parent().append(el))`
 * reflows once per element, which thrashes on a sort/undo spanning thousands of sections.
 * @param {HTMLElement[]} elements Already in the desired final order.
 */
function appendGroupedByParent(elements) {
    const byParent = new Map()
    for (const el of elements) {
        const parent = el.parentElement
        const group = byParent.get(parent)
        if (group) {
            group.push(el)
        } else {
            byParent.set(parent, [el])
        }
    }
    for (const [parent, group] of byParent) {
        $(parent).append(group)
    }
}
/**
 * One-shot snapshot for undoing a bulk move: the child list of <root> and of every ancestor of the given
 * frames (up to <root>), i.e. every container whose content a regroup may change. Replaces a per-frame
 * "put me back after my previous sibling" closure – 30 000 closures + jQuery wrappers for a big regroup.
 * @param {Element[]} frames
 * @param {Element} root
 * @returns {Map<Node, Node[]>}
 */
function snapshotChildren(frames, root) {
    /** @type {Map<Node, Node[]>} */
    const snapshot = new Map()
    const remember = node => snapshot.set(node, Array.from(node.childNodes))
    remember(root)
    for (const frame of frames) {
        for (let node = frame.parentNode; node && node !== root && !snapshot.has(node); node = node.parentNode) {
            remember(node)
        }
    }
    return snapshot
}

/**
 * Put every container of a `snapshotChildren()` snapshot back to its remembered children. Done while
 * <root> is out of the document, see `withDetached()`. Nodes that are not in the snapshot (ex. sections
 * a regroup created) drop out.
 * @param {Map<Node, Node[]>} snapshot
 * @param {Element} root The container the snapshot was taken from.
 */
function restoreChildren(snapshot, root) {
    withDetached(root, () => {
        for (const [node, children] of snapshot) {
            /** @type {Element} */ (node).replaceChildren(...children)
        }
    })
}

/**
 * Run `fn` with `element` taken out of the document (a comment marks its place), then put it back.
 * Moving thousands of nodes inside the live, laid-out presentation costs ~0.3 ms per node (each move
 * tears down and rebuilds the node's layout/style state); the same moves in a detached subtree are
 * almost free, so a bulk edit pays for one re-layout instead of one per node.
 * @param {Element} element
 * @param {function} fn
 */
function withDetached(element, fn) {
    if (!element.parentNode) {
        return fn()
    }
    const placeholder = document.createComment("")
    element.replaceWith(placeholder)
    try {
        return fn()
    } finally {
        placeholder.replaceWith(element)
    }
}
