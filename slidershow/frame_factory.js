/**
 * Append new frame programatically with the static methods.
 */
class FrameFactory {
    /**
     *
     * @param {string|JQuery} html
     * @param {boolean} append
     * @returns {JQuery}
     */
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

    /**
     *
     * @param {string} filename
     * @param {boolean} append to $main
     * @param {?File} data
     * @param {boolean} ram_only We will push the media contents to the RAM
     * @param {?Function} callback When an demanding action ends (like reading exif)
     * @returns {JQuery}
     */
    static img(filename, append = true, data = null, ram_only = false, callback = null) {
        // data-src preserve the performance for serveral thousand frames
        const $el = $(`<img/>`, { "data-src": filename, "data-datetime": formatDateMs(data.lastModified) })
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

    /**
     *
     * @param {string} filename
     * @param {boolean} append to $main
     * @param {?File} data
     * @param {boolean} ram_only We will push the media contents to the RAM
     * @returns {JQuery}
     */
    static video(filename, append = true, data = null, ram_only = false) {
        const $el = $(`<video/>`, { "controls": true, "autoplay": true, "data-src": filename, "data-datetime": formatDateMs(data.lastModified) })
        const $frame = FrameFactory.html($el, append)
        if (data && ram_only) {
            FrameFactory._read(data, $el)
        }
        return $frame
    }

    static _read(data, $el) {
        $el
            .data(READ_SRC, (prefer_blob = false) => {
                return new Promise(resolve => {
                    if (prefer_blob) { // shorter but needed to revoke the URL manually
                        resolve(URL.createObjectURL(new Blob([data])))
                    } else {
                        const reader = new FileReader()
                        reader.onload = () => resolve(reader.result)
                        reader.readAsDataURL(data)
                    }
                })
            })
    }

    /**
     *
     * @param {string} filename
     * @param {boolean} append to $main
     * @param {File} data
     * @param {boolean} ram_only We will push the media contents to the RAM
     * @param {function} callback When an demanding action ends (like reading exif)
     * @returns {null|JQuery} Null if the file could not be included
     */
    static file(filename, append = true, data = null, ram_only = false, callback = null) {
        let identifier = data?.type.split("/")[0] || filename.split('.').pop().toLowerCase() // either mime type or the suffix
        if (["mp4", "mov", "avi", "vob", "ogv", "webm", "mts", "3gp", "mpg", "mpeg", "wmv", "hevc"].includes(identifier)) {
            identifier = "video"
        } else if (["jpg", "jpeg", "jxl", "png", "gif", "avif", "webp", "heic"].includes(identifier)) {
            identifier = "image"
        }

        switch (identifier) {
            case "video":
                callback()
                return FrameFactory.video(filename, append, data, ram_only)
            case "image":
                return FrameFactory.img(filename, append, data, ram_only, callback)
            default:
                console.warn("Cannot identify", filename)
                FrameFactory.text("Cannot be identified: " + filename, append)
                return null
        }
    }
}