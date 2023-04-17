class Hud {

    /**
     *
     * @param {Playback} playback
     */
    constructor(playback) {
        this.playback = playback
        this.$hud_filename = $("#hud-filename")
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
        this.$hud_tag = $("#hud-tag")
        this.$hud_counter = $("#hud-counter")
        this.$hud_thumbnails = $("#hud-thumbnails")

        // this.thumbnails = false
    }

    playback_icon(html) {
        $("#playback-icon").remove()
        $("<div/>", { id: "playback-icon", html: html }).appendTo($hud).delay(1000).fadeOut(500, function () {
            $(this).remove()
        })
    }


    /**
     * Thumbnail ribbon
     * @param {Frame} frame
     */
    refresh_thumbnails(frame) {
        return;
        // if (!this.thumbnails) {
        //     return
        // }
        // this.hud.$hud_thumbnails.toggle()
        const $frame = frame.$frame
        this.$hud_thumbnails.html("")
        // console.log("211: this.hud.$hud_thumbnails", $frame, $frame.index(), )

        const index = $frame.data("frame").index
        for (let i = index - 3; i < index + 3; i++) {
            console.log("216: $(this.$articles[i]).html()", $(this.playback.$articles[i]).html(), i, this.playback.$articles)

            const $frame = $(this.playback.$articles[i])
            Frame.preload($frame) // XX this get preloaded multiple times
            const $thumbnail = $("<div/>", { html: $frame.html() }).toggleClass("current", i === index)
            this.$hud_thumbnails.append($thumbnail)
        }

    }

    /**
     *
     * @param {Frame} frame
     */
    fileinfo(frame) {
        const $actor = frame.$actor
        if (!$actor) {
            $actor = { data: () => null }
        }

        const name = frame.get_filename($actor) || "?"

        this.$hud_filename.html(name)

        this.$hud_device.text($actor.data("device"))
        this.$hud_datetime.text($actor.data("datetime"))
        this.$hud_gps.text($actor.data("gps"))
        this.tag($actor.attr("data-tag"))

        // Counter
        const collection_index = frame.$frame.index() + 1
        const collection_max = frame.$frame.siblings().length + 1

        if (collection_max > 1 && collection_max !== frame.playback.frame_count) {
            this.$hud_counter.text(`${collection_index} / ${collection_max} (${frame.index} / ${frame.playback.frame_count})`)
        } else {
            this.$hud_counter.text(`${frame.index} / ${frame.playback.frame_count}`)
        }

        // Thumbnails
        this.refresh_thumbnails(frame)
    }

    tag(tag = "") {
        this.$hud_tag.html(tag ? "TAG: " + tag : "")
    }

    alert(text, soft = false) {
        // $("#letadylko-submit").after("<span class='map-broken alert alert-warning'></span>");
        if (soft) {
            console.warn(text) // XX GUI message overlay windowd
        } else {
            alert(text)
        }
    }

    /**
     * Information for the presenter, not for the public.
     */
    discreet_info(text) {
        if (text) {
            console.log("INFO:", text)
        }
    }
}