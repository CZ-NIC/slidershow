// Load all needed JS + CSS resources. User has nothing to specify in the HEAD.
// We cannot use module as this would launch CORS blocking when using locally without server.

// What is current directory
//  User might use local: <script src="../slidershow/slidershow.js"></script>
//  As well as: <script src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/slidershow/slidershow.js"></script>
const DIR = document.querySelector("script[src$='slidershow.js']").getAttribute("src").replace(/\/slidershow.js$/, "") + "/";
const MAP_ENABLE = !location.hash.includes("map-disabled")
// NOTE fetch MAPY_TOKEN from URL/UI too
const MAPY_TOKEN = "G2Tz6lgHdd2FpdZCwuU3yvbggGKSwcVkv8ptLos3Mn8" // demo token, get your own at https://developer.mapy.com/account/projects

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
            // src: "https://cdn.jsdelivr.net/npm/vanilla-js-wheel-zoom@9.0.4/dist/wheel-zoom.min.js",
            src: "https://cdn.jsdelivr.net/gh/worka/vanilla-js-wheel-zoom@952d1add/dist/wheel-zoom.min.js",
            crossOrigin: "anonymous",
        },
        { src: "https://cdn.jsdelivr.net/npm/js-circle-progress@0.2.4/dist/jquery.circle-progress.min.js" },
        { src: "https://code.jquery.com/ui/1.13.1/jquery-ui.min.js" },
        { src: "https://cdn.jsdelivr.net/gh/e3rd/WebHotkeys@0.9.3/WebHotkeys.js?register" },
        { src: "https://cdn.jsdelivr.net/npm/exif-js" },
        { src: "https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js" },
        MAP_ENABLE ? { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" } : null,
        { src: "https://cdn.jsdelivr.net/npm/zebra_dialog@3.0.5/dist/zebra_dialog.min.js" }
    ].filter(Boolean).map(f => loadScript(f))

    const vendor_styles = ["https://cdn.jsdelivr.net/npm/zebra_dialog@latest/dist/css/materialize/zebra_dialog.min.css",].map(f => loadStyle(f))
    if (MAP_ENABLE) {
        loadStyle("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css")
    }

    const local = ["static.js", "frame_factory.js", "frame.js", "frame_zoom.js", "place.js", "map.js", "hud.js", "export.js", "property_panel.js", "propertyPanelPoints.js", "operation.js", "changes.js", "menu.js", "playback.js", "session.js", "aux_window.js"].filter(Boolean).map(f => loadScript({ src: DIR + f }))

    /**
     When there were 60 photos and 10 videos in a 230 MB presentation file, these were started before we could
     get rid of their autoplay attribute (especially if a user clicks to the loading page = interacts with it,
        making the browser to have no objection for autoplaying).
    They still starts playing for a bit but then end.
    */
    const stop_videos = () => {
        console.log("Stopping videos", $("video[autoplay]").length)
        $("video[autoplay]").removeAttr("autoplay").attr("data-autoplay-prevented", 1).each(function () { this.pause() })
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

    // wait for all scripts to load
    Promise.all(vendor.concat(local)).then(() => load_launch() )
})

function loadjQuery(callback) {
    if (window.jQuery) { // do not re-load jQuery if already loaded in the head before
        return callback()
    }
    // Allow using $ in the body without the need of load blocks.
    document.write('<script data-templated=1 src="https://code.jquery.com/jquery-3.7.1.min.js" integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossorigin="anonymous"></script>')
    document.querySelector("script[data-templated]").addEventListener("load", () => callback())
    return
    const el = document.createElement("script")
    el.src = "https://code.jquery.com/jquery-3.6.4.min.js"
    el.integrity = "sha256-oP6HI9z1XaZNBrJURtCoUT5SUnxFr8s3BzRl+cbzUq8="
    el.crossOrigin = "anonymous"
    el.setAttribute('data-templated', '1')
    el.addEventListener("load", () => callback())
    document.head.appendChild(el)
}

function loadScript(attrs) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        Object.entries(attrs).forEach(([k, v]) => script[k] = v)
        script.onload = resolve
        script.onerror = reject
        script.setAttribute('data-templated', '1')
        document.head.appendChild(script)
    })
}

function loadStyle(url) {
    return new Promise((resolve, reject) => {
        const link = document.createElement("link")
        link.href = url
        link.rel = "stylesheet"
        link.setAttribute('data-templated', '1')
        link.onload = resolve
        link.onerror = reject
        document.head.appendChild(link)
    })
}

function get_menu() {
    return $(`<div id="map-wrapper"></div>

    <div id="hud">
        <div id="hud-menu"></div>
        <div id="hud-fileinfo">
            <div>
                <span id="hud-filename"></span>
                <span id="hud-gps"></span>
            </div>
            <div id="hud-device"></div>
            <div id="hud-datetime"></div>
            <div id="hud-tag"></div>
            <div id="hud-counter"></div>
        </div>
        <div id="hud-properties"></div>
        <div id="hud-thumbnails"></div>
        <div id="hud-grid"></div>
        <div id="control-icons"></div>
    </div>

    <menu>
        <div>
            <h1>SlideRshow</h1>
        </div>
        <div id='start-wrapper'>
            Start presenting<br />
            <button id="start">&#9654;</button>
            </div>

        <div>
            Append frames<br />
            <input type="file" id="file" multiple>

            <div id="drop" data-placeholder="Drag files here">
                Drag files here
            </div>

            <form id="defaults">
                Defaults
                <br />Duration <input name="duration" size="4" placeholder="0"> s
                <br />Transition <input name="transition-duration" size="4" placeholder="0"> s
                <br />Media folder path <input title="If not set, we put the media data inside the DOM (RAM consuming)" name="path" value="" placeholder="./">
            </form>
        </div>
    </menu>`)
}