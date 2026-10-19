# Third-party software

LUT Builder's own code is licensed under the [MIT license](LICENSE).

Browser camera verification downloads `@ffmpeg/core` 0.12.10, an FFmpeg
WebAssembly decoder, from this site when needed. That decoder is separate
third-party software licensed under GPL-2.0-or-later, as declared by its package.
Its JavaScript wrapper, `@ffmpeg/ffmpeg` 0.12.15, is MIT-licensed.

- [FFmpeg decoder source and build recipes, v0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10)
- [JavaScript wrapper source, v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15)
- [GNU GPL version 2](frontend/public/licenses/ffmpeg-gpl-2.0.txt), also included in the built site at `licenses/ffmpeg-gpl-2.0.txt`.

The upstream build recipes identify FFmpeg and the codec libraries used to
produce the decoder. Refer to those projects for their corresponding sources
and notices. LUT generation itself does not download or use the decoder.
