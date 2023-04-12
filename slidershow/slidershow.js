// Load all needed JS + CSS resources. User has nothing to specify in the HEAD.
// We cannot use module as this would launch CORS blocking when using locally without server.
loadjQuery(() => {
    // What is current directory
    const DIR = $("script[src$='slidershow.js']").attr("src").replace(/\/slidershow.js$/, "") + "/"

    // style
    const linkElement = document.createElement("link")
    linkElement.href = DIR + "../style.css"
    linkElement.rel = "stylesheet"
    document.head.appendChild(linkElement)

    // external and local scripts
    const vendor = [
        {
            src: "https://code.jquery.com/jquery-3.6.4.min.js",
            integrity: "sha256-oP6HI9z1XaZNBrJURtCoUT5SUnxFr8s3BzRl+cbzUq8=",
            crossOrigin: "anonymous"
        },
        {
            src: "https://cdnjs.cloudflare.com/ajax/libs/textfit/2.4.0/textFit.min.js",
            integrity: "sha512-vLs5rAqfvmv/IpN7JustROkGAvjK/L+vgVDFe7KpdtLztqF8mZDfleK2MZj/xuOrWjma0pW+lPCMcBbPKJVC7g==",
            crossOrigin: "anonymous",
            referrerpolicy: "no-referrer"
        },
        {
            src: "https://cdn.jsdelivr.net/npm/vanilla-js-wheel-zoom@6.21.0/dist/wheel-zoom.min.js",
            integrity: "sha256-iew84VMdav48KUPfYXOXyChG413xDhB4NlDngkmVfTg=",
            crossOrigin: "anonymous"
        },
        {
            src: "https://cdn.jsdelivr.net/npm/js-circle-progress@0.2.4/dist/jquery.circle-progress.min.js"
        },

        { src: "https://cdn.jsdelivr.net/npm/exif-js" },
        { src: "https://api.mapy.cz/loader.js" }
    ].map(f => loadScript(f))
    const local = ["../WebHotkeys.js", "static.js", "frame.js", "place.js", "map.js", "hud.js", "menu.js", "playback.js"].map(f => loadScript({ src: DIR + f }))

    // wait for all scripts to load
    Promise.all(vendor.concat(local)).then(() => {
        Loader.async = true
        Loader.load(null, null, () => { // Maps API need to have special callback
            head().appendTo("body")
            loadScript({ src: DIR + "launch.js" }) // run the main script
        })
    })
})

function loadjQuery(callback) {
    var el = document.createElement("script")
    el.src = "https://code.jquery.com/jquery-3.6.4.min.js"
    el.addEventListener("load", () => callback())
    document.head.appendChild(el)
}

function loadScript(attrs) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        Object.entries(attrs).forEach(([k, v]) => script[k] = v)
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
    });
}

function head() {
    return $(`<div id="map-wrapper"></div>

    <div id="hud">
        <div id="hud-fileinfo">
            <div id="hud-filename"></div>
            <div id="hud-device"></div>
            <div id="hud-datetime"></div>
            <div id="hud-gps"></div>
            <div id="hud-tag"></div>
            <div id="hud-counter"></div>
        </div>
        <div id="hud-thumbnails"></div>
    </div>

    <menu>
        <h1>SlideRshow</h1>
        <div>
            Start presenting<br />
            <button id="start">&#9654;</button>
        </div>

        <div>
            Or choose another frames<br />
            <input type="file" id="file" multiple>

            <div id="drop" data-placeholder="Drag files here">
                Drag files here
            </div>

            <form id="defaults">
                Defaults
                <br />Duration <input name="duration" value="3" size="4" placeholder="0"> s
                <br />Video frame duration <input name="duration-video" value="0" size="4" placeholder="0"> s
                <br />Transition <input name="transition-duration" value="0.5" size="4" placeholder="0"> s
            </form>

            <br/>
            <button id="export" title="Export Ctrl+S">💾</button>
        </div>
    </menu>`)
}