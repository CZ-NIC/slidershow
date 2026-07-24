const { withPage, openWithFiles, markVideoStart, openGridSilently, moveMouse, click, narrate } = require("../lib")
const { randomPhotos } = require("../demo-files")

/** docs/organizing.md — sort a whole section's frames by EXIF date via the grid's "order ▾" menu.
 * Uses a fresh slice of the photo pool (indices 12-19) so it doesn't reuse grid-overview's photos.
 * Fed in reverse order on purpose – these filenames are already date-ordered alphabetically, so sorting
 * them "by date" as-loaded would be a visible no-op; reversing first gives the sort something to do.
 * Only grid-overview.webm demonstrates opening the grid itself – every other grid scenario opens it
 * silently before markVideoStart() so the clip just starts already inside the grid. */
module.exports = () => withPage("grid-sort", { record: true }, async page => {
    await openWithFiles(page, randomPhotos.slice(12, 20).reverse())
    await openGridSilently(page)
    markVideoStart(page)

    // The frames all live inside the one <section>, not directly under <main> – sorting via the
    // Presentation/main ribbon's own "order ▾" is a no-op (it only reorders main's *direct* frame
    // children, of which there are none here). Must target the section's own ribbon instead – it has no
    // data-role attribute (only main's does), so pick the non-main one.
    const orderMenu = page.locator('section-controller:not([data-role="main"]) .section-menu:has(span:text("order ▾"))')
    const orderSpan = orderMenu.locator("span")

    await narrate(page, [
        {
            caption: "The grid ribbon can sort a whole section …", after: 700,
            action: async p => {
                const box = await orderSpan.boundingBox()
                await moveMouse(p, box.x + box.width / 2, box.y + box.height / 2)
            },
        },
        {
            caption: "… by EXIF date, oldest first", before: 500, after: 900,
            action: async p => {
                const btn = orderMenu.locator('[data-role="date-asc"]')
                const box = await btn.boundingBox()
                await click(p, box.x + box.width / 2, box.y + box.height / 2)
            },
        },
    ])
})
