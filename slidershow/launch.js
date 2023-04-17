
const wh = new WebHotkeys()
const $main = $("main")
const $hud = $("#hud")
const FRAME_SELECTOR = "article,article-map"

const READ_EXIF = true // power consuming

const PRELOAD_XXX = false // XXX Nejde mi to stáhnout, když používám preload. Ale jenom když je to na RAMce, bez cesty.

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