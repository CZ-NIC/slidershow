class Session {
    constructor(playback) {
        /** @type {Playback} */
        this.playback = playback
        this.read()
    }

    read() {
        const s = window.location.hash.substring(1)
        this.playback.index = Math.max(0, Number(s) - 1)
    }

    restore() {
        this.read()
        this.playback.goToFrame(this.playback.index)
    }

    store() {
        window.location.hash = this.playback.index + 1
    }

    /**
     * "http://example.com/" -> example.com
     * "http://example.com/foo" -> foo.html
     * "http://example.com/foo/" -> foo.html
     * "http://example.com/foo/bar.htm" -> bar.htm
     */
    get docname() {
        let name
        const url = window.location.pathname.split("/")
        while (!name && url.length) {
            name = url.pop()
        }
        if (!name) {
            name = "slidershow.html"
        }
        if (!/(\.html|\.htm)$/i.test(name)) {
            name += ".html";
        }
        return name
    }

}