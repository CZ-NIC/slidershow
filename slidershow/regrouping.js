// Group the frames to sections, ex. by tags
class RegroupingController {
    /**
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
    }

    /**
     * Group frames according to the user tags across multiple <section> tags
     * @param {"tags"|"weeks"} criterion
    * @param {?JQuery<HTMLElement>} $frames If none, all frames are regrouped.
    */
    group(criterion = "tags", $frames = null) {
        const pl = this.playback
        /** @type {function[]} */
        const redos = []
        /** @type {JQuery[]} */
        const added = []

        if (!$frames) {
            $frames = pl.$articles
        }

        pl.changes.undoable(`Group ${$frames.length} frames by ${criterion}`,
            () => {
                redos.length = 0
                added.length = 0
                $frames.each((_, el) => {
                    const $frame = $(el)
                    /** @type {Frame} */
                    const frame = $frame.data("frame")


                    const name = (() => {
                        switch (criterion) {
                            case "tags": return frame.$actor.attr("data-tag")
                            case "weeks": return this._toWeekFormat(frame.$actor.data("datetime"))
                        }
                    })()
                    if (!name) { // leave in the former section
                        return
                    }
                    redos.push(pl.operation.redoForMoving($frame))

                    // find or create section to put the frame to (to its end)
                    let $section = $(`section[data-name=${name}]`)
                    if (!$section.length) {
                        $section = $("<section/>", { "data-name": name }).prependTo($main)
                        added.push($section)
                    }
                    $frame.appendTo($section)
                })
                pl.positionFrames()
                pl.goToFrame(pl.$current.data("frame").index - 1) // keeps you on the same frame (works badly)
                pl.hud.reset_grid()
            },
            () => {
                redos.reverse().map(f => f())
                added.map(el => $(el).remove())
                pl.hud.reset_grid()
            },
            () => pl.resetAndGo()
        )
    }

    /**
     * @param {string | number | Date} dateStr
     */
    _toWeekFormat(dateStr) {
        const date = new Date(dateStr);
        if (isNaN(date)) {
            return "unknown-week"
        }

        const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);

        return `${tmp.getUTCFullYear()}-week${String(week).padStart(2, '0')}`;
    }

}