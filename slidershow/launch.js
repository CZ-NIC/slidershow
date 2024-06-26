/** @type {WebHotkeys} */
const wh = window.webHotkeys.setOptions({
    onToggle: (el, enabled) => $(el).toggle(enabled), // hide DOM element on hotkey disable
})
const $main = $("body > main").length ? $("body > main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "main article,main article-map"
const FRAME_TAGS = "article, article-map" // Can be used only in the <main> context. Because sometimes FRAME_SELECTOR is too strict.
const FRAME_SECTION_SELECTOR = FRAME_SELECTOR + ",main section"

/** To fetch docs */
const DOCS_URI = "https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@main/README.md"
/** To link docs */
const HOME_PAGE = "https://github.com/CZ-NIC/slidershow/"

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
* video[data-autoplay-prevented]=1 Replaces native `autoplay` parameter.
* [data-src-bytes] Stored raw bytes, see EXPORT_SRC_BYTES.
* [data-src-replaced] See EXPORT_SRC.
* <frame-preview> Contents is a preview of a frame. Attribute [data-ref] corresponds to the frame.index.
* [data-templated] This element was inserted only temporarily throught a template (ex: footer in an article or a <head> vendor script). Should not be exported.
* [data-preloaded] The frame has already been preloaded.
* data("step-original") Temporarily change [data-step] value.
* .step-shown Frame step index has greater value so we see this element.
* .step-hidden Frame step index has lower value so we do not see this element.
* .step-not-yet-visible Auxiliary window highlights not-yet-seen elements.
* <img-temp-animation-step> Tags that help distinguish image zoom step from the image step.
* Img with wzoom:
*   [data-wzoom] Wzoom active
*   trigger("zoom.slidershow") new position
*   data("wzoom_get_ratio") screen aware ratio
*   data("wzoom_resize_off") event destructor
*   $(window).on("resize.wzoom")
* Actor event "actor.slidershow" – on ex: rotate change.
    If the event has a data- attribute associated, it happens in the frame.refresh_actor.
    Otherwise, it gets emitted at the point of actor change (ex: video mute operation).
* Frame video event namespace .slidershow-video
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

// Main launch and export to the dev console
/** @type {Playback} */
var playback
/** @type {Menu} */
var menu
/** @type {AuxWindow} */
var aux_window

const PROP_DEFAULT = {
    "duration": 0,
    "step-duration": 0,
    "transition-duration": 0,
    "step-transition-duration": 1,
    "playback-rate": 1,
    "video": "autoplay controls",
    "fit": "auto",
    "panorama-threshold": 2,
    "start": false,
    "spread-frames": "spiral",
    "step-shown": false,
    "rotate": 0
}
const PROP_NONSCALAR = {
    "step-points": true,
    "video-points": true
}

// For the media, infer the property from the CSS, not from the DOM.
const PROP_CALLBACKS = {
    // We infer the rotation from a step.
    // The user clicks rotate left, the actor has no data-rotate set
    // but the step rotated it. We return deg.
    "rotate": $el => parseFloat($el.css("rotate"))
}

main()

function main() {
    // Whether this window is the main one or an aux-window
    const channel_id = new URLSearchParams((window.location.search)).get("controller")
    if (channel_id) {
        aux_window = new AuxWindow().overrun(channel_id)
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

    // Restore frame size on window zoom
    $(window).on("resize", () => menu?.playback.goToFrame(menu?.playback.index))

    // Restore on hash
    $(window).on("hashchange", () => menu?.playback.session.restore())
}

// Common functions

/**
 * Return closest prop, defined in the step or DOM.
 * Ex: prop("rotate", img) -> checks current step, then img[data-rotate],
 *  then article[data-rotate], then sections[data-rotate], then main[data-rotate]
 * (Zero aware, you can safely set `data-prop=0`.)
 * @param {string} property Ex: for "data-start" use just "start"
 * @param {JQuery} $el What element to check the prop of.
 * @param {any} def Custom default value if not set in DOM or via defProperty. If null, the PROP_DEFAULT default value is used.
 * @param {?string} defProperty Name of a property whose value should be used as a default.
 * @param {boolean} css Check element CSS first before investigating DOM.
 * @returns {undefined|boolean|number|string} Undefined if not set neither in the def param, nor in the PROP_DEFAULT.
 */
function prop(property, $el, def = null, defProperty = null, css = false) {
    // First, we might have to check the CSS. This has sense for actors only.
    // The CSS might have been altered by a step so that the value in the DOM
    // is not relevant.
    if (css) {
        const val = PROP_CALLBACKS[property]?.($el)
        if (val !== undefined) {
            return val
        }
    }
    // Why .removeDate? Because the DOM might have changed.
    // User did it or we set up main.duration by the auto-forward button. And the .data value is cached.
    // We do not read the attr because we need the conversion that happens when jQuery fetches data from attr.
    // For ex: step-points which need to be converted to an array.
    const v = $el.closest(`[data-${property}]`).removeData(property).data(property)
    switch (v) {
        case "false": // <main data-start='false'> -> false
            return false
        case "":
        // mere presence of an attribute resolves to true: <main data-start>
        // (unfortunately undistinguishable from `<main data-start=''>` both in Chrome and FF)
        case "true": // <main data-start='true'> -> true
            return true;
        case undefined:
            if (defProperty) {
                return prop(defProperty, $el, def)
            }
            return def !== null ? def : PROP_DEFAULT[property]
        default:
            const numeric_only = /^[-+]?\d*\.?\d+$/
            if (numeric_only.test(v)) { // <main data-start='0'> -> Boolean(Number(0)) === false
                return parseFloat(v)
            } else {
                return v
            }
    }
}