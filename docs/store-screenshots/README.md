# Store screenshots

[Documentation](../README.md)

Listing images for App Store Connect and Google Play. Each one is a **real screen of this client**, captured from the
web export of the app (the same React Native code) running against a seeded local Gotalk server, then placed in a
device frame with a headline on the brand backdrop. They are not drawn from the static [mockups](../mockups).

## What is here

| Folder | Size | Store slot |
|---|---|---|
| `ios/iphone-6.3-inch` | 1179 × 2556 | App Store, iPhone 6.1" / 6.3" slot (7 images) |
| `ios/iphone-6.9-inch` | 1320 × 2868 | App Store, iPhone 6.9" (7 images) |
| `ios/iphone-6.5-inch` | 1284 × 2778 | App Store, iPhone 6.5" (7 images) |
| `ios/ipad-13-inch` | 2064 × 2752 | App Store, iPad 13" (6 images; the app sets `supportsTablet`) |
| `ios/app-store-header/app-store-header-3840x1646.png` | 3840 × 1646 | App Store product page header (21:9) |
| `ios/app-store-header/search-results-3840x2560.png` | 3840 × 2560 | App Store search results image (3:2) |
| `ios/app-store-header/header-and-search-5244x2950.png` | 5244 × 2950 | One 16:9 image Apple crops for both placements |
| `android/phone` | 1080 × 1920 | Google Play, phone (7 images) |
| `android/feature-graphic.png` | 1024 × 500 | Google Play feature graphic |

All files are opaque PNGs, which both stores require. The header and search results images are for iOS 27 and later
and are optional; they show the app's one-line pitch and two real screens. In the 16:9 image the text and phones stay
inside the central region that both of Apple's crops keep. Google Play tablet (7"/10") screenshots are optional and not
produced.

Notes on what the images show:

- Captures are of the web build at each device's real viewport and pixel density, with the device's safe-area insets
  applied. The status bar, Dynamic Island, punch-hole camera and home indicator are drawn on top; they are not
  captured from a device. Before submitting, compare a couple of screens with a real device build.
- The iPad frames omit the status bar. In the wide layout the sidebar and content headers sit at the very top of the
  screen, so a status bar would overlap them.
- People, places and posts are fictional seed data ([capture/seed.mjs](capture/seed.mjs)).

## Regenerating

Everything is reproducible. `raw/` holds the captures, so changing a headline or a frame only needs step 4.

1. **Server.** Build an image under its own tag so it never touches a `gotalk` stack you already run, then start the
   throwaway stack (project `gotalk-shots`, ports 18080 and 17880-17882):
   `docker build -t gotalk-server:shots <path to gotalk-server>`, then `capture/reset.sh`. The script resets the stack,
   seeds it and backdates the content, so every device class starts from the same unread state.
2. **Client.** `pnpm --filter @gotalk/app build`, then `node capture/serve.mjs` (serves the export on port 18081).
3. **Capture.** From a directory with `playwright-core` installed (`npm i playwright-core`; Google Chrome is used):
   run `capture/reset.sh`, then `node capture/capture.mjs iphone`; repeat with `android` and `ipad`, resetting before each.
4. **Compose.** `node generate.mjs` writes the images next to it. Headlines are in `COPY` at the top of that file.

Voice screens need LiveKit (it is in the compose file): three other seeded users join the call through their own
client sessions so the call is real.
