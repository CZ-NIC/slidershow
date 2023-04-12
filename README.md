Slidershow – more than a slideshow

Have you ever wanted to show your friends media from holidays? How cubersome it was to mix photos and videos? Enough of frame transition? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML based presented will let you show your contents just as you want. Either launch it and drag the files inside or fully define all the properties.

# Usage

## Online
The application runs in the browser – check it.

(Remember: Nothing is uploaded to the server. Check the code – there is no server.)

## Manually

Add somewhere and that is all!

```html
<script src="slidershow/slidershow.js"></script>
```

# Structure

Put the presentation content to the <main> tag which contain <article> tags.



## Frame <article>

Every frame is represented by an `<article>` tag.

```html
<article><img src="flower.jpg" /></article>
```

Which contains arbitrary HTML code, such as images or videos.

### Attributes

* `data-duration`: How many seconds a frame will last. By default, indefinitely (waiting for a user action)
```html
<article data-duration="0.5">Short frame</article>
<article>You have to click to get further.</article>
<article data-duration="0.5">Short frame</article>
```
* `data-duration-video`: Supersedes `data-duration` for a video frame.
```html
<section data-duration="1" data-duration-video="0">
    <article><img /></article> <!-- Go further after 1 s -->
    <article><video .../> </article> <!-- Not skipped after 1 s, waiting for a user action -->
</section>
```

* `data-transition`: `fade` (default), `scroll-down` XXX
* `data-transition-duration`: s (default 0.5)
* `data-x`, `data-y`: A viewport stands for a chessboard field. This is the position of the frame in the chessboard. XXX Attention, when nested in section. They may stay in the same position. Implement z-index of something.
* `data-video`: All <video> tags inherits its value as attributes. (controls autoplay muted loop)

```html
<article data-video="autoplay muted">
    <video> <!-- becomes <video autoplay muted> -->
        <source src="my_video.mp4#t=8,10" type="video/mp4">
    </video>
</article>
```

## Map frame <article-map>

* attributes
    * `data-places`: Delimited by comma. Ex: "Prague, Brno"
    * `data-route`: Delimited by comma. Ex: "Prague, Brno"
* Content is not displayed in the moment.
* You may nest `<article-map>` tags easily which causes the map to change.

```html
<article-map data-duration="0" data-places="Prague, Brno">
    <article-map data-duration="0" data-places="Paris"></article-map>
    <article-map data-duration="0.3" data-places="London"></article-map>
</article-map>
```

## Frame group <section>
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

### Nested <article> tags

You may nest an `<article>` beneath another one. Which causes the children to be hidden and shown on top of the parent when they time comes.

```html
<article>
    <img src="flower.jpg" />
    <article>That is a flower!</article>
</article>
```

## Frame content

Any HTML content is accepted.

### <video>

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

* `data-playback-rate`: The speed of the video. (May be set on the parents too.)
```html
<article> <!-- fast video -->
    <video src="my_video.mp4#t=8,10" date-playback-rate="4"></video>
</article>
<article date-playback-rate="0.7">  <!-- slower video -->
    <video src="my_video.mp4#t=8,10"></video>
</article>
```

### Text

If there is no tag inside an `<article>`, it is considered as a plain text. Its size gets fit to the screen width.

### <img>

#### Preload
When having thousands of image, your browser may choke. Use `data-src` instead of `src` as a preload.

```html
<img data-src="flower.jpg" /> <!-- becomes <img src="flower.jpg"> when needed -->
```

#### Exif info
We try to fetch Exif data for images.
* `data-device`: maker and model
* `data-dateTime`
* `data-gps`: point on the map

However, this is a non-trivial task since the browser protects your photos privacy. This will work for images you drag and drop inside, image from the web (with the permitive CORS policy). Reading the Exif of your local images you just mention in the document will work only with the browser (CORS disabled)[https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file] – do that only if you know what are you doing.

#### Zoomable

Zoomable on click/mouse wheel. Double click restores image original size.


#### Panoramatic images

When an image is much longer than the screen, we show it slowly first before resizing it to fit the screen.

# Playback

## Controls

When played, keyboard shortcuts works.

Next frame: <kbd>Right</kbd>, <kbd>PageDown</kbd>, <kbd>n</kbd>, <kbd>Space</kbd>
Previous frame: <kbd>Left</kbd>, <kbd>PageUp</kbd>, <kbd>p</kbd>

Full controls: <kbd>h</kbd>

Video: Adjust speed by <kbd>Numpad +/-</kbd>

## Start

The <menu> is displayed before the presentation starts, unless the <main> has `data-start` attribute.

# Organizing

Use Numpad to tag the images. Then in the menu, hit <kbd>Alt+G</kbd> to group the images to the `<section>` according to tags.