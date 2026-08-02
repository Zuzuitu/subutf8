# SubUTF8

Offline, mobile-first subtitle/text encoding converter designed for iOS via Capacitor.

## What it does
- Multi-select import: SRT, text-based SUB, ASS, SSA, VTT, SMI, TXT
- Detects UTF-8 / UTF-8 BOM / UTF-16LE / UTF-16BE and common Central/Western European legacy encodings
- Converts to UTF-8 without changing subtitle timestamps/structure
- Optional Romanian mojibake repair (including legacy ş/ţ → ș/ț)
- Individual save + batch ZIP export
- Runs locally; files are not uploaded
- PWA + Capacitor-ready

## Run locally
```bash
npm install
npm run dev
```

## Build iOS project
Requires macOS + Xcode + Node.js.
```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```
Then choose your Apple Development Team in Xcode, set bundle ID if desired, test on iPhone, and archive for TestFlight/App Store.

## Important
`.sub/.idx` (VobSub) and `.sup`/PGS are image-based subtitles and require OCR, so they are intentionally not handled by this UTF-8 text converter.
