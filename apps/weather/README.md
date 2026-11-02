# Weather

The forecast, plus a short plain-language summary written by Claude in the voice you pick (Snarky, Marvin, Gandalf, Wise Guy and more). It's an Expo / React Native app shipped as a web build. It was moved here from [josh-sea/weather](https://github.com/josh-sea/weather) at `9592f42`. That repo, its Android builds and the EAS setup stay as they were. This copy is the web version going forward.

Live at **https://josh-cocciardi-weather.web.app** (its own Hosting site in the `josh-cocciardi` project).

## Layout

```
apps/weather/
  App.js, components/        # the app (React Native + react-native-web)
  utils/api.js               # calls /api/forecast and /api/summary
  utils/geocode.js           # place search + "where am I" (browser-safe services)
  utils/alert.js             # Alert.alert that also works on the web
  public/                    # index.html template, manifest.json, icons/
  functions/                 # Cloud Functions codebase "weather" (Node 22)
    index.js                 # weather-api: forecast proxy + Claude summaries
    prompts.js               # forecast → prompt for each timeframe
    personalities.js         # the voices
    test/                    # node --test
```

## How it works

- **Forecast:** the browser asks `GET /api/forecast?lat=&lon=`. The `weather-api` function calls [Pirate Weather](https://pirateweather.net) with the server-held key and caches the answer for 10 minutes per ~1 km square.
- **AI summary:** the browser asks `POST /api/summary` with the place, timeframe (`now`, `today`, `tomorrow`, `week`, `weekend`) and personality. The function builds the prompt from its own copy of the forecast and calls **Claude Haiku 5.5** (`claude-haiku-5-5`, low effort). The client can't send prompt text, so the endpoint can't be used as a general Claude proxy. Summaries are cached for 30 minutes. If Claude is unavailable or declines, the function returns a plain line built from the numbers instead.
- **Limits:** per visitor, 60 forecasts and 40 summaries per 10 minutes per function instance, and at most 3 instances.
- **Place search:** [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api) straight from the browser (no key). "Beacon", "Beacon, NY" and "12508" all work. `expo-location`'s geocoder doesn't run on the web.
- **Current location:** the browser's geolocation, named with OpenStreetMap's [Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/) (one call per tap, no key). On first load the app tries quietly; if the browser says no, you get the welcome screen instead of an error.
- **Saved places and personality** stay in the browser (AsyncStorage, which is localStorage on the web).

## Keys (one-time setup)

Both keys live in Firestore at **`weather_secrets/keys`**, which the rules lock away from every client:

| field | value |
|---|---|
| `pirateWeatherKey` | your Pirate Weather API key |
| `anthropicKey` | an Anthropic API key |

Firebase console → Firestore → start collection `weather_secrets` → document id `keys` → add the two string fields. The function rereads them every 5 minutes, so a new key takes effect without a deploy. Until `anthropicKey` is set, the app shows the plain fallback summaries.

## Local development

```sh
cd apps/weather && npm ci
npm run web          # dev server on localhost:8081
npm run build:web    # static export to dist/
```

On `localhost` the app calls the deployed `/api` on `josh-cocciardi-weather.web.app`. To use the functions emulator instead, set `EXPO_PUBLIC_API_BASE` (for example `http://127.0.0.1:5001/josh-cocciardi/us-central1/weather-api`) and give the emulator `PIRATE_WEATHER_KEY` and `ANTHROPIC_API_KEY` env vars, which the function uses when Firestore has no keys.

```sh
cd apps/weather/functions && npm ci && npm test
```

## Deploy

On merge to `master`, CI exports the web build, runs the function tests, and deploys `hosting:weather` and `functions:weather` in their own step. The `weather_secrets` rule goes out with the shared Firestore rules. To deploy by hand: `./deploy.sh weather`.
