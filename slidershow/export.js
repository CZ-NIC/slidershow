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
    }

    file_handler_checkbox() {
        if (!this.file_handler_allowed) {
            return "(In this browser, you are not allowed to rewrite local files.)"
        }
        return $("<label />",
            { "text": "Rewrite local file next time? (Chrome only)" })
            .prepend(
                $("<input />", { "type": "checkbox", "checked": this.file_handler_wanted })
                    .on("click", (e) => {
                        this.file_handler_wanted = $(e.target).prop("checked")
                    })
            )
    }


    export_dialog() {
        new $.Zebra_Dialog({
            message: "Will you put the presentation file to the media folder?<br>",
            source: { inline: this.file_handler_checkbox() },
            type: "question",
            title: "Export",
            buttons: [{
                caption: "Same folder (tiny presentation size)", callback: () => this.export()
            }, {
                caption: "Another folder (tiny presentation size)", callback: () =>
                    new $.Zebra_Dialog("Where will the presentation find the media folder?", {
                        title: "The path to the media folder",
                        default_value: $main.attr("sli-path") || $("[name=path]", "#defaults").val() || "./",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, path) => $main.attr("sli-path", path) && this.export(false, path)
                        }]
                    })
            }, {
                // XX estimate the size and how many photos could not be packed (not being dropped previously)
                // XX fix: if imported with a path, those file will not be exported with src=data
                caption: "Pack into one file (huge RAM + disk demand)", callback: () => this.export(true)
            }]
        })
    }

    async export(compact_file = false, path = "") {
        // Why to wrap the body inside a div? jQuery seems to handle such fundamental tags differently.
        // We end up with a collection of body children, not with the body itself.
        const $contents = $("<div>" + $("body").prop('outerHTML') + "</div>")

        // reduce parameters
        $contents.removeAttr("style")
        $contents.find("*").removeAttr("style")
        $contents.find("> #map, > #map-hud, > #map-wrapper, > #hud, > #preblink-prevention, > menu, > .ZebraDialog, > .ZebraDialogBackdrop").remove()
        await Frame.finalize_frames($contents, this.playback.$articles, compact_file, path, this.menu.display_progress(this.playback.$articles.length))

        const html = $contents.prop("innerHTML").replaceAll(EXPORT_SRC, "src")
        if (!html.length) {
            this.playback.hud.ok("Export failed", "Cannot export a single file – too big.")
            return
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

        // Export the data blob
        const data = `<!DOCTYPE html><html><head>\n${$head[0].innerHTML}</head>\n<body>` + html + "\n</body>\n</html>"

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
            this.file_handler = await window.showSaveFilePicker({suggestedName: this.playback.session.docname}) // ask once for the path – then keep newHandle
        }
        return this.file_handler
    }

    download(data) {
        const blob = new Blob([data], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = this.playback.session.docname
        document.body.appendChild(link)
        link.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(link)
    }

    // --- Album export (one folder per named tag + a "vsechny" folder with everything) ---

    /**
     * @typedef {{tag: number, name: string, frames: Frame[]}} Album
     */

    /**
     * @returns {Album[]} One entry per tag in use, ascending. Named tags use their name as the folder;
     * unnamed tags fall back to `tag-<digit>` (so tagging without naming still exports something useful).
     */
    collect_albums() {
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
     * @param {Album[]} albums
     * @returns {Frame[]} Every frame belonging to at least one album, deduplicated (→ the "vsechny" folder).
     */
    union_frames(albums) {
        const seen = new Set()
        const result = []
        albums.forEach(a => a.frames.forEach(f => {
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
     * Guards against album names that would corrupt the export: two tags sharing a name (or a tag
     * named "vsechny", the reserved catch-all folder) end up copied into the very same folder – later
     * files silently overwrite earlier ones and `alba.json`/`<album>.txt` collapse to the last one
     * written, since both are keyed by name. A `/` or `\` would also make `getDirectoryHandle(name,
     * {create:true})` throw mid-export (an unhandled rejection, not a dialog).
     * @param {Album[]} albums
     * @returns {string[]} Human-readable problems, empty if `albums` are all export-safe.
     */
    _validate_albums(albums) {
        const problems = []
        const seenNames = new Map()
        for (const album of albums) {
            if (album.name.toLowerCase() === "vsechny") {
                problems.push(`Tag name "${album.name}" is reserved (used for the "vsechny" folder) – rename it.`)
            }
            if (/[/\\]/.test(album.name)) {
                problems.push(`Tag name "${album.name}" contains a path separator – rename it.`)
            }
            const key = album.name.toLowerCase()
            if (seenNames.has(key)) {
                problems.push(`Tags named "${seenNames.get(key)}" and "${album.name}" would collide into the same folder – rename one.`)
            } else {
                seenNames.set(key, album.name)
            }
        }
        return problems
    }

    /**
     * Entry point for Ctrl+Shift+S: browser-support check, named-tags/validation checks, then a summary
     * dialog (per-album counts, a source-folder hint if some files aren't in memory) with an "Export" button.
     */
    export_albums_dialog() {
        if (!window.showDirectoryPicker) {
            this.playback.hud.ok("Export albums",
                "Exporting to folders works only in Chrome/Edge.<br>"
                + "Your tags are saved inside the presentation – export it with <kbd>Ctrl+S</kbd>, "
                + "open the exported file in Chrome, and run this again (<kbd>Ctrl+Shift+S</kbd>).")
            return
        }
        const albums = this.collect_albums()
        if (!albums.length) {
            this.playback.hud.ok("Export albums", "No tags used yet. Tag some frames first (Alt+T, then a digit).")
            return
        }
        const problems = this._validate_albums(albums)
        if (problems.length) {
            this.playback.hud.ok("Export albums", `Fix tag names before exporting:<br>${problems.join("<br>")}`)
            return
        }
        const allFrames = this.union_frames(albums)
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

        const rows = [...albums.map(a => ({ name: a.name, count: a.frames.length })), { name: "vsechny", count: allFrames.length }]
            .map(({ name, count }) => `<tr><td>${this._esc(name)}</td><td>${count}</td></tr>`).join("")
        const summary = `<table class="album-summary">${rows}</table>${sizeLine}<br>`
            + (baseCandidates.length
                ? `<br>${baseCandidates.length} file(s) are referenced by a relative path – give the base URL below to download them over http.`
                : "")
            + (missingFrames.length
                ? `<br>${missingFrames.length} file(s) aren't in memory and can't be fetched over http`
                + ` – you'll be asked for a "source folder" to read them from (its subfolders are searched too).`
                + (pathHint ? `<br>Hint: their path looks like <code>${this._esc(pathHint)}/…</code> – pick that folder, or a parent of it.` : "")
                : "")

        const $extra = $("<div/>", { class: "album-export-extra" })
        let $baseInput = null
        if (baseCandidates.length) {
            $baseInput = $("<input/>", {
                type: "text",
                value: localStorage.getItem("ALBUM-BASE-URL") || "",
                placeholder: "https://example.com/photos/",
                style: "width:100%"
            })
            $("<label/>").append(document.createTextNode("Base URL: "), $baseInput).appendTo($extra)
        }

        new $.Zebra_Dialog({
            message: summary,
            source: { inline: $extra },
            title: "Export albums to folders",
            type: "question",
            buttons: [
                "Cancel",
                ...(missingFrames.length ? [{
                    caption: "Change source folder…",
                    callback: () => this._change_source_dir_handle().then(() => this.export_albums_dialog())
                }] : []),
                {
                    caption: "Export",
                    default_confirmation: true,
                    callback: () => {
                        const baseUrl = $baseInput ? String($baseInput.val()).trim() : ""
                        if (baseUrl) {
                            localStorage.setItem("ALBUM-BASE-URL", baseUrl)
                        }
                        this.export_albums(albums, allFrames, baseUrl)
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
     * @param {Album[]} albums
     * @param {Frame[]} allFrames
     * @param {string} baseUrl Base URL for relative-path frames on a file:// presentation (empty otherwise).
     */
    async export_albums(albums, allFrames, baseUrl = "") {
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
            targetDir = await window.showDirectoryPicker({ mode: "readwrite", id: "slidershow-albums-target", startIn: "pictures" })
        } catch (e) {
            return // user cancelled the target folder picker
        }

        const folderNames = ["vsechny", ...albums.map(a => a.name)]
        // Loose files from a previous export (alba.json, <album>.txt) must abort too, not just the
        // subfolders – otherwise they're silently overwritten by the fresh run.
        const fileNames = ["alba.json", ...albums.map(a => `${a.name}.txt`)]
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
            this.playback.hud.ok("Export albums", `Target folder already contains: ${conflicts.join(", ")}. Pick an empty folder.`)
            return
        }

        const semaphore = new Semaphore(4)
        /** @type {Object<string, FileSystemDirectoryHandle>} */
        const dirHandles = {}
        /** @type {Object<string, {copiedNames: string[], missing: string[]}>} */
        const results = {}

        dirHandles["vsechny"] = await targetDir.getDirectoryHandle("vsechny", { create: true })
        results["vsechny"] = await this._copy_frames(allFrames, dirHandles["vsechny"], sourceIndex, semaphore, baseUrl)

        for (const album of albums) {
            dirHandles[album.name] = await targetDir.getDirectoryHandle(album.name, { create: true })
            results[album.name] = await this._copy_frames(album.frames, dirHandles[album.name], sourceIndex, semaphore, baseUrl)
        }

        await this._write_alba(targetDir, results)
        this._show_export_summary(targetDir, albums, allFrames, dirHandles, results, semaphore, baseUrl)
    }

    async _write_alba(targetDir, results) {
        const alba = Object.fromEntries(Object.entries(results).map(([name, r]) => [name, r.copiedNames]))
        await this._write_text(targetDir, "alba.json", JSON.stringify(alba, null, 2))
        for (const [name, r] of Object.entries(results)) {
            if (name !== "vsechny") {
                await this._write_text(targetDir, `${name}.txt`, r.copiedNames.join("\n"))
            }
        }
    }

    /**
     * @param {FileSystemDirectoryHandle} targetDir
     * @param {Album[]} albums
     * @param {Frame[]} allFrames
     * @param {Object<string, FileSystemDirectoryHandle>} dirHandles
     * @param {Object<string, {copiedNames: string[], missing: string[]}>} results
     * @param {Semaphore} semaphore
     * @param {string} baseUrl
     */
    _show_export_summary(targetDir, albums, allFrames, dirHandles, results, semaphore, baseUrl = "") {
        const summary = Object.entries(results)
            .map(([name, r]) => `${name}: ${r.copiedNames.length} copied` + (r.missing.length ? `, ${r.missing.length} missing` : ""))
            .join("<br>")
        this.playback.hud._pushHistory(summary)

        const missingCount = results["vsechny"].missing.length
        new $.Zebra_Dialog(summary, {
            title: "Album export finished",
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
                        const frames = (name === "vsechny" ? allFrames : albums.find(a => a.name === name).frames)
                            .filter(f => results[name].missing.includes(f.get_filename()))
                        if (!frames.length) {
                            continue
                        }
                        const retried = await this._copy_frames(frames, dirHandle, sourceIndex, semaphore, baseUrl)
                        results[name].copiedNames.push(...retried.copiedNames)
                        results[name].missing = retried.missing
                    }
                    await this._write_alba(targetDir, results)
                    this._show_export_summary(targetDir, albums, allFrames, dirHandles, results, semaphore, baseUrl)
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
     * Basename collision within one album folder → `_2`, `_3`, … suffix, never a silent overwrite.
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
            const req = indexedDB.open("slidershow-albums", 1)
            req.onupgradeneeded = () => req.result.createObjectStore("handles")
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

}