# Video `<video>`

```html
<article>
    <video controls autoplay muted loop>
        <source src="my_video.mp4#t=8,10" type="video/mp4">
    </video>
</article>
```

* Due to the `<source>` URL, only the portion between *8 s – 10 s* gets played.
* The `<video>` tag benefits from standard attributes like `loop`, `muted`, `autoplay` and `controls` (so that controls are visible). In Chromium-based browsers, only a `muted` video respects `autoplay`, so we recommend using `controls` too so that you may start the video with <kbd>Space</kbd>.
* When a new frame appears, the first video gets focus. If `autoplay` is present, it starts playing. Keys like <kbd>Space</kbd>, <kbd>Left</kbd>, <kbd>Right</kbd> stop working for frame switching to avoid interfering with the video controls.

## `sli-datetime`
File modification time, if available. Like [`sli-thumb`](images.md#thumbnail-preview-sli-thumb), it inherits from ancestors (`<article>`, `<section>`, `<main>`) – the closest element wins, so it may be set once on an `<article>` even without a nested `<img>`/`<video>`.

## `sli-playback-rate`
The speed of the video.

!!! tip
    Can be adjusted by <kbd>Numpad +/-</kbd> while presenting (see the menu – <kbd>Esc</kbd>).

```html
<article> <!-- fast video -->
    <video src="my_video.mp4#t=8,10" sli-playback-rate="4"></video>
</article>
<article sli-playback-rate="0.7">  <!-- slower video -->
    <video src="my_video.mp4#t=8,10"></video>
</article>
```

## `sli-video`
(default `'autoplay controls'`) All `<video>` tags inherit its value as attributes (`autoplay controls muted loop`).

!!! tip
    Toggle muted by <kbd>Alt+M</kbd> while presenting.

```html
<article sli-video="autoplay muted">
    <video> <!-- becomes <video autoplay muted> -->
        <source src="my_video.mp4#t=8,10" type="video/mp4">
    </video>
</article>
<article>
    <video src="my_video.mp4"> <!-- becomes <video autoplay controls> because that is the default --></video>
</article>
<article>
    <video sli-video='muted' src="my_video.mp4"> <!-- becomes <video muted> --></video>
</article>
<article>
    <video muted src="my_video.mp4"> <!-- becomes <video autoplay controls muted> --></video>
</article>
```

## `sli-video-cut`

Browsers allow you to specify the [playback range](https://developer.mozilla.org/en-US/docs/Web/Media/Audio_and_video_delivery#specifying_playback_range) with a `#t=[START],[STOP]` URL suffix. Should you wish to change the value dynamically, you may set it as `sli-video-cut`.

Example: `<video src="myvideo.mp4#t=10"></video>` will start playing at time 10 s.

Use the property panel (<kbd>Alt+P</kbd>) to help you.

<video autoplay controls muted loop playsinline width="640" src="../assets/video-cut.webm" title="Trimming a clip's playback range via the sli-video-cut property panel field"></video>

## `sli-video-points`

An array of events that happen during video playthrough. The format is `[startTime, rule, rule...]`.

The first item is the `startTime` when the other rules happen. Rules are as follows:

* `goto:[time]` – Where to jump. Ex: `[10, "goto:50"]` means: at time 10 s, jump to time 50 s.
* `rate:[s]` – Ex: `[10, "rate:.5"]` means: at time 10 s, slow down to half.
* `mute` – Toggles to muted sound.
* `unmute` – Unmutes sound.
* `pause` – Video stops.
* `point:[sli-step-point]` – Zoom to a point. This is defined by a standard [sli-step-point](images.md#sli-step-points). Ex: `[4, "goto:2.9", "point:[100,100,5]"]` means: at time 4 s, jump back to time 2.9 s and zoom to a given point.

Use the property panel (<kbd>Alt+P</kbd>) to help you create video points.
