/** @type {WebHotkeys} */
const wh = window.webHotkeys.setOptions({
    onToggle: (el, enabled) => {
        $(el).toggle(enabled)
        // Also toggle labels (non-interactive icons) in the same group
        $(el).closest("[data-hotkey-group]").find(".hud-menu-label").toggle(enabled)
    }, // hide DOM element on hotkey disable
})
const $main = $("body > main").length ? $("body > main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "main article,main article-map"
const FRAME_TAGS = "article, article-map" // Can be used only in the <main> context. Because sometimes FRAME_SELECTOR is too strict.
const FRAME_SECTION_SELECTOR = FRAME_SELECTOR + ",main,main section"
const VIDEO_EXTENSIONS = ["mp4", "mov", "avi", "vob", "ogv", "webm", "mts", "3gp", "mpg", "mpeg", "wmv", "hevc"]
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "jxl", "png", "gif", "avif", "webp", "heic"]

// prop() memoization store – declared up here (above the main() call below) so it's initialized before
// any load-time prop() read. See prop() / prop_invalidate() for the caching contract.
/** @type {WeakMap<Element, Map<string, {gen:number, def:any, defProperty:?string, value:any}>>} */
const _propCache = new WeakMap()
let _propGen = 0

/** To fetch docs */
const DOCS_URI = "https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@main/README.md"
/** To link docs */
const HOME_PAGE = "https://github.com/CZ-NIC/slidershow/"

/**
 * When exporting: Setting src directly on more than few hundred photos would kill the tab instantanely;
 * hence we use EXPORT_SRC instead. (The browser will not start loading.)
 */
const EXPORT_SRC = "sli-src-replaced"
/**
 * Here we conserve bytes that would come to src. However, having too much media with src would
 * make the browser choke when opening.
 */
const EXPORT_SRC_BYTES = "sli-src-bytes"
/**
 * A media file might have this data("read-src"), containing a method.
 * It produces raw bytes. The source is either FileReader for dragged in files or former EXPORT_SRC_BYTES attribute.
 * It may have the first parameter `prefer_blob` in which case you need to revoke the URL manually.
 */
const READ_SRC = "read-src"

/*
Private attributes that are not documented in the README because the user should not need them:

* main[sli-path] Path to the media folder.
* data("read-src") See READ_SRC.
* video[sli-autoplay-prevented]=1 Replaces native `autoplay` parameter.
* [sli-src-bytes] Stored raw bytes, see EXPORT_SRC_BYTES.
* [sli-src-replaced] See EXPORT_SRC.
* <frame-preview> Contents is a preview of a frame. Attribute [data-ref] corresponds to the frame.index.
* [sli-templated] This element was inserted only temporarily throught a template (ex: footer in an article or a <head> vendor script). Should not be exported.
* [sli-preloaded] The frame has already been preloaded.
* img[sli-thumb-shown] The full-quality src is still loading in the background; src currently holds the sli-thumb preview.
* data("step-original") Temporarily change [sli-step] value.
* .step-shown Frame step index has greater value so we see this element.
* .step-hidden Frame step index has lower value so we do not see this element.
* .step-not-yet-visible Auxiliary window highlights not-yet-seen elements.
* <img-temp-animation-step> Tags that help distinguish image zoom step from the image step.
* Img with wzoom:
*   [sli-wzoom] Wzoom active
*   trigger("zoom.slidershow") new position
*   data("wzoom_get_ratio") screen aware ratio
*   data("wzoom_resize_off") event destructor
*   $(window).on("resize.wzoom")
* Actor event "actor.slidershow" – on ex: rotate change.
    If the event has a sli- attribute associated, it happens in the frame.refresh_actor.
    Otherwise, it gets emitted at the point of actor change (ex: video mute operation).
* Frame video event namespace .slidershow-video
*/

// var variables that a hacky user might wish to change. Might become sli-attributes in the future.
/** power consuming */
var READ_EXIF = true
var ROUTE_TIMEOUT = 1000
/** When having both `src` and `sli-src`, export `<img src>` rather than `<img sli-src>`
    When exporting hundreds of media files, setting the src attribute would prevent the HTML being opened → default false.
    However, for a smaller number, it is nicer to have the src present
    for the raw HTML backwards compatibility for the case slideRshow stopped working. */
var PREFER_SRC_EXPORT = false

/** How many frames should be preloaded. So that the frame does not blink when having no transition duration. */
var PRELOAD_FORWARD = 50
/** How many frames should be preloaded for the case the user goes back in the playback. */
var PRELOAD_BACKWARD = 20
/** Max concurrent full-quality media downloads (the expensive ones). They are the flood risk on a real server,
    so they are throttled and served in order of distance from the current frame. */
var ORIGINAL_CONCURRENCY = 4
/** Max concurrent thumbnail (`sli-thumb`) loads. Cheap, so a generous limit – kept only to avoid the browser's
    per-host connection pool filling up with previews and stalling the current frame's original. */
var THUMB_CONCURRENCY = 8

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
    "loop-presentation": false,
    "spread-frames": "spiral",
    "step-shown": false,
    "rotate": 0,
    "thumb": "",
    "fallback": ""
}
const PROP_NONSCALAR = {
    "step-points": true,
    "video-points": true
}

// For the media, infer the property from the CSS, not from the DOM.
const PROP_CALLBACKS = {
    // We infer the rotation from a step.
    // The user clicks rotate left, the actor has no sli-rotate set
    // but the step rotated it. We return deg.
    "rotate": $el => {
        // computed `rotate` is "none" for a never-rotated element -> parseFloat gives NaN,
        // which must not short-circuit the DOM walk in prop()
        const deg = parseFloat($el.css("rotate"))
        return isNaN(deg) ? undefined : deg
    }
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

    // Restore frame size on window zoom. Debounced – a resize fires repeatedly while dragging a window
    // edge or hiding/showing a mobile browser's URL bar, and goToFrame() isn't cheap (preload/positioning
    // bookkeeping), so only the final size in a burst actually triggers it.
    let resize_timer
    $(window).on("resize", () => {
        clearTimeout(resize_timer)
        // Only reposition once a frame is actually being presented – a resize on the menu (right after
        // loading a presentation) would otherwise call goToFrame with no current frame yet.
        resize_timer = setTimeout(() => menu?.playback.frame && menu.playback.goToFrame(menu.playback.index), 150)
    })

    // Restore on hash
    $(window).on("hashchange", () => menu?.playback.session.restore())

    // Surface unexpected errors to the presenter instead of dying silently in the console
    let last_error = ""
    const announce = message => {
        if (message !== last_error) { // no toast flood when the same error repeats (ex: on every frame change)
            last_error = message
            setTimeout(() => last_error = "", 5000)
            menu?.playback.hud.info("Error: " + message)
        }
    }
    window.addEventListener("error", e => announce(e.message))
    window.addEventListener("unhandledrejection", e => announce(String(e.reason?.message ?? e.reason)))
}

// Common functions

/**
 * The presentation's file name: the URL-derived fallback for both the export/save-as name (see
 * `export_filename()`) and the tag-names localStorage key (see `tag_names_key()`) when the presentation
 * has no name of its own. Purely URL-based, so it stays stable regardless of the (mutable) name.
 * "http://example.com/" -> example.com
 * "http://example.com/foo" -> foo.html
 * "http://example.com/foo/" -> foo.html
 * "http://example.com/foo/bar.htm" -> bar.htm
 * @returns {string}
 */
function docname() {
    let name
    const url = window.location.pathname.split("/")
    while (!name && url.length) {
        name = url.pop()
    }
    if (!name) {
        name = "slidershow.html"
    }
    if (!/(\.html|\.htm)$/i.test(name)) {
        name += ".html";
    }
    return name
}

/**
 * The presentation's human display name: `<main sli-title>`, else the document `<title>`. Consistent
 * with `<section sli-title>` (a section's display name) – "sli-title is the display name at any level".
 * Set via `Playback.set_presentation_name()`, which mirrors it to `document.title`.
 * @returns {string}
 */
function presentation_name() {
    return String($main.attr("sli-title") || document.title || "").trim()
}

/**
 * Filename for downloads/exports: the presentation name slugified + ".html", else `docname()`. So a
 * named presentation exports as e.g. `dovolena-2019.html` instead of the eternal `slidershow.html`.
 * @returns {string}
 */
function export_filename() {
    const slug = slugify(presentation_name())
    return slug ? slug + ".html" : docname()
}

/**
 * localStorage key under which this presentation's tag display-names are cached. Prefers the
 * presentation's own name, so different presentations dropped into the same generic URL (ex.
 * `slidershow.html`) don't collide on one shared key; falls back to `docname()` when unnamed.
 * `Playback.set_presentation_name()` migrates the stored entry from the old key to the new one on
 * rename, so the cache follows the name instead of orphaning.
 * @returns {string}
 */
function tag_names_key() {
    return "TAG-NAMES: " + (presentation_name() || docname())
}

/**
 * A safe, readable filename stem from arbitrary text: replaces characters illegal in a filename with
 * spaces, collapses whitespace to single dashes, trims stray separators, caps the length. Empty when
 * the input reduces to nothing (callers fall back to `docname()`).
 * @param {string} s
 * @returns {string}
 */
function slugify(s) {
    return String(s)
        .replace(/[\/\\<>:"|?*\x00-\x1f]+/g, " ") // characters illegal in Windows/Unix filenames
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[-.]+/, "")
        .slice(0, 120)
        .replace(/[-.]+$/, "") // also clears any separator the slice re-exposed at the end
}

/**
 * Return closest prop, defined in the step or DOM.
 * Ex: prop("rotate", img) -> checks current step, then img[sli-rotate],
 *  then article[sli-rotate], then sections[sli-rotate], then main[sli-rotate]
 * (Zero aware, you can safely set `sli-prop=0`.)
 * @param {string} property Ex: for "sli-start" use just "start"
 * @param {JQuery} $el What element to check the prop of.
 * @param {any} def Custom default value if not set in DOM or via defProperty. If null, the PROP_DEFAULT default value is used.
 * @param {?string} defProperty Name of a property whose value should be used as a default.
 * @param {boolean} css Check element CSS first before investigating DOM.
 * @returns {undefined|boolean|number|string} Undefined if not set neither in the def param, nor in the PROP_DEFAULT.
 */
/**
 * Invalidate the prop() memoization. O(1) (just bumps a generation counter), so callers over-invalidate
 * freely: bumping too often only lowers the cache hit-rate, it can never return a stale value. Call it
 * right after writing any `sli-*` attribute that prop() resolves (rotate, duration, tag-names, …), and
 * after structural DOM changes (reset/regroup) that could move which ancestor a lookup resolves to.
 */
function prop_invalidate() { _propGen++ }

/**
 * Drop the memoized prop() lookups of a single element (its whole property map). Use this instead of the
 * global prop_invalidate() when only one element's own `sli-*` changed and no ancestor moved – ex. an async
 * EXIF write sets `sli-datetime` on one leaf actor, so bumping the global generation (and losing every other
 * frame's cache during a bulk import) is wasteful. Safe because actors are leaves: nothing resolves through them.
 * @param {Element} el
 */
function prop_invalidate_el(el) { _propCache.delete(el) }

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
    // Memoize the closest()+data() DOM walk (a single goToFrame does dozens of prop() reads, ex.
    // positionFrames reads the constant `spread-frames` once per frame). Never cache a live-CSS read
    // (css=true with a PROP_CALLBACKS entry depends on computed style, not the DOM) nor a multi/zero
    // element set. Any sli-* write bumps _propGen via prop_invalidate(), dropping the whole cache.
    const el = ($el.length === 1 && !(css && PROP_CALLBACKS[property])) ? $el[0] : null
    if (el) {
        const hit = _propCache.get(el)?.get(property)
        if (hit && hit.gen === _propGen && hit.def === def && hit.defProperty === defProperty) {
            return hit.value
        }
    }
    const value = _prop_resolve(property, $el, def, defProperty)
    if (el) {
        let byProp = _propCache.get(el)
        if (!byProp) {
            _propCache.set(el, byProp = new Map())
        }
        byProp.set(property, { gen: _propGen, def, defProperty, value })
    }
    return value
}

function _prop_resolve(property, $el, def, defProperty) {
    const $found = $el.closest(`[sli-${property}]`)
    let v = $found.length ? $found.attr(`sli-${property}`) : undefined
    if (v !== undefined && PROP_NONSCALAR[property]) {
        // ex: step-points, video-points - array-valued attributes, stored as JSON in the DOM
        v = JSON.parse(v)
    }
    switch (v) {
        case "false": // <main sli-start='false'> -> false
            return false
        case "":
        // mere presence of an attribute resolves to true: <main sli-start>
        // (unfortunately undistinguishable from `<main sli-start=''>` both in Chrome and FF)
        case "true": // <main sli-start='true'> -> true
            return true;
        case undefined:
            if (defProperty) {
                return prop(defProperty, $el, def)
            }
            return def !== null ? def : PROP_DEFAULT[property]
        default:
            const numeric_only = /^[-+]?\d*\.?\d+$/
            if (numeric_only.test(v)) { // <main sli-start='0'> -> Boolean(Number(0)) === false
                return parseFloat(v)
            } else {
                return v
            }
    }
}