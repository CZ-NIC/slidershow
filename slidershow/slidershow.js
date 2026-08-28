// Load all needed JS + CSS resources. User has nothing to specify in the HEAD.
// We cannot use module as this would launch CORS blocking when using locally without server.

// Offline export (see Export.export, "Make offline-safe"): the exported <html sli-offline> carries every
// vendor/local script+style verbatim in #sli-offline-assets, keyed by URL (vendor) or bare filename (local,
// since DIR is then unknown/irrelevant). loadScript/loadStyle/loadjQuery below consult it before ever
// touching the network. Leaflet is bundled too: only the map *tiles* stay online-only (the tile server
// needs network regardless), but the library itself loads by default (MAP_ENABLE) and a failed network
// load of it would reject the boot Promise.all below and blank the whole app – so it's embedded/copied
// like every other vendor lib, and offline the map simply has no tiles.
const OFFLINE = document.documentElement.hasAttribute("sli-offline")
const OFFLINE_ASSETS = OFFLINE ? JSON.parse(document.getElementById("sli-offline-assets").textContent) : null
const JQUERY_SRC = "https://code.jquery.com/jquery-3.7.1.min.js"

// What is current directory
//  User might use local: <script src="../slidershow/slidershow.js"></script>
//  As well as: <script src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/slidershow/slidershow.js"></script>
//  When offline-inlined, this very script has no `src` at all – DIR stays "" and local lookups fall
//  back to bare filenames, matching how they're keyed in OFFLINE_ASSETS.
const SELF_SCRIPT = document.querySelector("script[src$='slidershow.js']")
const DIR = SELF_SCRIPT ? SELF_SCRIPT.getAttribute("src").replace(/\/slidershow.js$/, "") + "/" : ""
const MAP_ENABLE = !location.hash.includes("map-disabled")

// NOTE fetch these constants from URL/UI too
// (Put them into session.js and hud/properites panel.)
/** Mapy.com demo token, get your own at https://developer.mapy.com/account/projects */
const MAPY_TOKEN = "G2Tz6lgHdd2FpdZCwuU3yvbggGKSwcVkv8ptLos3Mn8"
/** Grid: Number of items preloaded around the current frame on both sides (snapped to row start) */
const GRID_PRELOAD_RADIUS = 60
/** Grid: Number of items loaded per scroll batch (snapped to row start) */
const GRID_PAGE_SIZE = 30
/** Number of columns – fewer, bigger tiles on touch devices are easier to hit with a finger.
 * Six on desktop because grid tiles are 4:3 (style.css): that is taller than the old viewport-shaped
 * tile, so a column more keeps at least as many frames on screen as the previous five. */
var GRID_COLUMNS = matchMedia("(pointer: coarse)").matches ? 3 : 6
/** Grid: upper bound for the +/- column control – past this a tile shows nothing recognizable. */
const GRID_COLUMNS_MAX = 20
/** Grid: tile shapes the presenter cycles through (GridController.cycleTileShape), in cycle order.
 * "screen" reproduces the device's own proportions, which is what an authored slide should look like. */
const GRID_TILE_SHAPES = ["4:3", "1:1", "screen"]
/** Grid: what a tile's caption shows (GridController.cycleTileLabels), in cycle order. */
const GRID_TILE_LABELS = ["off", "name", "name-date"]
/** Grid: how a photo meets its tile (GridController.toggleTileFit) – crop to fill, or show whole. */
const GRID_TILE_FITS = ["cover", "contain"]

// style
document.querySelector("html").style.display = "none" // so that body images are not shown before the style loads (short white blink appears instead)

loadStyle(DIR + "style.css").then(() => document.querySelector("html").removeAttribute("style"))

loadjQuery(() => {
    // external and local scripts
    const vendor = [
        {
            src: "https://cdnjs.cloudflare.com/ajax/libs/textfit/2.4.0/textFit.min.js",
            integrity: "sha512-vLs5rAqfvmv/IpN7JustROkGAvjK/L+vgVDFe7KpdtLztqF8mZDfleK2MZj/xuOrWjma0pW+lPCMcBbPKJVC7g==",
            crossOrigin: "anonymous",
            referrerpolicy: "no-referrer"
        },
        {
            src: "https://cdn.jsdelivr.net/gh/worka/vanilla-js-wheel-zoom@9.1.0/dist/wheel-zoom.min.js",
            crossOrigin: "anonymous",
        },
        { src: "https://cdn.jsdelivr.net/npm/js-circle-progress@0.2.4/dist/jquery.circle-progress.min.js" },
        { src: "https://code.jquery.com/ui/1.13.1/jquery-ui.min.js" },
        { src: "https://cdn.jsdelivr.net/gh/e3rd/WebHotkeys@0.9.5/WebHotkeys.js?register" },
        { src: "https://cdn.jsdelivr.net/npm/exif-js" },
        { src: "https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js" },
        MAP_ENABLE ? { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" } : null,
        { src: "https://cdn.jsdelivr.net/npm/zebra_dialog@3.0.5/dist/zebra_dialog.min.js" }
    ].filter(Boolean).map(f => loadScript(f))

    const vendor_styles = ["https://cdn.jsdelivr.net/npm/zebra_dialog@latest/dist/css/materialize/zebra_dialog.min.css",].map(f => loadStyle(f))
    if (MAP_ENABLE) {
        loadStyle("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css")
    }

    const local = ["static.js", "frame_factory.js", "frame.js", "frame_zoom.js", "place.js", "map.js", "hud.js", "grid.js", "palette.js", "export.js", "property_panel.js", "propertyPanelPoints.js", "operation.js", "section.js", "changes.js", "start.js", "playback.js", "session.js", "aux_window.js"].filter(Boolean).map(f => loadScript({ src: DIR + f }))

    /**
     When there were 60 photos and 10 videos in a 230 MB presentation file, these were started before we could
     get rid of their autoplay attribute (especially if a user clicks to the loading page = interacts with it,
        making the browser to have no objection for autoplaying).
    They still starts playing for a bit but then end.
    */
    const stop_videos = () => {
        console.log("Stopping videos", $("video[autoplay]").length)
        $("video[autoplay]").removeAttr("autoplay").attr("sli-autoplay-prevented", 1).each(function () { this.pause() })
    }

    const load_launch = () => {
        get_menu().appendTo("body")
        stop_videos()
        $(document).ready(() => {
            stop_videos()
            loadScript({ src: DIR + "launch.js" })
        })
    }

    // meta tag check (however, if not already present, export button displays as garbage)
    if (!$("meta[charset]", "head").length) {
        $("head").append("<meta charset='utf-8'>")
    }
    // without this, mobile browsers render the layout at desktop width and scale it down,
    // shrinking the whole UI (HUD, menu, buttons) far below a usable size.
    // Native pinch-zoom of the whole page is disabled (maximum-scale/user-scalable) because it would let the
    // user zoom out past the current frame and see the huge off-screen canvas the other frames are laid out on;
    // zooming into a photo is still possible through its own zoom widget.
    if (!$("meta[name=viewport]", "head").length) {
        $("head").append("<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'>")
    }

    // wait for all scripts to load
    Promise.all(vendor.concat(local)).then(() => {
        // WebHotkeys normally self-registers by reading its own `?register` query param off
        // `document.currentScript.src` – offline export replaces `src` with a `data:` URL (see
        // offline_data_url) whose content can't safely carry that query, so it never self-registers there.
        // Harmless/redundant otherwise: this only fires when the normal path somehow left it unset.
        // `WebHotkeys` (the class) is a bare identifier, not `window.WebHotkeys` – classic <script>s share
        // one top-level lexical scope, but a class/const/let declaration never becomes a window property.
        if (!window.webHotkeys && typeof WebHotkeys !== "undefined") {
            window.webHotkeys = new WebHotkeys()
        }
        load_launch()
    })
})

function loadjQuery(callback) {
    if (window.jQuery) { // do not re-load jQuery if already loaded in the head before
        return callback()
    }
    if (OFFLINE_ASSETS && JQUERY_SRC in OFFLINE_ASSETS) {
        const script = document.createElement('script')
        script.src = offline_data_url(OFFLINE_ASSETS[JQUERY_SRC])
        script.setAttribute('sli-templated', '1')
        script.onload = callback
        document.head.appendChild(script)
        return
    }
    // Allow using $ in the body without the need of load blocks.
    // SRI + crossorigin belong only to the real https CDN src. A "folder" offline export rewrites
    // JQUERY_SRC to a local relative path (vendor/…); there, crossorigin turns the load into a CORS
    // request the file:// origin blocks outright (and the CDN hash wouldn't match a re-served copy anyway).
    const sri = /^https?:/.test(JQUERY_SRC)
        ? ` integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossorigin="anonymous"`
        : ""
    document.write(`<script sli-templated=1 src="${JQUERY_SRC}"${sri}></script>`)
    // The written <script> may not be in the DOM synchronously (document.write from an external script feeds the
    // parser's input stream), so querying it here can race and return null. Poll for jQuery instead.
    const wait_for_jquery = () => window.jQuery ? callback() : setTimeout(wait_for_jquery, 10)
    wait_for_jquery()
}

/**
 * A `data:` URL standing in for a fetched script/style's `text` (offline export – see OFFLINE_ASSETS
 * above), so the element needs no network fetch yet still has a real, non-empty `src`/`href` – unlike a
 * plain inline `<script>`/`<style>`, which some vendor code doesn't tolerate (WebHotkeys reads
 * `document.currentScript.src` to detect its own load parameters; a data: URL keeps that a valid, if
 * query-less, URL instead of throwing on `new URL("")`). Anything the original URL's own query/fragment
 * was used for is handled separately (see the WebHotkeys fallback in slidershow.js's loader) – it can't
 * be appended here, as browsers treat a data: URL's query as literal script/style text, not metadata.
 * @param {string} text
 * @param {string} mime
 * @returns {string}
 */
function offline_data_url(text, mime = "text/javascript") {
    return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`
}

/**
 * @param {{src: string, [key: string]: *}} attrs
 */
function loadScript(attrs) {
    if (OFFLINE_ASSETS && attrs.src in OFFLINE_ASSETS) {
        attrs = { ...attrs, src: offline_data_url(OFFLINE_ASSETS[attrs.src]) }
    }
    // Only a real http(s) src carries SRI/crossorigin/referrerpolicy. A "folder" offline export rewrites
    // vendor srcs to local relative paths (vendor/…) but leaves those attributes on the vendor entry; an
    // inline offline export turns the src into a data: URL. On either, crossorigin/SRI would turn the load
    // into a CORS request the file:// origin blocks (or an SRI hash that can't match a data: URL), so strip
    // them unless the src really is http(s).
    const isHttp = /^https?:/.test(attrs.src)
    if (!isHttp) {
        attrs = { ...attrs }
        delete attrs.integrity
        delete attrs.crossOrigin
        delete attrs.referrerpolicy
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        // Without this, an uncaught error anywhere in a script loaded from a different origin (ex: the app's
        // own files served off jsdelivr) is reported to window.onerror as an opaque "Script error." with no
        // message/file/line – all the CDN hosts used here (jsdelivr, cdnjs, code.jquery.com, unpkg) send the
        // CORS headers needed for the browser to disclose the real error once the tag is marked crossorigin.
        // Only applied to http(s) sources: on file:// (local dev via presenter.html/tutorial_local.html), marking
        // a same-origin/local script crossorigin turns it into a CORS request, which the browser always blocks.
        const defaults = isHttp ? { crossOrigin: "anonymous" } : {}
        Object.entries({ ...defaults, ...attrs }).forEach(([k, v]) => script[k] = v)
        script.onload = resolve
        script.onerror = reject
        script.setAttribute('sli-templated', '1')
        document.head.appendChild(script)
    })
}

function loadStyle(url) {
    if (OFFLINE_ASSETS && url in OFFLINE_ASSETS) {
        const style = document.createElement('style')
        style.textContent = OFFLINE_ASSETS[url]
        style.setAttribute('sli-templated', '1')
        document.head.appendChild(style)
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const link = document.createElement("link")
        link.href = url
        link.rel = "stylesheet"
        link.setAttribute('sli-templated', '1')
        link.onload = resolve
        link.onerror = reject
        document.head.appendChild(link)
    })
}

function get_menu() {
    return $(`<div id="map-wrapper"></div>
    <img id="preblink-prevention" />

    <div id="hud">
        <div id="hud-righttop-wrapper">
            <div id="command-palette">
                <input type="text" placeholder="Type '/' to search commands…" autocomplete="off" spellcheck="false" />
                <ul class="palette-results"></ul>
            </div>
            <div id="hud-menu"></div>
        </div>
        <div id="hud-fileinfo">
            <div>
                <span id="hud-filename"></span>
                <span id="hud-gps"></span>
            </div>
            <div id="hud-device"></div>
            <div id="hud-datetime"></div>
            <div id="hud-tag"></div>
            <div id="hud-counter"></div>
            <div id="hud-tag-filter" title="Filtered by tag – click to change or clear"></div>
        </div>
        <div id="hud-properties"></div>
        <div id="hud-grid-status">
            <div id="hud-grid-loading" title="Click to list the files currently loading"><span></span></div>
            <span id="hud-grid-retry" title="Retry loading these files"></span>
            <div id="hud-grid-loading-files"></div>
        </div>
        <div id="hud-selection" style="display:none">
            <button data-sel="clear" title="Clear selection (Escape)">&#10006;</button>
            <span class="sel-count"></span>
            <span class="sel-hint" title="Shift+Arrow / Shift+click: select a range&#10;Space / Ctrl+click: toggle one frame&#10;Ctrl+Arrow: move the selection&#10;Escape: clear">⇧ range · Ctrl toggle</span>
            <button data-sel="copy" title="Copy (Ctrl+C / Ctrl+Insert)">&#128203;</button>
            <button data-sel="cut" title="Cut (Ctrl+X / Shift+Delete)">&#9986;</button>
            <button data-sel="paste" title="Paste after the current frame (Ctrl+V / Shift+Insert)">&#128229;</button>
            <button data-sel="delete" title="Delete (Delete)">&#128465;</button>
        </div>
        <div id="hud-thumbnails"></div>
        <div id="hud-grid"></div>
        <div id="control-icons"></div>
        <div id="hud-progress"><div id="hud-progress-bar"></div></div>
        <div id="mobile-nav">
            <button data-role="prev" title="Previous">&#9665;</button>
            <button data-role="grid" title="Grid overview">&#9638;</button>
            <button data-role="menu" title="Menu">&#9776;</button>
            <button data-role="next" title="Next">&#9655;</button>
        </div>
    </div>

    <menu>
        <div>
            <h1>SlideRshow</h1>
            <div id="recent-panel"></div>
        </div>
        <div id='start-wrapper'>
            <input id="presentation-name" placeholder="Start presenting" title="Name this presentation – click to edit; used as the export filename and shown in the Recent list">
            <button id="start">&#9654;</button>
            <div id="play-modes">
                <button class="play-mode" sli-duration="5" title="Auto-forward, 5 s per frame">&#9201; 5&nbsp;s</button>
                <button class="play-mode" sli-duration="10" title="Auto-forward, 10 s per frame">&#9201; 10&nbsp;s</button>
                <button class="play-mode" data-kiosk title="Auto-forward and loop – exhibition / kiosk mode">&#128257; Kiosk</button>
            </div>
            <div id="content-summary"></div>
            </div>

        <div>
            <details id="append-panel">
                <summary>Append frames</summary>
                <label for="file" id="file-label">Choose files…</label>
                <input type="file" id="file" multiple>

                <div id="drop" data-placeholder="Drag files here">
                    Drag files here
                </div>

                <form id="defaults">
                    <details>
                        <summary>Defaults</summary>
                        Duration <input name="duration" size="4" placeholder="0"> s
                        <br />Transition <input name="transition-duration" size="4" placeholder="0"> s
                        <br />Media folder path <input title="If not set, we put the media data inside the DOM (RAM consuming)" name="path" value="" placeholder="./">
                        <br />Group by <select name="group-by" id="group-by" title="Split the imported files into sections. Folder and dates are known from the files right away; Camera (and a date correction) come from the EXIF, so those sections settle shortly after the import.">
                            <option value="">Nothing</option>
                            <option value="folder">Folder</option>
                            <option value="days">Day</option>
                            <option value="months">Month</option>
                            <option value="years">Year</option>
                            <option value="camera">Camera</option>
                        </select>
                    </details>
                </form>
            </details>
        </div>
        <div id="menu-hint">In the show press <kbd>/</kbd> for the command palette · <kbd>Esc</kbd> for menu</div>
    </menu>`)
}
