
const wh = new WebHotkeys()
const $main = $("main").length ? $("main") : $("<main/>").appendTo("body")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"

const READ_EXIF = true // power consuming

const PRELOAD_EXPERIMENTAL = false // XX cannot be downloaded when preload used. But only when on RAM without path.

/**
 * Width / height > this → launch panorama
 */
const PANORAMA_THRESHOLD = 2


// Main launch and export to the dev console
let $articles = Frame.load_all()
/**
 * @type {Playback}
 */
let playback
const menu = new Menu()