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
* video[data-autoplay-prevented]
*/

// XX var variables that a hacky user might wish to change. Might become data-attributes in the future.
/** power consuming */
var READ_EXIF = true
var ROUTE_TIMEOUT = 1000
/** Export as <img src> or <img data-src>
    When exporting hundreds of media files, setting the src attribute would prevent the HTML being opened → default false.
    However, for a smaller number, it is nicer to have the src present
    for the raw HTML backwards compatibility for the case slideRshow stopped working. */
var PREFER_SRC_EXPORT = false

/** How many frames should be preloaded. So that the frame does not blink when having no transition duration. */
var PRELOAD_FORWARD = 50
/** How many frames should be preloaded for the case the user goes back in the playback. */
var PRELOAD_BACKWARD = 20

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