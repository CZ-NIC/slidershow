# Images `<img>`

## Exif info
We try to fetch Exif data for images.

* `sli-device`: maker and model
* `sli-datetime`: picture time stamp (or fallback to file modification time)
* `sli-gps`: point on the map (the HUD map will be automatically displayed in the corner)
* `sli-folder`: the folder the file was imported from (not EXIF – it comes from the drop itself, see [grouping on import](organizing.md#grouping-on-import))

However, this is a non-trivial task since the browser protects your photos' privacy. This works for images you drag and drop inside, and images from the web (with a permissive CORS policy). Reading the Exif of local images you merely mention in the document works only with the browser [CORS disabled](https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file) – do that only if you know what you are doing.

## Zoomable

Zoomable on click / mouse wheel or via a button from the menu. You can zoom either an image or a video. Use <kbd>arrows</kbd> to crawl over the picture when zoomed. Even multiple arrows work at once. If you need the arrows to control the video playthrough, use <kbd>Ctrl+arrows</kbd> (works for both Firefox and Chrome).

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/zoom.webm" title="Wheel-zooming into a photo and arrow-crawling around it"></video>

### `sli-step-points`

An array of points an image should pass through. The first is the initial image position. Works for the image itself or any contained image.

Point: `[left = 0, top = 0, scale = 1, transition_duration = sli-step-transition-duration | sli-transition-duration, duration = sli-step-duration | sli-duration, sli-rotate ]`

The first point is a state, not a step – the frame simply appears in it, with no animation, even when
it is zoomed in. (The same goes for entering a frame backwards: you land on its last point at once.)
Want the frame to start unzoomed and only then zoom in? Prepend the neutral point `[]` and make the
zoom a regular step – that way you also control how long the whole image is held: `[[], [100,10,2]]`.
Alternatively, fill in `transition_duration` on the first point; there is nothing to transition from,
so that slot means "zoom in from the neutral position when the frame opens".

In this example, the image starts at `[100, 10, 2]`, then zooms out `[]` (instantly, no delay), then goes slowly (note the delay parameter) to `[150,10,3,3]`. Next, while using the default `transition_duration` (note the `null` -> becomes `1.5`), we set `duration` to 0.5 second for this step only `[200,10,4,null,.5]`.

```html
<article sli-transition-duration=1.5>
    <img sli-step-points="[[100,10,2], [], [150,10,3,3], [200,10,4,null,1] , [250,10,5] , [300,10,6] , [350,10,7]]" src="..."/>
</article>
```

Position `0,0` is at the image centre. Its real dimension is taken into account so the value remains stable while changing the browser size (different displays). We recommend using the property panel (<kbd>Alt+P</kbd>) to determine the coordinates – <kbd>Alt+S</kbd> adds a point at the image's current position without even opening the panel first. Drag a point onto another one in the panel to reorder them.

!!! tip "Seeing the points without the panel"
    In [editing mode](playback.md) (<kbd>Alt+E</kbd>), a frame that carries points shows them as
    pills in the top-right corner whenever the property panel is closed – 📸 for `sli-step-points`,
    🎬 for [`sli-video-points`](video.md#sli-video-points). So it is visible at a glance that a
    frame has points at all, and that <kbd>Alt+S</kbd> / <kbd>Alt+V</kbd> just added one. The pills
    are fully interactive without the panel: click one to edit that point (a step-point follows
    whatever you zoom/pan to, a video point shows [its rules](video.md#editing-a-point-afterwards)),
    double-click to remove it, and use the trailing **+** to add one. The point being edited, or one
    just added, gets a row of its own fields below it – for a step-point the two number inputs
    (<kbd>Alt+I</kbd> / <kbd>Alt+U</kbd>) setting its `transition_duration`/`duration`.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/points-badge.webm" title="Adding step-points from the corner badge in editing mode"></video>

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/step-points.webm" title="Composing sli-step-points in the property panel and stepping through them"></video>

Every image in the sections slowly zooms out from the centre. (Images in header and footer are ignored.)

```html
<section sli-step-points="[[0,0,15], [0,0,1,5]]">
    <article><img src="..."/></article>
    <article><img src="..."/></article>
    <article><img src="..."/></article>
</section>
```

## Caption

Put a `<figcaption>` next to the image (or video) to show a caption over the bottom of the frame – white text on a dark fade. It does not take part in the frame's layout: the photo still fills the whole frame exactly as if it were alone, the caption is not zoomed with it, and it arrives and leaves together with its frame. Any HTML goes inside; restyle it with `article > figcaption` in your own CSS.

```html
<article sli-src="flower.jpg">
    <figcaption><i>Greetings from the garden!</i><br><b>— Jane</b></figcaption>
</article>
```

In the grid overview, a photo's tile does not show its caption (it would bury the tile); a frame with further content is previewed as a whole, caption included.

## Blurred backdrop (`sli-backdrop`)

A photo whose shape differs from the screen's – typically a portrait photo on a landscape projector – does not sit between black bars: the empty space is filled with a blurred, darkened copy of the photo. It belongs to the frame, so it moves and fades together with it.

* `auto` (default) – behind every photo frame (a frame holding just its photo, a [caption](#caption) aside), not behind a slide of your own layout, a video or a map
* `blur` – behind any frame with an image, slides of your own layout too
* `none` – plain black

Set it on `<main>` for the whole presentation or on a single `<article>`/`<section>`; cycle it live with <kbd>Shift+B</kbd>, or preset it with `backdrop=none` in the [URL hash](playback.md#url-hash-presets).

It costs next to nothing: the photo (its [thumbnail](#thumbnail-preview-sli-thumb), if there is one) is drawn once into a 64px picture which the browser merely stretches – nothing more is downloaded (see below for the exception), and no blur is computed while the frames move. A photo from another domain cannot be read like that unless its server allows it (`Access-Control-Allow-Origin`): then the photo is fetched once more as a CORS request and painted cheaply too. Otherwise CSS blurs the photo itself, which looks the same but costs more on a slow machine. The [data saver](playback.md#data-saver) skips that extra download.

```html
<main sli-backdrop="none"> <!-- the whole presentation in plain black … -->
    <article sli-src="portrait.jpg" sli-backdrop="auto"></article> <!-- … but this frame -->
</main>
```

## Panoramic images

When an image is much longer than the screen, we show it slowly first before resizing it to fit the screen. This delays the `<article>`'s [`sli-duration`](structure.md#sli-duration). It starts when the image proportion width / height > `sli-panorama-threshold=2`.

## Preload
When you have thousands of images, your browser may choke. Use `sli-src` instead of `src` as a preload.

```html
<img sli-src="flower.jpg" /> <!-- becomes <img src="flower.jpg"> when needed -->
```

A generator may not even know the file type. Put `sli-src` directly on an empty `<article>` and the right element is created from the file extension.

```html
<article sli-src="flower.jpg"></article> <!-- becomes <article><img sli-src="flower.jpg"></article> -->
<article sli-src="clip.mp4"></article> <!-- becomes <article><video sli-src="clip.mp4"></article> -->
```

Attributes like `sli-datetime` are inherited from the `<article>` too, so a generator can put them directly there without knowing whether it will become an `<img>` or `<video>`:

```html
<article sli-src="foto.jpg" sli-datetime="2024-01-02T10:00:00"></article>
```

## Thumbnail preview (`sli-thumb`)

If your originals are large (multi-MB photos over a slow connection), let SlideRshow show a small preview first and swap in the full file only once it has fully downloaded. Set `sli-thumb` on `<main>` (or a `<section>`, or a single `<img>`/`<video>`) to a template resolved against that element's `sli-src`:

* `{dir}` – directory of the original (`photos/2024/`)
* `{file}` – full original file name (`flower.jpg`)
* `{name}` – file name without extension (`flower`)
* `{ext}` – original extension (`jpg`)

```html
<main sli-thumb="thumbs/{name}.webp"> <!-- same folder tree, different name/extension -->
```

SlideRshow itself never generates the thumbnails. The partner tool [slidershow-builder](https://github.com/CZ-NIC/slidershow-builder/) does: its `previews` subcommand writes a 320 px WebP for every photo and video frame (re-running it only touches what changed and prunes thumbnails of deleted files):

```bash
pip install slidershow-builder
slidershow-builder previews photos --preview-dir thumbs
```

```html
<main sli-thumb="thumbs/{file}.webp"> <!-- photos/flower.jpg → thumbs/flower.jpg.webp -->
```

Subfolders are mirrored (`photos/2024/a.jpg` → `thumbs/2024/a.jpg.webp`), so for a nested tree set the template per `<section>` (`sli-thumb="thumbs/2024/{file}.webp"`). You may of course prepare the thumbnails any other way (`ffmpeg`, `imagemagick`) and point the template at them. If a thumbnail is missing or fails to load for a particular file, that file is silently loaded the usual way, no error is shown. A `sli-thumb` without any `{}` placeholder is used verbatim, so you may also override it on a single element for an irregular file:

```html
<img sli-src="photos/oddball.jpg" sli-thumb="thumbs/oddball-special.jpg" />
```

### What the stand-in looks like

While the full file downloads, the preview occupies the frame exactly like the original would –
it is scaled up to the same size, so a 300 px thumbnail does fill the whole screen. To keep that
from being mistaken for the real photo, it is rendered blurred (`filter: blur(12px)` on
`[sli-thumb-shown]`); the blur fades away over 0.3 s the moment the full-quality file is swapped
in. Restyle it in your own CSS if you prefer a sharper stand-in:

```css
[sli-thumb-shown] { filter: blur(4px); }
```

For a `<video>`, the thumbnail becomes the `poster` instead – the browser replaces it on its own
once the first frame is decodable, and it is not blurred.

The grid/ribbon overview (<kbd>g</kbd>/<kbd>j</kbd>) uses the thumbnail exclusively and never downloads the full file just to show a preview.

## Fallback source (`sli-fallback`)

Some formats do not play in every browser (e.g. HEIC/HEIF photos are decoded by Safari but not by Chrome on Windows). Set `sli-fallback` – same placeholder syntax and inheritance as `sli-thumb` – to a pre-converted alternative that is loaded automatically if `sli-src` fails to load or decode:

```html
<main sli-fallback="converted/{name}.jpg">
```

Several space-separated templates may be given – useful when a single `sli-fallback` set high up (e.g. on `<main>`) has to cover both photos and videos, which convert to different containers/extensions. Each candidate is tried in order; the first that actually loads/decodes wins:

```html
<main sli-fallback="converted/{name}.jpg converted/{name}.mp4">
```

SlideRshow never converts the files itself. [slidershow-builder](https://github.com/CZ-NIC/slidershow-builder/) does – HEIC/HEIF → JPEG and videos in codecs browsers do not play (e.g. HEVC) → H.264 MP4, in the same pass that creates the thumbnails:

```bash
slidershow-builder previews photos --preview-dir thumbs --fallback-dir fb
```

```html
<main sli-thumb="thumbs/{file}.webp" sli-fallback="fb/{file}.jpg fb/{file}.mp4">
```

If none of the candidates loads (or `sli-fallback` is empty/missing), a toast warns about the unsupported file for the frame currently being viewed (a visible thumbnail, if any, stays on screen).
