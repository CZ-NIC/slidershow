# Text & maps

## Text

You can place arbitrary content inside an `<article>`.

* `sli-fit=auto`
    * `true|false`: Fit the text size to the screen width.
    * `auto`: Fit if there is no tag inside an `<article>`.

## Map

These map-related attributes help you display the HUD / fullscreen map.

* `sli-places`: Delimited by comma. Ex: "Prague, Brno"
* `sli-map-zoom`: Zoom as given by the [Mapy.cz API](https://api.mapy.cz/doc/SMap.html) (world 1, country 5, street 13)
* `sli-gps`: Single point, longitude and latitude, comma delimited.

    ```html
    <!-- these are equivalent -->
    <img sli-gps='50.0884647, 14.4707590' />
    <img sli-places='Prague' />
    ```

* `sli-map-animate=true`: Change the centre point directly (`false`) or in a few steps (`true`).
* `sli-map-geometry-show=false`: Route amongst the places. If a single place is given, we take the place from the last time.
    * `false` No route shown.
    * `route|true` Route is calculated amongst the places.
    * `line` Only a line is marked amongst the places.

    ```html
    <!-- Full route is calculated and shown between Prague and Brno, then between Brno and Pardubice. -->
    <article-map sli-duration="0" sli-places="Prague" sli-map-geometry-show="true">
        <article-map sli-places="Brno"></article-map>
        <article-map sli-places="Pardubice"></article-map>
    </article-map>
    ```

* `sli-map-geometry-criterion=''`: empty or `car_fast`, `car_fast_traffic`, `car_short`, `foot_fast`, `foot_hiking`, `bike_road`, `bike_mountain`
* `sli-map-markers-show=false`: Show marker of a point.
* `sli-map-geometry-clear=true`: Clear all routes and drawings before displaying.
* `sli-map-markers-clear=true`: Clear all point markers. (Or keep them all visible.)

### `<article-map>` frame

Normally any map command will cause a small HUD map to appear in the corner. Should you wish to display the fullscreen map, use the `<article-map>` tag.

You may nest `<article-map>` tags easily, which causes the map to change.

```html
<article-map sli-duration="0" sli-places="Prague, Brno">
    <article-map sli-duration="0" sli-places="Paris"></article-map>
    <article-map sli-duration="0.3" sli-places="London"></article-map>
</article-map>
```

Note that no content is displayed within the `<article-map>` at the moment.

### Animate a GPX file

You can easily convert a GPX file (exported from map software) into an interactive route. Just launch this Python script on a GPX file and copy the `<article-map>` tags to the presentation HTML.

```python
from pathlib import Path
import re
FILENAME = "export.gpx"
FRAME_COUNT = 10

tag_end = "</article-map>"
if matches:=re.findall('<trkpt lat="([^"]+)" lon="([^"]+)">', Path(FILENAME).read_text()):
    # limit to frame count but always include the first and the last
    step = round(len(matches)/(FRAME_COUNT-2))
    limited = [matches[0]] + matches[::step][1:-1] + [matches[-1]]
    # convert coordinates to frames
    html = "\n".join([f'<article-map sli-gps="{",".join((x[1], x[0]))}">{tag_end}' for x in limited])
    # nest all under the first tag
    html = re.sub(tag_end, "", html, 1) + tag_end
    print(html)
```
