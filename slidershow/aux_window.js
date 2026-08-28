class AuxWindow {

    constructor() {
        this.instance_id = btoa(window.location.href) // Math.floor(10 ** 6 + Math.random() * 9 * 10 ** 6) // random 6digit number

        // start_listener
        this.channel = new BroadcastChannel(`slidershow=${this.instance_id}`)
        this.channel.addEventListener("message", e => this.controller_command(e.data))

        this.last_info = null

        /** @type {?Playback} Set by the Playback constructor; stays null inside an aux window. */
        this.playback = null

        /**
         * @type {string[]} Pane id per sector, indexed like AUX_SLOTS. Authored in the master
         * (it owns the URL hash) and mirrored into every aux window over the channel.
         */
        this.layout = [...AUX_LAYOUT_DEFAULT]
        /** @type {number[]} The three splits the window is divided by, see AUX_SIZE_NAMES. */
        this.sizes = [...AUX_SIZE_DEFAULT]
    }

    /**
     * This is an auxiliary window.
     */
    overrun(channel_id) {
        $("body").empty().append(this.get_template())  // this is just an auxiliary window, get rid of any content

        this.$aux = $("#aux_window")
        this.$status_message = $("#status_message")
        /** @type {Object} Last `info` payload; kept so that re-laying out does not need a round trip. */
        this.data = {}

        this.master = new BroadcastChannel(`slidershow=${channel_id}`)
        this.master.addEventListener("message", e => this.controller_command(e.data))
        this.master.postMessage({ "action": "get-last-state" })

        this.render()

        $(document).on("keydown", e => {
            if ($(e.target).closest("input, select, textarea, button, .ZebraDialog").length) {
                return // the layout dialog is being operated – its keys are not playback controls
            }
            this.master.postMessage({
                "action": "pressed-key", "key": {
                    "key": e.key,
                    "code": e.code,
                    "shiftKey": e.shiftKey,
                    "altKey": e.altKey,
                    "ctrlKey": e.ctrlKey,
                    "metaKey": e.metaKey,
                }
            })
        })
        return this
    }


    /** Open an aux window */
    open() {
        window.open(window.location.href.split("#")[0] + `?controller=${this.instance_id}`, "Auxiliary window", "toolbar=no,menubar=no")
    }

    /**
     * Master side: adopt a new arrangement, persist it in the hash and push it to the aux windows.
     * @param {string[]} layout Pane ids, indexed like AUX_SLOTS. Unknown ids fall back to the default.
     * @param {?Array<number|string>} sizes The three splits, coerced to numbers and clamped (the hash
     *  hands them over as strings); null keeps the current ones (the hash may carry
     *  `aux` and `aux-size` in either order, so neither may clobber the other).
     * @param {boolean} store Write to the URL hash. Off while restoring from that very hash, and
     *  while a dialog previews an arrangement the user has not confirmed yet.
     * @returns {{layout: string[], sizes: number[]}} The sanitized arrangement.
     */
    set_layout(layout, sizes = null, store = true) {
        this.layout = AUX_SLOTS.map((_, i) => {
            const pane = String(layout?.[i] ?? "").trim()
            if (pane in AUX_PANES) {
                return pane
            }
            if (pane) {
                console.warn("[slidershow] Unknown aux window pane:", pane)
            }
            return AUX_LAYOUT_DEFAULT[i]
        })
        const wanted = sizes ?? this.sizes
        this.sizes = AUX_SIZE_DEFAULT.map((fallback, i) => {
            const n = Math.round(Number(wanted?.[i]))
            return isNaN(n) ? fallback : Math.min(AUX_SIZE_MAX, Math.max(AUX_SIZE_MIN, n))
        })

        const arrangement = { layout: this.layout, sizes: this.sizes }
        Object.assign(this.last_info || {}, arrangement)
        this.channel.postMessage({ "action": "layout", ...arrangement })
        if (store) {
            this.playback?.session.store()
        }
        return arrangement
    }

    /**
     * Ask for a new arrangement. The master owns the URL hash, so an aux window never applies one
     * itself – it routes the wish through him and repaints from the broadcast that comes back.
     */
    request_layout(layout, sizes, store = true) {
        if (this.$aux) {
            this.master.postMessage({ "action": "set-layout", "layout": layout, "sizes": sizes, "store": store })
        } else {
            this.set_layout(layout, sizes, store)
        }
    }

    /**
     * Send the information to an aux-window.
     * @param {Frame} frame
     * @param {Frame?} following
     */
    info(frame, following) {
        this.last_info = {
            action: "info",
            frame: frame.get_preview(false),
            notes: frame.get_notes(),
            next_frame: following?.get_preview(),
            next_notes: following?.get_notes(),
            step: frame.get_step(),
            layout: this.layout,
            sizes: this.sizes
        }
        this.channel.postMessage(this.last_info)
    }

    /**
     * Sends a text from the main to the aux window.s
     * @param {string} text
     */
    display_message(text) {
        this.channel.postMessage({ "action": "display-message", "text": text })
    }

    /**
     * @param {Frame} frame
     */
    update_step(frame) {
        this.channel.postMessage({ "action": "update-step", "step": frame.get_step() })
    }

    /**
     * @param {*} e Message from an aux-window
     */
    controller_command(e) {
        // Both ends share this method and both listen on the same channel, so each ignores what is
        // addressed to the other. (Also guards the master's own channel object against its own echo –
        // ex: two tabs sharing the same URL, hence the same channel name.)
        const AUX_ONLY = ["info", "update-step", "display-message", "layout"]
        const MASTER_ONLY = ["get-last-state", "set-layout", "pressed-key"]
        if (this.$aux ? MASTER_ONLY.includes(e.action) : AUX_ONLY.includes(e.action)) {
            return
        }
        switch (e.action) {
            case "info":
            case "layout":
                if (e.action === "info") {
                    Object.assign(this.data, e)
                }
                this.layout = e.layout || this.layout
                this.sizes = e.sizes || this.sizes
                this.render()
                break
            case "update-step":
                this.data.step = e.step
                this.apply_step()
                this.$status_message.html("").hide()
                break
            case "get-last-state":
                this.channel.postMessage(this.last_info
                    || { "action": "layout", "layout": this.layout, "sizes": this.sizes })
                break
            case "set-layout":
                // An aux window asks the master (the hash owner) to re-arrange the sectors.
                this.set_layout(e.layout, e.sizes, e.store !== false)
                break
            case "display-message":
                this.$status_message.html(e.text).toggle(Boolean(e.text))
                break
            case "pressed-key":
                wh.simulate(e.key)
                break
            default:
                console.warn("Unknown message", e)
        }
    }

    /**
     * Aux window: (re)fill every sector from `this.data`, and size them by `this.sizes`.
     */
    render() {
        const d = this.data
        const started = d.action === "info"
        /** Pane id → [HTML to display, placeholder before the playback starts] */
        const content = {
            "current": [d.frame, "Start presenting to see the current frame here."],
            "next": [started ? (d.next_frame || "END") : "", ""],
            "notes": [d.notes, "Here you will see presenter's notes."],
            "next-notes": [d.next_notes, "Here you will see the next frame's notes."],
            "-": ["", ""]
        }

        const pane_of = slot => this.layout[AUX_SLOTS.indexOf(slot)]
        const shown = AUX_COLUMNS.map(slots => slots.filter(slot => pane_of(slot) !== "-"))
        const live_columns = shown.filter(slots => slots.length).length

        AUX_COLUMNS.forEach((slots, c) => {
            const width = c ? 100 - this.sizes[0] : this.sizes[0]
            // An emptied sector takes no space at all (CSS hides it), so whatever is left over
            // spreads – which is also how the merged full-height column comes about.
            const width_share = live_columns > 1 ? width / 100 : 1
            this.$aux.find(`.aux-column[data-column=${c}]`)
                .attr("data-empty", shown[c].length ? null : "true")
                // flex-grow, not the `flex` shorthand – jQuery would append "px" to a bare number
                // there and turn the share into a flex-basis (`flexGrow` is in its unitless list).
                .css("flex-grow", width)

            slots.forEach((slot, j) => {
                const pane = pane_of(slot)
                const height = j ? 100 - this.sizes[c + 1] : this.sizes[c + 1]
                const height_share = shown[c].length > 1 ? height / 100 : 1
                const [html, placeholder] = content[pane] || content["-"]
                this.$aux.find(`.aux-slot[data-slot=${slot}]`)
                    .attr("data-pane", pane)
                    // A frame preview is a full-blown article, so it has to be shrunk by whichever
                    // of the two shares of the window this sector got is the smaller one.
                    .css({ "flex-grow": height, "--aux-scale": Math.min(width_share, height_share) })
                    .find("frame-preview").html(started ? (html || "") : placeholder)
            })
        })

        this.apply_step()
    }

    /** Highlight the element to be revealed in the next step. Re-applied after every render. */
    apply_step() {
        const $current = this.$aux.find(".aux-slot[data-pane=current] frame-preview")
        $current.find("[sli-step]")
            .removeClass("current-step step-hidden step-not-yet-visible")
            .filter((_, el) => Number($(el).attr("sli-step")) > this.data.step).addClass("step-not-yet-visible")
        $current.find(`[sli-step=${Number(this.data.step)}]`).addClass("current-step", true)
    }

    /**
     * Configure all four sectors at once – what each of them shows and how the window is divided
     * between them. Lives here rather than in `Operation` because both ends open it: the master
     * through its hotkey, the aux window through the knob in its corner.
     */
    layout_dialog() {
        const before = { layout: [...this.layout], sizes: [...this.sizes] }
        const $list = $("<div/>", { class: "aux-layout-list" })
        const restore_hotkeys = this.playback?.operation.suspendHotkeys()
        let answered = false

        const read = () => ({
            layout: $("select", $list).map((_, el) => String($(el).val())).get(),
            sizes: $("input[type=range]", $list).map((_, el) => Number($(el).val())).get()
        })
        // Apply straight away so the effect can be seen, but leave the URL alone until it is confirmed.
        const preview = () => {
            const wish = read()
            $("output", $list).each((i, el) => { $(el).text(`${wish.sizes[i]} : ${100 - wish.sizes[i]}`) })
            this.request_layout(wish.layout, wish.sizes, false)
        }
        const answer = wish => {
            answered = true
            this.request_layout(wish.layout, wish.sizes)
        }

        AUX_SLOT_NAMES.forEach((name, i) => $("<label/>").append(
            document.createTextNode(name + ": "),
            $("<select/>")
                .append(Object.entries(AUX_PANES).map(([id, label]) => $("<option/>", { value: id, text: label })))
                .val(this.layout[i])
                .on("change", preview)
        ).appendTo($list))

        AUX_SIZE_NAMES.forEach((name, i) => $("<label/>", { class: "aux-size" }).append(
            document.createTextNode(name + ": "),
            $("<input/>", { type: "range", min: AUX_SIZE_MIN, max: AUX_SIZE_MAX, step: 1, value: this.sizes[i] })
                .on("input", preview),
            $("<output/>", { text: `${this.sizes[i]} : ${100 - this.sizes[i]}` })
        ).appendTo($list))

        new $.Zebra_Dialog({
            message: "What the auxiliary window shows where, and how it is split. An emptied sector "
                + "disappears altogether, leaving its neighbour the whole space.",
            source: { inline: $list },
            type: "question",
            title: "Auxiliary window layout",
            onClose: () => {
                restore_hotkeys?.()
                // Closed by the × or by clicking away – neither button spoke, so the live preview
                // above was never confirmed and has to be taken back. Deferred because Zebra_Dialog
                // gives no promise about running a button's callback before this.
                setTimeout(() => answered || answer(before))
            },
            buttons: [
                { caption: "Cancel", callback: () => answer(before) },
                { caption: "Ok", default_confirmation: true, callback: () => answer(read()) }
            ]
        })
    }

    /** The single knob the whole window is arranged from – one per window, not one per sector. */
    settings_button() {
        return $("<button/>", { class: "aux-settings", title: "Auxiliary window layout", html: "&#9881;" })
            .on("click", () => this.layout_dialog())
    }

    get_template() {
        // The sectors are filled and sized by render().
        const slot = name => $("<div/>", { class: "aux-slot" })
            .attr("data-slot", name)
            .append($("<frame-preview/>"))

        const column = (slots, c) => $("<div/>", { class: "aux-column" })
            .attr("data-column", c)
            .append(slots.map(slot))

        return $("<div/>", { id: "aux_window" }).append(
            $("<p/>", { id: "status_message" }).hide(),
            AUX_COLUMNS.map(column),
            this.settings_button()
        )
    }
}
