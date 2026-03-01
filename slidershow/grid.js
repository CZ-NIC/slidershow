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
        this.$framesSections = $(FRAME_SECTION_SELECTOR)
        this.columns = GRID_COLUMNS
        this.preload_radius = Math.ceil(GRID_PRELOAD_RADIUS / GRID_COLUMNS) * GRID_COLUMNS
        this.page_size = Math.ceil(GRID_PAGE_SIZE / GRID_COLUMNS) * GRID_COLUMNS

        this.loadedFrom = 0
        this.loadedUpTo = 0
        this.colMap = this._buildColMap()
    }

    changeColumnsCount(step = 1) {
        GRID_COLUMNS += step
        this.$container.css("--columns", GRID_COLUMNS)
        this.hud.reset_grid()
    }

    /**
     * Initial load around current frame, bind scroll handler
     * @param {?Frame} lastFrame
     */
    load(lastFrame = null) {
        const currentPos = this._currentPos()
        const startFrom = this._snapToRowStart(Math.max(0, currentPos - this.preload_radius))
        const startTo = Math.min(this.$framesSections.length, currentPos + this.preload_radius)

        this.$framesSections.slice(startFrom, startTo).each((_, frameOrSection) => this._addToGrid(frameOrSection))
        this.loadedFrom = startFrom
        this.loadedUpTo = startTo

        this.hud.makeThumbnailsImportable(this.$container)
        this._bindScroll()
        this._scrollToCurrentFrame(lastFrame)
        return this
    }

    /**
     *
     * @param {?Frame} lastFrame
     */
    focusFrame(lastFrame = null) {
        const currentPos = this._currentPos()

        // Is this frame out of current range?
        if (currentPos < this.loadedFrom || currentPos >= this.loadedUpTo) {
            // Fetch through the missing direction
            if (currentPos < this.loadedFrom) {
                const from = this._snapToRowStart(Math.max(0, currentPos - this.preload_radius))
                this._loadBatch(from, this.loadedFrom - from, true)
            } else {
                this._loadBatch(this.loadedUpTo, currentPos - this.loadedUpTo + this.preload_radius, false)
            }
            this._discardFarItems()
        }

        this.hud.makeThumbnailsImportable(this.$container)
        this._scrollToCurrentFrame(lastFrame)
    }

    _currentPos() {
        return this.$framesSections.index(
            this.$framesSections.filter((_, el) =>
                el.tagName !== "SECTION" && $(el).data("frame")?.index === this.pl.index
            )[0]
        )
    }

    _buildColMap() {
        const colMap = []
        let col = 0
        this.$framesSections.each((i, el) => {
            if (el.tagName === "SECTION") {
                col = 0
                colMap[i] = null
            } else {
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

    _loadBatch(from, count, prepend = false) {
        const snappedFrom = this._snapToRowStart(from)
        const snappedTo = snappedFrom + count

        const slice = this.$framesSections.slice(snappedFrom, snappedTo).toArray()
        if (prepend) slice.reverse()
        slice.forEach(frameOrSection => this._addToGrid(frameOrSection, prepend))

        if (prepend) {
            this.loadedFrom = snappedFrom
        } else {
            this.loadedUpTo = snappedTo
        }
    }

    _discardFarItems() {
        const discard = (_, frameOrSection) => {
            if (frameOrSection.tagName === "SECTION") {
                this.$container.children("section-controller").filter((_, el) =>
                    $(el).data("section") === frameOrSection
                ).remove()
            } else {
                const idx = $(frameOrSection).data("frame")?.index
                this.$container.children(`[data-ref="${idx}"]`).remove()
            }
        }
        this.$framesSections.slice(0, this.loadedFrom).each(discard)
        this.$framesSections.slice(this.loadedUpTo).each(discard)
    }

    /**
     * @param {HTMLElement} frameOrSection
     */
    _addToGrid(frameOrSection, prepend = false) {
        if (frameOrSection.tagName === "SECTION") {
            this._assureSection(frameOrSection, prepend)
        } else {
            this.hud.assureThumbnail($(frameOrSection).data("frame"), this.$container, prepend)
        }
    }

    /**
     * Insert control ribbon for the section to the grid if encountered
     * @param {HTMLElement} currentSection
     * @param {boolean} prepend
     */
    _assureSection(currentSection, prepend = false) {
        const $sc = $(`<section-controller>
                        <span class="section-title">Section ${this.pl.section_controller.getSectionName($(currentSection))}</span>
                        <div class="section-menus">
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
                                    <button data-role='new-section'>section</button>
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
                            <button data-role='delete'>delete</button>
                        </div>
                    </section-controller>`)
            .data("section", currentSection)
        prepend ? $sc.prependTo(this.$container) : $sc.appendTo(this.$container)
    }

    _bindScroll() {
        this.$container.off('scroll').on('scroll', e => {
            const el = e.currentTarget
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5
            const atTop = el.scrollTop <= 5

            if (atBottom && this.loadedUpTo < this.$framesSections.length) {
                this._loadBatch(this.loadedUpTo, this.page_size, false)
                this.hud.makeThumbnailsImportable(this.$container)
                this._discardFarItems()
            }

            if (atTop && this.loadedFrom > 0) {
                const scrollBefore = el.scrollHeight
                this._loadBatch(Math.max(0, this.loadedFrom - this.page_size), this.page_size, true)
                this.hud.makeThumbnailsImportable(this.$container)
                el.scrollTop += el.scrollHeight - scrollBefore
                this._discardFarItems()
            }
        })
    }

    /**
     * Scroll to the thumbnail if not visible
     * @param {?Frame} lastFrame
     */
    _scrollToCurrentFrame(lastFrame) {
        // why set timeout? Because the re-ordering DOM changes must flush first.
        // Scroll only when the frame changed.
        // Ex: Hitting 'End' will scroll. But dragging unactive frames around would scroll you out from what you have just dragged.
        setTimeout(() => {
            if (this.pl.frame !== lastFrame) {
                const el = this.hud.getThumbnail(this.pl.frame, this.$container).get(0)
                if (!el) return
                const rect = el.getBoundingClientRect()
                if (rect.top < 0 || rect.bottom > document.documentElement.clientHeight) {
                    el.scrollIntoView({ block: "center" })
                }
            }
        }, 1)
    }
}