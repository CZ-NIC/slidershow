# Structure

Put the presentation content into the `<main>` tag, which contains `<article>` tags (~ frames).

<!-- MEDIA: structure diagram — main > section > article > img. A mermaid graph or a PNG. Can be authored now, no photos needed. -->

## How attributes resolve

To control the presentation flow, we use many attributes. These are resolved in the following way:

* `<div sli-attribute>` → true
* `<div sli-attribute=''>` → true
* `<div sli-attribute='true'>` → true
* `<div sli-attribute='false'>` → false
* `<div sli-attribute='1'>` → 1 (also true)
* `<div sli-attribute='0'>` → 0 (also false)
* `<div sli-attribute='value'>` → value
* `<div>` → default

An element affected by an attribute searches for it amongst its own or its ancestors' attributes.

```html
<main sli-attribute="1" >
    <img /> <!-- → value=1 -->
    <img sli-attribute="2" />  <!-- → value=2 -->
</main>
```

## Frame `<article>`

Every frame is represented by an `<article>` tag.

```html
<article><img src="flower.jpg" /></article>
```

It contains arbitrary HTML code, such as images or videos (by default, one per slide). Use control attributes:

### `sli-duration`
(default `0`) How many seconds a frame step will last. By default, indefinitely (waiting for a user action).

```html
<article sli-duration="0.5">Short frame</article>
<article>You have to click to get further</article>
<article sli-duration="0.5">Short frame</article>
```

Note a video frame is an exception: it will hold till the video finishes and then change frame.

Auto-forward can also be set live with <kbd>Shift+Alt+f</kbd>, and a thin **countdown bar** at the bottom edge (toggle <kbd>Shift+c</kbd>, off by default) shows how long until the next frame.

### `sli-loop-presentation`
(default off, set on `<main>`) When the presentation reaches its last frame, loop back to the first one instead of stopping – for kiosk / exhibition playback (pair it with `sli-duration` for a hands-free loop). Toggle live with <kbd>Shift+L</kbd>, or use the **🔁 Kiosk** splash button. The narrower-scoped [`sli-loop`](#sli-loop) is a different feature – it loops several images *within* one frame.

### `sli-transition-duration`
(default `0`) How many seconds it will take to change a frame.

### `sli-spread-frames`
(default `spiral`) A viewport stands for a chessboard field. This is how the frames are positioned on the chessboard.

* `true=spiral`
* `diagonal`

### `sli-x`, `sli-y`
Valid only for `sli-spread-frames=diagonal`. Overrides the default position. Attention: do not let frames share the same position.

### `sli-loop`
If present, images in the body will rapidly loop, creating a funny animation. (Currently only the `true` value is allowed, for an infinite loop.)

```html
<article sli-loop>
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

### `sli-tag`
Set by the [tagging feature](organizing.md#tagging-albums) on the frame's `<img>`/`<video>`, not hand-authored. Space-separated list of digit tokens, e.g. `sli-tag="1 2"` for a frame in both tag 1 and tag 2.

### `sli-tag-names`
On `<main>`: comma-separated display names for tags, position = digit (`sli-tag-names="rodiče,vedoucí"` names tag 1 "rodiče" and tag 2 "vedoucí"). Digits past the list still work, shown as bare numbers.

### `sli-rotate`
**(number in degrees)** Any content can easily be rotated. Use the buttons in the menu to rotate live.

### `<!-- presenter's notes -->`
You may use HTML comments just before the frame or as the first frame child. Markdown syntax is supported. These will be displayed in the [auxiliary window](organizing.md#auxiliary-window) while presenting.

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

## Frame group `<section>`
`<article>` tags may be encapsulated into (nested) `<section>` groups. A `<section>` has the same attributes as an `<article>`.

```html
<section sli-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
    <article sli-duration='0'>You have to click to get further.</article>
    <article>Short frame (inherits 0.5)</article>
</section>
```

As the ultimate default, the `<main>` tag may be used.

```html
<main sli-duration='0.5'>
    <article>Short frame (inherits 0.5)</article>
</main>
```

### Nested `<article>` tags

You may nest an `<article>` beneath another one, which causes the children to be hidden and shown on top of the parent when their time comes.

```html
<article>
    <img src="flower.jpg" />
    <article>That is a flower!</article>
</article>
```

## Template

### Header and footer

`<header>` and `<footer>` tags used within a `<template>` are automatically inserted into frames that do not yet contain such tags. (Put the `<template>` outside `<main>`.)

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
