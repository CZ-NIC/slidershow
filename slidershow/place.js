let MAP_USE_CACHE = true

class Place {
    static async get(name) {
        const p = new Place(name)
        await p.assure_coord()
        return p
    }
    constructor(name) {
        this.name = name
        let cache = {}

        if (MAP_USE_CACHE) {
            try {
                cache = JSON.parse(localStorage.getItem("PLACE: " + this.name)) || {}
            } catch (e) {
                console.warn("Something wrong with the map cache", e)
            }
        }

        this.coordinates = cache.coordinates || {}
    }

    /**
     * return true if coordinates already exist
     * */
    assure_coord() {
        if (this.coordinates && Object.keys(this.coordinates).length) {
            return true
        }

        return (new SMap.SuggestProvider()).get(this.name).then((addresses) => {
            if (addresses.length < 1) {
                console.log("Coordinates error", this.name, addresses)
                return
            }
            this.coordinates = addresses[0]
            console.log("Coordinates", this.name, "possibilities:", addresses.length, this.coordinates)
            this.cache_self()
        })
    }

    coord() {
        if (!this.coordinates || !Object.keys(this.coordinates).length) {
            console.warn("Unknown coordinates of", this.name)
        }
        return SMap.Coords.fromWGS84(this.coordinates.longitude, this.coordinates.latitude)
    }

    // XX route to another place
    // compute_distance(place) {
    //     if (this.distances[place.name]) { // we already have this distance
    //         return true;
    //     }
    //     return (new SMap.Route([this.coord(), place.coord()], (route) => {
    //         const [time, len] = [route._results.time, route._results.length]
    //         console.log(`${this.name} -> ${place.name}: ${len} m, ${time} s`)
    //         if (time && len) {
    //             Place._show_route_on_map(route) // XX looks amazing but slows down, might make it togglable in UI
    //             this.distances[place.name] = { "time": time, "length": len }
    //             this.cache_self()
    //         }
    //     })).getPromise()
    // }

    // static _show_route_on_map(route) {
    //     var coords = route.getResults().geometry
    //     // m.setCenterZoom(...m.computeCenterZoom(coords))
    //     var g = new SMap.Geometry(SMap.GEOMETRY_POLYLINE, null, coords)
    //     geometry_layer.clear()
    //     geometry_layer.addGeometry(g)
    // }

    cache_self() {
        localStorage.setItem("PLACE: " + this.name, JSON.stringify(this))
    }
}