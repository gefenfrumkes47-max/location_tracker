# 📡 Real-Time Boat Location Tracker

A two-device web application for sharing location between two iPhones on separate sailboats. Displays real-time distance, bearing, and tilt — with an audio beeping system that tells sailors the relative heel direction of the other boat, even in noisy conditions.

---

## Project Structure

```
location-tracker/
├── server.js        ← Node.js server with Socket.IO
├── package.json     ← Dependencies
├── README.md
└── public/
    └── index.html   ← Full client-side app (HTML + CSS + JS in one file)
```

---

## Deployment (Railway — free tier)

1. Create a new GitHub repository and push all files
2. Go to [railway.app](https://railway.app) → **Start a New Project** → **Deploy from GitHub repo**
3. Select your repository — Railway auto-detects Node.js
4. Click **Generate Domain** to get a public HTTPS URL
5. Open the URL in Safari/Chrome on both iPhones
6. Grant GPS permissions when prompted

> **Important:** The app requires HTTPS for GPS and DeviceOrientation to work on iOS. Railway provides this automatically.

---

## Architecture Overview

```
iPhone A                        Server                        iPhone B
────────                        ──────                        ────────
GPS (filtered)  ──── Socket.IO ──→  broadcast  ──→  receive location
Tilt + tiltSide ────────────────→              ──→  audio beep decision
                ←── device-count ←──────────────────
```

The server is intentionally **thin** — it only relays messages between the two devices and enforces the 2-device limit. All the signal processing happens on the client.

---

## Server (`server.js`)

### 2-Device Limit

```js
const MAX_DEVICES = 2;
let connectedCount = 0;
```

When a third device tries to connect, the server immediately emits a `server-full` event to that socket and disconnects it. All connected devices receive a `device-count` update whenever someone connects or disconnects, so the status display stays accurate.

---

## Client (`public/index.html`)

The entire client is a single HTML file with embedded CSS and JavaScript. Below is a section-by-section breakdown.

---

### 1. GPS — Raw Input

```js
navigator.geolocation.watchPosition(callback, errorHandler, {
  enableHighAccuracy: true,
  maximumAge: 0,         // never use cached positions
  timeout: 10000
});
```

`maximumAge: 0` forces the device to always request a fresh fix from the hardware GPS chip, never serving a stale cached position. `enableHighAccuracy: true` uses the GPS chip rather than cell/Wi-Fi triangulation.

Every new fix carries a `coords.accuracy` value (in metres) — the device's own estimate of its position error. This number is fed directly into the Kalman filter as the measurement noise.

---

### 2. Kalman Filter

This is the core of the GPS processing pipeline. The goal is to produce a smooth, stable position estimate that follows real boat movement while suppressing noise from waves and GPS jitter.

#### Why Kalman?

A simple moving average introduces **lag** — if the boat turns, the average takes several seconds to catch up. Kalman filter solves this by maintaining a **velocity estimate** alongside position, so it can predict where the boat will be next and weight each new GPS reading against that prediction.

#### State Vector

Each axis (latitude, longitude) has its own independent 1D filter with a 2-element state:

```
state = [ x,  v ]
         ↑    ↑
      position  velocity (degrees/second)
```

Using two separate 1D filters instead of one 4D filter is valid here because boats move slowly enough that the lat/lng axes don't meaningfully correlate.

#### The Two-Step Cycle

Every time a new GPS fix arrives, the filter runs two steps:

**Step 1 — Predict**

Using the current position and velocity, project forward by `dt` seconds (time since the last fix):

```
x_predicted = x + v × dt
v_predicted = v          (constant velocity assumption)
```

The **covariance matrix P** is also predicted forward — it grows over time, representing increasing uncertainty the longer we go without a measurement:

```
P' = F × P × Fᵀ + Q
```

where `F` is the motion matrix `[[1, dt], [0, 1]]` and `Q` is the process noise that prevents the filter from becoming overconfident.

**Step 2 — Update**

When the new GPS measurement `z` arrives, compute how surprising it is:

```
innovation = z - x_predicted
```

Then compute the **Kalman gain** `K` — a number between 0 and 1 that decides how much to trust the new measurement versus the prediction:

```
K = P' / (P' + R)
```

where `R` is the **measurement noise**, derived directly from `coords.accuracy`:

```js
R = (accuracy_metres / 111320)²
// 111320 metres per degree of latitude
```

If `accuracy` is small (say 3 m), `R` is tiny, `K` approaches 1, and the filter trusts the GPS almost completely. If `accuracy` is large (say 20 m, common when the boat heels or the sky is obscured), `K` drops and the filter mostly sticks with its own prediction.

Finally, blend prediction and measurement:

```
x_new = x_predicted + K × innovation
v_new = v_predicted + K_v × innovation
P_new = (I - K) × P'
```

#### Constants

| Constant | Value | Meaning |
|---|---|---|
| `GPS_PROCESS_NOISE` | `1e-9` | How much the filter trusts its own motion model. Higher = more responsive, less smooth. |
| `GPS_MIN_MEAS_NOISE` | `1e-8` | Floor for measurement noise — even a "perfect" GPS reading gets this minimum uncertainty. |
| Initial covariance P | `[[1e-4, 0], [0, 1e-6]]` | High initial uncertainty so the filter locks onto the first few fixes quickly. |

---

### 3. Bearing Calculation & Smoothing

Once both filtered positions are known, bearing is calculated with the **Haversine formula** (accounts for Earth's curvature):

```js
function calcBearing(lat1, lon1, lat2, lon2) { ... }
// Returns 0–360°: 0 = North, 90 = East, 180 = South, 270 = West
```

Raw bearing still jitters ±2–5° even after Kalman filtering, because small GPS errors get amplified when boats are close. A **circular moving average** over the last 5 bearings smooths this out:

```js
// Average sin and cos separately to handle the 0°/360° wrap correctly
sinSum += Math.sin(bearing_i)
cosSum += Math.cos(bearing_i)
smoothed = atan2(sinSum, cosSum)
```

A naive numeric average would fail near North — averaging 355° and 5° would give 180° (South) instead of 0° (North). The sin/cos method handles this correctly.

---

### 4. Tilt Sensing & Smoothing

The device's **gamma** axis from `DeviceOrientationEvent` measures left/right tilt in degrees:
- Negative = leaning left
- Positive = leaning right

**Rolling 10-second average:** Raw samples are stored in a buffer with timestamps. Samples older than 10 seconds are dropped. The average of all remaining samples is the smoothed tilt. This absorbs wave motion (typically 2–4 second period) while still responding to a real change in heel within ~5 seconds.

**Hysteresis:** Once the smoothed tilt crosses ±5°, the filter commits to that side and won't flip back until the tilt crosses the threshold in the other direction. This prevents the audio from toggling rapidly when the boat is sailing nearly upright.

```
tiltSide: -1 = left, 0 = centre, +1 = right
```

`tiltSide` is computed **once on the sending device** and transmitted to the receiving device. The receiver uses it directly — no second hysteresis pass. This was an earlier bug: running hysteresis twice in series caused double lag and "stickiness" before the beep frequency would change.

---

### 5. Throttled Transmission

`DeviceOrientationEvent` fires 30–60 times per second on iOS. Emitting to the server at that rate wastes bandwidth and battery. A simple timestamp gate limits actual sends to ~3 per second (every 333 ms):

```js
function throttledEmit() {
  if (Date.now() - lastEmitTs < 333) return;
  lastEmitTs = Date.now();
  socket.emit("send-location", { lat, lng, tilt, tiltSide });
}
```

---

### 6. Audio Beeping System

The audio engine uses the **Web Audio API** with self-scheduling (not `setInterval`) for reliable timing on all mobile browsers.

**Frequency:**
- `1400 Hz` — other boat heeling right (positive tiltSide)
- `320 Hz` — other boat heeling left (negative tiltSide)
- Silent — tiltSide is 0 (upright)

**Volume vs. Distance:**

| Distance | Gain |
|---|---|
| ≤ 21 m | 100% of slider value |
| 21–70 m | Linear falloff |
| ≥ 70 m | 5% (audible floor) |

The master volume slider scales the entire curve — its maximum maps to 100% of the slider position.

**iOS compatibility fixes:**
- `AudioContext` is created **inside** the button tap handler — iOS blocks audio creation outside a user gesture
- `audioCtx.resume()` is awaited as a Promise before starting the beep chain
- A `visibilitychange` listener re-resumes the context when the screen wakes up — iOS suspends `AudioContext` in the background

**Self-scheduling pattern:**
```js
function scheduleBeep() {
  // ... play one beep ...
  osc.onended = () => {
    setTimeout(scheduleBeep, gap);  // schedule the next one
  };
}
```
This is more reliable than `setInterval` on mobile because it ties the next beep to the actual completion of the previous one, not a wall-clock timer that can drift or be throttled by the browser.

---

### 7. Compass & Calibration

The compass reads heading from `DeviceOrientationEvent`:
- On iOS: uses `webkitCompassHeading` (true north, pre-corrected)
- On Android/desktop: uses `event.alpha` from `deviceorientationabsolute` (requires absolute orientation support)

**Calibration overlay:** At startup, the user can point their phone directly at the other boat and press "Calibrate." This captures the current `bearing - heading` difference as a `calibrationOffset`. All subsequent arrow displays subtract this offset so the arrow points forward (relative to the user's body) rather than toward magnetic north.

---

## Key Parameters You Can Tune

| Location | Constant | Default | Effect |
|---|---|---|---|
| Kalman | `GPS_PROCESS_NOISE` | `1e-9` | ↑ = more responsive, less smooth |
| Kalman | `GPS_MIN_MEAS_NOISE` | `1e-8` | ↑ = always smoother regardless of accuracy |
| Bearing | `BEARING_WINDOW` | `5` | ↑ = smoother arrow, more lag |
| Tilt | `TILT_WINDOW_MS` | `10000` | ↑ = less jitter, slower response |
| Tilt | `TILT_HYSTERESIS` | `5°` | ↑ = harder to flip sides |
| Audio | `DIST_NEAR` | `21 m` | Below this = max volume |
| Audio | `DIST_FAR` | `70 m` | Above this = minimum volume |
| Audio | `FREQ_HIGH` | `1400 Hz` | Tone for right heel |
| Audio | `FREQ_LOW` | `320 Hz` | Tone for left heel |
| Network | `EMIT_INTERVAL_MS` | `333 ms` | Transmission rate (~3 Hz) |
