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
        /** @type {?string} Tile shape the presenter picked from GRID_TILE_SHAPES, or null to let
         * detectTileShape() decide. Session-only: it travels in the URL hash (session.js "grid-tile"),
         * deliberately NOT in the document – opening someone else's presentation must never rewrite it.
         * NOTE If authors ever want to ship a preferred grid look with an exported file, an
         * `sli-grid-tile` on <main> would slot in here as the default underneath the autodetection. */
        this.tile_shape = null
        /** @type {string} One of GRID_TILE_LABELS – what the tile's caption shows. Session-only, like
         * tile_shape; unlike it, there is nothing to autodetect, captions are simply off until asked for. */
        this.tile_labels = "off"
        /** @type {string} One of GRID_TILE_FITS. "contain" shows each photo whole instead of cropping it to
         * the tile – a momentary aid when checking composition, not a look to browse in (every tile then
         * sits in its own letterbox and the wall of photos goes ragged). */
        this.tile_fit = "cover"

        // The presenter's column count outlives the presentation it was set on – it is a preference about
        // how dense *they* like the overview, not about this file (which is why it is not in the hash).
        const stored = Number(pref_get("sli:grid-columns"))
        if (stored >= 1 && stored <= GRID_COLUMNS_MAX) {
            GRID_COLUMNS = stored
        }
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

        /** @type {Set<number>} Selected frame indices (into pl.$articles). Ephemeral UI state, purely a
         * grid-overview convenience – it is NOT part of the presentation and is never exported nor persisted. */
        this.selection = new Set()
        /** @type {?number} Anchor frame index for Shift-range extension (the fixed end of the range). */
        this.anchor = null
        /** @type {?{html: string[], cut: boolean, frames: Frame[]}} Copy/cut clipboard. `html` are the
         * sanitized frames a copy-paste clones; `frames` the live originals a cut-paste moves (and, for a
         * cut, the ones painted with the `cut` class). */
        this.clipboard = null
        /** @type {?JQuery} A section/main ribbon clicked (or arrow-key-navigated onto) to pin the paste
         * destination – lets Ctrl+V target an empty section, which has no frame of its own to act as the
         * usual cursor-frame anchor. While set, it also doubles as the keyboard cursor's position (see
         * _currentPos) so Up/Down/PageUp/PageDown keep working from the ribbon instead of getting stuck.
         * Cleared by any cursor move onto a frame. */
        this.pasteTarget = null
        /** @type {?number} The column Up/Down/PageUp/PageDown last aimed for – kept across calls (even
         * across a landing on a shorter row, or on an empty-section ribbon with no column of its own) so
         * repeated vertical moves stay in the same visual column instead of drifting to whatever the
         * previous (possibly clamped) row happened to land on. Reset on any non-vertical cursor move. */
        this.preferredCol = null
    }

    /** Pin `$section` (a <section> or <main>, via its section-controller ribbon) as the next paste's
     * destination – the frames get prepended into it. Click the same ribbon again to unpin. */
    togglePasteTarget($section) {
        this.pasteTarget = this.pasteTarget?.is($section) ? null : $section
        this._syncSelectionClass()
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
        // Clamped: a step down to 0 would make every `calc(100% / var(--columns))` divide by zero and take
        // the whole overview with it, and there is no point in tiles too small to recognize anything on.
        GRID_COLUMNS = Math.min(GRID_COLUMNS_MAX, Math.max(1, GRID_COLUMNS + step))
        pref_set("sli:grid-columns", GRID_COLUMNS)
        this.$container.css("--columns", GRID_COLUMNS)
        this.hud.reset_grid()
    }

    /** The shape tiles are actually drawn in – the presenter's pick, or the autodetected one. */
    get tileShape() {
        return this.tile_shape || this.detectTileShape()
    }

    /**
     * Photos want a photo-shaped tile; authored slides want to look like what the audience will see, or
     * you cannot tell one slide from another in the overview. Decided from the DOM alone, so no media has
     * to be loaded first: a frame holding nothing but its <img>/<video> is a photo (see is_media_only),
     * anything carrying a layout of its own is a slide.
     * @returns {string} One of GRID_TILE_SHAPES.
     */
    detectTileShape() {
        const $frames = this.pl.$articles
        if (!$frames.length) {
            return "4:3"
        }
        const photos = $frames.filter((_, el) => is_media_only($(el))).length
        // Two thirds, not a bare majority – a deck of photos opened with a title slide or two in front of
        // it is still a photo album, and should not be dragged into the slide-shaped look by them.
        return photos / $frames.length >= 2 / 3 ? "4:3" : "screen"
    }

    /** Adopt `shape` (anything not in GRID_TILE_SHAPES falls back to the autodetection). */
    setTileShape(shape) {
        this.tile_shape = GRID_TILE_SHAPES.includes(shape) ? shape : null
        this.applyTileView()
    }

    /** Paint the whole tile view onto the container; the tiles themselves are styled from these attributes
     * in CSS, so switching any of the three needs no re-render of the grid's contents. */
    applyTileView() {
        this.$container.attr({
            "data-tile": this.tileShape,
            "data-labels": this.tile_labels,
            "data-fit": this.tile_fit,
        })
    }

    /** Adopt `labels` (anything not in GRID_TILE_LABELS turns captions off). */
    setTileLabels(labels) {
        this.tile_labels = GRID_TILE_LABELS.includes(labels) ? labels : "off"
        this.applyTileView()
    }

    /** Step to the next caption mode: nothing → file name → file name and date. */
    cycleTileLabels() {
        const next = (GRID_TILE_LABELS.indexOf(this.tile_labels) + 1) % GRID_TILE_LABELS.length
        this.setTileLabels(GRID_TILE_LABELS[next])
        this.hud.info(`Tile captions: ${this.tile_labels}`)
        this.pl.session.store()
    }

    /** Adopt `fit` (anything not in GRID_TILE_FITS crops to fill). */
    setTileFit(fit) {
        this.tile_fit = GRID_TILE_FITS.includes(fit) ? fit : "cover"
        this.applyTileView()
    }

    /** Flip between cropping a photo to its tile and showing it whole. */
    toggleTileFit() {
        this.setTileFit(this.tile_fit === "cover" ? "contain" : "cover")
        this.hud.info(this.tile_fit === "contain" ? "Showing whole frames" : "Cropping frames to the tile")
        this.pl.session.store()
    }

    /** Step to the next shape in GRID_TILE_SHAPES, starting from whatever is on screen now (so the first
     * press moves off the autodetected shape rather than jumping to the head of the list). */
    cycleTileShape() {
        const next = (GRID_TILE_SHAPES.indexOf(this.tileShape) + 1) % GRID_TILE_SHAPES.length
        this.setTileShape(GRID_TILE_SHAPES[next])
        this.hud.info(`Tile shape: ${this.tile_shape}`)
        this.pl.session.store()
    }

    /**
     * Initial load around current frame, bind scroll handler
     * @param {boolean} scrollToCurrent
    */
    load(scrollToCurrent = false) {
        this.$framesSections = $(FRAME_SECTION_SELECTOR).filter((_, el) => this._matchesFilter(el))
        this.columns = GRID_COLUMNS
        this.$container.css("--columns", GRID_COLUMNS) // keep the CSS var in sync (esp. on the very first load)
        this.applyTileView() // the autodetection depends on the frames, so re-decide on every load
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
                order((frame1, frame2) => (frame1.$actor ? prop("datetime", frame1.$actor) : undefined) < (frame2.$actor ? prop("datetime", frame2.$actor) : undefined) ? 1 : -1)
                break
            case "date-asc":
                order((frame1, frame2) => (frame2.$actor ? prop("datetime", frame2.$actor) : undefined) < (frame1.$actor ? prop("datetime", frame1.$actor) : undefined) ? 1 : -1)
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
            case "untag-all":
                pl.section_controller.untagAll($section)
                break
            case "sort-sections":
                pl.section_controller.sortSections(param, $section)
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
                $("<input/>", { type: "file" }).change(async function () {
                    const frames = await pl.menu.loadFiles([...this.files])
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

            $sc.find(".section-menu-row > button").each((_, btn) => {

                return addCmd($(btn).text(), btn)
            }

            )
        }
        return commands
    }


    // Row 1 (subsection ops + container-level misc) sits level with the title – it's the first line of
    // .section-menus, which is a flex sibling of .section-title. Row 2 (own-frame ops) is a second line
    // below it. Shared by <main> and <section> alike – both can hold subsections and loose frames at once.
    // Only the row-1 tail differs: a section can be deleted, the presentation can't; only the presentation
    // shows the tag-filter.
    _subsectionMenuRow = `<span class="section-menu-row-label">subsection</span>
                            <div class="section-menu">
                                <span title="Insert a new empty subsection">add ▾</span>
                                <div class="dropdown">
                                    <button data-role='add-subsection' data-param='before' title="Insert a new empty subsection at the very beginning">to the begginning</button>
                                    <button data-role='add-subsection' data-param='after' title="Insert a new empty subsection at the very end">to the end</button>
                                </div>
                            </div>
                            <div class="section-menu">
                                <span title="Reorder the direct subsections alphabetically by name">sort ▾</span>
                                <div class="dropdown">
                                    <button data-role='sort-sections' data-param='desc' title="Sort subsections Z → A">by name ⇓</button>
                                    <button data-role='sort-sections' data-param='asc' title="Sort subsections A → Z">by name ⇑</button>
                                </div>
                            </div>
                            <button data-role='flatten-subsections' title="Remove the subsection wrappers, keeping their frames in place (opposite of delete)">flatten</button>`

    _frameMenuRow = `<div class="section-menu-row">
                            <span class="section-menu-row-label">frames</span>
                            <div class="section-menu">
                                <span title="Insert a new frame here">add ▾</span>
                                <div class="dropdown">
                                    <button data-role='import' title="Pick a file to import as a new frame">media</button>
                                    <button data-role='new-frame' title="Insert a new blank text frame">text</button>
                                </div>
                            </div>
                            <div class="section-menu">
                                <span title="Reorder the direct frames">order ▾</span>
                                <div class="dropdown">
                                    <button data-role='name-desc' title="Sort frames Z → A by filename">by name ⇓</button>
                                    <button data-role='name-asc' title="Sort frames A → Z by filename">by name ⇑</button>
                                    <button data-role='date-desc' title="Sort frames newest → oldest">by date ⇓</button>
                                    <button data-role='date-asc' title="Sort frames oldest → newest">by date ⇑</button>
                                </div>
                            </div>
                            <div class="section-menu">
                                <span title="Split the direct frames into new subsections">regroup ▾</span>
                                <div class="dropdown">
                                    <button data-role='regroup' data-param='hours' title="Group frames sharing the same hour into their own subsection">by hours</button>
                                    <button data-role='regroup' data-param='days' title="Group frames sharing the same day into their own subsection">by days</button>
                                    <button data-role='regroup' data-param='weeks' title="Group frames sharing the same week into their own subsection">by weeks</button>
                                    <button data-role='regroup' data-param='months' title="Group frames sharing the same month into their own subsection">by months</button>
                                    <button data-role='regroup' data-param='years' title="Group frames sharing the same year into their own subsection">by years</button>
                                    <button data-role='regroup' data-param='tags' title="Group frames by their tag into their own subsection">by tags</button>
                                    <button data-role='regroup' data-param='folder' title="Group frames by the folder they were imported from (sli-folder) into their own subsection">by folder</button>
                                    <button data-role='regroup' data-param='camera' title="Group frames by the camera that took them (EXIF Make + Model) into their own subsection">by camera</button>
                                </div>
                            </div>
                        </div>`

    _menuOfMainTemplate = `<div class="section-menus">
                        <div class="section-menu-row">
                            ${this._subsectionMenuRow}
                            <button data-role='untag-all' title="Clear every tag from all frames inside, recursively">untag all</button>
                            <div class="section-menu tag-filter-menu">
                                <span title="Show only frames carrying the checked tag(s)">filter by tag ▾</span>
                                <div class="dropdown tag-filter-dropdown"></div>
                            </div>
                        </div>
                        ${this._frameMenuRow}
                    </div>`

    _sectionMenuTemplate = `<div class="section-menus">
                        <div class="section-menu-row">
                            ${this._subsectionMenuRow}
                            <button data-role='untag-all' title="Clear every tag from all frames inside, recursively">untag all</button>
                            <button data-role='delete' title="Delete this section AND everything inside it – all its frames and subsections">delete</button>
                        </div>
                        ${this._frameMenuRow}
                    </div>`

    /** <frame-preview> index in this.$framesSections – or, while a ribbon is pinned as the paste target
     * (see pasteTarget), that ribbon's own index, so the keyboard cursor can keep moving relative to it
     * instead of the real (unchanged) current frame it was pinned from. */
    _currentPos() {
        if (this.pasteTarget) {
            return this.$framesSections.index(this.pasteTarget[0])
        }
        return this.$framesSections.index(this.pl.frame.$frame)
    }


    /** @param {HTMLElement} el @returns {boolean} A frame element (article / article-map). */
    _isFrameEl(el) {
        return !!el && ["ARTICLE", "ARTICLE-MAP"].includes(el.tagName)
    }

    /** @param {HTMLElement} el @returns {boolean} A section/main ribbon with no frame anywhere inside it
     * (recursively) – the only grid positions with no frame of their own to land the cursor on. Arrow
     * navigation still needs to be able to stop here (see getFrameIndexInNextRow) so Ctrl+V has a way to
     * target a freshly inserted empty subsection without reaching for the mouse. */
    _isEmptySection(el) {
        return ["SECTION", "MAIN"].includes(el.tagName) && $(el).find(FRAME_SELECTOR).length === 0
    }

    /**
     * @param {HTMLElement} el
     * @returns {boolean} A frame living loose in its nearest section/main – not inside one of that
     * container's own subsections (possibly inside a plain layout <div>) – while that container DOES have
     * subsections. Only then does it need a "Loose frames" cue; a section with no subsections at all has
     * nothing for its own frames to look separated from.
     */
    _isOrphan(el) {
        if (!this._isFrameEl(el)) return false
        const $container = $(el).closest("section, main")
        const sc = this.pl.section_controller
        return sc.getDirectSections($container).length > 0 && sc.getDirectFrames($container).is(el)
    }

    /**
     * @param {number} i Index into this.$framesSections
     * @returns {boolean} This position starts a run of orphan frames that directly follows either an
     * in-section frame or a *different* section's ribbon (ex. an empty subsection just inserted before
     * it) – the spots where, without a cue, orphans look "glued" to whatever came right before them. A run
     * right after this frame's OWN container's ribbon needs no extra cue; that ribbon already heads it.
     */
    _orphanRunStart(i) {
        const el = this.$framesSections[i]
        const prev = this.$framesSections[i - 1]
        if (!this._isOrphan(el) || !prev) return false
        if (!this._isFrameEl(prev)) {
            return prev !== $(el).closest("section, main")[0] // some other (sub)section's ribbon, not ours
        }
        return !this._isOrphan(prev)
    }

    /**
     * Besides colMap, also builds `this.rowOf`: a visual row number per this.$framesSections index, used by
     * getFrameIndexInNextRow to jump by exactly one row regardless of how many thumbnails are in it. A row
     * is either a run of thumbnails (0..columns-1, wrapping or cut short by the next boundary) or a single
     * empty-section ribbon (its own dedicated, landable row – see _isEmptySection). A non-empty ribbon gets
     * no row of its own: it is not a landing spot, so it just tags along with whatever row preceded it,
     * while still resetting the column so the frames after it start a fresh row.
     */
    _buildColMap() {
        const colMap = []
        const rowOf = []
        let col = 0
        let row = -1
        this.$framesSections.each((i, el) => {
            if (["SECTION", "MAIN"].includes(el.tagName)) {
                col = 0
                colMap[i] = null
                if (this._isEmptySection(el)) row++
                rowOf[i] = row
            } else {
                if (this._orphanRunStart(i)) col = 0 // break onto a fresh row under the loose-frames divider
                if (col === 0) row++
                colMap[i] = col
                rowOf[i] = row
                col = (col + 1) % this.columns
            }
        })
        this.rowOf = rowOf
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
        const isMain = $(this.$framesSections[fsIndex]).closest("section, main").is("main")
        $("<div/>", { class: "grid-orphan-divider", text: isMain ? "Loose frames — outside any section" : "Loose frames — outside any subsection" })
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
        const sc = pl.section_controller
        const $main = $(main)
        const rawTitle = presentation_name()
        const $mc = $(`<section-controller data-role="main">
                    <span class="section-title">
                        <span class="section-title-name">${rawTitle || "Presentation"}</span>
                        <span class="section-title-counts">(${sc.getSectionCounts($main)})</span>
                    </span>
                    ${this._tagFilterBadge()}
                    ${this._menuOfMainTemplate}
                </section-controller>`)
            .data("section", main)
        this._makeTitleEditable($mc.find(".section-title-name"), rawTitle, "Presentation",
            name => pl.set_presentation_name(name))
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
        const sc = this.pl.section_controller
        const $section = $(currentSection)
        const depth = $section.parents("section").length // 0 for a top-level section, 1+ for a subsection
        const rawTitle = sc.getSectionTitle($section)
        const $sc = $(`<section-controller style="--depth: ${depth}">
                        <span class="section-title">
                            <span class="section-title-name">${rawTitle || "Section"}</span>
                            <span class="section-title-counts">(${sc.getSectionCounts($section)})</span>
                        </span>
                        ${this._sectionMenuTemplate}
                    </section-controller>`)
            .data("section", currentSection)
        this._makeTitleEditable($sc.find(".section-title-name"), rawTitle, "Section",
            name => sc.renameSection($section, name))
        return prepend ? $sc.prependTo(this.$container) : $sc.appendTo(this.$container)
    }

    /**
     * Turns `$name` (a ".section-title-name" span showing the current title or `fallback`) into an
     * inline text input on click – <kbd>Enter</kbd>/blur commits via `onCommit`, <kbd>Escape</kbd> or an
     * unchanged value discards. Stops the click from bubbling to the delegated "section-controller"
     * click handler (Hud.init_grid), which would otherwise also pin/unpin this ribbon as the paste
     * target. Hotkeys are suspended for the duration (`Operation.suspendHotkeys()`, the same mechanism
     * a Zebra_Dialog uses) – WebHotkeys only special-cases single printable characters while a text
     * input is focused, so without this, <kbd>Escape</kbd>/digit keys typed into the name would still
     * fire the grid's own "clear selection"/tagging hotkeys instead of just editing the text. `onCommit`
     * goes through `Changes.undoable` (see `Playback.set_presentation_name()` /
     * `SectionController.renameSection()`), whose `do_always` calls `pl.reset()` – that rebuilds the
     * whole grid, so a successful commit needs no manual DOM patch here; only the discard path does.
     * @param {JQuery} $name
     * @param {string} rawValue Current raw title (empty when unset).
     * @param {string} fallback Placeholder text, and what to restore to on discard when `rawValue` is empty.
     * @param {(value: string) => void} onCommit
     */
    _makeTitleEditable($name, rawValue, fallback, onCommit) {
        $name.off("click.rename").on("click.rename", e => {
            e.stopPropagation()
            if ($name.children("input").length) {
                return // already editing – let the input handle its own click (cursor placement)
            }
            const resumeHotkeys = this.pl.operation.suspendHotkeys()
            const $input = $("<input/>", { class: "section-title-input", value: rawValue, placeholder: fallback })
            $name.empty().append($input)
            const input = /** @type {HTMLInputElement} */ ($input[0])
            input.focus()
            input.select()
            const restore = () => $name.text(rawValue || fallback)
            $input.on("keydown", ev => {
                if (ev.key === "Enter") {
                    ev.preventDefault()
                    $input[0].blur()
                } else if (ev.key === "Escape") {
                    ev.preventDefault()
                    $input.data("discard", true)
                    $input[0].blur()
                }
            }).on("blur", () => {
                resumeHotkeys()
                const value = String($input.val()).trim()
                if ($input.data("discard") || value === rawValue) {
                    restore()
                } else {
                    onCommit(value)
                }
            })
        })
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
     * @returns {number|HTMLElement|null}
     */
    getFrameIndexInNextPage(direction) {
        const containerHeight = this.$container[0].clientHeight
        const thumbHeight = this.hud.getThumbnail(this.pl.frame, this.$container)[0]?.offsetHeight
        if (!thumbHeight) return this.pl.index

        const rowsPerPage = Math.max(1, Math.floor(containerHeight / thumbHeight) - 1)

        return this.getFrameIndexInNextRow(rowsPerPage * direction)
    }

    /**
     * Returns the frame index of the thumbnail that is visually rows above/below the given frame index –
     * or, if that row is an empty section's ribbon (nothing else to land on), the section element itself.
     * Jumps by exactly one row even when the target row has fewer thumbnails than the current column –
     * it clamps to the row's last thumbnail instead of continuing to search further rows for an exact
     * column match. The aimed-for column is sticky (see preferredCol): it keeps being pursued across
     * repeated calls even though a short row or an empty-section stop couldn't satisfy it, so e.g. landing
     * on an empty section (2 rows above a row of 5) and continuing down twice more lands back on the 3rd
     * thumbnail rather than getting stuck at whatever narrower column the empty row implied.
     * @param {number} rows Positive for down, negative for up
     * @returns {number|HTMLElement|null}
     */
    getFrameIndexInNextRow(rows) {
        const pos = this._currentPos()
        if (pos === -1) return null

        const desiredCol = this.preferredCol ?? this.colMap[pos]
        this.preferredCol = desiredCol
        const targetRow = this.rowOf[pos] + rows

        if (targetRow < 0) return 0
        if (targetRow > this.rowOf[this.rowOf.length - 1]) return this.pl.$articles.length - 1

        let ribbon = null, best = null
        for (let i = 0; i < this.rowOf.length; i++) {
            if (this.rowOf[i] !== targetRow) continue
            const col = this.colMap[i]
            if (col === null) {
                ribbon = this.$framesSections[i] // a non-empty ribbon never gets its own row (see _buildColMap)
                continue
            }
            if (col <= desiredCol) best = i
            if (col >= desiredCol) break // first column reaching (or clamped past) the desired one – nearest match
        }
        if (ribbon) {
            return this._isEmptySection(ribbon) ? ribbon : null
        }
        return best != null ? $(this.$framesSections[best]).data("frame")?.index ?? null : null
    }

    // ---- Multi-selection ---------------------------------------------------------------------------
    // A file-manager style selection layered over the grid. The current frame (pl.index) doubles as the
    // selection cursor; `selection` holds the extra chosen frames and `anchor` is the fixed end of a
    // Shift-range. Bulk operations (tag / delete / move) act on the selection, falling back to the cursor
    // alone when nothing is selected. Wired to hotkeys in Operation.gridInit and clicks in Hud.init.

    /** @returns {boolean} */
    hasSelection() {
        return this.selection.size > 0
    }

    /** Drop the whole selection (and its anchor) and repaint. */
    clearSelection() {
        this.selection.clear()
        this.anchor = null
        this.pasteTarget = null
        this._syncSelectionClass()
    }

    /**
     * The "✖ clear" action: if a cut/copy clipboard is active, drop it first (so cut/copied frames
     * un-grey without also losing the selection) – only a second call, once the clipboard is already
     * empty, clears the selection itself.
     */
    clearClipboardOrSelection() {
        if (this.clipboard) {
            this.clipboard = null
            this._syncSelectionClass()
        } else {
            this.clearSelection()
        }
    }

    /** Select every filter-visible frame (Ctrl+A). */
    selectAll() {
        this.selection.clear()
        this.pl.$articles.each((i, el) => {
            if (this.pl.frame_matches_filter($(el).data("frame"))) {
                this.selection.add(i)
            }
        })
        this.anchor = null
        this._syncSelectionClass()
    }

    /**
     * Frames the bulk operations act on: the selection in document order, or just the cursor frame when
     * nothing is selected.
     * @returns {Frame[]}
     */
    selectedFrames() {
        const indices = this.hasSelection() ? [...this.selection] : [this.pl.index]
        return indices.sort((a, b) => a - b)
            .map(i => $(this.pl.$articles[i]).data("frame"))
            .filter(Boolean)
    }

    /** Replace the selection with the (filter-visible) frame indices in the inclusive range a…b. */
    _selectRange(a, b) {
        this.selection.clear()
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        for (let i = lo; i <= hi; i++) {
            if (this.pl.frame_matches_filter($(this.pl.$articles[i]).data("frame"))) {
                this.selection.add(i)
            }
        }
    }

    /** Toggle `index` (defaults to the cursor) in/out of the selection – Ctrl+Space / Ctrl+click. */
    toggleSelect(index = this.pl.index) {
        if (this.selection.has(index)) {
            this.selection.delete(index)
        } else {
            this.selection.add(index)
        }
        this.anchor = index
        this.pasteTarget = null
        this._syncSelectionClass()
    }

    /**
     * Plain cursor move (arrow without a modifier): move the cursor but KEEP the selection, and re-anchor
     * to the new cursor so a following Shift+arrow extends from here. Keeping the selection lets you build a
     * scattered pick with just Space+arrows – Escape (or a plain click) is what clears it.
     * @param {function} navFn Either performs the navigation itself (previousFrame/nextFrame do that
     * internally and return undefined), or returns where to go: a frame index, or – when the target row is
     * an empty section with no frame inside it to land on – its section/main element, pinned as the paste
     * target instead (see togglePasteTarget) so Ctrl+V still has somewhere to go without a mouse click.
     */
    moveCursor(navFn) {
        const target = navFn()
        if (target instanceof HTMLElement) {
            this.pasteTarget = $(target)
            this._syncSelectionClass()
            this._scrollToSection(this.pasteTarget)
            return
        }
        if (typeof target === "number") {
            this.pl.goToFrame(target)
        } else {
            // navFn performed its own (non-vertical, ex. previousFrame/nextFrame) move – forget the
            // remembered column so the next Up/Down starts fresh from wherever this actually landed.
            this.preferredCol = null
        }
        this.anchor = this.pl.index
        this.pasteTarget = null
        this._syncSelectionClass()
    }

    /** Scroll the pinned section's ribbon into view if it is currently rendered but off-screen (a no-op
     * if it fell outside the grid's lazily-loaded window – same best-effort as _scrollToCurrentFrame). */
    _scrollToSection($section) {
        setTimeout(() => {
            const el = this.$container.children("section-controller")
                .filter((_, e) => $(e).data("section") === $section[0]).get(0)
            if (!el) return
            const rect = el.getBoundingClientRect()
            if (rect.top < 0 || rect.bottom > document.documentElement.clientHeight) {
                el.scrollIntoView({ block: "center" })
            }
        }, 1)
    }

    /**
     * Shift+arrow: stretch/shrink the selection from the anchor to `targetIndex` and move the cursor there.
     * A whole "Shift+Up adds the row above" falls out for free – the row's frames sit in the contiguous
     * index range between anchor and target.
     * @param {?number|HTMLElement} targetIndex
     */
    extendTo(targetIndex) {
        // An empty section has no frame to add to the selection – ignore it (getFrameIndexInNextRow may
        // return its element instead of an index when the target row is such a section).
        if (typeof targetIndex !== "number" || targetIndex < 0 || targetIndex >= this.pl.$articles.length) {
            return
        }
        if (this.anchor === null) {
            this.anchor = this.pl.index
        }
        this._selectRange(this.anchor, targetIndex)
        this.pl.goToFrame(targetIndex)
        this.pasteTarget = null
        this._syncSelectionClass()
    }

    /**
     * Paint `selected` on the chosen thumbnails, `cut` on those in a cut-clipboard (greyed, "about to
     * move") and `copied` on those in a copy-clipboard (dashed outline, "will be cloned") – so the user
     * can tell which frames are on the clipboard – then refresh the badge.
     */
    _syncSelectionClass() {
        const clip = this.clipboard
        const clipSet = new Set(clip ? clip.frames.map(f => f.index) : [])
        this.$container.children("frame-preview").each((_, el) => {
            const ref = Number(el.dataset.ref)
            $(el).toggleClass("selected", this.selection.has(ref))
                .toggleClass("cut", !!clip?.cut && clipSet.has(ref))
                .toggleClass("copied", !!clip && !clip.cut && clipSet.has(ref))
        })
        this.$container.children("section-controller").each((_, el) => {
            $(el).toggleClass("paste-target", !!this.pasteTarget?.is($(el).data("section")))
        })
        this.hud.refresh_selection_info()
    }

    /**
     * Shift/Ctrl+drag over the grid draws a rubber-band rectangle that adds every frame it touches to the
     * selection – an alternative to clicking each one. Bound once (Hud.init_grid) in the capture phase so
     * it pre-empts the per-thumbnail jQuery-UI drag (which reorders on a plain, modifier-free drag). A drag
     * shorter than the threshold is left alone, so a modifier *click* still falls through to its handler.
     */
    initMarquee() {
        const container = this.$container[0]
        const THRESHOLD = 5
        let start = null, $box = null, base = null, moved = false

        container.addEventListener("mousedown", e => {
            if (e.button !== 0 || !(e.shiftKey || e.ctrlKey || e.metaKey)) {
                return
            }
            if (e.target instanceof Element && e.target.closest("button, input, a")) {
                return // let modifier-clicks on ribbon controls work normally
            }
            e.stopPropagation() // pre-empt the thumbnail's drag-to-reorder
            e.preventDefault()  // no native image/text drag ghost
            start = { x: e.clientX, y: e.clientY }
            moved = false

            const onMove = ev => {
                if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < THRESHOLD) {
                    return
                }
                if (!moved) { // threshold crossed – begin the rubber band, remembering the pre-existing pick
                    moved = true
                    base = new Set(this.selection)
                    $box = $("<div class='grid-marquee'/>").appendTo(document.body)
                }
                const x1 = Math.min(start.x, ev.clientX), y1 = Math.min(start.y, ev.clientY)
                const x2 = Math.max(start.x, ev.clientX), y2 = Math.max(start.y, ev.clientY)
                $box.css({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 })
                this._applyMarquee(base, x1, y1, x2, y2)
            }
            const onUp = () => {
                document.removeEventListener("mousemove", onMove, true)
                document.removeEventListener("mouseup", onUp, true)
                if (moved) {
                    $box?.remove()
                    $box = null
                    // a click fires right after the drag – swallow it so it doesn't re-toggle/extend
                    const swallow = ce => { ce.stopImmediatePropagation(); ce.preventDefault() }
                    container.addEventListener("click", swallow, { capture: true, once: true })
                    setTimeout(() => container.removeEventListener("click", swallow, true), 0)
                }
                start = null
            }
            document.addEventListener("mousemove", onMove, true)
            document.addEventListener("mouseup", onUp, true)
        }, true)
    }

    /**
     * Union `base` with every filter-visible frame whose thumbnail intersects the client-space rectangle.
     * @param {Set<number>} base Selection to grow from (captured when the drag began)
     */
    _applyMarquee(base, x1, y1, x2, y2) {
        this.selection = new Set(base)
        this.$container.children("frame-preview").each((_, el) => {
            const r = el.getBoundingClientRect()
            if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) {
                const ref = Number(el.dataset.ref)
                if (this.pl.frame_matches_filter($(this.pl.$articles[ref]).data("frame"))) {
                    this.selection.add(ref)
                }
            }
        })
        this._syncSelectionClass()
    }

    /**
     * One undoable that relocates the DOM nodes `$moved` via `doFn`, restores each to its original sibling
     * on undo, and once the reorder settles reselects `reselectFrames` at their fresh indices (repainting).
     * @param {string} label
     * @param {JQuery} $moved Nodes detached/reinserted by doFn – captured now for the undo restore.
     * @param {function} doFn
     * @param {Frame[]} reselectFrames Frames to re-mark selected afterwards (their .index is reassigned by reset()).
     */
    _relocate(label, $moved, doFn, reselectFrames) {
        const pl = this.pl
        // Restores replay in document order so an earlier node that was another's original prev-sibling is
        // back in place before the later one references it.
        const restores = $moved.toArray().map(el => {
            const $f = $(el), $prev = $f.prev(), $parent = $f.parent()
            return $prev.length ? () => $f.insertAfter($prev) : () => $f.prependTo($parent)
        })
        pl.changes.undoable(label, doFn, () => restores.forEach(r => r()), () => {
            pl.resetAndGo()
            this.selection = new Set(reselectFrames.map(f => f.index))
            this.anchor = null
            if (this.isDisplayed) {
                this._syncSelectionClass()
            }
        })
    }

    /**
     * Move the whole selection (or the cursor frame alone) as one block, one undoable. Rather than moving
     * the block, it hops the (up to) one row's / one column's worth of NON-selected frames adjacent to the
     * block over to its far side: the block slides the opposite way and the move is perfectly symmetric, so
     * Ctrl+Down then Ctrl+Up returns to the exact original layout (may cross section boundaries).
     * @param {"up"|"down"|"left"|"right"} dir
     */
    moveSelection(dir) {
        const pl = this.pl
        const indices = (this.hasSelection() ? [...this.selection] : [pl.index]).sort((a, b) => a - b)
        const forward = dir === "down" || dir === "right"
        const step = (dir === "up" || dir === "down") ? this.columns : 1
        const selSet = new Set(indices)
        const N = pl.$articles.length

        const pivots = []
        if (forward) {
            for (let i = indices[indices.length - 1] + 1; i < N && pivots.length < step; i++) {
                if (!selSet.has(i)) pivots.push(i)
            }
        } else {
            for (let i = indices[0] - 1; i >= 0 && pivots.length < step; i--) {
                if (!selSet.has(i)) pivots.push(i)
            }
        }
        if (!pivots.length) {
            pl.shake()
            return
        }
        pivots.sort((a, b) => a - b)

        const $pivots = $(pivots.map(i => pl.$articles[i]))
        const $blockFirst = $(pl.$articles[indices[0]])
        const $blockLast = $(pl.$articles[indices[indices.length - 1]])
        const movedFrames = indices.map(i => $(pl.$articles[i]).data("frame"))

        this._relocate(`Move ${movedFrames.length} frames`, $pivots,
            () => forward ? $blockFirst.before($pivots) : $blockLast.after($pivots),
            movedFrames)
    }

    /** Drag-drop of a multi-selection: move every selected frame next to `targetRef` (before/after it). */
    moveSelectionBeside(targetRef, before) {
        const pl = this.pl
        targetRef = Number(targetRef)
        const frames = this.selectedFrames()
        if (frames.some(f => f.index === targetRef)) {
            return // dropped onto one of the dragged frames – no-op
        }
        const $frames = $(frames.map(f => f.$frame[0]))
        const $target = $(pl.$articles[targetRef])
        this._relocate(`Move ${frames.length} frames`, $frames,
            () => $target[before ? "before" : "after"]($frames), frames)
    }

    /** Drag-drop of a multi-selection onto a section ribbon: prepend every selected frame into it. */
    putSelectionIntoSection(section) {
        const frames = this.selectedFrames()
        const $frames = $(frames.map(f => f.$frame[0]))
        this._relocate(`Move ${frames.length} frames to section`, $frames,
            () => $(section).prepend($frames), frames)
    }

    /**
     * Toggle tag `n` on every selected frame as one undoable (`n` null/0 clears). Bulk-consistent: if all
     * selected frames already carry `n` it is removed from all, otherwise added to all.
     * @param {?number} n
     */
    tagSelection(n) {
        const pl = this.pl
        const frames = this.selectedFrames()
        const snap = frames.map(f => ({ f, before: f.get_tags() }))
        let label, apply
        if (!n) {
            label = `Clear tags on ${frames.length} frames`
            apply = () => []
        } else {
            const allHave = snap.every(({ before }) => before.includes(n))
            label = `${allHave ? "Untag" : "Tag"} ${n} on ${frames.length} frames`
            apply = ({ before }) => allHave
                ? before.filter(t => t !== n)
                : (before.includes(n) ? before : [...before, n].sort((a, b) => a - b))
        }
        pl.changes.undoable(label,
            () => snap.forEach(s => s.f.write_tags(apply(s))),
            () => snap.forEach(({ f, before }) => f.write_tags(before)))
    }

    /** Delete every selected frame as one undoable, then land the cursor on a surviving frame.
     * When the cursor is pinned on a section (paste target) instead of a frame, delete that section. */
    deleteSelection() {
        const pl = this.pl
        if (this.pasteTarget && !this.hasSelection()) {
            pl.section_controller.deleteSection(this.pasteTarget)
            this.pasteTarget = null
            this._syncSelectionClass()
            return
        }
        const frames = this.selectedFrames()
        if (frames.length === 1) {
            frames[0].delete()
            this.clearSelection()
            return
        }
        const snaps = frames.map(f => {
            const $frame = f.$frame
            const $prev = $frame.prev()
            const $parent = $frame.parent()
            return { $frame, reinsert: $prev.length ? () => $frame.insertAfter($prev) : () => $frame.prependTo($parent) }
        })
        const landing = Math.min(...frames.map(f => f.index))
        pl.changes.undoable(`Delete ${frames.length} frames`,
            () => snaps.forEach(s => s.$frame.detach()),
            () => snaps.forEach(s => s.reinsert()),
            () => {
                this.selection.clear()
                this.anchor = null
                pl.reset()
                const target = pl.$articles[Math.min(landing, pl.$articles.length - 1)] ?? pl.$articles.get(-1)
                pl.goToFrame($(target).data("frame")?.index ?? 0)
                this._syncSelectionClass()
            })
    }

    // ---- Clipboard (copy / cut / paste) -----------------------------------------------------------
    // Copy serializes the selected frames so a paste inserts fresh clones; cut keeps the live frames so a
    // paste moves them. Paste drops the frames right after the current cursor frame. Both keybinding styles
    // are wired in Operation.gridInit (Ctrl+C/X/V and Ctrl+Insert / Shift+Delete / Shift+Insert).

    /**
     * Serialize frames for the clipboard, stripping the live transient state (inline position `style`,
     * `sli-preloaded`, generated `sli-templated` children) so a pasted clone loads its preview from
     * scratch instead of inheriting a "already positioned & preloaded" corpse that never renders.
     * @param {Frame[]} frames
     * @returns {string[]}
     */
    _serialize(frames) {
        return frames.map(f => {
            const $c = f.$frame.clone().removeAttr("style").removeAttr("sli-preloaded")
            $c.find("[sli-templated]").remove()
            return $c[0].outerHTML
        })
    }

    /** Remember the selection for a clone-on-paste copy. */
    copySelection() {
        const frames = this.selectedFrames()
        if (!frames.length) {
            return
        }
        this.clipboard = { html: this._serialize(frames), cut: false, frames }
        this.pl.hud.info(`Copied ${frames.length} frames`)
        this._syncSelectionClass()
    }

    /** Remember the selection for a move-on-paste cut. */
    cutSelection() {
        const frames = this.selectedFrames()
        if (!frames.length) {
            return
        }
        this.clipboard = { html: this._serialize(frames), cut: true, frames }
        this.pl.hud.info(`Cut ${frames.length} frames`)
        this._syncSelectionClass()
    }

    /** Insert the clipboard just after the current cursor frame (or, if a section ribbon is pinned via
     * togglePasteTarget, as that section's first frames) – cloning on copy, moving on cut. */
    paste() {
        const pl = this.pl
        const clip = this.clipboard
        if (!clip?.html?.length) {
            pl.shake()
            return
        }
        const target = this.pasteTarget
        const $cursor = pl.frame.$frame

        if (clip.cut) {
            const frames = clip.frames.filter(f => f.$frame.parent().length) // still in the DOM
            if (!frames.length || (!target && frames.some(f => f.index === pl.index))) {
                pl.shake() // nothing to move, or pasting onto one of the cut frames itself
                return
            }
            const $frames = $(frames.map(f => f.$frame[0]))
            this.clipboard = null // cleared before the move so _relocate's repaint drops the "cut" marks
            this._relocate(`Move ${frames.length} frames`, $frames,
                () => target ? target.prepend($frames) : $cursor.after($frames), frames)
        } else {
            /** @type {JQuery[]} Fresh clones – matches the array-of-jQuery shape SectionController.importFrames expects. */
            const $new = clip.html.map(h => $(h))
            pl.section_controller.importFrames($new, target ?? $cursor, target ? "prepend" : false)
            this.selection = new Set($new.map($f => $f.data("frame")?.index).filter(i => i != null))
            this.anchor = null
            this._syncSelectionClass()
        }
    }
}