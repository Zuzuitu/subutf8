SubUTF8 PWA public assets

Urcă toate fișierele din acest folder în /public pe GitHub.

Apoi adaugă în <head> din index.html:

<link rel="icon" type="image/png" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/pwa.css" />

<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="SubUTF8" />

<script defer src="/pwa-mode.js"></script>

pwa.css și pwa-mode.js se aplică efectiv doar când SubUTF8 rulează instalat ca PWA.
Site-ul normal din Safari rămâne neschimbat.
