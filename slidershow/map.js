/**
 * @typedef {number[]} Coordinates
 * @property {number} 0 - Zeměpisná délka (longitude).
 * @property {number} 1 - Zeměpisná šířka (latitude).
 */

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
        console.log("21: !!!!!playback", playback)


        this.query_last
        this.changing
        this.buffer
        this.animate_map_init()
    }

    /**
     *
     * @returns MapWidget
     */
    map_start() {
        console.log("13: START", this.$map[0])

        const center = SMap.Coords.fromWGS84(14.41790, 50.12655)
        const map = this.map = new SMap(JAK.gel(this.$map[0]), center)
        map.addDefaultLayer(SMap.DEF_BASE).enable()
        map.addDefaultControls()

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

    hide() {
        this.geometry_layer.removeAll()
        this.marker_layer.removeAll()
        this.$map.hide()
    }
    destroy() {
        this.map.$destructor()
        this.$map.remove()
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
                this.geometry_layer.clear()
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
     * Nicer map zooming XX I did for my wedding page
     */
    animate_map_init() {
        this.buffer = []
        this.buffer.target = null
        console.log("155: this.playback", this.playback)
const thisRef = this
        this.changing = new Interval(() => {
            console.log("158: this", this, this.TEST, thisRef.TEST)
            // console.trace()

            console.log("158: this.buffer", this.buffer, thisRef.buffer)

            if (this.buffer.length === 0) {
                this.changing.stop()
                // check map broken
                const r = (x) => {
                    return Math.round(x * 10000);
                }
                console.log("164: this.buffer", this.buffer)

                console.log("165: this.playback", this.playback) // XXXXXX tady
                if (this.buffer.target && r(this.buffer.target[0]) !== r(this.map.getCenter().x) || r(this.buffer.target[1]) !== r(this.map.getCenter().y)) {
                    console.log("165: this.playback", this.playback)
                    console.log("166: this", this)


                    this.playback.hud.alert("Map broken?")
                }
                return
            }
            const ins = this.buffer.shift()


            this.map.setCenterZoom(SMap.Coords.fromWGS84(ins[0], ins[1]), ins[2], true)
        }, 700).stop()

    }

    _animate_to(longitude, latitude, zoom_final) {
        console.log("184: longitude, latitude", longitude, latitude)

        this.changing.stop()
        this.buffer = []
        const [a, b] = [this.map.getCenter().x, this.map.getCenter().y]
        const [x, y] = [longitude, latitude]

        this.marker_layer.addMarker(new SMap.Marker(SMap.Coords.fromWGS84(longitude, latitude)))

        this.buffer.target = [x, y]
        console.log("192: this.buffer", this.buffer, a,b)

        let distance = Math.sqrt(Math.pow(a - x, 2) + Math.pow(b - y, 2))
        let max_zoom
        if (distance < 0.001) {
            max_zoom = 17
        } else if (distance < 0.01) {
            max_zoom = 15
        } else if (distance < 0.1) {
            max_zoom = 13
        } else if (distance < 1) {
            max_zoom = 11
        } else if (distance < 10) {
            max_zoom = 9
        } else {
            max_zoom = 3
        }
        let current_zoom = this.map.getZoom()
        let zoom = Math.min(max_zoom, current_zoom)

        // zoom out
        let steps = Math.ceil((current_zoom - zoom) / 3)
        for (let step = 1; step <= steps; step++) {
            console.log("Odzoom", a, b, current_zoom - (current_zoom - zoom) / steps * step)
            this.buffer.push([a, b, current_zoom - (current_zoom - zoom) / steps * step])
        }

        // move
        steps = 3
        for (let step = 1; step <= steps; step++) {
            const x_step = (x - a) / steps * step
            const y_step = (y - b) / steps * step
            if (Math.abs(x_step) < 0.00001 && Math.abs(y_step) < 0.00001) {
                console.log("standing", x_step, y_step)
                break;
            }
            console.log("228: a,x_step, steps, step, x", a,x_step, steps, step, x)

            console.log("move", a + x_step, b + y_step, zoom)
            this.buffer.push([a + x_step, b + y_step, zoom])
        }


        // zoom in
        steps = Math.ceil((zoom_final - zoom) / 3)
        for (let step = 1; step < steps; step++) {
            console.log("zoom", x, y, Math.round(zoom + (zoom_final - zoom) / steps * step))
            this.buffer.push([x, y, Math.round(zoom + (zoom_final - zoom) / steps * step)])
        }
        console.log("zoom", x, y, zoom_final)
        this.buffer.push([x, y, zoom_final])
        console.log("247: this.buffer", this.buffer)
        this.TEST = 5
        this.changing.start()
    }

    // test() {
    //     this.animate_to("Salcburk", 11)
    // }


    animate_to(longitude, latitude, zoom_final = 8) {
        this.$map.show(0)
        // if (this.query_last && this.query_last[0] === longitude && this.query_last[1] === latitude && this.query_last[2] === zoom_final) {
        //     return
        // }
        if (this.query_last?.join() === [longitude, latitude, zoom_final].join()) {
            return
        }
        this.query_last = [longitude, latitude,  zoom_final]
        this._animate_to(longitude, latitude, zoom_final)

        // if (typeof query !== "string") { // query is GPS coordinates
        //     addresses = [{ longitude: query[0], latitude: query[1] }]
        //     this._animate_to(addresses, zoom_final)
        // } else { // query is a query string
        //     this._names_to_places([query]).then(places =>
        //         this._animate_to(places[0], zoom_final)
        //     )
        // }
    }

}