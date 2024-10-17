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
        this.$notes = $("#notes")
        this.$next_frame = $("#next_frame")
        this.$status_message = $("#status_message")


        const master = new BroadcastChannel(`slidershow=${channel_id}`)
        master.addEventListener("message", e => this.controller_command(e.data))
        master.postMessage({ "action": "get-last-state" })

        $(document).on("keydown", e => master.postMessage({
            "action": "pressed-key", "key": {
                "key": e.key,
                "code": e.code,
                "shiftKey": e.shiftKey,
                "altKey": e.altKey,
                "ctrlKey": e.ctrlKey,
                "metaKey": e.metaKey,
            }
        }))
        return this
    }


    /** Open an aux window */
    open() {
        window.open(window.location.href.split("#")[0] + `?controller=${this.instance_id}`, "Auxiliary window", "toolbar=no,menubar=no")
    }

    /**
     * Send the information to an aux-window.
     * @param {Frame} frame
     * @param {Frame?} following
     */
    info(frame, following) {
        this.last_info = {
            action: "info",
            frame: frame.get_preview(false),
            notes: frame.get_notes(),
            next_frame: following?.get_preview(),
            step: frame.get_step()
        }
        this.channel.postMessage(this.last_info)
    }

    /**
     * Sends a text from the main to the aux window.s
     * @param {string} text
     */
    display_message(text) {
        this.channel.postMessage({ "action": "display-message", "text": text })
    }

    /**
     * @param {Frame} frame
     */
    update_step(frame) {
        this.channel.postMessage({ "action": "update-step", "step": frame.get_step() })
    }

    /**
     * @param {*} e Message from an aux-window
     */
    controller_command(e) {
        switch (e.action) {
            case "info":
                this.$current_frame.html(e.frame)
                this.$notes.html((e.notes || "")).toggle(Boolean(this.$notes.html())) // hide notes if empty
                this.$next_frame.html(e.next_frame || "END")
            case "update-step":
                // Highlight the element to be revealed in the next step
                this.$current_frame.find("[data-step]")
                    .removeClass("current-step step-hidden step-not-yet-visible")
                    .filter((_, el) => $(el).data("step") > e.step).addClass("step-not-yet-visible")
                this.$current_frame.find(`[data-step=${Number(e.step)}]`).addClass("current-step", true)
                break
            case "get-last-state":
                if (this.last_info) {
                    this.channel.postMessage(this.last_info)
                }
                break
            case "display-message":
                this.$status_message.html(e.text)
                break
            case "pressed-key":
                wh.simulate(e.key)
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
                    <p id="status_message"></p>
                    <h3>Next slide</h3>
                    <frame-preview id="next_frame"></frame-preview>
                </div>
            </div>
            <frame-preview id="notes">Here you will see presenter's notes.</frame-preview>
        </div>
        `)
    }
}