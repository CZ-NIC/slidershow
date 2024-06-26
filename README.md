# SlideRshow – more than a slideshow

[![Run now!](https://img.shields.io/badge/Run_now!-green.svg)](https://cz-nic.github.io/slidershow/slidershow.html)

Have you ever wanted to show your friends media from holidays? How cubersome it was to mix photos and videos? Enough of frame transition? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML based presenter will let you show your contents just the way you desire. Either launch it and drag the files in or fully define all the properties.



What is SlideRshow and what advantages it has?
* **media player**
    * [Nomacs](https://nomacs.org/) – perfect but does not handle videos
    * [VLC](https://www.videolan.org/vlc/) – perfect but not stable with 100+ files in the playlist
    * Windows Photo Viewer – cannot set the presentation order
    * Google Photos viewer – instead of moving the video forward, the arrow jumps to the next image
    * none support video zoom (we do)
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

What can you acheive? See a variety of features in another example at [extra/tutorial.html](https://cz-nic.github.io/slidershow/extra/tutorial.html).

# Contents
- [Prologue](#slidershow--more-than-a-slideshow)
- [Usage](#usage)
- [Contents](#contents)
- [Playback](#playback)
  * [Controls](#controls)
  * [Start](#start)
  * [Thumbnails](#thumbnails)
  * [Auxiliary window](#auxiliary-window)
  * [Organizing](#organizing)
- [Structure](#structure)
  * [Frame `<article>`](#frame-article)
      - [`data-rotate`](#data-rotate)
      - [`data-duration`](#data-duration)
      - [`data-transition-duration`](#data-transition-duration)
      - [`data-spread-frames`](#data-spread-frames)
      - [`data-x`, `data-y`](#data-x-data-y)
      - [`data-loop`](#data-loop)
      - [`id`](#id)
      - [`<!-- presenter's notes -->`](#---presenters-notes---)
  * [Frame content](#frame-content)
      - [`data-step`](#data-step)
        * [Step styling](#step-styling)
      - [`data-step-class`](#data-step-class)
      - [`data-step-shown`](#data-step-shown)
      - [`data-step-li`](#data-step-li)
      - [`data-step-duration`](#data-step-duration)
      - [`data-step-transition-duration`](#data-step-transition-duration)
    + [`<img>`](#img)
      - [Exif info](#exif-info)
      - [Zoomable](#zoomable)
        * [`data-step-points`](#data-step-points)
      - [Panoramatic images](#panoramatic-images)
      - [Preload](#preload)
    + [`<video>`](#video)
      - [`data-datetime`](#data-datetime)
      - [`data-playback-rate`](#data-playback-rate)
      - [`data-video`](#data-video)
      - [`data-video-points`](#data-video-points)
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

There is a varienty of keyboard shortcuts. Click the menu button in the top right corner (<kbd>Esc</kbd>) or hit <kbd>F1</kbd> to see a complete list.

* Next frame: <kbd>Right</kbd>, <kbd>PageDown</kbd>, <kbd>n</kbd>, <kbd>Space</kbd>
* Previous frame: <kbd>Left</kbd>, <kbd>PageUp</kbd>, <kbd>p</kbd>
* Video: Adjust speed by <kbd>Numpad +/-</kbd>
* Toggle file info: <kbd>f</kbd>
* Toggle HUD map: <kbd>m</kbd>

## Start

The `<menu>` is displayed before the presentation starts, unless the `<main>` has the `data-start` attribute.

## Thumbnails ribbon and grid

While presenting, press <kbd>Alt+J</kbd> to display the thumbnail ribbon or <kbd>Alt+G</kbd> to see full grid. There, you can easily sort the frames. Either move them one by one or sort whole section (by EXIF date or file names). Import new images just by dragging them in.

## Auxiliary window

While presenting, you may appraise an auxiliary window on the second monitor that shows you the next frame and presenting notes. Start it with <kbd>Alt+W</kbd>.

## Organizing

Start tagging mode with <kbd>Alt+T</kbd>. Use Numpad to tag the images – think of a tag as a number that corresponds to one of your categories.. Then in the menu, hit <kbd>Alt+Shift+G</kbd> to group the images to the `<section>` according to tags. Export with <kbd>Ctrl+S</kbd>. Sorted & ready!

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

### `data-duration`
(default `0`) How many seconds will a frame step last. By default, indefinitely (waiting for a user action).

```html
<article data-duration="0.5">Short frame</article>
<article>You have to click to get further</article>
<article data-duration="0.5">Short frame</article>
```
Note a video frame is an exception: will hold till the video finishes and then change frame.

### `data-transition-duration`
(default `0`) How many seconds will it take to change a frame.

### `data-spread-frames`
(default `spiral`) A viewport stands for a chessboard field. This is how the frame are positioned in the chessboard.
* `true=spiral`
* `diagonal`
### `data-x`, `data-y`
Valid only for `data-spread-frames=dialogal`. Overrides the default position. Attention, do not let the frames share the same position.

### `data-loop`
If present, images in the body will rapidly loop, creating a funny animation. (Currenly allowed only `true` value for an infitite loop.)
```html
<article data-loop>
    <img src="pic1.jpg" />
    <img src="pic2.jpg" />
</article>
```

### `id`
Standard HTML ID serves for navigation.
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
### `<!-- presenter's notes -->`
You may use HTML comments just before the frame or as the first frame child. Markdown syntax is supported. These will be displayed in the auxiliary window while presenting.

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

A tag have following attributes:

#### `data-rotate`

**(number in degrees)** The content might easily be rotated. Use buttons in the menu to rotate live.

#### `data-step`
This element is not initially displayed but gradually appears as the user progresses through the presentation. If the value is not set, it will receive the next available unfilled number. If two elements share the same number, they will appear (or disappear) simultaneously. The numbers do not need to be assigned successively; you can skip values.

The property is not inherited, it concerns this particular element only. In gains `.step-shown` or `.step-hidden` class.

A basic example:

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
<article data-step-li>
    <h1>Seen from the beginning</h1>
    <ul>
        <li>step 2</li>
        <li>step 3</li>
        <li data-step="1">step 1</li>
        <li>step 6</li>
        <li data-step="4">step 4</li>
        <li>step 7</li>
    </ul>
    <p data-step>step 8</p>
    <p data-step="100">step last</p> <!-- you can skip numbers -->
    <p data-step="1">step 1 (too)</p>
    <p data-step="5">step 5</p>
    <p data-step>step 9</p>
    <p data-step="5">step 5 (too)</p>
    <p>seen from the beginning</p>
</article>
```

##### Step styling
By default, the animation is fade in/out. It was made easy to change it. Example via pure CSS:

```html
<style>
    [data-step] {
        /* all steps appear with a blue flash */
        animation-name: blue-flash;
    }

    @keyframes blue-flash {
        from {
            background-color: blue;
        }

        to {
            background-color: unset;
        }
    }
</style>
```

 #### `data-step-class`
 Any contained elements with [`[data-step]`](#data-step) will have this class set. Ignored when having [`[data-step-shown]`](#data-step-shown) set. Example using [Animate.css](https://animate.style/):

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
<article data-step-li>
    <ul data-step-class="animate__animated animate__backInDown">
        <li>I will fall from the top</li>
        <li>Me too</li>
    </ul>
</article>
```

#### `data-step-shown`
Any contained elements with [`[data-step]`](#data-step) will not be hidden automatically. Instead of being shown, they receive the class given by the attribute. Supresses [`[data-step-class]`](#data-step-class).

```html
<style>
    .my-class {font-weight: bold;}
</style>
<article data-step-li>
    <ul>
        <li>Will be shown.</li>
        <li data-step-shown="my-class">Still visible. Becomes bold at step 2.</li>
    </ul>
</article>
```

#### `data-step-li`
Every contained `<li>` element is taken as having the `data-step` attribute (see also: [`data-step`](#data-step)). They are not initially displayed but appears gradually as the user progresses through the presentation.

```html
<article data-duration=1>
    <ul data-step-li>
        <li>Lorem</li> <!-- displayed at step 1 -->
        <li>ipsum</li> <!-- displayed at step 2 -->
        <li>dolor</li> <!-- displayed at step 3 -->
        <li>sit</li>   <!-- displayed at step 4 -->
    </ul>
    <ul>
        <li>Always visible</li>
    </ul>
</article>
```

#### `data-step-duration`

How many seconds will a frame step last. By default, it takes [`data-duration`](#data-duration).

#### `data-step-transition-duration`

How many seconds will it take to change an image zoom step. By default, it takes [`data-transition-duration`](#data-transition-duration).

### `<img>`

#### Exif info
We try to fetch Exif data for images.
* `data-device`: maker and model
* `data-datetime`: picture time stamp (or fallback to file modification time)
* `data-gps`: point on the map (HUD map will be automatically displayed in the corner)

However, this is a non-trivial task since the browser protects your photos privacy. This will work for images you drag and drop inside, images from the web (with the permitive CORS policy). Reading the Exif of your local images you just mention in the document will work only with the browser [CORS disabled](https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file) – do that only if you know what are you doing.

#### Zoomable

Zoomable on click/mouse wheel or a button from menu. You can zoom either an image or a video. Use <kbd>arrows</kbd> to crawl over the picture when zoomed. Even multiple arrows work at once. If you need the arrows to control the video playthrough, use <kbd>Ctrl+arrows</kbd> (works for both Firefox and Chrome).

##### `data-step-points`

Array of points an image should pass. The first is the initial image position. Works for the image itself or any contained image.

Point: `[left = 0, top = 0, scale = 1, transition_duration = data-step-transition-duration | data-transition-duration, duration = data-step-duration | data-duration, data-rotate ]`

In this example, the image starts at `[100, 10, 2]`, then zooms out `[]`, then goes slowly (note the delay parameter) to `[150,10,3,3]`. Next, while using the default `transition_duration` (note the `null` -> becomes `1.5`), we set `duration` to 0.5 second for this step only `[200,10,4,null,.5]`.

```html
<article data-transition-duration=1.5>
    <img data-step-points="[[100,10,2], [], [150,10,3,3], [200,10,4,null,1] , [250,10,5] , [300,10,6] , [350,10,7]]" src="..."/>
</article>
```

Position `0,0` is at the image centre. Its real dimension is taken into account so the value remains stable while changing the browser size (different displays). We recommend to use the property panel (<kbd>Alt+P</kbd>) to determine the coordinates.

Every image in the sections slowly zooms out from the center. (Images in header and footer are ignored.)

```html
<section data-step-points="[[0,0,15,5], [0,0,1,5]]">
    <article><img src="..."/></article>
    <article><img src="..."/></article>
    <article><img src="..."/></article>
</section>
```

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

#### `data-datetime`
File modification time if available.

#### `data-playback-rate`
The speed of the video.

Tip: Can be adjusted by <kbd>Numpad +/-</kbd> while presenting (see menu – <kbd>Esc</kbd>).
```html
<article> <!-- fast video -->
    <video src="my_video.mp4#t=8,10" date-playback-rate="4"></video>
</article>
<article date-playback-rate="0.7">  <!-- slower video -->
    <video src="my_video.mp4#t=8,10"></video>
</article>
```

#### `data-video`
(default `'autoplay controls'`) All `<video>` tags inherits its value as attributes (`autoplay controls muted loop`). Tip: toggle muted by <kbd>Alt+M</kbd> while presenting.

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

#### `data-video-cut`

Browsers allow you to specify the [playback range](https://developer.mozilla.org/en-US/docs/Web/Media/Audio_and_video_delivery#specifying_playback_range) by `#t=[START],[STOP]` URL suffix. Should you wish to change the value dynamically, you may set it as video-cut.

Ex: `<video src="myvideo.mp4#t=10></video>` will start playing at time 10 s.

Use the property panel (<kbd>Alt+p</kbd>) to help you with.

#### `data-video-points`

Array of events that happen during video playthrough. The format is: `[startTime, rule, rule...]`.

The first item is the `startTime` when other rules happen. Rules are following:

* `goto:[time]` – Where to jump. Ex: `[10, "goto:50"]` means: At the time 10 s, jump to time 50 s.
* `rate:[s]` – Ex: `[10, "rate:.5"]` means: At the time 10 s, slow down to half.
* `mute` – Toggles to muted sound.
* `unmute` – Unmutes sound.
* `pause` – Video stops.
* `point:[data-step-point]` – Zoom to a point. This is defined by a standard [data-step-point](#data-step-points). Ex: `[4, "goto:2.9", "point:[100,100,5]"]` means: At the time 4 s, jump back to time 2.9 s and zoom to a given point.

Use the property panel (<kbd>Alt+p</kbd>) to help you with creating video points.

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

Tags `<header>` and `<footer>` used within a `<template>` are automatically inserted into frames that does not yet contain such tags. (Put the `<template>` outside `<main>`.)

```html
<template>
    <footer>This is the default footer</footer>
</template>

<main>
    <article>
        Here we get an automatic footer
        <!-- Inserted: <footer>This is the default footer</footer> -->
    </article>

    <article>
        No footer will be appended here
        <footer></footer>
    </article>
</main>
```

## Further styling

The presentation being run in a simple HTML page, style customisation is really simple. Take a look at any running instance to the DevTools. For instance, to hide the frame counter, add a style tag to the `<head>`.

```html
<style>
    #hud-counter {display:none}
</style>
```

Or adjust the green template ([extra/green.css](https://cz-nic.github.io/slidershow/extra/green.css)) that is being used in the tutorial.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/extra/green.css" />
```

# Troubleshooting

## Media not shown: [HEIF](https://caniuse.com/?search=heif), MOV...

Some formats might not be supported in your browser. The is particullary unfortunate for the [JXL](https://caniuse.com/?search=jxl) format, which appears superiour. However is kept restrained by [Google who pushes WebP](https://www.reddit.com/r/programming/comments/1ajq7bj/google_is_once_again_accused_of_snubbing_the_jpeg/) instead.

Another issue arises from the patent mess surrounding x265: [HEIF](https://caniuse.com/?search=heif), [HEVC](https://caniuse.com/?search=hevc). You might have luck with a less common browser that supports these formats.

If you have encouter difficulties with MOV, specifying [the right codec](https://stackoverflow.com/questions/31380695/how-to-open-mov-format-video-in-html-video-tag) might help.

# License
GNU GPLv3.
