class CommandPalette {
    /**
     * @typedef {Object} Command
     * @property {string} description
     * @property {Function} callback
     * @property {Function|Boolean} isEnabled Optional function that returns whether the command is currently enabled.
     * @property {?string} hotkey
     * @property {?string} group
     */

    /** @type {Command[]} */
    _commands = []

    /** @type {number} Currently highlighted index in filtered results */
    _activeIndex = -1

    /** @type {Command[]} Currently filtered commands */
    _filtered = []

    _firstRun = true

    /**
     * @param {Hud} hud
     */
    constructor(hud) {
        this.hud = hud

        // DOM
        this.$wrapper = this.hud.$command_palette
        this.$input = this.$wrapper.find("input")
        this.$list = this.$wrapper.find("ul")

        this.#bindEvents()
    }

    /**
     * Register a command
     * @param {string} description
     * @param {Function} callback
     * @param {Function|Boolean} isEnabled Optional function that returns whether the command is currently enabled
     * @param {?string} hotkey
     * @param {?string} group
     */
    register(description, callback, isEnabled = true, hotkey = null, group = null) {
        this._commands.push({ description, callback, isEnabled, hotkey, group })
    }

    focus() {
        this.$wrapper.fadeIn(500)
        this.$input.trigger("focus")
    }

    #bindEvents() {
        this.$input
            .on("focus", () => {
                // Initially, all items are shown. But then reset items only if something changes.
                // Ex. user tagged a frame, then they turned off tagging, so when the palette
                //  is focused again, the tag command is not available anymore and thus the list should be reset.
                if (this._firstRun
                    || this._filtered.some(({ isEnabled }) => typeof isEnabled === "function" ? isEnabled() : isEnabled)

                ) {
                    this._firstRun = false
                    this.#filter('')
                }
            })
            .on("input", () => this.#filter(this.$input.val()))
            .on("keydown", e => {
                switch (e.key) {
                    case "ArrowDown":
                        e.preventDefault()
                        this.#moveActive(1)
                        break
                    case "ArrowUp":
                        e.preventDefault()
                        this.#moveActive(-1)
                        break
                    case "Enter":
                        e.preventDefault()
                        this.#executeActive()
                        break
                    case "Escape":
                        this.$input.trigger("blur")
                        break
                }
            })

        // Run command on click
        this.$list.on("click", "li", e => {
            const index = $(e.currentTarget).data("index")
            this._filtered[index]?.callback()
        })
    }

    /**
     * Fuzzy match: all characters of needle appear in haystack in order
     * Returns score (higher = better match) or -1 if no match
     * @param {string} needle
     * @param {string} haystack
     * @returns {number}
     */
    #fuzzyScore(needle, haystack) {
        const n = needle.toLowerCase()
        const h = haystack.toLowerCase()
        let ni = 0, score = 0, lastMatch = -1

        for (let hi = 0; hi < h.length && ni < n.length; hi++) {
            if (h[hi] === n[ni]) {
                // Consecutive matches and word-start matches score higher
                score += (hi === lastMatch + 1) ? 2 : 1
                if (hi === 0 || h[hi - 1] === ' ') score += 2
                lastMatch = hi
                ni++
            }
        }

        return ni === n.length ? score : -1
    }

    /**
     * Wrap matched characters in <mark>
     * @param {string} needle
     * @param {string} haystack
     * @returns {string}
     */
    #highlight(needle, haystack) {
        if (!needle) return haystack
        const n = needle.toLowerCase()
        const chars = haystack.split('')
        let ni = 0
        const result = []

        for (let hi = 0; hi < chars.length; hi++) {
            if (ni < n.length && chars[hi].toLowerCase() === n[ni]) {
                result.push(`<mark>${chars[hi]}</mark>`)
                ni++
            } else {
                result.push(chars[hi])
            }
        }

        return result.join('')
    }

    /**
     * @param {string} query
     */
    #filter(query) {
        this._activeIndex = -1

        this._filtered = this._commands
            .filter(({ isEnabled }) => typeof isEnabled === "function" ? isEnabled() : isEnabled)
        if (query.trim()) {
            this._filtered = this._filtered
                .map(cmd => ({ cmd, score: this.#fuzzyScore(query, cmd.description) }))
                .filter(({ score }) => score >= 0)
                .sort((a, b) => b.score - a.score)
                .map(({ cmd }) => cmd)
        }

        this.#renderList(query)
    }

    /**
     * @param {string} query
     */
    #renderList(query = '') {
        this.$list.empty()

        this._filtered.forEach((cmd, i) => {
            const parts = []
            if (cmd.group) parts.push(`<span class="hint">${cmd.group}</span>`)
            parts.push(this.#highlight(query, cmd.description))
            if (cmd.hotkey) parts.push(`<span class="hint">${cmd.hotkey}</span>`)

            const html = parts.join(" ")
            $('<li/>', { html: html })
                .data("index", i)
                .appendTo(this.$list)
        })
    }

    /**
     * @param {number} direction 1 or -1
     */
    #moveActive(direction) {
        const count = this._filtered.length
        if (!count) return

        this._activeIndex = (this._activeIndex + direction + count) % count
        this.$list.children().removeClass("active")
            .eq(this._activeIndex).addClass("active")
            .get(0)?.scrollIntoView({ block: "nearest" })
    }

    #executeActive() {
        // Use selected or the first element beneath
        const cmd = this._filtered[this._activeIndex] || this._filtered[0]
        if (cmd) {
            cmd.callback()
            // Clear input after executing a command. However, the results will stay.
            // So that activating "Go right" will hide command palette but when focusing again,
            // the user gets "Go right" option pre-selected.
            this.$input.val('').trigger("blur")
            // Palette can be opened standalone (hotkey) without the hud menu.
            // In that case, hide its wrapper too, otherwise it stays hanging on screen.
            if (!this.hud.$hud_menu.is(":visible")) {
                this.$wrapper.fadeOut(500)
            }
        }
    }
}
