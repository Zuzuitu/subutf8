<div align="center">
  <img src="public/logo-subutf8.png" alt="SubUTF8" width="420" />

# SubUTF8

**Convert subtitle files to UTF-8, repair broken Romanian characters, and process multiple files locally on your device.**

[![Live](https://img.shields.io/badge/live-srt.alexlab.media-0A84FF)](https://srt.alexlab.media)
[![PWA](https://img.shields.io/badge/PWA-installable-34C759)](https://srt.alexlab.media)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](LICENSE)

**[Open SubUTF8](https://srt.alexlab.media)**
</div>

---

## What is SubUTF8?

SubUTF8 is a lightweight, mobile-first subtitle encoding converter built for quick use on iPhone, Android, tablet and desktop.

Its main purpose is simple: take subtitle text files that use legacy encodings or contain incorrectly displayed Romanian characters and produce clean UTF-8 files without changing subtitle timing or structure.

All conversion happens locally in the browser. Subtitle contents are not uploaded to an alexlab.media server.

## Features

- Multi-file import and batch processing
- Automatic encoding detection for common subtitle encodings
- UTF-8 conversion while preserving subtitle structure and timestamps
- Automatic repair for incorrectly displayed Romanian characters
- Legacy Romanian `ş` / `ţ` normalization to `ș` / `ț`
- Individual file download
- Batch ZIP export
- Original filenames are preserved
- Local, browser-side processing
- Installable PWA for an app-like experience
- Capacitor-ready project structure for native iOS packaging
- Responsive interface for phone, tablet and desktop

## Supported text subtitle formats

| Format | Support |
| --- | --- |
| `.srt` | ✅ |
| `.sub` (text-based) | ✅ |
| `.ass` | ✅ |
| `.ssa` | ✅ |
| `.vtt` | ✅ |
| `.smi` | ✅ |
| `.txt` | ✅ |

### Image-based subtitles

`.sub/.idx` (VobSub) and `.sup` / PGS subtitles are image-based formats and require OCR. They are intentionally outside the scope of SubUTF8.

## Encoding support

SubUTF8 handles or detects common subtitle encodings including:

- UTF-8
- UTF-8 with BOM
- UTF-16 LE
- UTF-16 BE
- Windows-1250
- Windows-1252
- ISO-8859-2

The converter then outputs UTF-8 encoded text.

## Romanian character repair

The optional repair pass fixes common incorrectly displayed Romanian text, including mappings such as:

```text
ÅŸ → ș
Å£ → ț
Åž → Ș
Å¢ → Ț
ş  → ș
ţ  → ț
```

The feature is intended to repair text encoding artifacts only. It does not rewrite subtitle dialogue or timing.

## Privacy

SubUTF8 was designed around local processing:

- files are read directly by the browser;
- subtitle contents are processed on the user's device;
- converted files are generated locally;
- no account is required;
- no subtitle upload API is required.

The public deployment is hosted at **[srt.alexlab.media](https://srt.alexlab.media)**.

## Install as an app

SubUTF8 is a Progressive Web App.

### iPhone / iPad

1. Open `srt.alexlab.media` in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Enable **Open as Web App** when the option is available.

### Other supported browsers

Use the browser's **Install app** / **Add to Home Screen** option when offered.

## Run locally

Requirements:

- Node.js
- npm

```bash
npm install
npm run dev
```

Vite will start the local development server.

## Production build

```bash
npm install
npm run build
```

The production output is generated in `dist/`.

## Native iOS project with Capacitor

A native iOS wrapper can be generated on macOS with Xcode:

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

Then select an Apple Development Team in Xcode and configure signing as needed.

## Technology

- React 19
- TypeScript
- Vite
- Capacitor
- `fflate` for ZIP generation
- `iconv-lite` / browser decoding support for legacy text encodings
- Cloudflare Pages for the public web deployment

## Security

Please see [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

Do not publish security-sensitive exploit details in a public issue.

## Support the project

If SubUTF8 is useful to you and you would like to support its continued development, you can optionally buy me a beer through PayPal:

**🍺 [Support SubUTF8 via PayPal](https://www.paypal.me/AlexandruCiobanu00)**

Support is entirely optional and does not unlock features.

## License

SubUTF8 is **source-available but proprietary software**.

Copyright © 2026 Zuzuitu / alexlab.media. All rights reserved.

The repository is public for transparency, inspection and project visibility. Public availability of the source code does **not** grant permission to copy, modify, redistribute, rebrand, publish, sell, sublicense, host or incorporate SubUTF8 or substantial portions of its code into another project without prior written permission from the copyright holder.

See [LICENSE](LICENSE) for the complete terms.
