
const wh = new WebHotkeys()
const $main = $("main").length ? $("main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"

// XX var might become data-attributes
var READ_EXIF = true // power consuming
var ROUTE_TIMEOUT = 1000
var PRELOAD_EXPERIMENTAL = false // XX cannot be downloaded when preload used. But only when on RAM without path.

// Main launch and export to the dev console
let $articles = Frame.load_all()
/**
 * @type {Playback}
 */
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
            return v;
    }
}