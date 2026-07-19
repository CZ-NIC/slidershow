const { defineConfig } = require("@playwright/test")

// The tests open tests/fixtures/*.html via file:// (the app deliberately supports file://),
// so no web server is needed. Vendor libraries still load from CDN → network required.
module.exports = defineConfig({
    testDir: "tests",
    use: {
        browserName: "chromium",
    },
})
