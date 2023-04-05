class MapWidget {
    constructor($map) {
        /**
         * @type {SMap}
         */
        this.map = null

        this.$map = $map

        console.log("11: CONSTRUCT",)

    }
    map_start() {
        console.log("13: START",this.$map[0])

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

    hide(){
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

    // Nicer map zooming XX (I did for my wedding page)
    //     //pokyny pro pohyb v mape
    //     var buffer = [];
    //     buffer.target = null;
    //     var changing = new Interval(() => {
    //         if (buffer.length === 0) {
    //             changing.stop();
    //             if (changing.panorama) {
    //                 $(".panorama").show();
    //                 // prepneme panorama a mapu
    //                 SMap.Pano.get(changing.panorama[0]).then(function (place) {
    //                     let o = {"fov": 1, "pitch": 0};  // we have to reset fov and pitch in case user changed something on the last scene
    //                     if (changing.panorama[1]) {
    //                         o["yaw"] = changing.panorama[1];
    //                     }
    //                     panoramaScene.show(place, o);
    //                 });
    //                 if (!panorama_shown) {
    //                     panorama_shown = true;
    //                     try {
    //                         m.removeControl(mini4);
    //                         m.addControl(panoramaScene, {right: "3px", bottom: "3px"}); // this throws an error
    //                     } catch (e) {
    //                     }
    //                 }
    //             }

    //             //check, jestli je mapa zasekla
    //             let r = (x) => {
    //                 return Math.round(x * 10000);
    //             };
    //             if (buffer.target && r(buffer.target[0]) !== r(m.getCenter().x) || r(buffer.target[1]) !== r(m.getCenter().y)) {
    //                 $("#letadylko-submit").after("<span class='map-broken alert alert-warning'>Mapa se možná rozbila – jestli nereaguje, renačtěte stránku, pardon.</span>");
    //             } else {
    //                 $(".map-broken").remove();
    //             }
    // //                                marker.setCoords(m.getCenter());
    //             return;
    //         }
    //         let instruction = buffer.shift();
    //         m.setCenterZoom(SMap.Coords.fromWGS84(instruction[0], instruction[1]), instruction[2], true);
    //     }, 700);
    // //                        }, 300);
    //     suggest = new SMap.SuggestProvider();
    //     var queries = {};

    //     function change_location_callback(addresses, zoom_final, panorama) {

    //         changing.stop();
    //         buffer = [];
    //         [a, b] = [m.getCenter().x, m.getCenter().y];
    //         [x, y] = [addresses[0].longitude, addresses[0].latitude];
    //         buffer.target = [x, y];
    //         let distance = Math.sqrt(Math.pow(a - x, 2) + Math.pow(b - y, 2));
    //         let max_zoom;
    //         if (distance < 0.001) {
    //             max_zoom = 17;
    //         } else if (distance < 0.01) {
    //             max_zoom = 15;
    //         } else if (distance < 0.1) {
    //             max_zoom = 13;
    //         } else if (distance < 1) {
    //             max_zoom = 11;
    //         } else if (distance < 10) {
    //             max_zoom = 9;
    //         } else {
    //             max_zoom = 3;
    //         }
    //         let current_zoom = m.getZoom();
    //         let zoom = Math.min(max_zoom, current_zoom);

    //         // XX změna v polovině instrukcí funguje ok?

    //         // zoom out
    //         let steps = Math.ceil((current_zoom - zoom) / 3);
    //         for (let step = 1; step <= steps; step++) {
    //             console.log("Odzoom", a, b, current_zoom - (current_zoom - zoom) / steps * step);
    //             buffer.push([a, b, current_zoom - (current_zoom - zoom) / steps * step]);
    //         }

    //         // move
    //         steps = 3;
    //         for (let step = 1; step <= steps; step++) {
    //             x_step = (x - a) / steps * step;
    //             y_step = (y - b) / steps * step;
    //             if (Math.abs(x_step) < 0.00001 && Math.abs(y_step) < 0.00001) {
    //                 console.log("standing", x_step, y_step);
    //                 break;
    //             }
    //             console.log("move", a + x_step, b + y_step, zoom);
    //             buffer.push([a + x_step, b + y_step, zoom]);
    //         }


    //         // zoom in
    //         steps = Math.ceil((zoom_final - zoom) / 3);
    //         for (let step = 1; step < steps; step++) {
    //             console.log("zoom", x, y, Math.round(zoom + (zoom_final - zoom) / steps * step));
    //             buffer.push([x, y, Math.round(zoom + (zoom_final - zoom) / steps * step)]);
    //         }
    //         console.log("zoom", x, y, zoom_final);
    //         buffer.push([x, y, zoom_final]);
    // //return; // XX
    // //                            console.log("celkove:", x, y, distance, zoom, max_zoom, zoom_final, buffer);
    //         changing.start();
    //         changing.panorama = panorama;


    //         if (panorama_shown) {
    //             panorama_shown = false;
    //             try {
    //                 m.addControl(mini4, {right: "3px", bottom: "3px"});
    //                 m.removeControl(panoramaScene);

    //             } catch (e) {
    //             }
    //         }



    //     }

    //     var query_last = null;
    //     function change_location(query, zoom_final = 8, panorama = null) {
    //         if (query_last && query_last[0] === query && query_last[1] === zoom_final) {
    //             return;
    //         }
    //         query_last = [query, zoom_final];
    //         console.log("query", query, panorama);
    //         if (typeof query !== "string") { // query is GPS coordinates
    //             addresses = [{longitude: query[0], latitude: query[1]}]
    //             change_location_callback(addresses, zoom_final, panorama);
    //         } else { // query is a query string
    //             if (query in queries) {
    //                 change_location_callback(queries[query], zoom_final, panorama);
    //             } else {
    //                 suggest.get(query).then((addresses) => {
    //                     if(addresses.length < 1) {
    //                         console.log("Chyba addresses", addresses);
    //                         $("#letadylko-submit").after("<span class='map-broken alert alert-warning'>Jestli mapa blbě reaguje, renačtěte stránku, pardon.</span>");
    //                         return;
    //                     }
    //                     queries[query] = addresses;
    //                     change_location_callback(queries[query], zoom_final, panorama);
    //                 });
    //             }
    //     }
    //     }
}

