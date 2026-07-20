/**
 * Grid overview. See thumbnails in a grid. Grid is part of the HUD.
 */
class GridController {
    /**
     * @param {Playback} playback
     * @param {Hud} hud
     * @param {JQuery<HTMLElement>} $container hud.$hud_grid
     */
    constructor(playback, hud, $container) {
        this.pl = playback
        this.hud = hud
        this.$container = $container

        this.$framesSections = $()
        this.columns = 0
        this.preload_radius = 0
        this.page_size = 0

        /** First displayed index from this.$framesSections */
        this.loadedFrom = 0
        /** Last displayed index from this.$framesSections */
        this.loadedUpTo = 0
        /** Index from this.$framesSections -> which column it should be placed in.
         * (Having in mind variable thumbnail-column count and sections.)
         */
        this.colMap = []
        this.isDisplayed = false
    }

    /**
     * @param {HTMLElement} el
     * @returns {boolean} Whether `el` should be part of the (possibly tag-filtered) grid. The shared
     * tag_filter lives on Playback – it also affects normal (non-grid) navigation, see Playback.set_tag_filter.
     */
    _matchesFilter(el) {
        if (!$(el).is(FRAME_SELECTOR)) {
            return true // a section/main header – headers are never filtered out
        }
        return this.pl.frame_matches_filter($(el).data("frame"))
    }

    changeColumnsCount(step = 1) {
        GRID_COLUMNS += step
        this.$container.css("--columns", GRID_COLUMNS)
        this.hud.reset_grid()
    }

    /**
     * Initial load around current frame, bind scroll handler
     * @param {boolean} scrollToCurrent
    */
    load(scrollToCurrent = false) {
        this.$framesSections = $(FRAME_SECTION_SELECTOR).filter((_, el) => this._matchesFilter(el))
        this.columns = GRID_COLUMNS
        this.$container.css("--columns", GRID_COLUMNS) // keep the CSS var in sync (esp. on the very first load)
        this.preload_radius = Math.ceil(GRID_PRELOAD_RADIUS / GRID_COLUMNS) * GRID_COLUMNS
        this.page_size = Math.ceil(GRID_PAGE_SIZE / GRID_COLUMNS) * GRID_COLUMNS
        if (this.page_size > this.preload_radius) {
            console.log("Warning, grid page size", this.page_size, "is bigger than preload radius", this.preload_radius)
        }
        this.colMap = this._buildColMap()

        const currentPos = this._currentPos()
        const startFrom = this._snapToRowStart(Math.max(0, currentPos - this.preload_radius))
        const startTo = Math.min(this.$framesSections.length, currentPos + this.preload_radius)

        this._loadBatch(startFrom, startTo - startFrom, false)

        this.hud.makeThumbnailsImportable(this.$container)
        this._bindScroll()

        if (scrollToCurrent) {
            this._scrollToCurrentFrame()
        }
        this.isDisplayed = true
        return this
    }

    /**
     * Make sure the frame-section at `pos` is loaded within thumbnails: extends the loaded
     * range in the missing direction and discards items that fell out of range.
     * @param {number} pos Index into this.$framesSections
     */
    _ensureLoaded(pos) {
        // Is this position out of the current range?
        if (pos < this.loadedFrom || pos >= this.loadedUpTo) {
            // Fetch through the missing direction
            if (pos < this.loadedFrom) {
                const from = this._snapToRowStart(Math.max(0, pos - this.preload_radius))
                const count = Math.min(pos + this.preload_radius, this.loadedFrom) - from
                this._loadBatch(from, count, true)
            } else {
                const from = this._snapToRowStart(Math.max(this.loadedUpTo, pos - this.preload_radius))
                const count = (pos + this.preload_radius) - from
                this._loadBatch(from, count, false)
            }
            this._discardFarItems(pos)
        }

        this.hud.makeThumbnailsImportable(this.$container)
    }

    /**
     *
     * @param {boolean} scrollToCurrent
     * Make sure the frame is loaded within thumbnails.
     */
    focusFrame(scrollToCurrent = false) {
        this._ensureLoaded(this._currentPos())
        if (scrollToCurrent) {
            this._scrollToCurrentFrame()
        }
    }

    sectionMenuAction($section, role, param) {
        const pl = this.pl
        /** @type {JQuery} Frames at this section's own level – seeing through <div> wrappers, but not into
         * nested subsections (they have their own ribbon). Used for regroup/import placement. */
        const $frames = pl.section_controller.getDirectFrames($section)
        /** @type {JQuery} Current frame (does not have to be in the section) */
        const $frame = pl.frame.$frame
        const cc = pl.changes

        switch (role) {
            case "name-desc":
                order((frame1, frame2) => frame2.get_filename().localeCompare(frame1.get_filename()))
                break
            case "name-asc":
                order((frame1, frame2) => frame1.get_filename().localeCompare(frame2.get_filename()))
                break
            case "date-desc":
                order((frame1, frame2) => frame2.$actor?.data("datetime") < frame1.$actor?.data("datetime") ? 1 : -1)
                break
            case "date-asc":
                order((frame1, frame2) => frame1.$actor?.data("datetime") < frame2.$actor?.data("datetime") ? 1 : -1)
                break
            case "new-frame":
                pl.section_controller.insertNewFrame(rightPlace())
                break
            case "regroup":
                pl.section_controller.group(param, $frames)
                break
            case "delete":
                pl.section_controller.deleteSection($section)
                break
            case "sort-sections":
                pl.section_controller.sortSections(param)
                break
            case "flatten-subsections":
                pl.section_controller.flattenSubsections($section)
                break
            case "add-subsection":
                pl.section_controller.insertNewSection($section, param === "before")
                break
            case "clear-tag-filter":
                pl.set_tag_filter([])
                break
            case "import":
                $("<input/>", { type: "file" }).change(function () {
                    const frames = pl.menu.loadFiles([...this.files])
                    pl.section_controller.importFrames(frames, rightPlace(), false)
                    pl.hud.info(`${this.files.length} media imported`)
                }).trigger("click")
                break
            default:
                this.info("Unknown action")
                break
        }

        /**
         *
         * @returns {JQuery} Current frame if in the section, otherwise the last frame of the current section.
         */
        function rightPlace() {
            return $frames.is($frame) ? $frame : $frames.slice(-1)
        }

        /**
         * Order frames
         * @param {frames} callback
         * @callback frames
         * @param {Frame} frame1
         * @param {Frame} frame2
         *
         */
        function order(callback) {
            // Reordering re-appends the frames, which would rip a frame out of a layout / shared-duration
            // <div> wrapper. So order only touches the section's *unwrapped* direct children; frames inside
            // wrapper divs keep their grouping untouched (known limitation, mirrored by the count helpers).
            const $orderable = $section.children(FRAME_SELECTOR)
            const $orig_frames = $orderable.map((_, e) => e)
            $orderable.sort((a, b) => callback($(a).data("frame"), $(b).data("frame")))

            cc.undoable("Sort frames",
                () => $section.append($orderable),
                () => $section.append($orig_frames),
                () => pl.resetAndGo())
        }
    }

    /**
     * Parse menu templates that are appended to <section-controller> tags.
     * And make commands from them.
     *
     * @returns {[hint: string, callback: Function, group_name: string][]}
     */
    getHotkeys() {
        const commands = []

        for (const [template, register, navtext] of [
            [
                this._sectionMenuTemplate,
                /**
                 * @param {HTMLElement} button
                 */
                (button) => () => {
                    const section = this.hud.playback.frame.$frame.closest("section")
                    if (!section.length) { // we do not support ex. ordering frames directly in main
                        this.hud.info("The frame is not in any section")
                        return
                    }
                    this.sectionMenuAction(section, button.dataset.role, button.dataset.param)
                },
                "section"
            ], [
                this._menuOfMainTemplate,
                /**
                 * @param {HTMLElement} button
                 */
                (button) => () => this.sectionMenuAction($main, button.dataset.role, button.dataset.param),
                "presentation"
            ]
        ]) {

            const $sc = $(template)

            const addCmd = (text, button) => commands.push([
                text,
                register(button),
                () => this.hud.grid_visible,
                navtext
            ])

            $sc.find(".section-menu").each((_, menu) => {
                const group = $(menu).find("span").first().text().replace(" ▾", "").trim()
                $(menu).find("button").each((_, btn) => addCmd(`${group} ${$(btn).text()}`, btn))
            })

            $sc.find("> button").each((_, btn) => {

                return addCmd($(btn).text(), btn)
            }

            )
        }
        return commands
    }


    _menuOfMainTemplate = `<div class="section-menus">
                        <div class="section-menu">
                            <span>add subsection ▾</span>
                            <div class="dropdown">
                                <button data-role='add-subsection' data-param='before'>to the begginning</button>
                                <button data-role='add-subsection' data-param='after'>to the end</button>
                            </div>
                        </div>
                        <div class="section-menu">
                            <span>sort ▾</span>
                            <div class="dropdown">
                                <button data-role='sort-sections' data-param='desc'>by name ⇓</button>
                                <button data-role='sort-sections' data-param='asc'>by name ⇑</button>
                            </div>
                        </div>
                        <button data-role='flatten-subsections'>flatten subsections</button>
                        <div class="section-menu tag-filter-menu">
                            <span>filter by tag ▾</span>
                            <div class="dropdown tag-filter-dropdown"></div>
                        </div>
                    </div>`

    _sectionMenuTemplate = `<div class="section-menus">
                        <div class="section-menu">
                                <span>order ▾</span>
                                <div class="dropdown">
                                    <button data-role='name-desc'>by name ⇓</button>
                                    <button data-role='name-asc'>by name ⇑</button>
                                    <button data-role='date-desc'>by date ⇓</button>
                                    <button data-role='date-asc'>by date ⇑</button>
                                </div>
                            </div>
                            <div class="section-menu">
                                <span>add ▾</span>
                                <div class="dropdown">
                                    <button data-role='import'>media</button>
                                    <button data-role='new-frame'>text</button>
                                    <!-- subsection? -->
                                </div>
                            </div>
                            <div class="section-menu">
                                <span>regroup ▾</span>
                                <div class="dropdown">
                                    <button data-role='regroup' data-param='hours'>by hours</button>
                                    <button data-role='regroup' data-param='days'>by days</button>
                                    <button data-role='regroup' data-param='weeks'>by weeks</button>
                                    <button data-role='regroup' data-param='months'>by months</button>
                                    <button data-role='regroup' data-param='years'>by years</button>
                                    <button data-role='regroup' data-param='tags'>by tags</button>
                                </div>
                            </div>
                            <button data-role='delete'>delete</button></div>`

    /** <frame-preview> index in this.$framesSections
    */
    _currentPos() {
        return this.$framesSections.index(this.pl.frame.$frame)
    }


    /** @param {HTMLElement} el @returns {boolean} A frame element (article / article-map). */
    _isFrameEl(el) {
        return !!el && ["ARTICLE", "ARTICLE-MAP"].includes(el.tagName)
    }

    /**
     * @param {HTMLElement} el
     * @returns {boolean} A frame living loose under <main>, in no <section> at all (possibly inside a plain
     * layout <div>). Its logical home is <main> – the "Presentation" ribbon – not any section.
     */
    _isOrphan(el) {
        return this._isFrameEl(el) && !$(el).closest("section").length
    }

    /**
     * @param {number} i Index into this.$framesSections
     * @returns {boolean} This position starts a run of orphan frames that directly follows an in-section
     * frame – the exact spot where, without a cue, orphans look "glued" to the previous section. (A run
     * right after the <main>/<section> ribbon needs no extra cue; the ribbon already heads it.)
     */
    _orphanRunStart(i) {
        return this._isOrphan(this.$framesSections[i]) && this._isFrameEl(this.$framesSections[i - 1]) && !this._isOrphan(this.$framesSections[i - 1])
    }

    _buildColMap() {
        const colMap = []
        let col = 0
        this.$framesSections.each((i, el) => {
            if (["SECTION", "MAIN"].includes(el.tagName)) {
                col = 0
                colMap[i] = null
            } else {
                if (this._orphanRunStart(i)) col = 0 // break onto a fresh row under the loose-frames divider
                colMap[i] = col
                col = (col + 1) % this.columns
            }
        })
        return colMap
    }

    _snapToRowStart(pos) {
        while (pos > 0 && this.colMap[pos] !== null && this.colMap[pos] !== 0) pos--
        return pos
    }

    /**
     * Adds the range to the grid.
     * @param {Number} from
     * @param {Number} to
     * @param {Boolean} prepend
     */
    _loadRange(from, to, prepend = false) {

        const slice = this.$framesSections.slice(from, to).toArray()
        if (prepend) slice.reverse()
        slice.forEach((frameOrSection, i) => {
            const index = prepend ? to - 1 - i : from + i
            this._addToGrid(frameOrSection, prepend, index)
        })
    }


    /**
     * This is a low-end method, pay attention we do not sanitize indices to mitigate duplicates etc.
     * @param {Number} from
     * @param {Number} count
     * @param {Boolean} prepend
     */
    _loadBatch(from, count, prepend = false) {
        const snappedFrom = this._snapToRowStart(from)
        const snappedTo = snappedFrom + count

        this._loadRange(snappedFrom, snappedTo, prepend)

        if (prepend) {
            this.loadedFrom = snappedFrom
        } else {
            this.loadedFrom = Math.max(this.loadedFrom, snappedFrom)
            this.loadedUpTo = snappedTo
        }
    }


    _discardFarItems(center) {
        const preload_limit = this.preload_radius * 5
        const newFrom = this._snapToRowStart(center - preload_limit)
        const newTo = center + preload_limit

        const discarded = []
        this.$container.children().each((_, el) => {
            const pos = $(el).data("fsIndex")
            if (pos < newFrom || pos >= newTo) {
                discarded.push(pos)
                $(el).remove()
            }
        })

        const ch = this.$container.children()
        this.loadedFrom = ch.first().data("fsIndex")
        this.loadedUpTo = ch.last().data("fsIndex")
    }

    /**
     * @param {HTMLElement} frameOrSection
     */
    _addToGrid(frameOrSection, prepend = false, fsIndex = null) {
        let el
        if (frameOrSection.tagName === "MAIN") {
            el = this._assureMain(frameOrSection, prepend)
        } else if (frameOrSection.tagName === "SECTION") {
            el = this._assureSection(frameOrSection, prepend)
        } else {
            el = this.hud.assureThumbnail($(frameOrSection).data("frame"), this.$container, prepend)
            this._assureOrphanDivider(el, fsIndex)
        }
        el.data("fsIndex", fsIndex)
    }

    /**
     * Insert a full-width "loose frames" divider right before the thumbnail `$thumb` when it starts a run
     * of orphan frames – so they read as belonging to the presentation, not to the section above them.
     * Placed relative to the already-inserted thumbnail (works for both append and prepend); carries the
     * thumbnail's fsIndex so _discardFarItems reclaims it together with the frame it heads.
     * @param {JQuery} $thumb
     * @param {?number} fsIndex Index of the thumbnail's frame in this.$framesSections
     */
    _assureOrphanDivider($thumb, fsIndex) {
        if (fsIndex == null || !this._orphanRunStart(fsIndex)) return
        if ($thumb[0].previousElementSibling?.classList.contains("grid-orphan-divider")) return // already there
        $("<div/>", { class: "grid-orphan-divider", text: "Loose frames — outside any section" })
            .data("fsIndex", fsIndex)
            .insertBefore($thumb)
    }

    /**
     * Insert control ribbon for the main element to the grid
     * @param {HTMLElement} main
     * @param {boolean} prepend
     */
    _assureMain(main, prepend = false) {
        const pl = this.pl
        const $mc = $(`<section-controller data-role="main">
                    <span class="section-title">${pl.section_controller.getSectionName($(main), "Presentation")}</span>
                    ${this._tagFilterBadge()}
                    ${this._menuOfMainTemplate}
                </section-controller>`)
            .data("section", main)
        $mc.find(".tag-filter-badge").on("click", () => pl.set_tag_filter([]))
        this.refreshTagFilterDropdown($mc.find(".tag-filter-dropdown"))
        // Rebuilt on every hover rather than once – tags may have been added/removed directly in the
        // grid (digit hotkeys on the current frame) since this ribbon was last (re)rendered, and that
        // does not by itself trigger a grid rebuild (see Hud.tag()).
        $mc.find(".tag-filter-menu").on("mouseenter", () => this.refreshTagFilterDropdown($mc.find(".tag-filter-dropdown")))
        return prepend ? $mc.prependTo(this.$container) : $mc.appendTo(this.$container)
    }

    /**
     * (Re)builds the "filter by tag ▾" dropdown: one checkbox per currently used tag, with its live
     * frame count, checked to match `playback.tag_filter`. Checking/unchecking applies the filter
     * immediately (see the delegated "change" handler in Hud.init_grid).
     * @param {JQuery} $dropdown
     */
    refreshTagFilterDropdown($dropdown) {
        const pl = this.pl
        const counts = new Map()
        pl.$articles.each((_, el) => $(el).data("frame").get_tags().forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
        const usedTags = [...counts.keys()].sort((a, b) => a - b)
        if (!usedTags.length) {
            $dropdown.html(`<span class="dropdown-empty">No tags used yet</span>`)
            return
        }
        const names = pl.frame.tag_names()
        const items = usedTags.map(t => {
            const label = names[t - 1] ? `${names[t - 1]} (${t})` : String(t)
            const checked = pl.tag_filter.includes(t) ? "checked" : ""
            return `<label><input type="checkbox" value="${t}" ${checked}> ${label} (${counts.get(t)})</label>`
        }).join("")
        const clear = pl.tag_filter.length ? `<button data-role="clear-tag-filter">Clear filter</button>` : ""
        $dropdown.html(items + clear)
    }

    /**
     * Small "clear filter" badge mirroring #hud-tag-filter (see Hud.refresh_tag_filter_icon), shown next
     * to the "Presentation" title so the grid makes clear it is only showing a filtered subset.
     * @returns {string}
     */
    _tagFilterBadge() {
        const pl = this.pl
        if (!pl.tag_filter.length) {
            return ""
        }
        const names = pl.frame.tag_names()
        const label = pl.tag_filter.map(t => names[t - 1] || t).join(", ")
        return `<span class="tag-filter-badge" title="Clear tag filter">🏷 ${label} ✕</span>`
    }

    /**
     * Insert control ribbon for the section to the grid if encountered
     * @param {HTMLElement} currentSection
     * @param {boolean} prepend
     */
    _assureSection(currentSection, prepend = false) {
        const $sc = $(`<section-controller>
                        <span class="section-title">${this.pl.section_controller.getSectionName($(currentSection))}</span>
                        ${this._sectionMenuTemplate}
                    </section-controller>`)
            .data("section", currentSection)
        return prepend ? $sc.prependTo(this.$container) : $sc.appendTo(this.$container)
    }

    _bindScroll() {
        this.$container.off('scroll').on('scroll', e => {
            const el = e.currentTarget
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5
            const atTop = el.scrollTop <= 5

            if (atBottom && this.loadedUpTo < this.$framesSections.length) {
                this._loadBatch(this.loadedUpTo, this.page_size, false)
                this.hud.makeThumbnailsImportable(this.$container)
            } else if (atTop && this.loadedFrom > 0) {
                const scrollBefore = el.scrollHeight
                this._loadBatch(Math.max(0, this.loadedFrom - this.page_size), this.page_size, true)
                this.hud.makeThumbnailsImportable(this.$container) // duplicated row?
                el.scrollTop += el.scrollHeight - scrollBefore
            } else {
                return
            }

            const pos = this.getScrollAnchor()
            if (pos) {
                this._discardFarItems(pos.frameSectionIndex)
            }
        })
    }

    /**
     * Scroll to the thumbnail if not visible
     */
    _scrollToCurrentFrame() {
        // why set timeout? Because the re-ordering DOM changes must flush first.
        // Scroll only when the frame changed.
        // Ex: Hitting 'End' will scroll. But dragging unactive frames around would scroll you out from what you have just dragged.
        setTimeout(() => {
            const el = this.hud.getThumbnail(this.pl.frame, this.$container).get(0)
            if (!el) return
            const rect = el.getBoundingClientRect()
            if (rect.top < 0 || rect.bottom > document.documentElement.clientHeight) {
                el.scrollIntoView({ block: "center" })
            }
        }, 1)
    }

    getScrollAnchor() {
        const container = this.$container[0]
        let best = null

        this.$container.children("frame-preview").each((_, el) => {
            if (el.offsetTop >= container.scrollTop) {
                best = {
                    frameIndex: Number(el.dataset.ref),
                    offsetY: el.offsetTop - container.scrollTop,
                    frameSectionIndex: $(el).data("fsIndex")
                }
                return false
            }
        })

        return best
    }

    /**
     * Restore a scroll position previously captured by getScrollAnchor, e.g. after the grid
     * was fully reset (such as when the column count changes).
     * @param {{frameIndex: number, offsetY: number, frameSectionIndex: number}} anchor
     */
    scrollToAnchor(anchor) {
        if (!anchor) return
        const { frameIndex, offsetY, frameSectionIndex: pos } = anchor
        if (pos == null || pos === -1) return

        this._ensureLoaded(pos)

        const $thumb = this.hud.getThumbnail({ index: frameIndex }, this.$container)
        if (!$thumb.length) return

        this.$container[0].scrollTop = $thumb[0].offsetTop - offsetY
    }

    /**
     * Returns the frame index after moving by one page up/down.
     * @param {number} direction 1 = down, -1 = up
     * @returns {number}
     */
    getFrameIndexInNextPage(direction) {
        const containerHeight = this.$container[0].clientHeight
        const thumbHeight = this.hud.getThumbnail(this.pl.frame, this.$container)[0]?.offsetHeight
        if (!thumbHeight) return this.pl.index

        const rowsPerPage = Math.max(1, Math.floor(containerHeight / thumbHeight) - 1)

        return this.getFrameIndexInNextRow(rowsPerPage * direction)
    }

    /**
     * Returns the frame index of the thumbnail that is visually rows above/below the given frame index.
     * @param {number} rows Positive for down, negative for up
     */
    getFrameIndexInNextRow(rows) {
        const pos = this._currentPos()
        if (pos === -1) return null

        const currentCol = this.colMap[pos]
        const direction = rows > 0 ? 1 : -1
        let i = pos + direction
        let crossedRows = 0

        while (i >= 0 && i < this.colMap.length) {
            const col = this.colMap[i]

            if (col === null) {
                crossedRows++
            } else {
                if (direction > 0 && col < this.colMap[i - 1]) crossedRows++
                if (direction < 0 && col > this.colMap[i + 1]) crossedRows++

                if (crossedRows >= Math.abs(rows) && col === currentCol) {
                    return $(this.$framesSections[i]).data("frame")?.index ?? null
                }
            }

            i += direction
        }
        return direction > 0 ? this.pl.$articles.length - 1 : 0
    }
}