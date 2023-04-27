const wh = new WebHotkeys()
const $main = $("main").length ? $("main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"
const EMPTY_SRC = "data:"
const EXPORT_SRC = "data-src-replaced"

/*
Private attributes that are not documented in the README because the user should not need them:

* main[data-path] Path to the media folder.
* [data-src] Public attribute. But know that every dragged file will have it.
    + [data-src-cached]: Such element might have a data-src-cached too which means the data is in the RAM.
* video[data-autoplay-prevented]

*/

// XX var might become data-attributes
var READ_EXIF = true // power consuming
var ROUTE_TIMEOUT = 1000
var POSTPONE_UPLOAD_READING = true // More memory efficient but might lag the user experience. May be removed in the future.
// Export as <img src> or <img data-src>
// When exporting hundreds of media files, setting the src attribute would prevent the HTML being opened → default false.
// However, for a smaller number, it is nicer to have the src, since when slideRshow does not work, it is somewhat
// backwards compatible as raw HTML.
var EXPORT_AS_SRC = false

// Main launch and export to the dev console
/** @type {Playback} */
var playback
const menu = new Menu()

// Common functions

/**
 * Return closest prop, defined in the DOM.
 * (Zero aware, you can safely set `data-prop=0`.)
 * @param {string} property
 * @param {any} def Default value if undefined
 * @param {jQuery} $el What element to check the prop of.
 * @returns
 */
function prop(property, def = null, $el) {
    const v = $el.closest(`[data-${property}]`).data(property)
    switch (v) {
        case "false": // <main data-start='false'> -> false
            return false
        case "":
        // mere presence of an attribute resolves to true: <main data-start>
        // (unfortunately undistinguishable from `<main data-start=''>` both in Chrome and FF)
        case "true": // <main data-start='true'> -> true
            return true;
        case undefined:
            if (def !== undefined) {
                return def
            }
        default:
            const numeric_only = /^[-+]?\d*\.?\d+$/
            if (numeric_only.test(v)) { // <main data-start='0'> -> Boolean(Number(0)) === false
                return parseFloat(v)
            } else {
                return v;
            }
    }
}