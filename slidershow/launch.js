
const wh = new WebHotkeys()
const $main = $("main")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"

const READ_EXIF = true // power consuming

// Main launch and export to the dev console
let $articles = Frame.load_all()
/**
 * @type {Playback}
 */
let playback
const menu = new Menu()