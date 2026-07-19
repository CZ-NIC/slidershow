const { test, expect } = require("@playwright/test")
const path = require("path")

const FIXTURE = "file://" + path.resolve(__dirname, "fixtures/props.html")

test("prop() walks element → article → section → main with type coercion", async ({ page }) => {
    await page.goto(FIXTURE)
    await expect(page.locator("#start")).toBeVisible()

    const values = await page.evaluate(() => ({
        own: prop("duration", $("#a1")),
        section: prop("duration", $("#a2")),
        main: prop("duration", $("#a3")),
        walk_to_main: prop("rotate", $("#a3")),
        presence_is_true: prop("step-shown", $("#a2")),
        sibling_not_inherited: prop("step-shown", $("#a1")),
        numeric: prop("playback-rate", $("#a3")),
        string_false: prop("start", $("#a3")),
        prop_default: prop("thumb", $("#a1")),
        custom_default: prop("fit", $("#a1"), "custom"),
    }))

    expect(values).toEqual({
        own: 1,
        section: 2,
        main: 3,
        walk_to_main: 90,
        presence_is_true: true,
        sibling_not_inherited: false,
        numeric: 7.5,
        string_false: false,
        prop_default: "",
        custom_default: "custom",
    })
})
