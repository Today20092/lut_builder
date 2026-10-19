# LUT Builder

Create custom false-color LUTs to check camera exposure. Choose the exposure bands and colors, then export a `.cube` file for your editing software, monitor, or compatible camera.

<p align="center">
  <a href="#roadmap"><img alt="Status: in development" src="https://img.shields.io/badge/Status-In%20development-C4A7E7?style=for-the-badge&amp;logo=github&amp;labelColor=493267"></a>
  <a href="#web-interface"><img alt="Interface: local browser" src="https://img.shields.io/badge/Interface-Local%20browser-B5DFE8?style=for-the-badge&amp;labelColor=29626B"></a>
  <a href="pyproject.toml"><img alt="Python: 3.12 or newer" src="https://img.shields.io/badge/Python-3.12%2B-F4C98B?style=for-the-badge&amp;logo=python&amp;labelColor=75512B"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-F4C98B?style=for-the-badge&amp;labelColor=75512B"></a>
</p>

[Get started](#quick-start) · [Web interface](#web-interface) · [Roadmap](#roadmap) · [User guide](docs/guide.md) · [Report a problem](https://github.com/Today20092/lut_builder/issues)

## Main goal: open your browser and make a LUT

Our highest priority is a browser-only app that anyone can use without downloading an application, installing uv or Python, or entering terminal commands. Once ready, this will be the main recommended way to use LUT Builder. The command line will remain an optional choice.

The goal is simple: open a link, choose your camera, adjust the bands and colors, save your presets in the browser, and download the `.cube` files you need. All LUT calculations should run on your device.

We want this to work wherever you are, on a computer, tablet, or phone, across browsers. Touch controls, small screens, preset storage, and file downloads are part of that goal. We will publish tested browser support and limits before release. Presets saved in one browser will not automatically appear on another device; setup export and import will let you keep a copy and move your work.

This browser-only version is not available yet. Follow [ticket #9](https://github.com/Today20092/lut_builder/issues/9) for the work. The current Workbench runs in a browser but still needs a local Python server, Git, uv, and the setup below.

The static browser build and its current feature limits are documented in the [browser support matrix](docs/browser-support.md). It is not a public entry point until its Pages deployment and browser acceptance checks are complete.

## Quick start

These instructions are for the current local version. The planned browser-only app will not need these steps.

You need [Git](https://git-scm.com/) and [uv](https://docs.astral.sh/uv/getting-started/installation/). The setup below is for Windows or macOS. uv manages Python 3.12 or newer and the project dependencies.

Open a terminal and run:

```sh
git clone https://github.com/Today20092/lut_builder.git
cd lut_builder
uv sync --locked
uv run lut-builder workspace
```

The Workbench opens at [127.0.0.1:8765](http://127.0.0.1:8765/). It runs on your computer. Keep the terminal open while you work. Press Enter or Ctrl+C in the terminal to stop it.

On Windows, you can also double-click [workspace.bat](workspace.bat) after setup.

Prefer the command line? Run:

```sh
uv run lut-builder build
```

Follow the prompts to create your LUT. A bare filename saves to `output/luts/`. You can also double-click [build.bat](build.bat) on Windows. On macOS, run `chmod +x build.command` once, then double-click [build.command](build.command).

## What you can do

- Set exposure bands in Stops, IRE, or Fill mode.
- Choose each band's color, position, and width.
- Export a 17, 33, or 65 point `.cube` LUT.
- Choose Rec.709 or Rec.2020 diagnostic output.
- Save a setup as JSON and load it again.
- Generate LUTs locally, without uploading your footage to a hosted service.

See the [user guide](docs/guide.md) for commands, examples, output paths, and how to load a LUT.

## Web interface

The Workbench is the local browser interface. You can drag exposure bands, edit their values, choose colors, and compare a demonstration image.

![Workbench showing seven exposure bands and a split demonstration preview](docs/images/workbench.jpg)

*Current interface, captured on October 18, 2026. The demonstration preview shows band colors. It does not check original camera exposure or apply the exported LUT.*

The interface is still in development. It already supports setup import and export, LUT generation, and checks on supported camera stills and selected video frames. These checks require the correct source settings. PNG decoding and video checks also need local FFmpeg; video checks need FFprobe.

See the [still guide](docs/still-verification.md) and [video guide](docs/testing/video-verification.md) for supported formats and limits.

Named palettes stay in the browser where you saved them. Use the same browser and `http://127.0.0.1:8765/` to find them again. Clearing browser storage can remove them. Export your setup as JSON to keep its applied band colors in a file.

If port 8765 is in use, close the other workspace or application using it and try again.

## Roadmap

The main priority is [browser-only LUT Builder on GitHub Pages, ticket #9](https://github.com/Today20092/lut_builder/issues/9). The intended experience is to open a link and make a LUT, including on a phone.

| Status | Work |
| --- | --- |
| Highest priority, planned | Publish the browser-only app with local calculations, saved browser presets, and direct `.cube` downloads. No application download or command-line setup. |
| Part of the browser release | Make the workflow usable with touch controls on phones and tablets, and test it across desktop and mobile browsers. |
| Available now | Local Workbench with visual band editing, color controls, previews, and LUT export. Requires local setup. |
| Available, optional path | Command-line builder with guided prompts and saved JSON setups. |
| Planned | Improve help and examples for choosing settings and making a first LUT. |
| Ongoing | Check results with real cameras and monitors, and use feedback to improve profile coverage. |

These are project priorities, not release dates. The command-line builder remains available for technical users and repeatable workflows.

## Supported camera profiles

The current catalog includes Sony S-Log3, Panasonic V-Log, Canon Log 3, ARRI LogC3, RED Log3G10, and Blackmagic Film Gen 5.

Run `uv run lut-builder list` to see the profiles and their sources. See the [profile table](docs/guide.md#supported-camera-profiles) for camera gamuts and example camera families. Match the profile to your camera's recording settings.

## Before you use a LUT

These LUTs help you check exposure. They are not a finished color grade or a normal viewing transform. They do not add tone mapping or highlight roll-off.

Match the camera profile and full or legal range to your monitoring setup. A host can scale a legal-range LUT twice if its range conversion is also enabled. Narrow color bands can look softer because of LUT size and host interpolation.

Recorded-signal warnings mark encoded RGB limits. They do not prove that the camera sensor has clipped. Check the result on your camera, monitor, or editing software before you rely on it.

## Guides and contributions

- [User and development guide](docs/guide.md) covers commands, exposure modes, saved setups, and build instructions.
- [Integration report](docs/testing/integration.md) records browser checks and known limits.
- [LUT correctness research](docs/research/false-color-lut-correctness.md) explains the calculations and source evidence.
- [Contributing](Contributing.md) explains how to propose changes and add camera profiles.
- [GitHub Issues](https://github.com/Today20092/lut_builder/issues) is the place for bug reports, profile requests, and feedback.
- [AGENTS.md](AGENTS.md) contains instructions for coding agents.

## License

[MIT](LICENSE).
