/**
 * Handy interval class, waiting till AJAX request finishes (won't flood server if there is a lag).
 */
class Interval {
    /**
     *  Class for managing intervals.
     *  Auto-delaying/boosting depending on server lag.
     *  Faking intervals by timeouts.
     *
     * @param {Function} fn If callback is set, the interval directly starts.
     * @param {number} delay
     * @param {boolean} blocking If true, the fn is an AJAX call. The fn will not be called again unless it calls `this.blocking = false` when AJAX is finished.
     *      You may want to include `.always(() => {this.blocking = false;})` after the AJAX call. (In 'this' should be instance of the Interval object.)
     *
     *      (Note that we preferred that.blocking setter over method unblock() because interval function
     *      can be called from other sources than this class (ex: at first run) and a non-existent method would pose a problem.)
     * @returns {Interval}
     */
    constructor(fn, delay, ajax_wait) {
        this.was_running = false
        this.freezed = false
        this._fn = fn
        this.delay = this._delay = delay
        this._delayed = () => {
            this.time1 = +new Date()
            this._fn.call(this)
            if (ajax_wait !== true && this.running) {
                this.start()
            }
        }
        if (fn) {
            this.start()
        }
    }

    /**
     *
     * @param {Number} delay If set, replaces current delay.
     * @returns
     */
    start(delay = null) {
        if (delay) {
            this._delay = delay
        }
        if (this.freezed) {
            return
        }
        this.stop()
        this.running = true
        this.instance = setTimeout(this._delayed, this._delay)
        return this
    }

    stop() {
        clearTimeout(this.instance)
        this.running = false
        return this
    }

    /**
     * @param {function} fn
     */
    fn(fn) {
        this._fn = fn
        return this
    }

    freeze() {
        this.freezed = true
        this.was_running = this.running
        this.stop()
    }

    unfreeze() {
        if (!this.freezed) {
            return
        }
        this.freezed = false
        if (this.was_running) {
            this.start()
        }
    }

    /**
     * Launch callback function now, reset and start the interval.
     * @return {Interval}
     */
    call_now() {
        this.stop()
        this._delayed()
        this.start()
        return this
    }

    /**
     * Start if stopped or vice versa.
     * @param start If defined, true to be started or vice versa.
     */
    toggle(start = null) {
        if (start === null) {
            this.toggle(!this.running)
        } else if (start) {
            this.start()
        } else {
            this.stop()
        }
        return this
    }

    set blocking(b) {
        if (b === false) {
            const rtt = +new Date() - this.time1
            if (rtt > this._delay / 3) {
                if (this._delay < this.delay * 10) {
                    this._delay += 100
                }
            } else if (rtt < this._delay / 4 && this._delay >= this.delay) {
                this._delay -= 100
            }
            if (this.running) {
                this.start()
            }
        }
    }
}

/**
 * Are elements of the arrays equal?
 * https://stackoverflow.com/a/39967517/2036148
 * @param {Array} a
 * @param {Array} b
 * @returns {Boolean}
 */
function arraysEqual(a, b) {
    return a.length === b.length && a.every((el, ix) => el === b[ix])
}

/**
 * Format date
 * @returns {string|null}
 */
function formatDateMs(ms) {
    if (!ms) {
        return null
    }
    const date = new Date(ms)

    return date.getFullYear() + '-' +
        ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
        ('0' + date.getDate()).slice(-2) + 'T' +
        ('0' + date.getHours()).slice(-2) + '-' +
        ('0' + date.getMinutes()).slice(-2) + '-' +
        ('0' + date.getSeconds()).slice(-2);
}

/**
 * This works well however the video stop ~ 100 ms later than the endtime.
 *
 * HTMLMediaElement endtime to seconds
 * https://developer.mozilla.org/en-US/docs/Web/Media/Audio_and_video_delivery#specifying_playback_range
 * @example `#t=20` -> null, `#t=10,20` -> 20
 * @returns {number|null} Seconds
 **/
// function getEndTimeFromURL(url) {
//     url = new URL(url).hash
//     if(url.startsWith("#t=") && url.includes(",")) {
//         const endtime = url.split("=")[1].split(",").pop()
//         if(endtime.includes(":")) { // #t=01:01:10 -> 3670 seconds
//             return endtime.split(":").map((val, index) => parseFloat(val) * Math.pow(60, 2-index)).reduce((a, b) => a + b, 0)
//         } else { // #t=20 -> 20 seconds
//             return parseFloat(endtime)
//         }
//     }
// }