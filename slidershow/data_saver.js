/**
 * Data saver – the mode for a metered or slow connection: full-quality photos are not downloaded at
 * all. Where a `sli-thumb` preview exists it stands in for the original (a whole album then costs a
 * few megabytes instead of tens of gigabytes); where none does, the media is simply not loaded until
 * asked for, frame by frame.
 *
 * Turned on automatically when the browser reports a metered/data-saving connection
 * (`navigator.connection.saveData`), and toggleable at any time (<kbd>Alt+B</kbd> / the menu button).
 * Videos are never fetched eagerly by the app anyway (the browser streams them), so the mode only
 * changes what happens to images – but it does swap a video's poster for the cheap thumbnail too.
 */
class DataSaver {
    /** @param {Playback} playback */
    constructor(playback) {
        this.playback = playback

        /** @type {boolean} */
        this.active = false

        /** @type {Set<string>} Full-quality URLs that were not downloaded because of this mode. */
        this.skipped = new Set()
        /** @type {Set<string>} Thumbnail URLs loaded in their place. */
        this.substituted = new Set()
        /** @type {Set<string>} Full-quality URLs that _were_ downloaded – the sample the estimate uses. */
        this.loaded = new Set()

        /** @type {boolean} The user (or the URL hash) set the mode by hand – stop following the
         * browser's own Save-Data preference from then on. */
        this._explicit = false
    }

    /**
     * Whether the browser says this connection is metered or the user asked to save data.
     * `navigator.connection` is Chromium-only; elsewhere there is simply nothing to go on.
     */
    static get metered() {
        return Boolean(navigator.connection?.saveData)
    }

    /**
     * Adopt the browser's own Save-Data preference at boot, and keep following it if the user flips it
     * mid-session (Chrome fires `change` on the connection). An explicit toggle wins from then on – a
     * mode the user turned off must not switch itself back on.
     */
    listen() {
        if (DataSaver.metered) {
            this.set(true, "Metered connection detected")
        }
        navigator.connection?.addEventListener?.("change", () => {
            if (!this._explicit && DataSaver.metered !== this.active) {
                this.set(DataSaver.metered, "Connection changed")
            }
        })
    }

    /**
     * @param {boolean} on
     * @param {?string} why Prefixed to the notification – says what turned it on when it wasn't the user.
     */
    set(on, why = null) {
        if (this.active === on) {
            return
        }
        this.active = on
        const hud = this.playback.hud
        hud.info(`${why ? why + " – d" : "D"}ata saver ${on ? "enabled" : "disabled"}. ${on
            ? "Photos are shown from their thumbnails, or left unloaded where there is none (Alt+L loads the current frame)."
            : "Photos are downloaded in full again."}`)
        // Frames already loaded keep whatever they hold; the ones around the cursor are re-preloaded so
        // the change is visible right away rather than only once the cursor reaches fresh frames.
        hud.refresh_data_saver()
        this.playback.reload_media()
        this.playback.session.store()
    }

    toggle() {
        this._explicit = true
        this.set(!this.active)
    }

    /**
     * Record that a full-quality file was not downloaded.
     * @param {string} src The full-quality URL that was skipped.
     * @param {?string} thumb The thumbnail shown instead, if any.
     */
    skip(src, thumb = null) {
        this.skipped.add(src)
        if (thumb) {
            this.substituted.add(thumb)
        }
    }

    /** Record that a full-quality file _was_ downloaded – the sample the "would have been" estimate uses. */
    note_loaded(src) {
        this.loaded.add(src)
    }

    /**
     * How much this mode has saved so far. The bytes actually transferred are known exactly (resource
     * timing); the bytes *not* transferred cannot be – the app never asked the server how big those
     * files are, which is the whole point. They are therefore estimated from the average size of the
     * full-quality files that did get downloaded this session, and reported as an estimate. With no such
     * sample yet (nothing was ever loaded in full), only the file count is reported.
     * @returns {{skipped: number, spent: number, estimate: ?number, sample: number}}
     */
    stats() {
        const spent = DataSaver.transferred(this.substituted)
        const sample_bytes = DataSaver.transferred(this.loaded)
        const sample = this.loaded.size
        const estimate = sample ? this.skipped.size * (sample_bytes / sample) : null
        return { skipped: this.skipped.size, spent, estimate, sample }
    }

    /** Bytes the browser really transferred for the given URLs (0 for anything served from cache). */
    static transferred(urls) {
        return performance.getEntriesByType("resource")
            .filter(e => urls.has(e.name))
            .reduce((sum, e) => sum + (/** @type {PerformanceResourceTiming} */(e).transferSize
                || /** @type {PerformanceResourceTiming} */(e).encodedBodySize || 0), 0)
    }

    /** Human-readable savings, shown by the menu button's tooltip and by `report()`. */
    summary() {
        const { skipped, spent, estimate, sample } = this.stats()
        if (!skipped) {
            return this.active
                ? "Data saver is on. Nothing has been skipped yet."
                : "Data saver is off – photos are downloaded in full."
        }
        const saved = estimate === null
            ? "an unknown amount (nothing was loaded in full yet, so there is nothing to estimate from)"
            : `≈ ${DataSaver.size(estimate)}`
        return `${skipped} full-size file(s) not downloaded, saving ${saved}`
            + (spent ? `; ${DataSaver.size(spent)} of thumbnails loaded instead` : "")
            + (sample ? ` (estimated from the ${sample} file(s) that were loaded in full)` : "")
            + "."
    }

    report() {
        this.playback.hud.ok("Data saver", this.summary())
    }

    /** @param {number} bytes */
    static size(bytes) {
        const units = ["B", "kB", "MB", "GB", "TB"]
        let i = 0
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024
            i++
        }
        return `${bytes.toFixed(bytes < 10 && i ? 1 : 0)} ${units[i]}`
    }

    /**
     * Download the current frame's media in full after all – the escape hatch for the frame one actually
     * wants to look at. Undoes the skip for this frame only; the mode itself stays on.
     */
    load_current_frame() {
        const frame = this.playback.frame
        const $media = frame?.$frame.find("img[sli-data-saved], video[sli-data-saved]")
        if (!$media?.length) {
            this.playback.hud.info(this.active
                ? "Nothing was held back on this frame."
                : "Data saver is off – everything here is loaded in full already.")
            return
        }
        $media.removeAttr("sli-data-saved").attr("sli-load-full", 1).removeAttr("src sli-thumb-shown")
        this.playback.hud.playback_icon("⤓")
        $media.each((_, el) => { Frame._load_media($(el), /** @type {HTMLImageElement} */(el), frame) })
    }
}
