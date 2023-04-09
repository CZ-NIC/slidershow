class Hud {

    constructor() {
        this.$hud_filename = $("#hud-filename")
        this.$hud_device = $("#hud-device")
        this.$hud_datetime = $("#hud-datetime")
        this.$hud_gps = $("#hud-gps")
        this.$hud_tag = $("#hud-tag")
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

        const name = ($actor.data("src") || $actor.attr("src"))?.split("/").pop() // XX -> used twice, make single method
        this.$hud_filename.html(name)

        this.$hud_device.html($actor.data("device"))
        this.$hud_datetime.html($actor.data("datetime"))
        this.$hud_gps.html($actor.data("gps"))
    }

    tag(tag="") {
        this.$hud_tag.html(tag? "TAG: " + tag : "")
    }

    alert(text) {
        // $("#letadylko-submit").after("<span class='map-broken alert alert-warning'></span>");
        alert(text)
    }
}