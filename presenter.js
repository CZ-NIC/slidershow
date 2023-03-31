const wh = new WebHotkeys()
$body = $("body")
let $articles = $("article")
/**
 * @type {Playback}
 */
let playback


const TRANS_DURATION = ($("body").data("transition-duration") || 0) * 1000 // XXX


/**
 * Main menu.
 */
class Menu {
    constructor() {

        $articles.hide(0)
        const $menu = this.$menu = $("menu").show(0)
        $body.show()

        const $start = $("#start").focus().click(() => this.start())

        if ($menu.attr("data-skip") !== undefined) {
            this.start()
        }

        wh.press(KEY.ESCAPE, "Go to menu", () => {
            playback.stop()
            $menu.show()
            $start.focus()
        })

        // Drop new files
        const $drop = $("#drop").on("drop", (ev) => {
            ev.preventDefault()
            const items = [...ev.originalEvent.dataTransfer.items].filter(i => i.kind === "file").map(i => i.getAsFile().name)
            if (this.appendFiles(items)) {
                $drop.text(`Dropped ${items.length} files.`)
            } else {
                $drop.text('Drop cancelled')
            }
        }).on("dragover", (ev) => {
            $drop.text("Drop")
            ev.preventDefault()
        }).on("dragleave", (ev) => {
            $drop.text($drag.data("placeholder"))
            ev.preventDefault()
        })

        // Input files
        const $file = $("#file").change(() => {
            this.appendFiles([...$file[0].files].map(f => f.name))
        })
    }

    start() {
        this.$menu.hide()
        playback = new Playback()
    }

    appendFiles(items) {
        console.log("49: items", items)
        const folder = prompt("What folder have you taken the files from?", "/home/.../")
        if (folder === null) {
            return
        }

        $articles.remove() // delete old frames
        const $section = $("<section/>").appendTo($body);//.data(defaults)
        ([...(new FormData($("#defaults")[0]))]).map(([key, val]) => $section.attr("data-" + key, val))

        const elements = items.map(item => Frame.file(folder + item, false)).filter(x => !!x)
        $section.hide(0).append(elements).children().hide(0).parent().show(0)
        return true
    }
}


/**
 * Append new frame programatically with the static methods.
 */
class Frame {
    static html(html, append=true) {
        const $el = $("<article/>", { html: html })
        if(append) {
            $el.appendTo($body).hide(0)
        }
        return $el
    }

    static text(text, append=true) {
        return Frame.html(text, append)
    }

    static img(filename, append=true) {
        return Frame.html(`<img src="${filename}" />`, append)
    }
    static video(filename, append=true) {
        return Frame.html(`<video controls autoplay><source src="${filename}"></video>`, append)
    }

    /**
     *
     * @param {*} filename
     * @returns {null|jQuery} Null if the file could not be included
     */
    static file(filename, append=true) {
        const suffix = filename.split('.').pop().toLowerCase()
        switch (suffix) {
            case "mp4":
                return Frame.video(filename, append)
            case "heif":
            case "heic":
            case "gif":
            case "png":
            case "jpg":
                return Frame.img(filename, append)
            default:
                console.warn("Cannot identify", filename)
                Frame.text("Cannot be identified: " + filename, append)
                return null
        }
    }

    constructor($el) {
        this.$el = $el
    }

    effect(effect) {
        const $el = this.$el
        const winHeight = $(window).height() + "px"
        switch (effect) {
            case "go-up":
                return $el.animate({ top: `-${$el.height()}px` }, TRANS_DURATION,
                    () => $el.hide(0).css("top", "0px"))
            case "go-down":
                return $el.animate({ top: winHeight }, TRANS_DURATION,
                    () => $el.hide(0).css("top", "0px"))
            case "arrive-from-bottom":
                return $el.css("top", winHeight).show(0).animate({ top: "0px" }, TRANS_DURATION)
            case "arrive-from-top":
                return $el.css("top", `-${$el.height()}px`).show(0).animate({ top: "0px" }, TRANS_DURATION)
            default:
                console.error("Unknown effect: " + effect)
        }

    }
}

/**
 * Frame playback controller.
 */
class Playback {

    constructor() {
        this.promise = {} // transition promise
        this.moving = true
        this.moving_timeout = null
        this.appendEndSlide()
        $articles = $("article")
        $articles.hide()

        this.$current = $articles.first()
        this.goToFrame(0, true)
        this.$current.show()

        this.videoInit()
        this.shortcuts()
    }

    stop() {
        clearTimeout(this.moving_timeout)
        $articles.hide()
    }

    /**
     * Inherit attributes from the ancestors
     */
    videoInit() {
        $articles.find("video").each(function () {
            const attributes = $(this).closest("[data-video]").data("video")?.split(" ") || [] // ex: ["muted", "autoplay"]
            attributes.forEach((k, v) => this[k] = true) // ex: video.muted = true
            // Following line has so more effect since it was already set by JS. However, for the readability
            // we display the attributes in the DOM too. We could skip the JS for the attribute 'controls'
            // but not for 'muted'. If the <video> is not <video muted> by the DOM load,
            // the attribute would have no effect.
            $(this).attr(attributes.reduce((k, v) => ({ ...k, [v]: true }), {})) // ex: <video muted=true>
        })
    }

    appendEndSlide() {
        Frame.text("... end.")
    }

    shortcuts() {
        // Shortcuts
        wh.press(KEY.SPACE, "Next", () => this.notVideoFocus() && this.nextFrame())

        wh.press(KEY.RIGHT, "Next", () => this.notVideoFocus() && this.nextFrame())
        wh.press(KEY.LEFT, "Prev", () => this.notVideoFocus() && this.previousFrame())

        wh.press(KEY.N, "Next", () => this.nextFrame())
        wh.press(KEY.P, "Prev", () => this.previousFrame())

        wh.press(KEY.PageDown, "Next", () => this.nextFrame())
        wh.press(KEY.PageUp, "Prev", () => this.previousFrame())

        wh.press(KEY.Home, "Go to the first", () => this.goToFrame(0))
        wh.press(KEY.End, "Go to end", () => this.goToFrame($articles.length - 2)) // -2 and not -1 due to our artificial end slide

        wh.press(KEY.H, "Show help", () => {
            alert(wh.getText())
        })

    }

    nextFrame() {
        this.goToFrame(this.index + 1, true)
    }
    previousFrame() {
        this.goToFrame(this.index - 1)
    }

    notVideoFocus() {
        return $(":focus").prop("tagName") !== "VIDEO"
    }

    /**
     *
     * @param {Number} index
     */
    goToFrame(index, moving = false) {
        console.log("Frame", index)

        const $last = this.$current

        const next = $articles[index]
        const $current = this.$current = next ? $(next) : $last
        this.index = $articles.index($current)

        this.moving = moving
        this.promise.aborted = true
        const promise = this.promise = $last[0] === $current[0] ? Promise.resolve() : this.transition($last, $current).promise()
        promise.then(() => {

            if (promise.aborted) { // another frame was raise meanwhile
                console.log("235: ABORTED",)
                return
            }
            console.log("Frame ready")


            // Focus media controls
            const $el = $current.find("video, img").first().focus()


            // Zoomable image
            if ($el.prop("tagName") === "IMG") {
                $el.zoom()
            }

            // No HTML tag found, fit plain text to the screen size
            if ($current.children().length === 0) {
                textFit($current)
            }

            // Video autoplay (when muted in chromium)
            // if ($el.prop("tagName") === "VIDEO") {
            //     // user has to interact first, try 'try catch'
            //     console.log("260: PLAY attempt")
            //     try {
            //         $el[0].play()
            //     } catch (e) {
            //         alert("Interact with the page before the autoplay works.")
            //         // XX $("<div/>", { text: "Interact with the page before the autoplay works." })
            //     }
            // }

            // Duration
            if (moving) {
                const duration = $el.prop("tagName") === "VIDEO" ? this.prop("duration-video") : this.prop("duration")

                if (duration) {
                    if(this.moving_timeout) {
                        clearTimeout(this.moving_timeout)
                    }
                    this.moving_timeout = setTimeout(() => this.moving && this.nextFrame(), duration * 1000)
                }
            }
            console.log("237: End config")

        })
    }

    prop(prop) {
        return this.$current.closest(`[data-${prop}]`).data(prop)
    }

    transition($last, $current) {
        const last = new Frame($last)
        const current = new Frame($current)
        switch (this.prop("transition")) {
            case "scroll-down":
                if ($articles.index($last) < $articles.index($current)) {
                    last.effect("go-up")
                    return current.effect("arrive-from-bottom")
                } else {
                    last.effect("go-down")
                    return current.effect("arrive-from-top")
                }
            case "fade":
            default:
                $last.fadeOut(TRANS_DURATION)
                return $current.fadeIn(TRANS_DURATION)
        }
    }
}


// export to the dev console
const menu = new Menu()
playback