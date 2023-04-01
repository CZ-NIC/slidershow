Have you ever wanted to show your friends media from holidays? How cubersome it was to mix photos and videos? Enough of frame transition? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML based presented will let you show your contents just as you want. Either launch it and drag the files inside or fully define all the properties.

# Structure

## Frame <article>

Every frame is represented by an `<article>` tag.

```html
<article><img src="flower.jpg" /></article>
```

Which contains arbitrary HTML code, such as images or videos.

## Attributes

* `data-duration`: How many seconds a frame will last. By default, indefinitely
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
* `data-transition-duration`: s (default 0.5) XXX
* `data-x`, `data-y`: A viewport stands for a chessboard field. This is the position of the frame in the chessboard. XXX Attention, when nested in section. They may stay in the same position. Implement z-index of something.

## Frame group <section>
These `<article>` tags might be encapsuled into (nested) `<section>` groups. A `<section>` has the same attributes as an `<article>`.

```html
<section data-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
    <article data-duration='0'>You have to click to get further.</article>
    <article>Short frame (inherits 0.5)</article>
</section>
```

As the ultimate default the `<body>` tag may be used.

```html
<body data-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
</body>
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

### Text

If there is no tag inside an `<article>`, it is considered as a plain text. Its size gets fit to the screen width.

# Playback

## Controls

When played, keyboard shortcuts works.

Next frame: <kbd>Right</kbd>, <kbd>PageDown</kbd>, <kbd>n</kbd>, <kbd>Space</kbd>
Previous frame: <kbd>Left</kbd>, <kbd>PageUp</kbd>, <kbd>p</kbd>

Full controls: <kbd>h</kbd>

## Start

The <menu> is displayed before the presentation starts, unless it has `data-skip` attribute.