# SlideRshow – more than a slideshow

[![Run now!](https://img.shields.io/badge/Run_now!-green.svg)](https://cz-nic.github.io/slidershow/examples/slidershow.html)

Have you ever wanted to show your friends media from holidays? How cubersome it was to mix photos and videos? Enough of frame transition? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML based presenter will let you show your contents just the way you desire. Either launch it and drag the files in or fully define all the properties.



What is SlideRshow and what advantages it has?
* **media player**
    * [Nomacs](https://nomacs.org/) – perfect but does not handle videos
    * [VLC](https://www.videolan.org/vlc/) – perfect but not stable with 100+ files in the playlist
* **organizer**
    * Simply tag photos as you browse them to be regrouped for a screening.
* **presentation software**
    * Ridiculously small file size – given you do not have to keep copies of media files as in other presentation software. Just link local or online files! Have you ever tried to put 1 GB of images onto slides?
    * Super easy video trimming.

# Usage

The application **runs in the browser** – see the SlideRshow **[right now](https://cz-nic.github.io/slidershow/examples/slidershow.html)**. Or download the repository and open the local file. Or add somewhere a tag and that is all!

```html
<script src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/slidershow/slidershow.js"></script>
```

When in the application, drag and drop media files into the page and just start the playthrough. (Remember: Nothing is uploaded to the server. Check the code – there is no server.) Should a more detailed presentation be needed, just export the presentation HTML file with <kbd>Ctrl+E</kbd> and edit it at will.

What can you acheive? See a variety of features in another example at [examples/tutorial.html](https://cz-nic.github.io/slidershow/examples/tutorial.html).

# Contents
- [Prologue](#slidershow-more-than-a-slideshow)
- [Usage](#usage)
- [Contents](#contents)
- [Playback](#playback)
  * [Controls](#controls)
  * [Start](#start)
  * [Thumbnails](#thumbnails)
  * [Auxiliary window](#auxiliary-window)
  * [Organizing](#organizing)
- [Structure](#structure)
  * [Frame `<article>`](#frame-article--)
  * [Frame content](#frame-content)
    + [`<img>`](#img)
      - [Exif info](#exif-info)
      - [Zoomable](#zoomable)
      - [Panoramatic images](#panoramatic-images)
      - [Preload](#preload)
    + [`<video>`](#video)
    + [Text](#text)
  * [Map](#map)
    + [`<article-map>` frame](#article-map-frame)
  * [Frame group `<section>`](#frame-group-section)
    + [Nested `<article>` tags](#nested-article-tags)
  * [Template](#template)
    + [Header and footer](#header-and-footer)
  * [Further styling](#further-styling)
- [License](#license)

# Playback

## Controls

When played, keyboard shortcuts works.

* Next frame: <kbd>Right</kbd>, <kbd>PageDown</kbd>, <kbd>n</kbd>, <kbd>Space</kbd>
* Previous frame: <kbd>Left</kbd>, <kbd>PageUp</kbd>, <kbd>p</kbd>
* Full controls: <kbd>?</kbd>
* Video: Adjust speed by <kbd>Numpad +/-</kbd>
* Toggle file info: <kbd>f</kbd>
* Toggle HUD map: <kbd>m</kbd>
* Menu: Hit <kbd>Esc</kbd>

## Start

The `<menu>` is displayed before the presentation starts, unless the `<main>` has the `data-start` attribute.

## Thumbnails

While presenting, press <kbd>Alt+J</kbd> to display the thumbnail ribbon.

## Auxiliary window

While presenting, you may appraise an auxiliary window on the second monitor that shows you the next frame and presenting notes. Start it with <kbd>Alt+W</kbd>.

## Organizing

Start tagging mode with <kbd>Alt+t</kbd>. Use Numpad to tag the images – think of a tag as a number that corresponds to one of your categories.. Then in the menu, hit <kbd>Alt+G</kbd> to group the images to the `<section>` according to tags. Export with <kbd>Ctrl+S</kbd>. Sorted & ready!

<sub>Note that the tag is stored in the browser (local storage)[https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage] by the file name so that you do not lose the information at crash. In case you import another photo with the same name, it will inherit the tag from the clashing file.</sub>

# Structure

Put the presentation content to the `<main>` tag which contain `<article>` tags (~ frames).

To control the presentation flow, we use many attributes. These are resolved in the following way:
* `<div data-attribute>` → true
* `<div data-attribute=''>` → true
* `<div data-attribute='true'>` → true
* `<div data-attribute='false'>` → false
* `<div data-attribute='1'>` → 1 (also true)
* `<div data-attribute='0'>` → 0 (also false)
* `<div data-attribute='value'>` → value
* `<div>` → default

An element affected by an attribute searches for it amongst its own or ancestors' attributes.

```html
<main data-attribute="1" >
    <img /> <!-- → value=1 -->
    <img data-attribute="2" />  <!-- → value=2 -->
</main>
```

## Frame `<article>`

Every frame is represented by an `<article>` tag.

```html
<article><img src="flower.jpg" /></article>
```

Which contains arbitrary HTML code, such as images or videos (by default, one per slide). Use control attributes:

* `data-duration=0`: How many seconds will a frame step last. By default, indefinitely (waiting for a user action).

    ```html
    <article data-duration="0.5">Short frame</article>
    <article>You have to click to get further</article>
    <article data-duration="0.5">Short frame</article>
    ```
    Note a video frame is an exception: will hold till the video finishes and then change frame.

* `data-transition-duration=0`: How many seconds will it take to change a frame.
* `data-spread-frames=spiral`: A viewport stands for a chessboard field. This is how the frame are positioned in the chessboard.
    * `true=spiral`
    * `diagonal`
* `data-x`, `data-y`: Valid only for `data-spread-frames=dialogal`. Overrides the default position. Attention, do not let the frames share the same position.
* `data-loop`: If present, images in the body will rapidly loop, creating a funny animation. (Currenly allowed only `true` value for an infitite loop.)
    ```html
    <article data-loop>
        <img src="pic1.jpg" />
        <img src="pic2.jpg" />
    </article>
    ```
* `data-li-stepped`: Every `<li>` element is taken as having the `data-step` attribute. They are not initially displayed but appears gradually as the user progresses through the presentation.
    ```html
    <article data-li-stepped data-duration=1>
        <ul>
            <li>Lorem</li> <!-- displayed at time 1 -->
            <li>ipsum</li> <!-- displayed at time 2 -->
            <li>dolor</li> <!-- displayed at time 3 -->
            <li>sit</li>   <!-- displayed at time 4 -->
        </ul>
    </article>
    ```
* `id`: Standard HTML ID serves for navigation.
    ```html
    <article>
        <a href="#my_frame">go to a specific frame</a>
        <a href="#my_section">go to the first frame in a specific section</a>
        <a href="#2">go to the second frame (number may change if you add frames later)</a>
    </article>
    <section id=my_section>
        <article>...</article>
        <article id=my_frame>...</article>
    </section>
    ```
* `<!-- presenter's notes -->` You may use HTML comments just before the frame or as the first frame child. These will be displayed in the auxiliary window while presenting.
    Before the frame:
    ```html
    <!-- I should talk about cats. -->
    <article><img src='cat.jpg' /></article>
    ```

    Inside the frame:
    ```html
    <article>
        <!-- I should talk about cats. -->
        <img src='cat.jpg' />
    </article>
    ```

## Frame content

Any HTML content is accepted.

* `data-step`: This element is not initially displayed but appears gradually as the user progresses through the presentation.
    ```html
    <article data-duration=1>
        <p>Lorem ipsum</p>
        <img data-step src="..."> <!-- displayed at step 1 -->
        <p>dolor sit amet</p>
        <img data-step src="..."> <!-- displayed at step 2 -->
        <p data-step>consectetur adipiscing</p>  <!-- displayed at step 3 -->
    </article>
    ```

    Steps work in a very intuitive way.

    ```html
    <article data-li-stepped>
        <h1>Seen from the beginning</h1>
        <ul>
            <li>step 3</li>
            <li>step 4</li>
            <li data-step="1">step 1</li>
            <li>step 8</li>
            <li data-step="4">step 5</li>
            <li>step 9</li>
        </ul>
        <p data-step>step 10</p>
        <p data-step="1">step 2</p>
        <p data-step="5">step 6</p>
        <p data-step="5">step 7</p>
        <p>seen from the beginning</p>
    </article>
    ```

    See also: `data-li-stepped`.

### `<img>`

#### Exif info
We try to fetch Exif data for images.
* `data-device`: maker and model
* `data-datetime`: picture time stamp
* `data-gps`: point on the map (HUD map will be automatically displayed in the corner)

However, this is a non-trivial task since the browser protects your photos privacy. This will work for images you drag and drop inside, images from the web (with the permitive CORS policy). Reading the Exif of your local images you just mention in the document will work only with the browser [CORS disabled](https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file) – do that only if you know what are you doing.

#### Zoomable

Zoomable on click/mouse wheel. Double click restores image original size.

#### Panoramatic images

When an image is much longer than the screen, we show it slowly first before resizing it to fit the screen. This will delay the `<article>`'s `data-duration`. It starts when the image proportion width / height > `data-panorama-threshold=2`.

#### Preload
When having thousands of images, your browser may choke. Use `data-src` instead of `src` as a preload.

```html
<img data-src="flower.jpg" /> <!-- becomes <img src="flower.jpg"> when needed -->
```

### `<video>`

```html
<article>
    <video controls autoplay muted loop>
        <source src="my_video.mp4#t=8,10" type="video/mp4">
    </video>
</article>
```

* Due to the `<source>` URL, only portion between *8 s – 10 s* gets played.
* The `<video>` tag benefits from standard attributes like `loop`, `muted`, `autoplay` and `controls` (so that controls are visible). In Chromium based browsers, only `muted` video respects `autoplay` so we recommend using `controls` too so that you may start the video with the <kbd>Space</kbd>.
* When a new frame appears, first video gets focus. Whether `autoplay` is present, it starts playing. Keys like <kbd>Space</kbd>, <kbd>Left</kbd>, <kbd>Right</kbd> stop working for frame switching to avoid interfering with the video controls.

* `data-playback-rate`: The speed of the video.
Tip: Can be adjusted by <kbd>Numpad +/-</kbd> while presenting.
```html
<article> <!-- fast video -->
    <video src="my_video.mp4#t=8,10" date-playback-rate="4"></video>
</article>
<article date-playback-rate="0.7">  <!-- slower video -->
    <video src="my_video.mp4#t=8,10"></video>
</article>
```

* `data-video='autoplay controls'`: All `<video>` tags inherits its value as attributes (`autoplay controls muted loop`). Tip: toggle muted by <kbd>Alt+M</kbd> while presenting.
    ```html
    <article data-video="autoplay muted">
        <video> <!-- becomes <video autoplay muted> -->
            <source src="my_video.mp4#t=8,10" type="video/mp4">
        </video>
    </article>
    <article>
        <video src="my_video.mp4"> <!-- becomes <video autoplay controls> because that is the default --></video>
    </article>
    <article>
        <video data-video='muted' src="my_video.mp4"> <!-- becomes <video muted> --></video>
    </article>
    <article>
        <video muted src="my_video.mp4"> <!-- becomes <video autoplay controls muted> --></video>
    </article>
    ```

### Text

You can place an arbitrary content inside an `<article>`.

* `data-fit=auto`
    * `true|false`: Fit the text size to the screen width.
    * `auto`: Fit if there is no tag inside an `<article>`

## Map

These are map-related attributes which helps you to display the HUD/fullscreen map.

* `data-places`: Delimited by comma. Ex: "Prague, Brno"
* `data-map-zoom`: Zoom as given by the [Mapy.cz API](https://api.mapy.cz/doc/SMap.html) (world 1, country 5, street 13)
* `data-gps`: Single point, longitude and latitude, comma delimited.
    ```html
    <!-- these are equivalent -->
    <img data-gps='50.0884647, 14.4707590' />
    <img data-places='Prague' />
    ```
* `data-map-animate=true`: Change the center point directly (`false`) or in a few steps (`true`).
* `data-map-geometry-show=false`: Route amongst the places. If a single place is given, we take the place from the last time.
    * `false` No route shown.
    * `route|true` Route is calculated amongst the places.
    * `line` Only line is marked amongst the places.
    ```html
    <!-- Full route is calculated and shown between Prague and Brno, then between Brno and Pardubice. -->
    <article-map data-duration="0" data-places="Prague" data-map-geometry-show="true">
        <article-map data-places="Brno"></article-map>
        <article-map data-places="Pardubice"></article-map>
    </article-map>
    ```
* `data-map-geometry-criterion=''`: empty or `fast`, `short`, `turist1`, `turist2`, `bike1`, `bike2`, `bike3`
* `data-map-markers-show=true`: Show red marker of a point.
* `data-map-geometry-clear=true`: Clear all route and drawings before displaying.
* `data-map-markers-clear=true`: Clear all point markers. (Or keep them visible all.)


### `<article-map>` frame

Normally any map command will incur a small HUD map in the corder to appear. Should you with to display the fullscreen map, use the `<article-map>` tag.


You may nest `<article-map>` tags easily which causes the map to change.

```html
<article-map data-duration="0" data-places="Prague, Brno">
    <article-map data-duration="0" data-places="Paris"></article-map>
    <article-map data-duration="0.3" data-places="London"></article-map>
</article-map>
```

Note that no content is displayed within the `<article-map>` in the moment.

#### Animate GPX file

You can easily convert a GPX file (exported from a map software) into an interactive route. Just launch this Python script onto a GPX file and copy the `<article-map>` tags to the presentation HTML.

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
    html = "\n".join([f'<article-map data-gps="{",".join((x[1], x[0]))}">{tag_end}' for x in limited])
    # nest all under the first tag
    html = re.sub(tag_end, "", html, 1) + tag_end
    print(html)
```

## Frame group `<section>`
These `<article>` tags might be encapsuled into (nested) `<section>` groups. A `<section>` has the same attributes as an `<article>`.

```html
<section data-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
    <article data-duration='0'>You have to click to get further.</article>
    <article>Short frame (inherits 0.5)</article>
</section>
```

As the ultimate default the `<main>` tag may be used.

```html
<main data-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
</main>
```

Standard HTML ID attribute serves for navigation.
```html
<article>
    <a href="#my_frame">go to a specific frame</a>
    <a href="#my_section">go to the first frame in a specific section</a>
    <a href="#2">go to the second frame (number may change if you add frames later)</a>
</article>
<section id=my_section>
    <article>...</article>
    <article id=my_frame>...</article>
</section>
```

### Nested `<article>` tags

You may nest an `<article>` beneath another one. Which causes the children to be hidden and shown on top of the parent when their time comes.

```html
<article>
    <img src="flower.jpg" />
    <article>That is a flower!</article>
</article>
```

## Template

### Header and footer

Tags `<header>` and `<footer>` used within a `<template>` are automatically inserted into frames that already contain such tags.

```html
<template>
    <footer>This is the default footer</footer>
</template>

<article>
    Here we get an automatic footer
    <!-- Inserted: <footer>This is the default footer</footer> -->
</article>

<article>
    No footer will be appended here
    <footer></footer>
</article>
```

## Further styling

The presentation being run in a simple HTML page, style customisation are really simple. Take a look at any running instance to the DevTools. For instance, to hide the frame counter, add a style tag to the `<head>`.

```html
<style>
    #hud-counter {display:none}
</style>
```

# License
GNU GPLv3.
