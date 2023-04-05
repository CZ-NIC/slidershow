class Hud {

    constructor() {
        this.$hud_filename = $("#hude-filename")
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
    }

    playback_icon(html) {
        $("#playback-icon").remove()
        $("<div/>", { id: "playback-icon", html: html }).appendTo($hud).delay(1000).fadeOut(500, function () {
            $(this).remove()
        })
    }

    /**
     *
     * @param {jQuery|null} $actor
     */
    fileinfo($actor) {
        if (!$actor) {
            $actor = { data: () => null }
        }
        const name = ($actor.data("src") || $actor.attr("src"))?.split("/").pop()
        this.$hud_filename.html(name)

        this.$hud_device.html($actor.data("device"))
        this.$hud_datetime.html($actor.data("datetime"))
        this.$hud_gps.html($actor.data("gps"))
    }
}