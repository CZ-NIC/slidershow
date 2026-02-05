class AnimationStep {
    /**
     * @param {number} latitude
     * @param {number} longitude
     * @param {number} zoom
     * @param {string} description
     * @param {boolean} marker Show the marker
     * @param {boolean} clearable If true, we might clean the layers
     */
    constructor(latitude, longitude, zoom, description, marker = false, clearable = false) {
        this.latitude = latitude
        this.longitude = longitude
        this.zoom = Math.round(zoom)
        this.description = description
        this.marker = marker
        this.clearable = clearable
    }

    /**
     * Return coordinates as plain object [lat, lon]
     * @returns {L.LatLng}
     */
    point() {
        return L.latLng(this.latitude, this.longitude)
    }
}

class MapWidget {
    /**
     * @type {L.Map}
     */
    map

    /**
     * Animation steps
     * @type {AnimationStep[]}
    */
    animation

    /**
     * Final animation destination
     * @type {?L.LatLng}
    */
    target_point

    /**
     * @type {L.LayerGroup}
     */
    geometry_layer
    /**
     * @type {L.LayerGroup}
     */
    marker_layer


    /**
     *
     * @param {JQuery} $map
     * @param {Playback} playback
     */
    constructor($map, playback) {

        this.$map = $map
        this.playback = playback


        this.query_last
        this.changing

        this._animate_map_init()


        this.default_layer = null // XX
        // this.geography_layer = null //XX

        /** @type {?Promise} Whether the animation is completed. */
        this.finished = null
        /** @type {?Function} Resolve method so that this.finished fulfills */
        this._finished = null

        this.geometry_clear = null
        this.markers_clear = null
        this.markers_show = null
        /** @type {Place[]} */
        this.last_places = []


        /** @type {Function[]} @see this.display_graphics_stack */
        this._graphics_stack = []
        this._hold_graphics = false

        /** @type {Boolean} Whether the map is on its initial position. */
        this.used = false

        /** Display suppressed by the user */
        this.blocked = false

        /** @type {?Function} postponed engage due to the blockage */
        this.postponed = null
    }

    /**
     *
     * @returns MapWidget
     */
    map_start() {
        if (!MAP_ENABLE) {
            return this
        }
        const center = L.latLng(50.12655, 14.41790)
        const map = this.map = L.map(this.$map[0]).setView(center, 13)

        L.tileLayer(`https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${MAPY_TOKEN}`, {
            maxZoom: 18,
            attribution: '© Seznam.cz, a.s.'
        }).addTo(map)

        // marker layer (kompatibilní se starým kódem)
        this.marker_layer = L.layerGroup().addTo(map)

        // geometry layer
        this.geometry_layer = L.layerGroup().addTo(map)

        map.on('moveend zoomend', () => {
            if (!this.animation.length) {
                this._finished()
            }
        })

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


        if ($frame) {
            this.$map.prependTo($frame)

        } else {
            // this.$map.prependTo($("#map-wrapper")) // XX not used in the moment, fullscreen background -> map_hud used instead
            this.$map.prependTo($("body")) // XX not used in the moment, fullscreen background
        }
    }

    toggle(force = false) {
        this.$map.toggle()
        this.blocked = force && this.$map.is(":hidden")
        if (force && !this.blocked && this.postponed) {
            this.postponed()
        }
    }
    hide() {
        this.$map.hide()
    }
    destroy() {
        this.map.remove()
        this.$map.remove()
    }
    /**
     * Move the map to a position and show it (if not blocked by the user action).
     * @param {Place[]} places
     * @param {*} animate
     * @param {*} geometry_show
     * @param {*} markers_show
     * @param {*} geometry_clear
     * @param {*} markers_clear
     * @param {number | null} zoom
     * @param {never[]} last_places
     */
    async engage(places, animate, geometry_show, geometry_criterion, markers_show, geometry_clear, markers_clear, zoom, last_places) {
        if (!MAP_ENABLE) {
            return
        }
        this.postponed = () => this._engage(places, animate, geometry_show, geometry_criterion, markers_show, geometry_clear, markers_clear, zoom, last_places)
        if (!this.blocked) {
            this.$map.show(0)
            this.postponed()
        }
    }

    /**
     * Move the map to a position and show it (if not blocked by the user action).
     * @param {Place[]} places
     * @param {*} animate
     * @param {*} geometry_show
     * @param {*} geometry_criterion
     * @param {*} markers_show
     * @param {*} geometry_clear
     * @param {*} markers_clear
     * @param {number | null} zoom
     * @param {never[]} last_places
     */
    async _engage(places, animate, geometry_show, geometry_criterion, markers_show, geometry_clear, markers_clear, zoom, last_places) {
        this.postponed = null
        this.last_places = last_places || []
        this.geometry_clear = geometry_clear
        this.markers_clear = markers_clear
        this.markers_show = markers_show

        // The internal map is redrawing and we want to be waited for.
        this.finished = new Promise((resolve, reject) => {
            this._finished = resolve
            setTimeout(reject, 5000, 'map timeout')
        }).then(() => {
            this._hold_graphics = false
            this.graphics_stack()
        })

        // resolve the places
        await Promise.all(places.map(p => p.assure_coord()))

        if (!animate) { // animation will clear them just before its ending
            if (this.geometry_clear) this.geometry_layer.clearLayers()
            if (this.markers_clear) this.marker_layer.clearLayers()
        }

        const routePromise = geometry_show ? this._route(geometry_show, places, geometry_criterion) : null

        if (geometry_show) {
            // if we await, it takes longer but the geometry is more stable
            // however, we do not want the user to lag
            await Promise.race([this._route(geometry_show, places, geometry_criterion), new Promise(resolve => setTimeout(() => resolve(), ROUTE_TIMEOUT))])
        }
        if (markers_show) {
            places.forEach(place => {
                this.marker_layer.addLayer(L.marker(place.coord()).bindPopup(place.name))
            })
        }


        const coords = places.map(p => p.coord())
        const center = coords.length === 1 ? coords[0] : this.map.getBounds().getCenter()

        const computed_zoom = zoom || (coords.length === 1 ? 15 : this.map.getZoom())

        // Start panning the map
        if (animate && this.used) { // we can animate only if the map has been used -> has a center to animate from
            this._animate_to(center.lat, center.lng, computed_zoom, zoom, null)
        } else {
            this.animation.length = 0 // is we switch slides too fast and there is still an ongoing animation, ends it prematurely

            this._hold_graphics = true // when using this.map.setCenter, no graphics should be drawn unless finished
            this.map.setView(center, zoom || computed_zoom, { animate: false })

            if (animate && !this.used && !zoom) { // as the center is being set right now, zoom this to a district level
                // (If we directly animated without with no center previously set, we'd see Prague for a moment
                // as this is the map vendor default. Which seemed weird for a different continent.)
                this._animate_to(center.lat, center.lng, computed_zoom, 8, center)
            }
        }

        if (routePromise) {
            // if we await, it takes longer but the geometry is more stable
            // however, we do not want the user to lag
            this._waitWithMinMax(routePromise, 200, ROUTE_TIMEOUT, "route timeout")
        }

        this.used = true // first use done
    }

    /**
     * When putting graphics while this.map.setCenter(center, true) has not yet finished has this effect:
     * the graphics is drawn to the previous center for a moment, no to the corresponding center.
     * Changing the center multiple times somewhat quickly causes the graphics drawn wrong for a moment.
     * The solution is to draw the graphics either before the animation starts or when finished.
     * @param {?Function} fn Added to the graphics stack.
     *
     * NOTE this function might not be needed now. (We migrated to Mapy REST API.)
     */
    graphics_stack(fn = null) {
        if (fn) {
            this._graphics_stack.push(fn)
        }

        if (!this._hold_graphics) {
            this._graphics_stack.forEach(f => f())
            this._graphics_stack.length = 0
        }
    }

    async _route(geometry_show, places, geometry_criterion) {
        const line = geometry_show === "line"
        let routing = [...places]
        if (routing.length < 2 && this.last_places.length) {
            // use last point
            routing.unshift(this.last_places.slice(-1)[0])
        }
        const points = routing.map(place => place.coord())

        if (routing.length > 1) { // geometry_show === "line"
            if (line) {
                this.graphics_stack(() =>
                    L.polyline(points).addTo(this.geometry_layer))
            }
            else { // geometry_show === "route"
                try {
                    const start = points[0]
                    const end = points[points.length - 1]

                    const url = new URL('https://api.mapy.com/v1/routing/route')
                    url.searchParams.set('start', `${start.lng},${start.lat}`)
                    url.searchParams.set('end', `${end.lng},${end.lat}`)
                    if (geometry_criterion) {
                        url.searchParams.set('routeType', geometry_criterion || 'car_fast')
                    }
                    url.searchParams.set('format', 'geojson')
                    url.searchParams.set('apikey', MAPY_TOKEN)

                    return fetch(url.toString())
                        .then(async res => {
                            const data = await res.json()
                            if (!res.ok) {
                                if (data?.detail?.length) {
                                    this.playback.hud.info(`Routing API error<br>${data.detail[0].msg}`)
                                }
                                throw new Error("Routing API error")
                            }
                            return data
                        })
                        .then(data => {
                            if (!data.geometry) {
                                throw new Error("Routing API returned no geometry")
                            }

                            this.graphics_stack(() =>
                                L.geoJSON(data.geometry, { style: { color: '#007bff', weight: 4 } })
                                    .addTo(this.geometry_layer)
                            )
                        })

                } catch (e) {
                    console.error("Routing error", e)
                }
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
            const as = this.animation.shift()
            if (!as) { // animation ends
                this.changing.stop()
                // check map broken
                const r = x => Math.round(x * 10000)
                if (!this.target_point || r(this.target_point.lat) !== r(this.map.getCenter().lat) || r(this.target_point.lng) !== r(this.map.getCenter().lng)) {
                    this.playback.hud.info("Map broken?", true)
                }
                return
            }

            if (as.clearable) {
                // it looks better when the old marker vanishes in the last step of an animation
                if (this.geometry_clear) {
                    this.geometry_layer.clearLayers()
                }

                if (this.markers_clear) {
                    this.marker_layer.clearLayers()
                }
            }

            if (as.marker) {
                this.marker_layer.addLayer(L.marker(as.point()))

                // NOTE rather check the map moves (as.point() is the current center and no as.zoom) than this
                // we just add the final point marker, no moving, skip interval iteration
                return this.changing.call_now()
            }

            this.map.setView(as.point(), as.zoom, { animate: true })
        }, 700).stop()

    }


    /**
     *
     * @param {Number} latitude
     * @param {Number} longitude
     * @param {Number} computed_zoom Recommended final zoom.
     * @param {?Number} zoom_final If not set, it is based on a previous location.
     * @param {?L.LatLng} center Use this as center, not current map center.
     * @returns
     */
    _animate_to(latitude, longitude, computed_zoom, zoom_final, center = null) {
        if (this.query_last?.join() === [latitude, longitude, zoom_final].join()) {
            return
        }
        this.query_last = [latitude, longitude, zoom_final]

        // final point
        const point = L.latLng(latitude, longitude)
        if (!zoom_final) {
            zoom_final = computed_zoom
        }

        this.changing.stop()
        this.animation = []
        const [a, b] = center ? [center.lat, center.lng] : [this.map.getCenter().lat, this.map.getCenter().lng]
        const [x, y] = [latitude, longitude]

        let current_zoom = this.map.getZoom()
        let zoom = Math.min(computed_zoom, current_zoom)



        // zoom out – if map moves only a little, do not zoom out, stay as close as possible
        let steps = Math.ceil((current_zoom - zoom) / 3)
        if (steps <= 1) {
            let recomm_zoom = this._computeIdealZoom([this.map.getCenter(), point], this.map)
            if (zoom > recomm_zoom) {
                zoom = recomm_zoom
                steps = Math.ceil((current_zoom - zoom) / 3)
            }
        }
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

            if (Math.abs(x_step) < 0.0001 && Math.abs(y_step) < 0.0001) {
                break
            }

            this.animation.push(new AnimationStep(a + x_step, b + y_step, zoom, "move"))
        }

        // zoom in
        steps = Math.ceil((zoom_final - zoom) / 3)
        for (let step = 1; step < steps; step++) {
            this.animation.push(new AnimationStep(x, y, zoom + (zoom_final - zoom) / steps * step, "zoom in"))
        }

        this.animation.push(new AnimationStep(x, y, zoom_final, "zoom final", this.markers_show, true))
        this.changing.start()
    }


    /**
     * Compute an ideal Leaflet zoom for given points.
     * @param {L.LatLng[]} points Array of Leaflet LatLng objects
     * @param {L.Map} map The Leaflet map
     * @returns {number} Recommended zoom level
     */
    _computeIdealZoom(points, map) {
        if (!points.length) return map.getZoom() || 5
        if (points.length === 1) return 15 // single place

        const bounds = L.latLngBounds(points)
        const maxDistance = bounds.getNorthEast().distanceTo(bounds.getSouthWest())

        // quick guess
        // - < 50 km → zoom 13–14 (town)
        // - < 300 km → zoom 8–10 (state)
        // - < 2000 km → zoom 5–7 (continent)
        // - > 2000 km → zoom 2–3 (world)
        let zoom
        if (maxDistance < 50000) zoom = 14
        else if (maxDistance < 300000) zoom = 9
        else if (maxDistance < 2000000) zoom = 6
        else zoom = 3

        const idealZoom = map.getBoundsZoom(bounds, true)
        return Math.min(zoom, idealZoom)
    }

    /**
     * Wait for a promise with a minimum and maximum display time.
     * @param {Promise} promise The main promise (e.g. route fetch)
     * @param {number} minMs Minimum time to wait after promise resolves
     * @param {number} maxMs Maximum total wait time
     * @param {string} timeoutMsg
     * @returns {Promise<any>} Resolves when either maxMs elapsed or promise+minMs finished
     */
    async _waitWithMinMax(promise, minMs = 200, maxMs = 5000, timeoutMsg = "") {
        const start = performance.now()
        let finished = false

        const mainPromise = (async () => {
            const result = await promise
            finished = true
            const elapsed = performance.now() - start
            if (elapsed < minMs) {
                await new Promise(r => setTimeout(r, minMs - elapsed))
            }
            return result
        })()

        const timeoutPromise = new Promise(resolve => setTimeout(() => {
            if (!finished && timeoutMsg) {
                console.warn(timeoutMsg)
            }
            resolve(null)
        }, maxMs))

        return Promise.race([mainPromise, timeoutPromise])
    }


}