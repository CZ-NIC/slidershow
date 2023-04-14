/**
 * Handy interval class, waiting till AJAX request finishes (won't flood server if there is a lag).
 */
class Interval {
    /**
     *  Class for managing intervals.
     *  Auto-delaying/boosting depending on server lag.
     *  Faking intervals by timeouts.
     *
     * @param {type} fn
     * @param {type} delay
     * @param {bool} blocking If true, the fn is an AJAX call. The fn will not be called again unless it calls `this.blocking = false` when AJAX is finished.
     *      You may want to include `.always(() => {this.blocking = false;})` after the AJAX call. (In 'this' should be instance of the Interval object.)
     *
     *      (Note that we preferred that.blocking setter over method unblock() because interval function
     *      can be called from other sources than this class (ex: at first run) and a non-existent method would pose a problem.)
     * @returns {Interval}
     */
    constructor(fn, delay, ajax_wait) {
        this.was_running = false
        this.freezed = false
        this.fn = fn;
        this.delay = this._delay = delay;
        this._delayed = function () {
            console.log("48: DELAYED")
            this.time1 = +new Date();
            this.fn.call(this);
            if (ajax_wait !== true && this.running) {
                this.start();
            }
        }.bind(this);
        this.start();
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

    freeze() {
        this.freezed = true
        this.was_running = this.running
        this.stop()
    }

    unfreeze() {
        if(!this.freezed) {
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
        this.stop();
        this._delayed();
        this.start();
        return this;
    }

    /**
     * Start if stopped or vice versa.
     * @param start If defined, true to be started or vice versa.
     */
    toggle(start = null) {
        if (start === null) {
            this.toggle(!this.running);
        } else if (start) {
            this.start();
        } else {
            this.stop();
        }
        return this;
    }

    set blocking(b) {
        if (b === false) {
            let rtt = +new Date() - this.time1;
            if (rtt > this._delay / 3) {
                if (this._delay < this.delay * 10) {
                    this._delay += 100;
                }
            } else if (rtt < this._delay / 4 && this._delay >= this.delay) {
                this._delay -= 100;
            }
            if (this.running) {
                this.start();
            }
        }
    }
}