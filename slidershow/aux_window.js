class AuxWindow {

    constructor() {
        this.instance_id = btoa(window.location.href) // Math.floor(10 ** 6 + Math.random() * 9 * 10 ** 6) // random 6digit number

        // start_listener
        this.channel = new BroadcastChannel(`slidershow=${this.instance_id}`)
        this.channel.addEventListener("message", e => this.controller_command(e.data))

        this.last_info = null
    }

    /**
     * This is an auxiliary window.
     */
    overrun(channel_id) {
        $("body").empty().append(this.get_template())  // this is just an auxiliary window, get rid of any content


        this.$current_frame = $("#current_frame")
        this.$notes =$("#notes")
        this.$next_frame = $("#next_frame")


        const master = new BroadcastChannel(`slidershow=${channel_id}`)
        master.addEventListener("message", e => this.controller_command(e.data))
        master.postMessage({ "action": "get-last-state" })

        return this
    }


    /** Open an aux window */
    open() {
        window.open(`?controller=${this.instance_id}`, "Auxiliary window", "toolbar=no,menubar=no")
    }

    /**
     * Send the information to an aux-window.
     * @param {string} frame HTML
     * @param {string} notes HTML
     * @param {string} next_frame HTML
     */
    info(frame, notes, next_frame) {
        this.last_info = { action: "info", frame: frame, notes: notes, next_frame: next_frame }
        this.channel.postMessage(this.last_info)
    }

    /**
     * @param {*} e Message from an aux-window
     */
    controller_command(e) {
        switch (e.action) {
            case "info":
                this.$current_frame.html(e.frame)
                this.$notes.html(e.notes || "").toggle(Boolean(this.$notes.html())) // hide notes if empty
                this.$next_frame.html(e.next_frame || "END")
                break;
            case "get-last-state":
                this.channel.postMessage(this.last_info)
                break
            default:
                console.warn("Unknown message", e)
        }
    }

    get_template() {
        return $(`
        <div id="aux_window">
            <div id="slide-wrapper">
                <frame-preview id="current_frame">Start presenting to see current frame here.</frame-preview>
                <div>
                    <h3>Next slide</h3>
                    <frame-preview id="next_frame"></frame-preview>
                </div>
            </div>
            <frame-preview id="notes">Here you will see presenter's notes.</frame-preview>
        </div>
        `)
    }
}