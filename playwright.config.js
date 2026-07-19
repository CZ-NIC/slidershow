const { defineConfig } = require("@playwright/test")

// The tests open tests/fixtures/*.html via file:// (the app deliberately supports file://),
// so no web server is needed. Vendor libraries still load from CDN → network required.
module.exports = defineConfig({
    testDir: "tests",
    use: {
        browserName: "chromium",
        // exif-js re-fetches the image over XHR, which file:// forbids by default
        launchOptions: { args: ["--allow-file-access-from-files"] },
    },
})
