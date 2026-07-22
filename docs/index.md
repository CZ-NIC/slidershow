# SlideRshow – more than a slideshow

[:material-play: Run now!](https://cz-nic.github.io/slidershow/slidershow.html){ .md-button .md-button--primary }

Have you ever wanted to show your friends media from holidays? How cumbersome it was to mix photos and videos? Enough of frame transitions? Dreaming about a fully customisable presentation experience? Presentation file size huge? This HTML-based presenter lets you show your contents just the way you desire. Either launch it and drag the files in, or fully define all the properties.

<!-- MEDIA: hero.webm — drop a mix of photos+videos onto the menu, hit Start, show a few transitions/zoom. Generate via Playwright once demo photos provided. -->

## Why SlideRshow?

**As a media player**

* [Nomacs](https://nomacs.org/) – perfect but does not handle videos
* [VLC](https://www.videolan.org/vlc/) – perfect but not stable with 100+ files in the playlist
* Windows Photo Viewer – cannot set the presentation order
* Google Photos viewer – instead of moving the video forward, the arrow jumps to the next image
* none support video zoom (we do)

**As an organizer**

* Simply tag photos as you browse them to be regrouped for a screening.

**As presentation software**

* Ridiculously small file size – you do not have to keep copies of media files as in other presentation software. Just link local or online files! Have you ever tried to put 1 GB of images onto slides?
* Super easy video trimming.

## Usage

The application **runs in the browser** – see the SlideRshow **[right now](https://cz-nic.github.io/slidershow/slidershow.html)**. Or download the repository and open the local file. Or just add a tag anywhere and that is all!

```html
<script src="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/slidershow/slidershow.js"></script>
```

When in the application, drag and drop media files into the page and just start the playthrough.

!!! note
    Nothing is uploaded to a server. Check the code – there is no server.

Should a more detailed presentation be needed, just export the presentation HTML file with <kbd>Ctrl+S</kbd> and edit it at will.

What can you achieve? See a variety of features in the [tutorial](https://cz-nic.github.io/slidershow/extra/tutorial.html).

Generate a presentation from a sheet with [slidershow-builder](https://github.com/CZ-NIC/slidershow-builder/).

## Where to go next

* [Playback – controls & start](playback.md) – keyboard shortcuts, splash quick-play modes, URL-hash presets.
* [Organizing & tagging](organizing.md) – thumbnails, grid multi-selection, tagging and album export.
* [Structure](structure.md) – the `<main>`/`<section>`/`<article>` model and how `sli-*` attributes resolve.

## License

GNU GPLv3.
