# Daily Brew Log

Every coffee I brew, logged by [Coffee Watch](https://github.com/e7h4n/coffee-watch) and published at **https://e7h4n.github.io/coffee/**.

Each brew shows TDS, extraction yield, brew ratio and time, the pour and slurry-temperature curves (from Nov 10, 2026), and tasting notes in SCA vocabulary. Brews are grouped by day, can be filtered, and up to four can be compared side by side.

## Updating the site

1. Copy the Dropbox folder `Apps/CoffeeWatch` into `raw/` (it is git-ignored and never published), or pass its path directly. For roast curves, also copy `Apps/Cardputer Roast` to `raw/roasts/cardputer/` and `Apps/CoffeeWatch/Artisan 烘焙记录` to `raw/roasts/artisan/` (or pass that folder as the second argument).
2. Regenerate the public data:
   ```sh
   npm run sync                                  # reads ./raw
   npm run sync -- ~/Dropbox/Apps/CoffeeWatch    # or any folder
   npm run sync -- raw raw/roasts                # brews folder, then roasts folder
   ```
   The script lists brews that are not curated yet.
3. Add or adjust those brews in `catalog/brews.json` (and new coffees in `catalog/beans.json`), then run `npm run sync` again.
4. Optional: `npm run preview` serves the built site at http://127.0.0.1:4173/.
5. Commit and push to `main`. GitHub Actions builds `dist/` and deploys it to Pages.

No dependencies; Node 20 or newer.

## What gets published

Only normalized, curated fields: the brew date and its cup number that day (no clock time), no device id, no Dropbox paths, and none of the free-form analysis notes from the raw records.

| File | Contents |
| --- | --- |
| `data/index.json` | All brews plus the bean catalog, with a 2 s thumbnail series for curves |
| `data/brews/<slug>.json` | One normalized brew record |
| `data/traces/<slug>.json` | Chart series: 0.5 s steps, 2 s median filter (removes valve-press spikes) |
| `data/csv/<slug>.csv` | Raw 10 Hz curve for the brew window: `t_s, weight_g, probe_c[, out_g]` |
| `data/brews.csv` | One row per brew, for spreadsheets |

TDS measurement is optional. Finished records with status `complete` or `awaiting_tds` are published; active or aborted sessions are not. Unmeasured TDS and extraction yield remain `null` (shown as missing, never as zero), and do not contribute to measured-TDS/yield statistics. The source status is not changed.

Extraction yield uses the immersion formula for the Hario Switch (`TDS / (1 - TDS) × water / dose`) and the beverage formula for the Hoop and V60 (`TDS × beverage / dose`).

## Roast batches

`catalog/roasts.json` holds one entry per roast batch, keyed by an id such as `2026-11-15-huakui-b`. Fields: `bean`, `label`, `short` (optional chart label), `date`, `machine`, `curveName`, `green`, `roasted`, `lossPct`, the marks `dry`, `fc`, `fcEnd` and `drop` (each `{ "t": seconds from charge, "bt": °C }`), `colorWhole` / `colorGround` / `colorNote` (Omni), `note`, `image` (a curve screenshot under `web/img/roasts/`), `sortKey`, and `log`. `log` points to a Cardputer Roast log under `raw/roasts` without its extension (for example `cardputer/Roast Logs/20261115-140136`); `npm run sync` reads its `.json` summary and `.csv` curve, fills in any marks and weights the catalog leaves out, and writes the curve to `data/roasts/<id>.json` (2 s steps of bean temperature, target, heater, fan and RoR). Catalog values always override the log, which is how mis-entered green weights are corrected.

A brew points at its batch with `roast` in `catalog/brews.json`; the brew then takes its bean, batch label and roast date (for days off roast) from the batch. The site shows every batch at `#/roasts`, each with its curve, marks and the brews made from it, and bean pages overlay up to four logged curves.

## Bean and brewer catalogs

Coffee display names use traceability information rather than importer, roaster or marketing names: country, known region, farm / station / producer, variety when useful, and process. Omit unknown elements; never infer a station or cultivar from a trade name. Keep roasters in `roaster`, special processing details in `processNote`, and legacy names in the private `match` keywords. Keep bean and roast IDs stable when renaming. Blends are named by their known origins or components, not an invented single origin.

The site has a page for every coffee (`#/beans`) and every brewer (`#/brewers`), built from two hand-kept files that are published as `data/beans.json` and `data/brewers.json`.

`catalog/beans.json` is keyed by bean id. Fields: `name`, `full`, `origin`, `region`, `farm`, `producer`, `altitude`, `variety`, `grade`, `process`, `processNote`, `harvest`, `roastLevel`, `source` (`Home roast`, `Commercial` or `Blend`), `roaster`, `roastDate` (bag date for commercial coffee), `roastNote`, `bagNotes`, `note`, and `match` (keywords used to recognise the bean in raw notes; not published). Roast batches live in `catalog/roasts.json` (above).

`catalog/brewers.json` is keyed by the brewer code that Coffee Watch writes (`Switch`, `Hoop`, `V60`). Fields: `name`, `maker`, `type`, `material`, `formula` (`immersion` or `beverage`), `method`, `notes`. A new brewer code in the raw records is reported by `npm run sync` until it is added here.

`catalog/gear.json` lists everything else on the Gear page (`#/gear`): logging hardware, refractometer, scales and grinders, grouped by `categories`. Each item has `name`, `maker`, `role`, optional `specs` (`[label, value]` pairs), `link` / `linkLabel` and `since`. Usage counts come from the brews: `grinder` matches the grinder code, `twoScale` counts two-scale brews, `tds` counts TDS readings and `curves` counts brews with a curve. Brewers on that page come from `catalog/brewers.json`. Published as `data/gear.json`.

## Curation fields

`catalog/brews.json` is keyed by the record id without its device prefix (`<random>-<seq>`, or the full `manual-…` id). Every field is optional:

| Field | Meaning |
| --- | --- |
| `roast` | Roast batch id in `catalog/roasts.json`; sets the bean, batch label and roast date |
| `bean`, `batch`, `roastDate` | For coffees without a roast batch: key in `catalog/beans.json`, a free-text batch label and the roast date (`YYYY-MM-DD`) |
| `brewer` | Confirmed actual brewer code from `catalog/brewers.json`, overriding a mislabeled watch record without changing the raw source |
| `grinder`, `grind` | `C40` or `MAVO` (Phantox Pro), and the setting |
| `valve` | Valve-open time in seconds, when the record does not have it |
| `rating` | `liked`, `ok` or `disliked` |
| `flavor` | Descriptors from the SCA Coffee Taster’s Flavor Wheel, e.g. `["Strawberry", "Lemon"]` |
| `tastes` | SCA CVA main tastes with intensity, e.g. `[["Sour", "medium"], ["Sweet", "high"]]` |
| `mouthfeel` | SCA CVA mouthfeel terms such as `Mouth-Drying`, `Smooth`, plus `Light body` / `Full body` |
| `note` | One-sentence tasting note in the same vocabulary |
| `method`, `correction` | Brew method notes, and any data correction applied to the record |
| `order` | `HH:MM` used only to order hand-entered records within their day |

A raw record can carry the same fields under `notes.sca`; values in `catalog/brews.json` take precedence. Without either, the bean is matched from `notes.bean` using the `match` keywords in `catalog/beans.json`.
