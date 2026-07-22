# Troubleshooting

## Media not shown: HEIF, MOV…

Some formats might not be supported in your browser. This is particularly unfortunate for the [JXL](https://caniuse.com/?search=jxl) format, which appears superior. However, it is kept restrained by [Google, who pushes WebP](https://www.reddit.com/r/programming/comments/1ajq7bj/google_is_once_again_accused_of_snubbing_the_jpeg/) instead.

Another issue arises from the patent mess surrounding x265: [HEIF](https://caniuse.com/?search=heif), [HEVC](https://caniuse.com/?search=hevc). You might have luck with a less common browser that supports these formats.

If you encounter difficulties with MOV, specifying [the right codec](https://stackoverflow.com/questions/31380695/how-to-open-mov-format-video-in-html-video-tag) might help.

See also [`sli-fallback`](images.md#fallback-source-sli-fallback) to auto-load a pre-converted alternative when a format fails to decode.
