# did

Compact desktop work-time tracker.

**Version:** `1.0.0`  
Runs on **Windows, macOS, and Linux** from the same repo (Electron).

## Download

Installers are on the [v1.0.0 release](https://github.com/ZareSaeed/did/releases/tag/v1.0.0) page.

| Platform | Package |
|----------|---------|
| Windows | [Installer](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-win-x64-setup.exe) · [Portable](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-win-x64-portable.exe) |
| macOS | [Apple Silicon](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-mac-arm64.dmg) · [Intel](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-mac-x64.dmg) |
| Linux | [AppImage](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-linux-x86_64.AppImage) · [deb](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-linux-amd64.deb) |

## Run from source

```bash
npm install
npm start
```

## Build installers locally

```bash
npm install
npm run dist:win     # Windows setup + portable
npm run dist:mac     # macOS (requires macOS)
npm run dist:linux   # Linux AppImage + deb
```

Outputs land in `dist/`. Pushing a `v*` tag builds all platforms via GitHub Actions.

## Features

- Large **Start / Pause** button
- Optional description popup when pausing a session
- Add / select / delete projects (delete asks for confirmation)
- Each project gets a distinct color
- Session log kept forever (Timer ↔ Log tabs)
- Delete individual log rows (with confirmation)
- Select rows (click or drag) and **Copy** as spreadsheet-ready TSV
- **Open CSV** keeps a live log CSV next to app data
- Tiny GitHub button + in-app version badge
- Data saved automatically between sessions

## License

MIT
