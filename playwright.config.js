const { defineConfig } = require("@playwright/test")

// The tests open tests/fixtures/*.html via file:// (the app deliberately supports file://),
// so no web server is needed. Vendor libraries still load from CDN → network required.
module.exports = defineConfig({
    testDir: "tests",
    // CDN fetches occasionally stall/hiccup in CI, timing out page.goto() – retry once there, not locally.
    retries: process.env.CI ? 2 : 0,
    use: {
        browserName: "chromium",
        // exif-js re-fetches the image over XHR, which file:// forbids by default
        launchOptions: { args: ["--allow-file-access-from-files"] },
    },
})
