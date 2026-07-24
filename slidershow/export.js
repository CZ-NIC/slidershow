class Export {
    /**
     *
     * @param {Menu} menu
     */
    constructor(menu) {
        this.menu = menu
        this.playback = menu.playback

        this.file_handler_allowed = Boolean(window.showSaveFilePicker)
        this.file_handler_wanted = this.file_handler_allowed
        this.file_handler = null

        /** @type {"cdn"|"inline"|"folder"} How the app's own code (vendor libs + local slidershow/*.js +
         * style.css) is attached to the exported file: fetched from the CDN again on next open ("cdn",
         * the default), inlined verbatim into the exported HTML itself ("inline"), or copied as separate
         * files into vendor/+slidershow/ folders next to it ("folder"). Applies to four of the five
         * export buttons ("Same folder" / "Another folder" / "Export all to" a single file/a folder –
         * not "folders by tags") – independent of how those buttons handle the media itself. */
        this.app_code = "cdn"

        /** @type {"asis"|"absolute"|"relative"} How a media path already referenced by `sli-src` (not
         * embedded raw bytes) is rewritten before export: left exactly as-is (the default), forced into
         * an absolute https URL against this page's own address, or forced into one relative to it.
         * Only meaningful for "Same folder"/"Another folder" – "Export all to" a single file/a folder
         * copy the actual bytes instead, so no path is left to rewrite. */
        this.media_paths = "asis"
    }

    /**
     * Only applies to "Same folder"/"Another folder"/"Export all to" a single file – those three write
     * one file via a normal browser download (Downloads folder, `(1)`/`(2)` suffix on repeat exports)
     * unless this is checked, which asks – via `assure_handler()`, on the *next* export click – where to
     * save that one file once, then keeps overwriting it on every export after, with no further prompts.
     * The two folder buttons below always use a directory picker instead and are unaffected either way.
     */
    file_handler_checkbox() {
        if (!this.file_handler_allowed) {
            return "(Chrome only – this browser can't rewrite local files, so exports always download normally.)"
        }
        return $("<label />", {
            "text": "Save to a file you pick, then keep overwriting it?",
            "title": "Applies to \"Same folder\"/\"Another folder\"/\"Export all to\" a single file only (the "
                + "two folder buttons below always ask for a folder anyway). Instead of a normal browser download "
                + "(Downloads folder, `(1)`/`(2)` suffix on repeat exports), asks where to save on the next "
                + "export click, then reuses that exact file for every export after – no further prompts."
        })
            .prepend(
                $("<input />", { "type": "checkbox", "checked": this.file_handler_wanted })
                    .on("click", (e) => {
                        this.file_handler_wanted = $(e.target).prop("checked")
                    })
            )
    }

    /**
     * Radio group applying to four buttons – "Same folder"/"Another folder" above it and "Export all
     * to" a single file/a folder below it (everything except "folders by tags"): picks how the app's own
     * code (vendor libs + local slidershow/*.js + style.css) is attached to the exported file,
     * independent of how those buttons handle the media itself. Three mutually exclusive options only –
     * "cdn" (default), "inline", "folder" – so a radio group, not a checkbox. Spliced in as its own
     * section *between* the two button groups it applies to (see `export_dialog()`), since it's the
     * setting people change least – it doesn't need to be the first thing seen by either group.
     */
    app_code_radio() {
        const file_blocked = this._is_file_protocol()
        const dir_supported = Boolean(window.showDirectoryPicker)
        const folder_blocked = file_blocked || !dir_supported
        // Only unsupported browsers need telling – Chrome/Edge already know they're Chrome/Edge.
        const folder_suffix = !dir_supported ? " (Chrome only)" : (file_blocked ? " (blocked)" : "")
        return this._radio_group("app-code", "App's own code:", "app_code", [
            { value: "cdn", label: "Load from CDN (default)",
                title: "Nothing extra happens. The exported file fetches jQuery/etc. and slidershow's own "
                    + "code from the CDN again on next open – needs network for that, just like this presentation." },
            { value: "inline", label: "Inline into the file" + (file_blocked ? " (blocked)" : ""),
                title: "Embeds that code right inside the exported HTML itself, so opening it later needs no "
                    + "network at all (except the map, which always needs one). Makes the file bigger and the "
                    + "export itself slower."
                    + (file_blocked ? " Currently blocked: see the warning below." : ""), blocked: file_blocked },
            { value: "folder", label: "Copy into a folder" + folder_suffix,
                title: "Copies that code as separate files into vendor/+slidershow/ folders next to the "
                    + "exported file and points it at those instead of the CDN – nothing is inlined, so the "
                    + "exported HTML itself stays as small as a normal export."
                    + (!dir_supported ? " Only available in Chrome/Edge." : "")
                    + (file_blocked ? " Currently blocked: see the warning below." : ""), blocked: folder_blocked },
        ])
    }

    /**
     * Radio group applying only to "Same folder"/"Another folder" (path-reference exports) – picks
     * whether an already-referenced media path is rewritten before export. "Export all to" a single
     * file/a folder copy the actual bytes instead, so this doesn't apply to them. Indented (style.css) –
     * narrower scope than "App's own code" below it, and placed right above the two buttons it actually
     * governs, instead of sitting at the same level as the broader radio.
     */
    media_paths_radio() {
        const file_protocol = this._is_file_protocol()
        const counts = this._media_path_counts()
        // Counted against the two rewrite targets, not the default – "Keep as-is" changes nothing by
        // definition, so a count next to it would only ever read "0 changed", which says nothing new.
        const relative_hint = counts.total === 0 ? ""
            : counts.absolute ? ` (${counts.absolute} absolute → relative)` : " (all already relative)"
        const absolute_hint = counts.total === 0 ? ""
            : counts.relative ? ` (${counts.relative} relative → absolute)` : " (all already absolute)"
        const scope = "Same/Another folder only"
            + (counts.dragdropped ? `; ${counts.dragdropped} drag-and-dropped file(s) unaffected` : ", not drag-and-dropped files")
        return this._radio_group("media-paths", `Media paths (${scope}):`, "media_paths", [
            { value: "asis", label: "Keep as-is (default)",
                title: "Leaves every photo/video path exactly as it is now, whether that's relative or absolute." },
            { value: "relative", label: "Force relative" + relative_hint,
                title: "Strips the origin off any media path that currently points at this same server, turning "
                    + "it back into a path relative to wherever the exported file ends up – useful when you're "
                    + "about to host the export (and its media) somewhere else with the same folder layout. "
                    + "Doesn't touch a file still only in memory (drag-dropped, not yet backed by a real URL)." },
            { value: "absolute", label: "Force absolute (https)" + absolute_hint + (file_protocol ? " (blocked)" : ""),
                title: "Rewrites every relative media path into an absolute URL against this page's own address – "
                    + "useful when this presentation is served from a local/dev server whose URL won't be the "
                    + "final one, but the media will still be reachable at today's address. Doesn't touch a file "
                    + "still only in memory (drag-dropped, not yet backed by a real URL) – there's nothing real "
                    + "to resolve those against."
                    + (file_protocol ? " Blocked on file:// – there's no address to make paths absolute against." : ""),
                blocked: file_protocol },
        ], "media-paths-radio")
    }

    /**
     * Shared renderer for `app_code_radio()`/`media_paths_radio()` – a labelled group of mutually
     * exclusive radios, one per `options` entry, writing the clicked value back to `this[prop]`.
     * @param {string} name radio `name` attribute, groups the inputs so only one can be checked
     * @param {string} legend heading shown above the group
     * @param {string} prop property on `this` read for the initial checked value and written on click
     * @param {{value: string, label: string, title: string, blocked?: boolean}[]} options
     * @param {string} css_class extra class on the wrapping `<div>`, for scope-specific styling (style.css)
     */
    _radio_group(name, legend, prop, options, css_class = "") {
        const $group = $("<div/>", { class: css_class }).append($("<strong/>", { text: legend }), "<br>")
        for (const opt of options) {
            $group.append(
                $("<label/>", { text: opt.label, title: opt.title }).prepend(
                    $("<input/>", {
                        "type": "radio", "name": name, "value": opt.value,
                        "checked": this[prop] === opt.value, "disabled": opt.blocked,
                    }).on("click", () => { this[prop] = opt.value })
                ),
                "<br>"
            )
        }
        return $group
    }

    /**
     * The "inline"/"folder" app-code options both need to re-read this presentation's own local files
     * (style.css, slidershow/*.js) – always refused by Chrome under a `file://` origin (this presentation
     * opened directly from disk) unless started with `--allow-file-access-from-files`; vendor libs,
     * fetched from a CDN over https, are unaffected either way. Known upfront, not just discovered on
     * click, so the dialog can say so instead of the radio silently failing per file / leaving a
     * half-written folder behind (see `_is_file_protocol`, `_offline_file_error`, `export_offline_folder`).
     * @returns {string} empty when not applicable
     */
    _file_protocol_warning() {
        return this._is_file_protocol()
            ? "<br>⚠ This presentation is open directly from disk (file://) – the \"inline\"/\"folder\" app code "
            + "options above need network access blocked from there by Chrome. Host it over http(s) instead "
            + "(a plain local dev server is enough) to use them."
            : ""
    }

    /**
     * Runs the export for the given media handling (`compact_file`/`path`, see `export()`), routed
     * through whichever app-code delivery (`this.app_code`) is currently selected.
     * @param {boolean} compact_file
     * @param {string} path
     */
    _run_export(compact_file, path) {
        return this.app_code === "folder" ? this.export_offline_folder(compact_file, path) : this.export(compact_file, path)
    }

    /**
     * Editable presentation-name field at the top of the export dialog – the same name as the splash
     * field / grid ribbon (`Playback.set_presentation_name()`), surfaced here too since it's what
     * decides the export filename (see `export_filename()`).
     * @returns {JQuery}
     */
    presentation_name_field() {
        const $input = $("<input/>", {
            type: "text", value: presentation_name(), placeholder: "Untitled presentation", class: "export-name",
            title: "Name this presentation – used as the export filename and shown in the splash's Recent list",
        }).on("change", () => this.playback.set_presentation_name(String($input.val())))
        return $("<div/>", { class: "export-name-row" }).append($input)
    }

    export_dialog() {
        const dialog = new $.Zebra_Dialog({
            type: false, // no icon – it reserves left padding this already-busy dialog can't spare
            width: 720, // wider than the 450px default – this dialog has grown too tall to also be narrow
            source: {
                inline: $("<div/>").append(
                    this.presentation_name_field(),
                    $("<div/>", { class: "dialog-heading", text: "Export the tiny presentation file to the media folder:" }),
                    "<br>",
                    this.file_handler_checkbox(), this.media_paths_radio()
                )
            },
            title: "Export",
            buttons: [{
                caption: "Same folder", callback: () => this._run_export(false, "")
            }, {
                caption: "Another folder", callback: () =>
                    new $.Zebra_Dialog("Where will the presentation find the media folder?", {
                        title: "The path to the media folder",
                        default_value: $main.attr("sli-path") || $("[name=path]", "#defaults").val() || "./",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, path) => $main.attr("sli-path", path) && this._run_export(false, path)
                        }]
                    })
            }, {
                // Marked only so the "Export all to"/"App's own code" content can be spliced in right
                // before it (see below) – every button from here on actually carries the media itself,
                // not just a path to it, unlike the two above.
                custom_class: "export-media-group",
                caption: "a single file (huge RAM demand)", callback: () => this._run_export(true, "")
            }, {
                caption: "a folder" + (!window.showDirectoryPicker ? " (Chrome only)" : ""),
                callback: () => this.export_media_folder()
            }, {
                caption: "folders by tags", callback: () => this.export_tags_dialog()
            }]
        })
        // Zebra_Dialog's buttons are all clickable – there's no plain heading row to give this button
        // group its own label, so a real (non-clickable) one is spliced in right before it instead of
        // folding "Export all to" into the first button's own caption. "App's own code" is tucked in
        // right before that, as a tail-end of the "Same/Another folder" section (no rule/heading of its
        // own) – it's the setting people change least (CDN is fine almost always), so it doesn't need to
        // sit above the buttons, but it still applies to "Export all to"'s first two buttons as well.
        dialog.dialog.find("a.export-media-group")
            .removeClass("export-media-group")
            .before($("<div/>", { class: "app-code-footer" })
                .append(this.app_code_radio(), this._file_protocol_warning()))
            .before($("<div/>", { class: "dialog-separator dialog-heading", text: "Export all to:" }))
        // Zebra_Dialog centers the dialog vertically once, from its height at construction time – all
        // the splicing above happens after that and makes it taller, so without this it renders too low
        // and runs off the bottom edge instead of staying centered.
        dialog.dialog.css("top", `${Math.max(20, (window.innerHeight - dialog.dialog[0].offsetHeight) / 2)}px`)
    }

    /**
     * Builds the exported `$contents`/`$head` (not yet serialized), shared by `export()`,
     * `export_offline_folder()` and `export_media_folder()` – everything up to the point where they
     * diverge on how the app's own code/media get attached (inlined / copied into a folder / left as a
     * data URI or path reference).
     * @param {boolean} compact_file
     * @param {string} path
     * @returns {Promise<{$contents: JQuery, $head: JQuery}>}
     */
    async _build_export_contents(compact_file, path) {
        // Why to wrap the body inside a div? jQuery seems to handle such fundamental tags differently.
        // We end up with a collection of body children, not with the body itself.
        const $contents = $("<div>" + $("body").prop('outerHTML') + "</div>")

        // reduce parameters
        $contents.removeAttr("style")
        $contents.find("*").removeAttr("style")
        $contents.find("> #map, > #map-hud, > #map-wrapper, > #hud, > #preblink-prevention, > menu, > .ZebraDialog, > .ZebraDialogBackdrop").remove()
        await Frame.finalize_frames($contents, this.playback.$articles, compact_file, path, this.menu.display_progress(this.playback.$articles.length))
        if (!compact_file) {
            this._rewrite_media_paths($contents, this.media_paths)
        }

        // Prepare the original head.
        // Why not use HEAD=document.head.innerHTML cached at the application start in slidershow.js?
        // As the document is not ready yet, it would not show whole header but only the part the parser is it.
        // Consider this head: `<script slidershow.js><link href=custom.css>`
        // While accessing document.head in slidershow.js, link is still invisible. The slidershow.js needed to be
        // the very last tag in the head. Which would cover different problems:
        // CSS order, user might want to add another script accessing slidershow properties...
        let $head = $("<div>" + $("head").prop('outerHTML') + "</div>")
        $head.find("[sli-templated]").remove() // remove all dynamically added libraries
        $head.find("[src^='https://api.mapy.cz'],[href^='https://api.mapy.cz']").remove() // including vendor libraries that does not our honour [sli-templated] attr

        return { $contents, $head }
    }

    /**
     * @param {JQuery} $contents
     * @returns {string}
     */
    _serialize_contents($contents) {
        return $contents.prop("innerHTML").replaceAll(EXPORT_SRC, "src")
    }

    /**
     * @param {boolean} compact_file
     * @param {string} path
     * @returns {Promise<{html: string, $head: JQuery}>}
     */
    async _build_export_parts(compact_file, path) {
        const { $contents, $head } = await this._build_export_contents(compact_file, path)
        return { html: this._serialize_contents($contents), $head }
    }

    /**
     * Rewrites every `sli-src` still referencing a path (not raw bytes – irrelevant for "Pack into one
     * file") per `mode`: "asis" leaves it untouched, "absolute" resolves a relative path into an
     * absolute URL against this page's own address, "relative" strips the origin off a path that
     * already points at this same server. Cross-origin absolute paths (ex. a CDN-hosted photo) are left
     * alone either way – there's no address to resolve/reduce them against.
     *
     * Frames still only in memory (drag-dropped, not yet backed by any real URL – `READ_SRC`) are
     * skipped entirely: their `sli-src` is just a filename label `Frame.finalize_frames()` prefixes
     * with "Another folder"'s `path`, not a real address – resolving that against *this* page (whatever
     * `path` turns out to mean once the export actually lands somewhere) would be a coin flip at best.
     * @param {JQuery} $contents
     * @param {"asis"|"absolute"|"relative"} mode
     */
    _rewrite_media_paths($contents, mode) {
        if (mode === "asis") {
            return
        }
        const $originals = this.playback.$articles.find("img[sli-src], video[sli-src]")
        $contents.find("img[sli-src], video[sli-src]").each((i, el) => {
            const $el = $(el)
            if ($($originals[i]).data(READ_SRC)) {
                return
            }
            const value = $el.attr("sli-src")
            if (!value) {
                return
            }
            try {
                if (mode === "absolute" && !this._is_absolute_path(value) && location.protocol !== "file:") {
                    $el.attr("sli-src", new URL(value, document.baseURI).href)
                } else if (mode === "relative" && this._is_absolute_path(value)) {
                    const url = new URL(value, document.baseURI)
                    if (url.origin === location.origin) {
                        $el.attr("sli-src", url.pathname + url.search + url.hash)
                    }
                }
            } catch (e) {
                // malformed sli-src – leave it untouched rather than exporting garbage
            }
        })
    }

    /**
     * @param {string} v
     * @returns {boolean}
     */
    _is_absolute_path(v) {
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || v.startsWith("//")
    }

    /**
     * How many of the presentation's photos/videos currently have a relative vs. an absolute `sli-src`
     * – shown next to "Force relative"/"Force absolute" in `media_paths_radio()` so the number isn't a
     * guess. `dragdropped` is called out separately since `_rewrite_media_paths()` skips those either way.
     * @returns {{relative: number, absolute: number, dragdropped: number, total: number}}
     */
    _media_path_counts() {
        let relative = 0, absolute = 0, dragdropped = 0
        this.playback.$articles.find("img[sli-src], video[sli-src]").each((_, el) => {
            const $el = $(el)
            if ($el.data(READ_SRC)) {
                dragdropped++
                return
            }
            const value = $el.attr("sli-src")
            if (value && this._is_absolute_path(value)) {
                absolute++
            } else {
                relative++
            }
        })
        return { relative, absolute, dragdropped, total: relative + absolute + dragdropped }
    }

    async export(compact_file = false, path = "") {
        const { html, $head } = await this._build_export_parts(compact_file, path)
        if (!html.length) {
            this.playback.hud.ok("Export failed", "Cannot export a single file – too big.")
            return
        }

        const inline_wanted = this.app_code === "inline"
        if (inline_wanted) {
            try {
                await this._inline_offline_assets($head)
            } catch (e) {
                this._offline_file_error(e)
                return
            }
        }

        // Export the data blob
        const data = `<!DOCTYPE html><html${inline_wanted ? " sli-offline" : ""}><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"

        if (this.file_handler_wanted && window.showSaveFilePicker) {
            const newHandle = await this.assure_handler()
            const fileStream = await newHandle.createWritable()
            await fileStream.write(data)
            await fileStream.close() // otherwise "Saved" shows while the file is still flushing

            this.menu.playback.hud.info("Saved")
        } else {
            this.download(data)
        }

        // Changes saved, allow leaving
        this.playback.changes.unblock_unload()
    }

    async assure_handler() {
        if (!this.file_handler) {
            this.file_handler = await window.showSaveFilePicker({suggestedName: this.playback.session.export_filename}) // ask once for the path – then keep newHandle
        }
        return this.file_handler
    }

    // --- Offline export (bundle the app's own code so the export needs no network but for map tiles) ---

    /**
     * Shown when an offline export's own `_fetch_text()` call fails – by far the most likely cause is
     * this presentation being opened directly from disk (`file://`): Chrome refuses XHR to *other* local
     * files that way unless started with `--allow-file-access-from-files` (vendor libraries, fetched
     * from a CDN over https, are unaffected – only this presentation's own local files trip on it).
     * @param {*} e
     */
    _offline_file_error(e) {
        const fileHint = location.protocol === "file:"
            ? "This presentation is open directly from disk (<code>file://</code>) – Chrome refuses to read "
            + "its own sibling files that way unless started with <code>--allow-file-access-from-files</code>. "
            + "Host it over http(s) instead (a plain local dev server is enough), then try again."
            : "Check the browser console for details."
        this.playback.hud.ok("Offline export failed", `${fileHint}<br><br><small>${this._esc(e?.message || e)}</small>`)
    }

    /**
     * Reads `url`'s body as text. Uses XHR rather than `fetch()` because `fetch()` flatly refuses
     * `file:` URLs ("URL scheme is not supported") – XHR still handles them, same as exif-js's own
     * re-fetch already relies on (a real end-user's default Chrome install still blocks `file:` URLs to
     * *other* files without `--allow-file-access-from-files`; https(s) URLs work everywhere either way).
     * @param {string} url
     * @returns {Promise<string>}
     */
    _fetch_text(url) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open("GET", url)
            xhr.onload = () => xhr.status === 0 || xhr.status === 200 ? resolve(xhr.responseText) : reject(new Error(`${url}: HTTP ${xhr.status}`))
            xhr.onerror = () => reject(new Error(`${url}: could not be fetched`))
            xhr.send()
        })
    }

    /**
     * Every vendor/local script or style currently loaded dynamically (marked `sli-templated` by
     * slidershow.js's loader), ready to be fetched again and embedded/copied for an offline export.
     * Leaflet is deliberately excluded – maps stay online-only (the tile server needs network anyway,
     * see PLAN.md item 6), so bundling the library itself would buy nothing.
     * @returns {{url: string, key: string, isLocal: boolean}[]} `key` is the bare filename for the
     * app's own local files (matches how DIR-less offline loading looks them up) or the full URL for
     * vendor libraries. `url`/`el.src`/`el.href` are always browser-resolved absolute URLs, but the
     * global `DIR` may still be the literal (possibly relative, ex. "../../slidershow/") `src` attribute
     * of the bootstrap tag – resolve it against the document before comparing, or every local file would
     * fail to match and get keyed (wrongly) by its full URL like a vendor one.
     */
    _offline_asset_descriptors() {
        const dir = new URL(DIR, document.baseURI).href
        return $("script[sli-templated], link[sli-templated]").toArray()
            .map(el => /** @type {HTMLScriptElement|HTMLLinkElement} */(el))
            .map(el => "src" in el ? el.src : el.href)
            .filter(url => url && !/unpkg\.com\/leaflet/i.test(url))
            .map(url => url.startsWith(dir)
                ? { url, key: url.slice(dir.length), isLocal: true }
                : { url, key: url, isLocal: false })
    }

    /**
     * @returns {Promise<Object<string, string>>} descriptor key → fetched source text
     */
    async _fetch_offline_assets() {
        const descriptors = this._offline_asset_descriptors()
        const entries = await Promise.all(descriptors.map(async d => [d.key, await this._fetch_text(d.url)]))
        return Object.fromEntries(entries)
    }

    /**
     * Inlines the app's own code into `$head` for the "one file" offline export: the bootstrap
     * `<script src=".../slidershow.js">` tag becomes a literal inline script (so it runs with no
     * network at all), and every other vendor/local asset is embedded as JSON in a
     * `#sli-offline-assets` tag that the inlined slidershow.js reads before falling back to the network.
     * `</script` is escaped in both – left as-is it would prematurely close the tag once this becomes
     * literal HTML text (harmless inside JS strings/comments: `<\/script` evaluates to the same string).
     * @param {JQuery} $head
     */
    async _inline_offline_assets($head) {
        const assets = await this._fetch_offline_assets()
        const $self = $head.find("script[src$='slidershow.js']")

        // Must land *before* $self in the head: script tags execute in document order as the parser
        // meets them, and slidershow.js reads #sli-offline-assets at its very top.
        const json = JSON.stringify(assets).replace(/</g, "\\u003c")
        $("<script>", { id: "sli-offline-assets", type: "application/json" }).text(json).insertBefore($self)

        const selfSrc = $self.attr("src")
        const selfSource = selfSrc ? await this._fetch_text(selfSrc) : ""
        $self.removeAttr("src integrity crossorigin referrerpolicy")
            .text(selfSource.replace(/<\/script/gi, "<\\/script"))
    }

    /**
     * Chrome-only: writes the exported presentation next to a copy of the app's own code (vendor libs
     * under `vendor/`, local `slidershow/*.js` + `style.css` under `slidershow/`) into one folder picked
     * by the user, rewriting the head's bootstrap script to the local relative path instead of the CDN
     * URL. Unlike the "inline" app-code option, nothing is inlined – the exported HTML stays as small as
     * a normal export, just re-hosted locally instead of fetched from a CDN.
     */
    /** Broken out only so tests can stub it – simulating a different origin isn't otherwise possible. */
    _is_file_protocol() {
        return location.protocol === "file:"
    }

    /**
     * @param {boolean} compact_file same meaning as in `export()` – "Export all to" a single file vs. the media
     *  staying referenced by path
     * @param {string} path same meaning as in `export()` – where the presentation will find the media folder
     */
    async export_offline_folder(compact_file = false, path = "") {
        if (!window.showDirectoryPicker) {
            this.playback.hud.ok("Offline export", "Writing a local folder works only in Chrome/Edge.<br>Use \"Inline into the file\" (the app code radio) instead.")
            return
        }
        if (this._is_file_protocol()) {
            // Checked upfront, not just caught: this presentation's own local files (style.css,
            // slidershow/*.js) get re-fetched via XHR to copy them, which Chrome always refuses from a
            // file:// origin without --allow-file-access-from-files (vendor libs, fetched from a CDN over
            // https, are unaffected). Left uncaught, that aborts the export mid-loop with empty
            // vendor/slidershow folders and no exported HTML to show for it – exactly what happened before
            // this check existed. The "inline" app-code option hits the same XHR restriction but fails
            // gracefully (single fetch, not a loop against a half-written folder), so it isn't gated here.
            this.playback.hud.ok("Offline export", "This presentation is open directly from disk (file://) – "
                + "Chrome refuses to read its own sibling files that way (needed to copy them into the "
                + "folder), unless started with --allow-file-access-from-files. Host this presentation over "
                + "http(s) instead (a plain local dev server is enough), then try again. \"Inline into the "
                + "file\" (the app code radio) has the same restriction but at least fails with a clear "
                + "message instead of a half-written folder.")
            return
        }
        let targetDir
        try {
            targetDir = await window.showDirectoryPicker({ mode: "readwrite", id: "slidershow-offline-target", startIn: "pictures" })
        } catch (e) {
            return // user cancelled
        }

        const { html, $head } = await this._build_export_parts(compact_file, path)
        if (!html.length) {
            this.playback.hud.ok("Export failed", "Cannot export a single file – too big.")
            return
        }

        try {
            await this._copy_app_code_to_folder($head, targetDir)
        } catch (e) {
            this._offline_file_error(e)
            return // the empty vendor/slidershow folders are left behind – harmless, user can delete them
        }

        const data = `<!DOCTYPE html><html><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"
        await this._write_text(targetDir, this.playback.session.export_filename, data)
        this.playback.hud.info("Offline folder written.")
        this.playback.changes.unblock_unload()
    }

    /**
     * Copies the app's own code (vendor libs, local `slidershow/*.js` + `style.css`) as separate files
     * into `vendor/`/`slidershow/` folders under `targetDir`, and rewrites `$head`'s bootstrap script
     * (and its hardcoded vendor CDN URLs) to point at those local copies instead of the CDN. Shared by
     * `export_offline_folder()` and `export_media_folder()` (when `this.app_code === "folder"`).
     * @param {JQuery} $head
     * @param {FileSystemDirectoryHandle} targetDir
     */
    async _copy_app_code_to_folder($head, targetDir) {
        const descriptors = this._offline_asset_descriptors()
        const appDir = await targetDir.getDirectoryHandle("slidershow", { create: true })
        const vendorDir = await targetDir.getDirectoryHandle("vendor", { create: true })
        const usedVendorNames = new Set()
        /** @type {Object<string, string>} original URL → relative path from the exported HTML */
        const rewrites = {}

        for (const d of descriptors) {
            if (d.isLocal) {
                const text = await this._fetch_text(d.url)
                await this._write_text(appDir, d.key, text)
                rewrites[d.url] = `slidershow/${d.key}`
            } else {
                const basename = this._unique_name(usedVendorNames, d.url.split("/").pop().split("?")[0])
                const text = await this._fetch_text(d.url)
                await this._write_text(vendorDir, basename, text)
                rewrites[d.url] = `vendor/${basename}`
            }
        }

        // Ship a customized copy of slidershow.js with its hardcoded vendor CDN URLs rewritten to the
        // local relative paths above – local files/style.css need no such rewrite, DIR already resolves
        // them relatively once the bootstrap tag below points at slidershow/slidershow.js.
        const $self = $head.find("script[src$='slidershow.js']")
        const selfSrc = $self.attr("src")
        if (selfSrc) {
            let selfSource = await this._fetch_text(selfSrc)
            for (const d of descriptors) {
                if (!d.isLocal) {
                    selfSource = selfSource.split(d.url).join(rewrites[d.url])
                }
            }
            await this._write_text(appDir, "slidershow.js", selfSource)
            $self.attr("src", "slidershow/slidershow.js").removeAttr("integrity crossorigin referrerpolicy")
        }
    }

    /**
     * Chrome-only: like "Export all to" a single file, except every photo/video is written as a real file into
     * a `media/` folder next to the exported HTML instead of embedded as a data URI – keeps the HTML
     * itself small while still making the whole export self-contained (unlike "Same folder"/"Another
     * folder", which only ever reference wherever the media already lives). Frames not currently
     * reachable (no in-memory File, not fetchable over http) fall back to the same "pick a source
     * folder" prompt as "Export tags to folders…"; any that still can't be found are reported, and
     * their `sli-src` is left untouched. Respects `this.app_code` exactly like the other export
     * buttons, sharing this same target folder for the "folder" option.
     */
    async export_media_folder() {
        if (!window.showDirectoryPicker) {
            this.playback.hud.ok("Media export", "Writing a local folder works only in Chrome/Edge.<br>Use \"Export all to\" a single file instead.")
            return
        }
        if (this.app_code === "folder" && this._is_file_protocol()) {
            // Same restriction/rationale as export_offline_folder() – checked upfront here too so a
            // failed app-code copy doesn't leave the media/ folder written but no exported HTML to show for it.
            this.playback.hud.ok("Media export", "This presentation is open directly from disk (file://) – "
                + "Chrome refuses to read its own sibling files that way (needed to copy the app's own code "
                + "into the folder), unless started with --allow-file-access-from-files. Host this presentation "
                + "over http(s) instead (a plain local dev server is enough), or pick \"Load from CDN\"/\"Inline "
                + "into the file\" for the app's own code instead, then try again.")
            return
        }

        const allFrames = this.all_frames()
        const mediaFrames = allFrames.filter(f => f.get_filename())
        let sourceIndex = null
        if (mediaFrames.some(f => this._frame_needs_source(f))) {
            const sourceDir = await this._get_source_dir_handle()
            if (!sourceDir) {
                return // user cancelled the source folder picker
            }
            sourceIndex = await this._build_source_index(sourceDir)
        }

        let targetDir
        try {
            targetDir = await window.showDirectoryPicker({ mode: "readwrite", id: "slidershow-media-target", startIn: "pictures" })
        } catch (e) {
            return // user cancelled
        }

        const mediaDir = await targetDir.getDirectoryHandle("media", { create: true })
        const nameByFrame = await this._copy_media_folder(mediaFrames, mediaDir, sourceIndex, new Semaphore(4))

        const { $contents, $head } = await this._build_export_contents(false, "")
        const $exportedFrames = $contents.find(FRAME_SELECTOR)
        allFrames.forEach((frame, i) => {
            const name = nameByFrame.get(frame)
            if (name) {
                $($exportedFrames[i]).find("img[sli-src], video[sli-src]").attr("sli-src", `media/${name}`)
            }
        })

        const html = this._serialize_contents($contents)
        if (!html.length) {
            this.playback.hud.ok("Export failed", "Cannot export a single file – too big.")
            return
        }

        const inline_wanted = this.app_code === "inline"
        try {
            if (inline_wanted) {
                await this._inline_offline_assets($head)
            } else if (this.app_code === "folder") {
                await this._copy_app_code_to_folder($head, targetDir)
            }
        } catch (e) {
            this._offline_file_error(e)
            return
        }

        const data = `<!DOCTYPE html><html${inline_wanted ? " sli-offline" : ""}><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"
        await this._write_text(targetDir, this.playback.session.export_filename, data)

        const missing = mediaFrames.length - nameByFrame.size
        this.playback.hud.info(missing ? `Media folder written (${missing} file(s) missing).` : "Media folder written.")
        this.playback.changes.unblock_unload()
    }

    download(data) {
        this._trigger_download(new Blob([data], { type: "text/plain" }), this.playback.session.export_filename)
    }

    /**
     * @param {Blob} blob
     * @param {string} filename
     */
    _trigger_download(blob, filename) {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(link)
    }

    /**
     * @param {string} filename
     * @param {string} text
     * @param {string} type
     */
    _download_text(filename, text, type = "text/plain") {
        this._trigger_download(new Blob([text], { type }), filename)
    }

    /**
     * Browsers without `showDirectoryPicker` (Firefox) can't copy media into folders, but the tag
     * lists themselves are cheap to produce from `groups` alone – no copying involved.
     * @param {TagGroup[]} groups
     */
    _download_manifest(groups) {
        const manifest = Object.fromEntries(groups.map(g => [g.name, g.frames.map(f => f.get_filename())]))
        this._download_text("tags.json", JSON.stringify(manifest, null, 2), "application/json")
    }

    /**
     * @param {TagGroup[]} groups
     */
    _download_txts(groups) {
        groups.forEach(g => this._download_text(`${g.name}.txt`, g.frames.map(f => f.get_filename()).join("\n")))
    }

    // --- Tag export (one folder per named tag) ---

    /**
     * @typedef {{tag: number, name: string, frames: Frame[]}} TagGroup
     */

    /**
     * @returns {Frame[]} Every frame in the presentation, in document order – unlike `union_frames()`,
     * not filtered by tag.
     */
    all_frames() {
        return this.playback.$articles.map((_, el) => $(el).data("frame")).get()
    }

    /**
     * @returns {TagGroup[]} One entry per tag in use, ascending. Named tags use their name as the folder;
     * unnamed tags fall back to `tag-<digit>` (so tagging without naming still exports something useful).
     */
    collect_tag_groups() {
        const pl = this.playback
        const names = pl.frame.tag_names()
        /** @type {Map<number, Frame[]>} */
        const byTag = new Map()
        pl.$articles.each((_, el) => {
            const frame = $(el).data("frame")
            frame.get_tags().forEach(t => {
                if (!byTag.has(t)) {
                    byTag.set(t, [])
                }
                byTag.get(t).push(frame)
            })
        })
        return [...byTag.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([tag, frames]) => ({ tag, name: names[tag - 1] || `tag-${tag}`, frames }))
    }

    /**
     * @param {TagGroup[]} groups
     * @returns {Frame[]} Every frame belonging to at least one tag group, deduplicated.
     */
    union_frames(groups) {
        const seen = new Set()
        const result = []
        groups.forEach(a => a.frames.forEach(f => {
            if (!seen.has(f)) {
                seen.add(f)
                result.push(f)
            }
        }))
        return result
    }

    /**
     * Longest common directory prefix of `frames`' `sli-src`/`src` paths (empty if none has a path,
     * ex. plain filenames or data URLs) – shown as a hint of which folder to pick as the source.
     * @param {Frame[]} frames
     * @returns {string}
     */
    _common_path_hint(frames) {
        const dirs = frames
            .map(f => String(f.$actor.attr("sli-src") || f.$actor.attr("src") || ""))
            .filter(p => p.includes("/"))
            .map(p => p.slice(0, p.lastIndexOf("/")))
        if (!dirs.length) {
            return ""
        }
        return dirs.reduce((a, b) => {
            let i = 0
            while (i < a.length && a[i] === b[i]) {
                i++
            }
            return a.slice(0, i)
        })
    }

    /**
     * Guards against tag names that would corrupt the export: two tags sharing a name end up copied
     * into the very same folder – later files silently overwrite earlier ones and
     * `tags.json`/`<tag>.txt` collapse to the last one written, since both are keyed by name. A `/`
     * or `\` would also make `getDirectoryHandle(name, {create:true})` throw mid-export (an unhandled
     * rejection, not a dialog).
     * @param {TagGroup[]} groups
     * @returns {string[]} Human-readable problems, empty if `groups` are all export-safe.
     */
    _validate_tag_groups(groups) {
        const problems = []
        const seenNames = new Map()
        for (const group of groups) {
            if (/[/\\]/.test(group.name)) {
                problems.push(`Tag name "${group.name}" contains a path separator – rename it.`)
            }
            const key = group.name.toLowerCase()
            if (seenNames.has(key)) {
                problems.push(`Tags named "${seenNames.get(key)}" and "${group.name}" would collide into the same folder – rename one.`)
            } else {
                seenNames.set(key, group.name)
            }
        }
        return problems
    }

    /**
     * Entry point for Ctrl+Shift+S: browser-support check, named-tags/validation checks, then a summary
     * dialog (per-tag counts, a source-folder hint if some files aren't in memory) with an "Export" button.
     */
    export_tags_dialog() {
        const groups = this.collect_tag_groups()
        if (!groups.length) {
            this.playback.hud.ok("Export tags", "No tags used yet. Tag some frames first (Alt+T, then a digit).")
            return
        }
        const problems = this._validate_tag_groups(groups)
        if (problems.length) {
            this.playback.hud.ok("Export tags", `Fix tag names before exporting:<br>${problems.join("<br>")}`)
            return
        }
        if (!window.showDirectoryPicker) {
            new $.Zebra_Dialog({
                message: "Exporting media to folders works only in Chrome/Edge.<br>"
                    + "Your tags are saved inside the presentation – export it with <kbd>Ctrl+S</kbd>, "
                    + "open the exported file in Chrome, and run this again (<kbd>Ctrl+Shift+S</kbd>).<br><br>"
                    + "Meanwhile, you can still grab just the tag lists below (no photos).",
                title: "Export tags",
                type: "information",
                buttons: [
                    "Cancel",
                    { caption: "Download tags.json", callback: () => this._download_manifest(groups) },
                    { caption: "Download .txt files", callback: () => this._download_txts(groups) }
                ]
            })
            return
        }
        const allFrames = this.union_frames(groups)
        // A relative-path frame on a file:// presentation isn't fetchable on its own, but becomes so once
        // the user supplies a base URL – offer that field instead of forcing a source folder for it.
        const baseCandidates = allFrames.filter(f =>
            !f.$actor.data("file") && !this._frame_http_url(f, "") && !!this._frame_http_url(f, "http://x/"))
        // Truly need a local source folder: no in-memory File, not fetchable over http even with a base.
        const missingFrames = allFrames.filter(f =>
            !f.$actor.data("file") && !this._frame_http_url(f, "") && !baseCandidates.includes(f))
        const pathHint = this._common_path_hint(missingFrames)

        // Total size is free only for in-memory Files (File.size); http/path files would each cost a
        // network HEAD/getFile() to measure, so they're only counted, not summed.
        let knownBytes = 0
        let unknownCount = 0
        allFrames.forEach(f => {
            const file = f.$actor.data("file")
            if (file && typeof file.size === "number") {
                knownBytes += file.size
            } else {
                unknownCount++
            }
        })
        const sizeLine = unknownCount === allFrames.length
            ? `Total size: unknown (${unknownCount} file(s) not in memory)`
            : `Total size: ${formatBytes(knownBytes)}` + (unknownCount ? ` (+ ${unknownCount} file(s) of unknown size)` : "")

        const rows = groups.map(a => ({ name: a.name, count: a.frames.length }))
            .map(({ name, count }) => `<tr><td>${this._esc(name)}</td><td>${count}</td></tr>`).join("")
        const summary = `<table class="tag-summary">${rows}</table>${sizeLine}<br>`
            + (baseCandidates.length
                ? `<br>${baseCandidates.length} file(s) are referenced by a relative path – give the base URL below to download them over http.`
                : "")
            + (missingFrames.length
                ? `<br>${missingFrames.length} file(s) aren't in memory and can't be fetched over http`
                + ` – you'll be asked for a "source folder" to read them from (its subfolders are searched too).`
                + (pathHint ? `<br>Hint: their path looks like <code>${this._esc(pathHint)}/…</code> – pick that folder, or a parent of it.` : "")
                : "")

        const $extra = $("<div/>", { class: "tag-export-extra" })
        let $baseInput = null
        if (baseCandidates.length) {
            $baseInput = $("<input/>", {
                type: "text",
                value: localStorage.getItem("TAG-EXPORT-BASE-URL") || "",
                placeholder: "https://example.com/photos/",
                style: "width:100%"
            })
            $("<label/>").append(document.createTextNode("Base URL: "), $baseInput).appendTo($extra)
        }
        const $writeJson = $("<input/>", { type: "checkbox", checked: true })
        const $writeTxt = $("<input/>", { type: "checkbox", checked: true })
        $("<label/>").append($writeJson, " Write tags.json").appendTo($extra)
        $("<label/>").append($writeTxt, " Write a <tag>.txt file per tag").appendTo($extra)

        new $.Zebra_Dialog({
            message: summary,
            source: { inline: $extra },
            title: "Export tags to folders",
            type: "question",
            buttons: [
                "Cancel",
                { caption: "Export as single file instead…", callback: () => this.export_dialog() },
                ...(missingFrames.length ? [{
                    caption: "Change source folder…",
                    callback: () => this._change_source_dir_handle().then(() => this.export_tags_dialog())
                }] : []),
                {
                    caption: "Export",
                    default_confirmation: true,
                    callback: () => {
                        const baseUrl = $baseInput ? String($baseInput.val()).trim() : ""
                        if (baseUrl) {
                            localStorage.setItem("TAG-EXPORT-BASE-URL", baseUrl)
                        }
                        this.export_tags(groups, allFrames, baseUrl, $writeJson.prop("checked"), $writeTxt.prop("checked"))
                    }
                }
            ]
        })
    }

    /**
     * Minimal HTML escaping for names/paths interpolated into a dialog's message string.
     * @param {string} s
     * @returns {string}
     */
    _esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    /**
     * @param {TagGroup[]} groups
     * @param {Frame[]} allFrames
     * @param {string} baseUrl Base URL for relative-path frames on a file:// presentation (empty otherwise).
     * @param {boolean} writeJson Whether to write a combined `tags.json` alongside the folders.
     * @param {boolean} writeTxt Whether to write one `<tag>.txt` per tag alongside the folders.
     */
    async export_tags(groups, allFrames, baseUrl = "", writeJson = true, writeTxt = true) {
        let sourceIndex = null
        if (allFrames.some(f => this._frame_needs_source(f, baseUrl))) {
            const sourceDir = await this._get_source_dir_handle()
            if (!sourceDir) {
                return // user cancelled the source folder picker
            }
            sourceIndex = await this._build_source_index(sourceDir)
        }

        let targetDir
        try {
            targetDir = await window.showDirectoryPicker({ mode: "readwrite", id: "slidershow-tags-target", startIn: "pictures" })
        } catch (e) {
            return // user cancelled the target folder picker
        }

        const folderNames = groups.map(a => a.name)
        // Loose files from a previous export (tags.json, <tag>.txt) must abort too, not just the
        // subfolders – otherwise they're silently overwritten by the fresh run.
        const fileNames = [
            ...(writeJson ? ["tags.json"] : []),
            ...(writeTxt ? groups.map(a => `${a.name}.txt`) : []),
        ]
        const conflicts = []
        for (const name of folderNames) {
            const exists = await targetDir.getDirectoryHandle(name).then(() => true, () => false)
            if (exists) {
                conflicts.push(name)
            }
        }
        for (const name of fileNames) {
            const exists = await targetDir.getFileHandle(name).then(() => true, () => false)
            if (exists) {
                conflicts.push(name)
            }
        }
        if (conflicts.length) {
            this.playback.hud.ok("Export tags", `Target folder already contains: ${conflicts.join(", ")}. Pick an empty folder.`)
            return
        }

        const semaphore = new Semaphore(4)
        /** @type {Object<string, FileSystemDirectoryHandle>} */
        const dirHandles = {}
        /** @type {Object<string, {copiedNames: string[], missing: string[]}>} */
        const results = {}

        for (const group of groups) {
            dirHandles[group.name] = await targetDir.getDirectoryHandle(group.name, { create: true })
            results[group.name] = await this._copy_frames(group.frames, dirHandles[group.name], sourceIndex, semaphore, baseUrl)
        }

        await this._write_manifest(targetDir, results, writeJson, writeTxt)
        this._show_export_summary(targetDir, groups, dirHandles, results, semaphore, baseUrl, writeJson, writeTxt)
    }

    /**
     * @param {FileSystemDirectoryHandle} targetDir
     * @param {Object<string, {copiedNames: string[], missing: string[]}>} results
     * @param {boolean} writeJson
     * @param {boolean} writeTxt
     */
    async _write_manifest(targetDir, results, writeJson = true, writeTxt = true) {
        if (writeJson) {
            const manifest = Object.fromEntries(Object.entries(results).map(([name, r]) => [name, r.copiedNames]))
            await this._write_text(targetDir, "tags.json", JSON.stringify(manifest, null, 2))
        }
        if (writeTxt) {
            for (const [name, r] of Object.entries(results)) {
                await this._write_text(targetDir, `${name}.txt`, r.copiedNames.join("\n"))
            }
        }
    }

    /**
     * @param {FileSystemDirectoryHandle} targetDir
     * @param {TagGroup[]} groups
     * @param {Object<string, FileSystemDirectoryHandle>} dirHandles
     * @param {Object<string, {copiedNames: string[], missing: string[]}>} results
     * @param {Semaphore} semaphore
     * @param {string} baseUrl
     * @param {boolean} writeJson
     * @param {boolean} writeTxt
     */
    _show_export_summary(targetDir, groups, dirHandles, results, semaphore, baseUrl = "", writeJson = true, writeTxt = true) {
        const summary = Object.entries(results)
            .map(([name, r]) => `${name}: ${r.copiedNames.length} copied` + (r.missing.length ? `, ${r.missing.length} missing` : ""))
            .join("<br>")
        this.playback.hud._pushHistory(summary)

        const missingCount = Object.values(results).reduce((sum, r) => sum + r.missing.length, 0)
        new $.Zebra_Dialog(summary, {
            title: "Tag export finished",
            type: missingCount ? "question" : "information",
            buttons: missingCount ? [{ caption: "Done" }, {
                caption: "Change source folder & retry",
                callback: async () => {
                    const sourceDir = await this._change_source_dir_handle()
                    if (!sourceDir) {
                        return
                    }
                    const sourceIndex = await this._build_source_index(sourceDir)
                    for (const [name, dirHandle] of Object.entries(dirHandles)) {
                        const frames = groups.find(a => a.name === name).frames
                            .filter(f => results[name].missing.includes(f.get_filename()))
                        if (!frames.length) {
                            continue
                        }
                        const retried = await this._copy_frames(frames, dirHandle, sourceIndex, semaphore, baseUrl)
                        results[name].copiedNames.push(...retried.copiedNames)
                        results[name].missing = retried.missing
                    }
                    await this._write_manifest(targetDir, results, writeJson, writeTxt)
                    this._show_export_summary(targetDir, groups, dirHandles, results, semaphore, baseUrl, writeJson, writeTxt)
                }
            }] : false
        })
    }

    /**
     * @param {Frame[]} frames
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {?Map<string, FileSystemFileHandle>} sourceIndex
     * @param {Semaphore} semaphore
     * @param {string} baseUrl
     * @returns {Promise<{copiedNames: string[], missing: string[]}>}
     */
    async _copy_frames(frames, dirHandle, sourceIndex, semaphore, baseUrl = "") {
        const copiedNames = []
        const missing = []
        const usedNames = new Set()

        await Promise.all(frames.map(async frame => {
            const release = await semaphore.acquire()
            try {
                const file = await this._frame_file(frame, sourceIndex, baseUrl)
                if (!file) {
                    missing.push(frame.get_filename())
                    return
                }
                const name = this._unique_name(usedNames, frame.get_filename())
                const handle = await dirHandle.getFileHandle(name, { create: true })
                const writable = await handle.createWritable()
                await file.stream().pipeTo(writable)
                copiedNames.push(name)
            } catch (e) {
                missing.push(frame.get_filename())
            } finally {
                release()
            }
        }))
        return { copiedNames, missing }
    }

    /**
     * Like `_copy_frames()`, but for `export_media_folder()`: every frame goes into the same flat
     * `dirHandle` (no per-tag subfolders) and the result maps each successfully-copied frame back to
     * its written name, so the caller can rewrite that exact frame's `sli-src` – `_copy_frames()`'s
     * `copiedNames` array can't be used for that, its order is completion order, not frame order.
     * @param {Frame[]} frames
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {?Map<string, FileSystemFileHandle>} sourceIndex
     * @param {Semaphore} semaphore
     * @returns {Promise<Map<Frame, string>>} frame → the name it was written under; missing frames are absent
     */
    async _copy_media_folder(frames, dirHandle, sourceIndex, semaphore) {
        const usedNames = new Set()
        const nameByFrame = new Map()

        await Promise.all(frames.map(async frame => {
            const release = await semaphore.acquire()
            try {
                const file = await this._frame_file(frame, sourceIndex, "")
                if (!file) {
                    return
                }
                const name = this._unique_name(usedNames, frame.get_filename())
                const handle = await dirHandle.getFileHandle(name, { create: true })
                const writable = await handle.createWritable()
                await file.stream().pipeTo(writable)
                nameByFrame.set(frame, name)
            } catch (e) {
                // left out of nameByFrame – its sli-src stays untouched, reported as "missing" by the caller
            } finally {
                release()
            }
        }))
        return nameByFrame
    }

    /**
     * Basename collision within one tag's folder → `_2`, `_3`, … suffix, never a silent overwrite.
     */
    _unique_name(usedNames, filename) {
        let name = filename
        let i = 2
        while (usedNames.has(name)) {
            const dot = filename.lastIndexOf(".")
            name = dot === -1 ? `${filename}_${i}` : `${filename.slice(0, dot)}_${i}${filename.slice(dot)}`
            i++
        }
        usedNames.add(name)
        return name
    }

    /**
     * Recursively index every file under `dir` by basename, so the source folder can be a common
     * ancestor of photos spread across several subfolders (first match wins on a duplicate basename –
     * same caveat as the localStorage tag/name lookup elsewhere in the app).
     * @param {FileSystemDirectoryHandle} dir
     * @returns {Promise<Map<string, FileSystemFileHandle>>}
     */
    async _build_source_index(dir) {
        const index = new Map()
        const walk = async (dirHandle) => {
            for await (const [name, handle] of dirHandle.entries()) {
                if (handle.kind === "file") {
                    if (!index.has(name)) {
                        index.set(name, handle)
                    }
                } else if (handle.kind === "directory") {
                    await walk(handle)
                }
            }
        }
        await walk(dir)
        return index
    }

    /**
     * The bytes to write for a frame, tried in order: the in-memory File (dragged/opened from disk),
     * an http(s) fetch (files served over the web), then a picked source folder (path-based frames
     * whose media lives on disk).
     * @param {Frame} frame
     * @param {?Map<string, FileSystemFileHandle>} sourceIndex
     * @param {string} baseUrl Base URL for relative-path frames on a file:// presentation.
     * @returns {Promise<?(File|Blob)>}
     */
    async _frame_file(frame, sourceIndex, baseUrl = "") {
        const stashed = frame.$actor.data("file")
        if (stashed) {
            return stashed
        }
        const url = this._frame_http_url(frame, baseUrl)
        if (url) {
            try {
                const resp = await fetch(url)
                if (resp.ok) {
                    return await resp.blob()
                }
            } catch (e) {
                // fall through to the source folder (e.g. offline, CORS, or a stale URL)
            }
        }
        const handle = sourceIndex?.get(frame.get_filename())
        if (!handle) {
            return null
        }
        try {
            return await handle.getFile()
        } catch (e) {
            return null
        }
    }

    /**
     * The http(s) URL a frame's media can be fetched from, or null when it isn't fetchable over the
     * network. An absolute `http(s):`/`data:`/`blob:` `sli-src`/`src` is used as-is; a relative path
     * resolves against the current document when *it* is served over http(s), otherwise against
     * `baseUrl` (the field the dialog offers when the presentation is opened from disk).
     * @param {Frame} frame
     * @param {string} baseUrl
     * @returns {?string}
     */
    _frame_http_url(frame, baseUrl = "") {
        const src = String(frame.$actor.attr("sli-src") || frame.$actor.attr("src") || $("source", frame.$actor).attr("src") || "")
        if (!src) {
            return null
        }
        if (/^(https?:|data:|blob:)/i.test(src)) {
            return src
        }
        const base = /^https?:$/i.test(location.protocol) ? document.baseURI : baseUrl
        if (!base) {
            return null
        }
        try {
            return new URL(src, base).href
        } catch (e) {
            return null
        }
    }

    /**
     * Whether a frame can only be read from a local source folder – no in-memory File and not fetchable
     * over http (even with `baseUrl`). Such frames drive the "pick a source folder" prompt.
     * @param {Frame} frame
     * @param {string} baseUrl
     * @returns {boolean}
     */
    _frame_needs_source(frame, baseUrl = "") {
        return !frame.$actor.data("file") && !this._frame_http_url(frame, baseUrl)
    }

    /**
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {string} name
     * @param {string} text
     */
    async _write_text(dirHandle, name, text) {
        const handle = await dirHandle.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        await writable.write(text)
        await writable.close()
    }

    /**
     * Directory to read source media from when a frame has no in-memory File (path-based / reopened
     * presentation). Persisted in IndexedDB so a later session only needs a one-click permission re-grant.
     * @returns {Promise<?FileSystemDirectoryHandle>} Null if the user cancels the picker.
     */
    async _get_source_dir_handle() {
        let handle = await this._load_persisted_handle()
        if (handle) {
            const granted = await handle.queryPermission({ mode: "read" }) === "granted"
                || await handle.requestPermission({ mode: "read" }) === "granted"
            if (granted) {
                return handle
            }
        }
        try {
            handle = await window.showDirectoryPicker({ mode: "read", id: "slidershow-source", startIn: "pictures" })
        } catch (e) {
            return null
        }
        await this._persist_handle(handle)
        return handle
    }

    /**
     * Always opens the picker (skips the persisted-handle fast path in _get_source_dir_handle), so the
     * user can pick a different folder even after one was already persisted from a previous export.
     * @returns {Promise<?FileSystemDirectoryHandle>} Null if the user cancels the picker.
     */
    async _change_source_dir_handle() {
        try {
            const handle = await window.showDirectoryPicker({ mode: "read", id: "slidershow-source", startIn: "pictures" })
            await this._persist_handle(handle)
            this.playback.hud.info("Source folder updated.")
            return handle
        } catch (e) {
            return null
        }
    }

    /**
     * @param {FileSystemDirectoryHandle} handle
     */
    async _persist_handle(handle) {
        const db = await this._open_handle_db()
        const tx = db.transaction("handles", "readwrite")
        tx.objectStore("handles").put(handle, "source")
        return new Promise(resolve => tx.oncomplete = resolve)
    }

    /**
     * @returns {Promise<?FileSystemDirectoryHandle>} Null if nothing was ever persisted, or on any IndexedDB error.
     */
    async _load_persisted_handle() {
        try {
            const db = await this._open_handle_db()
            const tx = db.transaction("handles", "readonly")
            return await new Promise(resolve => {
                const req = tx.objectStore("handles").get("source")
                req.onsuccess = () => resolve(req.result || null)
                req.onerror = () => resolve(null)
            })
        } catch (e) {
            return null
        }
    }

    /**
     * @returns {Promise<IDBDatabase>}
     */
    _open_handle_db() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("slidershow-tag-export", 1)
            req.onupgradeneeded = () => req.result.createObjectStore("handles")
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

}