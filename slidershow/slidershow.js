// Load other JS in the directory.
// We cannot use module as this would launch CORS blocking
// when using locally without server.
const dir = $("script[src$='slidershow.js']").attr("src").replace(/\/slidershow.js$/, "");

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = dir + "/" + src
        script.onload = resolve
        script.onerror = reject
        document.body.appendChild(script)
    });
}

Promise.all(["frame.js", "place.js", "map.js", "menu.js", "playback.js"].map(f => loadScript(f))).then(() => {
    loadScript("launch.js")
})
