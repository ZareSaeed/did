# did

Compact desktop work-time tracker — about the size of Windows Calculator.

**Version:** `1.0.0`  
Runs on **Windows, macOS, and Linux** from the same repo (Electron).

## Download

Installers are published on the [Releases](https://github.com/ZareSaeed/did/releases/latest) page.

| Platform | File |
|----------|------|
| Windows | `did-1.0.0-win-x64-setup.exe` (installer) |
| Windows | `did-1.0.0-win-x64-portable.exe` (portable) |
| macOS | `did-1.0.0-mac-arm64.dmg` / `did-1.0.0-mac-x64.dmg` |
| Linux | `did-1.0.0-linux-x64.AppImage` / `did-1.0.0-linux-x64.deb` |

Direct links (v1.0.0):

- [Windows installer](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-win-x64-setup.exe)
- [Windows portable](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-win-x64-portable.exe)
- [macOS DMG (Apple Silicon)](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-mac-arm64.dmg)
- [macOS DMG (Intel)](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-mac-x64.dmg)
- [Linux AppImage](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-linux-x64.AppImage)
- [Linux deb](https://github.com/ZareSaeed/did/releases/download/v1.0.0/did-1.0.0-linux-x64.deb)

Pushing a `v*` tag runs GitHub Actions to build all platforms and attach them to the release.

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

Outputs land in `dist/`.

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
