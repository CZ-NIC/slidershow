/** Real, copyright-free demo photos/videos to drop into the app for docs media generation.
 * Source folder is outside the repo (personal Downloads); the generated docs/assets/* output is NOT committed here
 * (it is git-excluded) – it lives in the separate public CZ-NIC/slidershow-assets repo, served to the docs via jsdelivr. */
const path = require("path")
const fs = require("fs")

const SOURCE_DIR = "/home/edvard/Downloads/slidershow_pouzit_bez_copyrightu"
const RANDOM_SUBDIR = path.join(SOURCE_DIR, "nahodny_fotecky")

const listFiles = (dir, exts) =>
    fs.readdirSync(dir)
        .filter(f => exts.includes(path.extname(f).toLowerCase()))
        .sort()
        .map(f => path.join(dir, f))

/** The few hand-picked files directly in SOURCE_DIR: 3 photos + 3 short videos. */
const curatedPhotos = listFiles(SOURCE_DIR, [".jpg", ".jpeg"])
const curatedVideos = listFiles(SOURCE_DIR, [".mp4"])

/** The larger pool of random phone photos – pick a handful, ok if some never get used. */
const randomPhotos = listFiles(RANDOM_SUBDIR, [".jpg", ".jpeg"])

/** Files with malformed EXIF that crash exif-js (window.onerror then surfaces it as a visible "Uncaught
 * RangeError" toast in a recording – verified via 20260720_082551.jpg, which throws "Offset is outside
 * the bounds of the DataView" in exif-js's getUint8). Not our bug to fix (vendor lib, CDN-loaded), so
 * just avoid these filenames when picking a slice of randomPhotos for a new scenario. Add to this list if
 * another photo turns out to trip the same thing. */
const KNOWN_BAD_EXIF = ["20260720_082551.jpg"]

/** A small, varied mix for quick demos: a couple of curated photos + a video + a couple of random ones. */
const mixed = (photoCount = 3, videoCount = 1) => [
    ...curatedPhotos.slice(0, photoCount),
    ...curatedVideos.slice(0, videoCount),
    ...randomPhotos.slice(0, photoCount),
]

module.exports = { SOURCE_DIR, RANDOM_SUBDIR, curatedPhotos, curatedVideos, randomPhotos, mixed, KNOWN_BAD_EXIF }
