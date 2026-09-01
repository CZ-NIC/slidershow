# SlideRshow – more than a slideshow

[![Run now!](https://img.shields.io/badge/Run_now!-green.svg)](https://cz-nic.github.io/slidershow/slidershow.html)
[![Docs](https://img.shields.io/badge/Docs-blue.svg)](https://cz-nic.github.io/slidershow/docs/)

Have you ever wanted to show your friends media from holidays? How cumbersome it was to mix photos and videos? Enough of frame transitions? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML-based presenter lets you show your contents just the way you desire. Either launch it and drag the files in, or fully define all the properties.

**[▶ Run it now](https://cz-nic.github.io/slidershow/slidershow.html)** · **[📖 Documentation](https://cz-nic.github.io/slidershow/docs/)** · **[✨ Tutorial](https://cz-nic.github.io/slidershow/extra/tutorial.html)**

<!-- MEDIA: hero.webm — drop a mix of photos+videos onto the menu, hit Start, show a few transitions/zoom. Generate via Playwright once demo photos provided. -->

## Why SlideRshow?

* **A media player** that handles photos *and* videos in one ordered playlist and supports video zoom — unlike Nomacs, VLC, Windows Photo Viewer or Google Photos. It scales: **10 000 photos totalling 100 GB** open as a single presentation, because the media is linked, never loaded up front.
* **An organizer** – simply tag photos as you browse them, then regroup them into albums for a screening.
* **Presentation software** with a ridiculously small file size – you link local or online files instead of copying gigabytes of media onto slides. Plus super easy video trimming.

## Quick start

The application **runs in the browser** – open the SlideRshow **[right now](https://cz-nic.github.io/slidershow/slidershow.html)**, drag & drop your media in, and start. Nothing is uploaded anywhere – there is no server.

Or embed it on any page with a single tag:

```html
<script src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/slidershow/slidershow.js"></script>
```

## Presentation names

Every presentation can have a name, which you set on the splash screen (hover the "Start presenting" label to reveal the editable field), with <kbd>Alt+N</kbd> during playback, via the export dialog (<kbd>Ctrl+S</kbd>), or by clicking the "Presentation" title in the grid overview. The name is stored in the document `<title>` (browser tab) and in the `sli-title` attribute on `<main>`, travels with exported files, and – when you export – the name is slugified to become the filename (e.g. *Dovolená 2019* → `dovolena-2019.html` instead of the generic `slidershow.html`). Several differently-named presentations can coexist under the same URL without their cached tag names interfering with each other.

To generate a presentation from a sheet, see [slidershow-builder](https://github.com/CZ-NIC/slidershow-builder/).

## Documentation

Full docs live at **[cz-nic.github.io/slidershow/docs](https://cz-nic.github.io/slidershow/docs/)**:

* [Playback – controls & start](https://cz-nic.github.io/slidershow/docs/playback/) – shortcuts, splash quick-play modes, URL-hash presets.
* [Organizing & tagging](https://cz-nic.github.io/slidershow/docs/organizing/) – thumbnails, grid multi-selection, tagging, tag export to albums.
* [Structure](https://cz-nic.github.io/slidershow/docs/structure/) – the `<main>`/`<section>`/`<article>` model and how `sli-*` attributes resolve.
* [Steps](https://cz-nic.github.io/slidershow/docs/steps/), [Images](https://cz-nic.github.io/slidershow/docs/images/), [Video](https://cz-nic.github.io/slidershow/docs/video/), [Text & maps](https://cz-nic.github.io/slidershow/docs/text-maps/) – per-content reference.

## License

GNU GPLv3.
