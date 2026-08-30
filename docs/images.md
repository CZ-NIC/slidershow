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

In this example, the image starts at `[100, 10, 2]`, then zooms out `[]` (instantly, no delay), then goes slowly (note the delay parameter) to `[150,10,3,3]`. Next, while using the default `transition_duration` (note the `null` -> becomes `1.5`), we set `duration` to 0.5 second for this step only `[200,10,4,null,.5]`.

```html
<article sli-transition-duration=1.5>
    <img sli-step-points="[[100,10,2], [], [150,10,3,3], [200,10,4,null,1] , [250,10,5] , [300,10,6] , [350,10,7]]" src="..."/>
</article>
```

Position `0,0` is at the image centre. Its real dimension is taken into account so the value remains stable while changing the browser size (different displays). We recommend using the property panel (<kbd>Alt+P</kbd>) to determine the coordinates – <kbd>Alt+S</kbd> adds a point at the image's current position without even opening the panel first. Drag a point onto another one in the panel to reorder them.

<video autoplay controls muted loop playsinline width="640" src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow-assets@main/step-points.webm" title="Composing sli-step-points in the property panel and stepping through them"></video>

Every image in the sections slowly zooms out from the centre. (Images in header and footer are ignored.)

```html
<section sli-step-points="[[0,0,15,5], [0,0,1,5]]">
    <article><img src="..."/></article>
    <article><img src="..."/></article>
    <article><img src="..."/></article>
</section>
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

You prepare the thumbnails yourself (e.g. with `ffmpeg`/`imagemagick`) – SlideRshow never generates them. If a thumbnail is missing or fails to load for a particular file, that file is silently loaded the usual way, no error is shown. A `sli-thumb` without any `{}` placeholder is used verbatim, so you may also override it on a single element for an irregular file:

```html
<img sli-src="photos/oddball.jpg" sli-thumb="thumbs/oddball-special.jpg" />
```

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

You prepare the alternative file(s) yourself; SlideRshow never converts them. If none of the candidates loads (or `sli-fallback` is empty/missing), a toast warns about the unsupported file for the frame currently being viewed (a visible thumbnail, if any, stays on screen).
