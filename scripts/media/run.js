#!/usr/bin/env node
/** Docs media production line.
 *
 * Usage: node scripts/media/run.js <scenario-name> [more-scenarios...]
 *        node scripts/media/run.js all
 *
 * Each scenario in scenarios/ drives the real app (presenter.html) with real demo photos/videos
 * (see demo-files.js) via Playwright, and writes its output straight to docs/assets/.
 * Add a new use-case by dropping a new scenarios/<name>.js file – no other wiring needed.
 */
const fs = require("fs")
const path = require("path")

const SCENARIOS_DIR = path.join(__dirname, "scenarios")
const names = fs.readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith(".js"))
    .map(f => f.replace(/\.js$/, ""))

async function main() {
    const requested = process.argv.slice(2)
    if (!requested.length) {
        console.error(`Usage: node scripts/media/run.js <${names.join("|")}|all>`)
        process.exit(1)
    }
    const toRun = requested.includes("all") ? names : requested
    for (const name of toRun) {
        if (!names.includes(name)) {
            console.error(`Unknown scenario "${name}". Available: ${names.join(", ")}`)
            process.exit(1)
        }
    }
    for (const name of toRun) {
        console.log(`▶ ${name}`)
        const out = await require(path.join(SCENARIOS_DIR, name))()
        console.log(`  ✓ ${out || "docs/assets/" + name + ".png"}`)
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
