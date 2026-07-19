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
                        default_value: $main.attr("data-path") || $("[name=path]", "#defaults").val() || "./",
                        type: "prompt",
                        buttons: ["Cancel", {
                            caption: "Ok",
                            default_confirmation: true,
                            callback: (_, path) => $main.attr("data-path", path) && this.export(false, path)
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
        $head.find("[data-templated]").remove() // remove all dynamically added libraries
        $head.find("[src^='https://api.mapy.cz'],[href^='https://api.mapy.cz']").remove() // including vendor libraries that does not our honour [data-templated] attr

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
     * @returns {Album[]} One entry per *named* tag in use (unnamed tags are not exportable albums).
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
            .filter(([tag]) => names[tag - 1])
            .map(([tag, frames]) => ({ tag, name: names[tag - 1], frames }))
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

    export_albums_dialog() {
        if (!window.showDirectoryPicker) {
            this.playback.hud.ok("Export alba", "Export alb do složek funguje jen v Chrome/Edge.")
            return
        }
        const albums = this.collect_albums()
        if (!albums.length) {
            this.playback.hud.ok("Export alba", "Žádné pojmenované tagy. Nejprve je pojmenujte (Alt+T → „Pojmenovat tagy…“).")
            return
        }
        const allFrames = this.union_frames(albums)
        const missing = allFrames.filter(f => !f.$actor.data("file")).length

        const summary = albums.map(a => `${a.name}: ${a.frames.length} souborů`).join("<br>")
            + `<br>vsechny: ${allFrames.length} souborů`
            + (missing ? `<br>${missing} souborů bude číst ze zdrojové složky` : "")

        new $.Zebra_Dialog(summary, {
            title: "Export alba do složek",
            type: "question",
            buttons: ["Cancel", {
                caption: "Export",
                default_confirmation: true,
                callback: () => this.export_albums(albums, allFrames)
            }]
        })
    }

    /**
     * @param {Album[]} albums
     * @param {Frame[]} allFrames
     */
    async export_albums(albums, allFrames) {
        let sourceDir = null
        if (allFrames.some(f => !f.$actor.data("file"))) {
            sourceDir = await this._get_source_dir_handle()
            if (!sourceDir) {
                return // user cancelled the source folder picker
            }
        }

        let targetDir
        try {
            targetDir = await window.showDirectoryPicker({ mode: "readwrite", id: "slidershow-albums-target", startIn: "pictures" })
        } catch (e) {
            return // user cancelled the target folder picker
        }

        const folderNames = ["vsechny", ...albums.map(a => a.name)]
        const conflicts = []
        for (const name of folderNames) {
            const exists = await targetDir.getDirectoryHandle(name).then(() => true, () => false)
            if (exists) {
                conflicts.push(name)
            }
        }
        if (conflicts.length) {
            this.playback.hud.ok("Export alba", `Cílová složka už obsahuje: ${conflicts.join(", ")}. Vyberte prázdnou složku.`)
            return
        }

        const semaphore = new Semaphore(4)
        /** @type {Object<string, {copiedNames: string[], missing: string[]}>} */
        const results = {}

        const vsechnyDir = await targetDir.getDirectoryHandle("vsechny", { create: true })
        results["vsechny"] = await this._copy_frames(allFrames, vsechnyDir, sourceDir, semaphore)

        for (const album of albums) {
            const dir = await targetDir.getDirectoryHandle(album.name, { create: true })
            results[album.name] = await this._copy_frames(album.frames, dir, sourceDir, semaphore)
        }

        const alba = Object.fromEntries(Object.entries(results).map(([name, r]) => [name, r.copiedNames]))
        await this._write_text(targetDir, "alba.json", JSON.stringify(alba, null, 2))
        for (const album of albums) {
            await this._write_text(targetDir, `${album.name}.txt`, results[album.name].copiedNames.join("\n"))
        }

        const summary = Object.entries(results)
            .map(([name, r]) => `${name}: ${r.copiedNames.length} zkopírováno` + (r.missing.length ? `, ${r.missing.length} chybí` : ""))
            .join("<br>")
        this.playback.hud.ok("Export alba dokončen", `${summary}<br>Přetáhněte složku do uploadu Zonerama / Google Photos.`)
    }

    /**
     * @param {Frame[]} frames
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {?FileSystemDirectoryHandle} sourceDir
     * @param {Semaphore} semaphore
     * @returns {Promise<{copiedNames: string[], missing: string[]}>}
     */
    async _copy_frames(frames, dirHandle, sourceDir, semaphore) {
        const copiedNames = []
        const missing = []
        const usedNames = new Set()

        await Promise.all(frames.map(async frame => {
            const release = await semaphore.acquire()
            try {
                const file = await this._frame_file(frame, sourceDir)
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
     * @param {Frame} frame
     * @param {?FileSystemDirectoryHandle} sourceDir
     * @returns {Promise<?File>}
     */
    async _frame_file(frame, sourceDir) {
        const stashed = frame.$actor.data("file")
        if (stashed) {
            return stashed
        }
        if (!sourceDir) {
            return null
        }
        try {
            const handle = await sourceDir.getFileHandle(frame.get_filename())
            return await handle.getFile()
        } catch (e) {
            return null
        }
    }

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

    async _persist_handle(handle) {
        const db = await this._open_handle_db()
        const tx = db.transaction("handles", "readwrite")
        tx.objectStore("handles").put(handle, "source")
        return new Promise(resolve => tx.oncomplete = resolve)
    }

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

    _open_handle_db() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("slidershow-albums", 1)
            req.onupgradeneeded = () => req.result.createObjectStore("handles")
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

}