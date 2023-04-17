/**
 * Append new frame programatically with the static methods.
 */
class FrameFactory {
    static html(html, append = true) {
        const $el = $("<article/>", { html: html })
        if (append) {
            $el.appendTo($main).hide(0)
        }
        return $el
    }

    static text(text, append = true) {
        return FrameFactory.html(text, append)
    }

    static img(filename, append = true, data = null, ram_only = false, callback = null) {
        // data-src prevents the performance for serveral thousand frames
        const $el = $(`<img src="data:" data-src="${filename}" />`)
        const $frame = FrameFactory.html($el, append)

        if (data) {
            // sets exif
            Frame.exif($el, data, callback)

            if (ram_only) {
                // src preloading (we do not need to know the exact directory)
                FrameFactory._read(data, $el)
            }
        } else {
            callback()
        }
        return $frame
    }

    static video(filename, append = true, data = null, ram_only = false) {
        const $el = $(`<video controls autoplay data-src="${filename}"></video>`)
        const $frame = FrameFactory.html($el, append)
        if (data && ram_only) {
            FrameFactory._read(data, $el)
        }
        return $frame
    }

    static _read(data, $el) {
        if (PRELOAD_XXX) {
            $el
                .attr("data-src-cached", 1)
                .data("src-cached-data", (dom) => {
                    const reader = new FileReader()
                    reader.onload = (e) => dom.src = e.target.result
                    reader.readAsDataURL(data)
                })
        } else {

            const reader = new FileReader()
            reader.onload = (e) => $el
                .attr("data-src-cached", 1)
                .data("src-cached-data", e.target.result)
            reader.readAsDataURL(data)
        }
    }

    /**
     *
     * @param {string} filename
     * @param {bool} append to $main
     * @param {Object} data
     * @param {bool} ram_only We will push the media contents to the RAM
     * @returns {null|jQuery} Null if the file could not be included
     */

    static file(filename, append = true, data = null, ram_only = false, callback = null) {
        const suffix = filename.split('.').pop().toLowerCase()
        switch (suffix) {
            case "mp4":
                callback()
                return FrameFactory.video(filename, append, data, ram_only)
            case "heif":
            case "heic":
            case "gif":
            case "png":
            case "jpg":
                return FrameFactory.img(filename, append, data, ram_only, callback)
            default:
                console.warn("Cannot identify", filename)
                FrameFactory.text("Cannot be identified: " + filename, append)
                return null
        }
    }
}