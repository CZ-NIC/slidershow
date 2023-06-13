const wh = new WebHotkeys()
const $main = $("main").length ? $("main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"

/**
 * When exporting: Setting src directly on more than few hundred photos would kill the tab instantanely;
 * hence we use EXPORT_SRC instead. (The browser will not start loading.)
 */
const EXPORT_SRC = "data-src-replaced"
/**
 * Here we conserve bytes that would come to src. However, having too much media with src would
 * make the browser choke when opening.
 */
const EXPORT_SRC_BYTES = "data-src-bytes"
/**
 * A media file might have this data("read-src"), containing a method.
 * It produces raw bytes. The source is either FileReader for dragged in files or former EXPORT_SRC_BYTES attribute.
 * It may have the first parameter `prefer_blob` in which case you need to revoke the URL manually.
 */
const READ_SRC = "read-src"

/*
Private attributes that are not documented in the README because the user should not need them:

* main[data-path] Path to the media folder.
* [data-src] Public attribute, containing path to disk file or at least its name.
    Every dragged file will have the file name.
    User might set either file name or full path.
    When exporting, we try to convert the file name to a full path if given by the user.
* data("read-src") See READ_SRC.
* video[data-autoplay-prevented]
* [data-src-bytes] Stored raw bytes, see EXPORT_SRC_BYTES.
* [data-src-replaced] See EXPORT_SRC.
* <frame-preview> Contents is a preview of a frame.
*/

// var variables that a hacky user might wish to change. Might become data-attributes in the future.
/** power consuming */
var READ_EXIF = true
var ROUTE_TIMEOUT = 1000
/** When having both `src` and `data-src`, export `<img src>` rather than `<img data-src>`
    When exporting hundreds of media files, setting the src attribute would prevent the HTML being opened → default false.
    However, for a smaller number, it is nicer to have the src present
    for the raw HTML backwards compatibility for the case slideRshow stopped working. */
var PREFER_SRC_EXPORT = false

/** How many frames should be preloaded. So that the frame does not blink when having no transition duration. */
var PRELOAD_FORWARD = 50
/** How many frames should be preloaded for the case the user goes back in the playback. */
var PRELOAD_BACKWARD = 20

/** Experimental. Open auxiliary window. */
var LAUNCH_AUX_WINDOW = true // false

// Main launch and export to the dev console
/** @type {Playback} */
var playback
/** @type {Menu} */
var menu
/** @type {AuxWindow} */
var aux_window
main()

function main() {
    // Whether this window is the main one or an aux-window
    const channel_id = new URLSearchParams((window.location.search)).get("controller")
    if (channel_id) {
        aux_window= new AuxWindow().overrun(channel_id)
    } else {
        menu = new Menu()
    }

    // Loading actions
    // Pull out bytes from DOM to lighten it
    $(`[${EXPORT_SRC_BYTES}]`).map((_, el) => {
        const contents = $(el).attr(EXPORT_SRC_BYTES)
        $(el)
            .data(READ_SRC, () => contents) // cannot use blob here, big video blocks fluent walkthrought (holding PgDown)
            .removeAttr(EXPORT_SRC_BYTES)
    })
}

// Common functions

/**
 * Return closest prop, defined in the DOM.
 * (Zero aware, you can safely set `data-prop=0`.)
 * @param {string} property For "data-start" use just "start"
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