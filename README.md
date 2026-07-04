# BagPing - native app (Capacitor)

Wraps the BagPing PWA (from `bagping-frontend`) as native iOS + Android, using Karam's icons.
Bundle/package id: `com.bionectech.bagping`. Splash/theme: #052744. Built with Capacitor 8 (iOS uses Swift Package Manager, no CocoaPods).

## What's here
- `www/`  - the BagPing web app (Karam's PWA)
- `ios/`, `android/`  - native projects (icons + permissions already applied)
- `capacitor.config.ts`  - app config
- `resources/`  - icon.png / splash.png sources (Karam's mark) for @capacitor/assets
- `codemagic.yaml`  - cloud build (iOS + Android) - no Mac needed

## Native permissions already set (from the BagPing spec)
iOS Info.plist: Location WhenInUse + Always, Bluetooth, Camera; UIBackgroundModes = location, bluetooth-central.
Android: FINE/COARSE/BACKGROUND location, BLUETOOTH_SCAN/CONNECT, POST_NOTIFICATIONS, FOREGROUND_SERVICE(_LOCATION), CAMERA.

## Push to your repo
    git init
    git add .
    git commit -m "BagPing Capacitor app - base scaffold"
    git branch -M main
    git remote add origin https://github.com/giorgosziad/bagping-app.git
    git push -u origin main

## Cloud build (Codemagic)
1. codemagic.io -> add app -> connect `bagping-app` repo (it reads codemagic.yaml).
2. iOS: add an App Store Connect API key integration named "BagPing ASC".
3. Android: create environment group `bagping_android` with your keystore vars; add a Google Play service-account JSON.
4. Run the `ios` workflow -> IPA -> TestFlight. Run `android` -> AAB -> Play internal.

## NEXT sub-phase (beacon detection - the real ping)
Not yet wired: the BagPing iBeacon detection.
- iBeacon UUID: 7B41A2C6-9E3D-4F58-B1A0-2C6E5D8F4A19 (major/minor from serial at activation)
- iOS: Core Location region monitoring/ranging; Android: filtered BLE scan (foreground service)
- Fires a rich local notification with the on-device bag photo + a proximity meter.
- Plus a Demo/Review mode so Apple can test without hardware.

## Beacon feature (NOW INCLUDED)
- `www/bagping-native.js` - Belt Radar: iBeacon detection, serial activation, proximity meter,
  photo-ping (on-device bag photo in the notification), and Demo mode.
- Included via one <script> line in index.html.
- Backend TODO: add `POST /activate {serial}` -> `{ok, beaconMajor, beaconMinor}` on bagping-backend.
  Until then the app activates locally and monitors the BagPing UUID (still detects the tag).
- Tag: set MOKO iBeacons to UUID 7B41A2C6-9E3D-4F58-B1A0-2C6E5D8F4A19.
