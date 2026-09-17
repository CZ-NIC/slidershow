/**
 * Print-to-PDF export, the way reveal.js does it: instead of shipping a PDF writer, lay the presentation
 * out as one printable page per slide and let the browser's own "Save as PDF" do the writing. Text stays
 * vector, nothing new loads from a CDN, and it works from `file://`.
 *
 * Why a parallel tree of clones instead of restyling the live one:
 *  - `Playback.positionFrames()` writes inline top/left on every article and navigation is a transform of
 *    `<main>`; restyling articles into a static flow corrupts the position math the next resize reuses.
 *  - textFit, WZoom (`FrameZoom`) and panorama write **px** values computed against the current viewport.
 *    In paged media `vh`/`vw` re-resolve against the page box, those px do not – every zoom point and
 *    fitted font size would land wrong.
 *  - `#map` is a single Leaflet instance moved into the current frame, so no two live maps can coexist.
 *
 * So each page holds a clone sized in px to the *screen* viewport – the very box all that px math was
 * computed against – uniformly shrunk into the paper with `transform: scale()`. The same trick the grid
 * (`frame-preview > article`) and the aux window (`--aux-scale`) already use.
 */
class PdfExport {

    /** Paper presets, in CSS px at 96 px/inch. `null` means "whatever the window currently is". */
    static PAGE_SIZES = {
        "16:9": [1280, 720],
        "4:3": [1024, 768],
        "a4-landscape": [1123, 794],
        "a4-portrait": [794, 1123],
        "window": null,
    }

    /** @type {Object<string,string>} */
    static PAGE_SIZE_LABELS = {
        "16:9": "16:9 slide (1280×720)",
        "4:3": "4:3 slide (1024×768)",
        "a4-landscape": "A4 landscape",
        "a4-portrait": "A4 portrait",
        "window": "Match this window",
    }

    /** @param {Menu} menu */
    constructor(menu) {
        this.menu = menu
        /** @type {Playback} */
        this.playback = menu.playback
        /** @type {string} Key of PdfExport.PAGE_SIZES */
        this.page_size = "16:9"
        /** @type {boolean} One page per step, instead of one page per frame with every step shown. */
        this.include_steps = true
        /** @type {?JQuery} The print tree, while laid out. */
        this.$root = null
        /** @type {?{index: number, step_disabled: boolean}} Playback state to put back in `teardown()`. */
        this._restore = null
        /** @type {boolean} Guards against `build()` running twice at once (it drives the live playback). */
        this._building = false
    }

    // -------------------------------------------------------------- UI

    dialog() {
        const op = this.playback.operation
        const $size = $("<select/>", { class: "print-size" }).append(
            Object.keys(PdfExport.PAGE_SIZES).map(key => $("<option/>", {
                value: key, text: PdfExport.PAGE_SIZE_LABELS[key], selected: this.page_size === key
            })[0])
        ).on("change", () => { this.page_size = String($size.val()) })

        const $steps = $("<input/>", { type: "checkbox", checked: this.include_steps })
            .on("change", () => { this.include_steps = $steps.prop("checked") })

        const $body = $("<div/>", { class: "print-dialog" }).append(
            $("<div/>").append($("<label/>", { text: "Page size: " }).append($size)),
            $("<div/>").append($("<label/>", { text: " One page per step (otherwise every step is shown at once)" })
                .prepend($steps)),
            $("<p/>", {
                text: "Every frame is visited to load its media, so this takes a while. The pages are then "
                    + "laid out on screen – check them over and hit Print to let the browser write the PDF "
                    + "(choose 'Save as PDF' and keep margins at none)."
            })
        )
        op._confirmOnEnter($body, "Lay out")

        new $.Zebra_Dialog({
            type: false,
            width: 560,
            source: { inline: $body },
            title: "Export to PDF",
            auto_focus_button: 1,
            onClose: op.suspendHotkeys(),
            buttons: ["Cancel", {
                caption: "Lay out",
                default_confirmation: true,
                callback: () => this.build()
            }]
        })
    }

    // -------------------------------------------------------------- build

    /**
     * Walks every navigable frame (and, with `include_steps`, every one of its steps), snapshotting each
     * into a printable page. Leaves the result laid out on screen; the user reviews it and prints.
     *
     * @param {{page_size?: string, include_steps?: boolean}} options
     * @returns {Promise<number>} Number of pages produced.
     */
    async build(options = {}) {
        if (this._building) {
            return 0
        }
        const pl = this.playback
        this.teardown()
        this._building = true

        const page_size = options.page_size ?? this.page_size
        const include_steps = options.include_steps ?? this.include_steps

        // A frame is snapshotted at the size it is rendered at right now – the box every px value inside
        // it (zoom transform, fitted font size) was computed against.
        const slide_w = window.innerWidth
        const slide_h = window.innerHeight
        const [page_w, page_h] = PdfExport.PAGE_SIZES[page_size] || [slide_w, slide_h]
        const scale = Math.min(page_w / slide_w, page_h / slide_h)

        const $root = this.$root = $("<print-root/>").css({
            "--page-w": page_w + "px",
            "--page-h": page_h + "px",
            "--slide-w": slide_w + "px",
            "--slide-h": slide_h + "px",
            "--print-scale": scale,
            // letterbox: centre the slide on the sheet
            "--offset-x": (page_w - slide_w * scale) / 2 + "px",
            "--offset-y": (page_h - slide_h * scale) / 2 + "px",
        }).appendTo("body")

        // `@page { size }` cannot read a custom property, so the sheet size is generated. Margins must be
        // zero, otherwise the browser scales our exactly-sized page down to fit inside them.
        $("<style/>", { id: "sli-print-page", text: `@page { size: ${page_w}px ${page_h}px; margin: 0 }` })
            .appendTo("head")

        // The grid short-circuits goToFrame() (it only refreshes the grid cursor), so nothing would ever
        // be entered or loaded while it is open.
        if (pl.hud.grid_visible) {
            pl.hud.toggle_grid()
        }
        this._restore = { index: pl.index, step_disabled: pl.step_disabled }
        // With steps disabled, `steps_prepare()` never runs and every [sli-step] element stays as
        // authored – which is exactly the flattened "whole frame at once" page we want in that mode.
        pl.step_disabled = !include_steps

        const $progress = $("<print-progress/>").appendTo("body")
        let pages = 0
        try {
            for (let index = 0; index < pl.$articles.length; index++) {
                /** @type {Frame} */
                const frame = $(pl.$articles[index]).data("frame")
                if (!frame || !pl.frame_is_navigable(frame)) {
                    continue // hidden tag / active tag filter – not part of the presentation right now
                }
                $progress.text(`Preparing page ${pages + 1} – frame ${index + 1}/${pl.$articles.length}`)
                pl.goToFrame(index, false, true, true)
                if (pl.frame !== frame) {
                    continue // goToFrame redirected us elsewhere; that frame gets (or got) its own turn
                }
                await this._frame_ready(frame)
                if (this.$root !== $root) {
                    return 0 // torn down meanwhile (the Close button) – stop filling a detached tree
                }
                if (include_steps && frame.steps.length) {
                    // `resetSteps` above means what the Home key means – the frame's *first step* is
                    // already shown. A PDF wants the frame's base state as a page of its own first, so
                    // rewind past it (immediately, there is nothing to animate for a snapshot).
                    frame.step_index = 0
                    frame.step_process($(/** @type {any} */(frame.steps.flat())), false, true)
                }
                this._add_page(frame, $root)
                pages++
                if (include_steps) {
                    while (frame.step(1)) {
                        await this._settle()
                        this._add_page(frame, $root)
                        pages++
                    }
                }
            }
        } finally {
            $progress.remove()
            this._building = false
        }

        if (!pages) {
            this.teardown()
            pl.hud.info("Nothing to print – no frame is currently visible.")
            return 0
        }
        $root.append(this._toolbar(pages))
        // Only now – the attribute hides the live presentation, which had to stay rendered (and
        // correctly sized) for every snapshot above.
        document.documentElement.setAttribute("sli-print", "")
        window.scrollTo(0, 0)
        await this._wait_for_paint()
        return pages
    }

    /** Waits until a freshly entered frame is actually showing what it is going to show. */
    async _frame_ready(frame) {
        await frame.preload()
        // `Frame.loaded` resolves on "error" too, so a missing file cannot hang the whole run.
        await frame.loaded
        await this.playback.promise // the (suppressed) transition; `enter()` runs off its callback
        await Promise.all(frame.effects)
        await this._settle()
    }

    /** One frame's paint plus, going forward, the CSS step animations (killed in the clone anyway). */
    async _settle() {
        await new Promise(resolve => setTimeout(resolve, 60))
        await new Promise(resolve => requestAnimationFrame(resolve))
    }

    /**
     * Snapshots the frame as it stands right now into a new page.
     * @param {Frame} frame
     * @param {JQuery} $root
     */
    _add_page(frame, $root) {
        const $page = $("<print-page/>").append(frame.get_preview(true, true))
        this._freeze_videos(frame, $page)
        $page.appendTo($root)
    }

    /**
     * A cloned `<video>` prints as a black box (or at best its poster). The live one, however, is decoded
     * right now – draw its current frame into a canvas and print that instead. The canvas is tainted
     * under `file://`, but nothing here reads its pixels back; it only has to paint.
     * (This is why the reservation noted in `Frame.get_preview()` does not apply: that one was about
     * having to ship the pixels to another window.)
     * @param {Frame} frame
     * @param {JQuery} $page
     */
    _freeze_videos(frame, $page) {
        const $originals = frame.$frame.find("video")
        const article = frame.$frame[0]?.getBoundingClientRect()
        $page.find("video").each((i, el) => {
            const video = /** @type {HTMLVideoElement} */ ($originals[i])
            if (!video?.videoWidth || !article) {
                return // nothing decoded yet – leave the clone be, the 🎥 badge stands in for it
            }
            const canvas = document.createElement("canvas")
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            canvas.getContext("2d").drawImage(video, 0, 0)
            // Placed by its real on-screen geometry rather than by CSS: the page is a 1:1 copy of the
            // viewport, so the same rectangle is correct whatever laid the video out (object-fit, zoom…).
            const box = video.getBoundingClientRect()
            $(canvas).addClass("print-frozen-video").css({
                left: box.left - article.left + "px",
                top: box.top - article.top + "px",
                width: box.width + "px",
                height: box.height + "px",
            }).replaceAll(el)
        })
    }

    /** On-screen only (hidden in `@media print`) – the pages are useless without a way to print them. */
    _toolbar(pages) {
        return $("<print-toolbar/>").append(
            $("<span/>", { text: `${pages} page${pages > 1 ? "s" : ""}` }),
            $("<button/>", { text: "Print", click: () => this.print_now() }),
            $("<button/>", { text: "Close", click: () => this.teardown() }),
        )
    }

    // -------------------------------------------------------------- print & restore

    /** Hands the laid-out pages to the browser's print dialog ("Save as PDF"). */
    async print_now() {
        if (!this.$root) {
            return
        }
        await this._wait_for_paint()
        window.print()
    }

    /** Build and print in one go – what a caller (test, palette) that wants no review step uses. */
    async print(options = {}) {
        if (await this.build(options)) {
            await this.print_now()
        }
    }

    /** Nothing may reach the printer half-decoded; `img.decode()` is the reliable "this will paint" signal. */
    async _wait_for_paint() {
        await document.fonts.ready
        const imgs = /** @type {HTMLImageElement[]} */ ($("img", this.$root).get())
        await Promise.all(imgs.map(img => img.decode?.().catch(() => { })))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }

    /** Removes the print tree and puts the playback back where the user left it. Safe to call twice. */
    teardown() {
        $("#sli-print-page").remove()
        document.documentElement.removeAttribute("sli-print")
        this.$root?.remove()
        this.$root = null
        if (this._restore) {
            const { index, step_disabled } = this._restore
            this._restore = null
            this.playback.step_disabled = step_disabled
            // resetSteps: the walk above left the last frame mid-step.
            this.playback.goToFrame(index, false, true, true)
        }
    }
}
