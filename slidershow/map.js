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
        this.animate_map_init()
    }

    /**
     *
     * @returns MapWidget
     */
    map_start(controls = true) {
        const center = SMap.Coords.fromWGS84(14.41790, 50.12655)
        const map = this.map = new SMap(JAK.gel(this.$map[0]), center)
        map.addDefaultLayer(SMap.DEF_BASE).enable()
        if (controls) {
            map.addDefaultControls()
        }
        // marker layer
        this.marker_layer = new SMap.Layer.Marker()
        map.addLayer(this.marker_layer)
        this.marker_layer.enable()

        // geometry layer
        this.geometry_layer = new SMap.Layer.Geometry()
        map.addLayer(this.geometry_layer).enable()
        this.$map.hide(0)
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
    clear() {
        this.geometry_layer.removeAll()
        this.marker_layer.removeAll()
    }

    _names_to_places(names = null) {
        return Promise.all(names.map(name => Place.get(name)))
    }

    set_center(longitude, latitude) {
        this.$map.show(0)

        const point = SMap.Coords.fromWGS84(longitude, latitude)

        this.marker_layer.addMarker(new SMap.Marker(point))
        this.map.setCenter(point, false)
    }

    async display_route(names = null) {
        this._names_to_places(names).then(places => {
            SMap.Route.route(places.map(place => place.coord()), {
                geometry: true
            }).then((route) => {
                if (route._results.error) {
                    console.warn("***Cannot find route", route)
                    return
                }
                console.log("Route", route)
                const coords = route.getResults().geometry
                this.geometry_layer.removeAll()
                this.geometry_layer.addGeometry(new SMap.Geometry(SMap.GEOMETRY_POLYLINE, null, coords))
                this.map.setCenterZoom(...this.map.computeCenterZoom(coords), true)
            })
        })
    }

    async display_markers(names = null) {
        this._names_to_places(names).then(places => {
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

            // centralize the map
            console.log("527: (...this.map", this.map.computeCenterZoom(places.map(p => p.coord())))

            this.map.setCenterZoom(...this.map.computeCenterZoom(places.map(p => p.coord())), false) // instead of false do nicer map zooming XX
        })
    }

    /**
     * Nicer map zooming I did for my wedding page
     */
    animate_map_init() {
        this.animation = []
        this.target_point = null
        this.changing = new Interval(() => {
            if (this.animation.length === 0) {
                this.changing.stop()
                // check map broken
                const r = (x) => {
                    return Math.round(x * 10000);
                }
                if (r(this.target_point.x) !== r(this.map.getCenter().x) || r(this.target_point.y) !== r(this.map.getCenter().y)) {
                    this.playback.hud.alert("Map broken?", true)
                }
                return
            }
            const as = this.animation.shift()

            if (as.marker) {
                this.clear()
                this.marker_layer.addMarker(new SMap.Marker(as.point()))
                // we just add the final point marker, no moving, skip interval iteration
                return this.changing.call_now()
            }

            this.map.setCenterZoom(as.point(), as.zoom, true)

        }, 700).stop()

    }


    animate_to(longitude, latitude, zoom_final = 8) {
        this.$map.show(0)
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