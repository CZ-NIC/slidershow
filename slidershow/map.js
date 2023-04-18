class AnimationStep {
    /**
     * @param {number} longitude
     * @param {number} latitude
     * @param {number} zoom
     * @param {string} description
     */
    constructor(longitude, latitude, zoom, description, marker = false) {
        this.longitude = longitude
        this.latitude = latitude
        this.zoom = Math.round(zoom)
        this.description = description
        this.marker = marker
    }

    point() {
        return SMap.Coords.fromWGS84(this.longitude, this.latitude)
    }
}

class MapWidget {
    /**
     *
     * @param {jQuery} $map
     * @param {Playback} playback
     */
    constructor($map, playback) {
        /**
         * @type {SMap}
         */
        this.map = null

        this.$map = $map
        this.playback = playback


        this.query_last
        this.changing

        /**
         * Animation steps
         * @type {AnimationStep[]}
        */
        this.animation

        /**
         * Final animation destination
         * @type {number}
         * @property {number} 0 - longitude
         * @property {number} 1 - latitude
        */
        this.target_point
        this._animate_map_init()


        this.default_layer = null // XX
        // this.geography_layer = null //XX

        /** @type {?Promise} Whether the animation is completed. */
        this.finished = null
        /** @type {?Function} Resolve method so that this.finished fulfills */
        this._finished = null

        this.geometry_clear = null
        this.markers_clear = null
        /** @type {Place[]} */
        this.last_places = []
    }

    /**
     *
     * @returns MapWidget
     */
    map_start() {
        const center = SMap.Coords.fromWGS84(14.41790, 50.12655)
        const map = this.map = new SMap(JAK.gel(this.$map[0]), center)

        this.default_layer = map.addDefaultLayer(SMap.DEF_BASE)
        this.default_layer.enable()
        // this.geography_layer = map.addDefaultLayer(SMap.DEF_GEOGRAPHY)
        // console.log("69: this.default_layer", this.default_layer, this.geography_layer)

        map.addDefaultControls()

        // marker layer
        this.marker_layer = new SMap.Layer.Marker()
        map.addLayer(this.marker_layer)
        this.marker_layer.enable()

        // geometry layer
        this.geometry_layer = new SMap.Layer.Geometry()
        map.addLayer(this.geometry_layer).enable()
        this.$map.hide(0)

        // signals
        map.getSignals().addListener(this, "*", (e) => {
            // zoom-stop for data-map-animate: true
            // map-unlock for data-map-animate: true without zooming
            // center-stop for data-map-animate: false
            if (["map-unlock", "zoom-stop", "center-stop"].includes(e.type) && !this.animation.length) {
                return this._finished()
            }
        })

        return this
    }

    /**
     * The map is displayed either at the background at the fixed position
     *  (and you cannot interact with by controls like mouse, the frame above takes the control)
     * or in a place of a frame you give here.
     * @param {Frame|null} frame Frame or null (fixed, non interactive position)
     */
    adapt(frame = null) {

        let $frame
        if (frame) {
            if (frame.parent) {
                if (this.$map.parent().data("frame") === frame.parent) {
                    return
                } else {
                    $frame = frame.parent.$frame
                }
            } else {
                $frame = frame.$frame
            }
        }

        this.$map.show(0)

        if ($frame) {
            this.$map.prependTo($frame)

        } else {
            // this.$map.prependTo($("#map-wrapper")) // XX not used in the moment, fullscreen background -> map_hud used instead
            this.$map.prependTo($("body")) // XX not used in the moment, fullscreen background
        }
    }

    toggle() {
        this.$map.toggle()
    }
    hide() {
        this.$map.hide()
    }
    destroy() {
        this.map.$destructor()
        this.$map.remove()
    }
    /**
     *
     * @param {Place[]} places
     * @param {*} animate
     * @param {*} geometry_show
     * @param {*} markers_show
     */
    async engage(places, animate, geometry_show, markers_show, geometry_clear, markers_clear, zoom) {
        await Promise.all(places.map(p => p.assure_coord()))
        this.geometry_clear = geometry_clear
        this.markers_clear = markers_clear

        if (!animate) { // animation will clear them just before its ending
            if (this.geometry_clear) {
                this.geometry_layer.removeAll()
            }
            if (this.markers_clear) {
                this.marker_layer.removeAll()
            }
        }

        if (markers_show) {
            places.forEach(place => {
                // var card = new SMap.Card();
                // card.getHeader().innerHTML = "<strong>Header</strong>";
                // card.getBody().innerHTML = "Contents";

                // const src = "img.jpg"
                // const marker = new SMap.Marker(place.coord(), place.name, {
                //     title: place.name,
                //     url: $("<img/>", { "src": src }).css({ "width": "50px" }).get()[0]
                // })
                // marker.decorate(SMap.Marker.Feature.Card, card);
                // this.marker_layer.addMarker(marker)
                this.marker_layer.addMarker(new SMap.Marker(place.coord(), place.name))
            })
        }
        if (geometry_show) {
            // if we await, it takes longer but the geometry is more stable
            // however, we do not want the user to lag
            await Promise.race([this._route(geometry_show, places), new Promise(resolve => setTimeout(() => resolve(), ROUTE_TIMEOUT))])
        }

        const [center, zoom_recommended] = this.map.computeCenterZoom(places.map(p => p.coord()))

        // The internal map is redrawing and we want to be waited for.
        this.finished = new Promise(resolve => {
            this._finished = resolve
        })

        if (animate) {
            this._animate_to(center.x, center.y, zoom || zoom_recommended)
        } else {
            this.animation.length = 0 // is we switch slides too fast and there is still an ongoing animation, ends it prematurely

            this.map.setCenter(center, true)
            if (zoom || zoom_recommended) {
                this.map.setZoom(zoom || zoom_recommended)
            }
        }
        this.last_places = places
    }

    async _route(geometry_show, places) {
        const line = geometry_show === "line"
        let routing = [...places]
        if (routing.length < 2 && this.last_places.length) {
            // use last point
            routing.unshift(this.last_places.slice(-1)[0])
        }

        if (routing.length > 1) {
            if (line) {
                this.geometry_layer.addGeometry(new SMap.Geometry(SMap.GEOMETRY_POLYLINE, null, routing.map(place => place.coord())))
            }
            else {
                return SMap.Route.route(routing.map(place => place.coord()), {
                    geometry: true
                }).then((route) => {
                    if (route._results.error) {
                        console.warn("Cannot find route", route)
                        return
                    }
                    const route_coords = route.getResults().geometry
                    this.geometry_layer.addGeometry(new SMap.Geometry(SMap.GEOMETRY_POLYLINE, null, route_coords))
                })
            }
        }
    }

    // geography() {
    // this.geography_layer.enable() XX
    // this.geography_layer = this.map.addDefaultLayer(SMap.DEF_GEOGRAPHY).enable()
    // this.map.removeLayer(SMap.DEF_GEOGRAPHY)
    // // this.map.changeBaseLayer("DEF_GEOGRAPHY");
    // console.log("151:         this.geography_layer",         this.geography_layer)
    // }


    /**
     * Nicer map zooming I did for my wedding page
     */
    _animate_map_init() {
        this.animation = []
        this.target_point = null
        this.changing = new Interval(() => {
            if (this.animation.length === 0) { // animation ends
                this.changing.stop()
                // check map broken
                const r = x => Math.round(x * 10000)
                if (r(this.target_point.x) !== r(this.map.getCenter().x) || r(this.target_point.y) !== r(this.map.getCenter().y)) {
                    this.playback.hud.alert("Map broken?", true)
                }
                return
            }
            const as = this.animation.shift()

            if (as.marker) {
                // it looks better when the old marker vanishes in the last step of an animation
                if (this.geometry_clear) {
                    this.geometry_layer.removeAll()
                }
                if (this.markers_clear) {
                    this.marker_layer.removeAll()
                }

                this.marker_layer.addMarker(new SMap.Marker(as.point()))
                // we just add the final point marker, no moving, skip interval iteration
                return this.changing.call_now()
            }

            this.map.setCenterZoom(as.point(), as.zoom, true)

        }, 700).stop()

    }


    _animate_to(longitude, latitude, zoom_final = 8) {
        // this.$map.show(0)
        if (this.query_last?.join() === [longitude, latitude, zoom_final].join()) {
            return
        }
        this.query_last = [longitude, latitude, zoom_final]

        // final point
        const point = SMap.Coords.fromWGS84(longitude, latitude)

        const [computed_pt, computed_zoom] = this.map.computeCenterZoom([point, this.map.getCenter()])
        // if map moves only a little, do not zoom out, stay as close as possible
        zoom_final = Math.max(zoom_final, computed_zoom)

        this.changing.stop()
        this.animation = []
        const [a, b] = [this.map.getCenter().x, this.map.getCenter().y]
        const [x, y] = [longitude, latitude]

        const current_zoom = this.map.getZoom()
        let zoom = Math.min(computed_zoom, current_zoom)

        // zoom out
        let steps = Math.ceil((current_zoom - zoom) / 3)
        let as = null
        for (let step = 1; step <= steps; step++) {
            this.animation.push(new AnimationStep(a, b, current_zoom - (current_zoom - zoom) / steps * step, "zoom out"))
        }

        this.animation.push(new AnimationStep(x, y, null, "marker", true))
        this.target_point = point


        // move
        steps = 3
        for (let step = 1; step <= steps; step++) {
            const x_step = (x - a) / steps * step
            const y_step = (y - b) / steps * step
            // console.log("260: x_step, y_step", x_step, y_step)

            if (Math.abs(x_step) < 0.0001 && Math.abs(y_step) < 0.0001) {
                // console.log("standing", x_step, y_step)
                break;
            }

            this.animation.push(new AnimationStep(a + x_step, b + y_step, zoom, "move"))
        }

        // zoom in
        steps = Math.ceil((zoom_final - zoom) / 3)
        for (let step = 1; step < steps; step++) {
            this.animation.push(new AnimationStep(x, y, zoom + (zoom_final - zoom) / steps * step, "zoom in"))
        }

        this.animation.push(new AnimationStep(x, y, zoom_final, "zoom final"))
        this.changing.start()
    }

}