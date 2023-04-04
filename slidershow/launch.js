
const wh = new WebHotkeys()
const $main = $("main")

const TRANS_DURATION = ($("main").data("transition-duration") || 0) * 1000 //* 0// XX do an attribute instead
const READ_EXIF = true // power consuming

// Main launch and export to the dev console
let $articles = Frame.load_all()
/**
 * @type {Playback}
 */
let playback
const menu = new Menu()