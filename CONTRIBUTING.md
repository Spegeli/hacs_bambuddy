# Contributing

Thanks for your interest in improving this integration. This is a small personal project, so the process is deliberately light.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a security vulnerability** — privately, never as a public issue: see the [security policy](SECURITY.md).
- **Report a bug** — [open a bug report](https://github.com/Spegeli/hacs_bambuddy/issues/new?template=bug_report.yml). The versions of the integration, BamBuddy and Home Assistant, and a debug log, help most.
- **Suggest a feature** — [open a feature request](https://github.com/Spegeli/hacs_bambuddy/issues/new?template=feature_request.yml).
- **Improve translations** — corrections and new languages are welcome, see [Translations](#translations).
- **Submit a change** — see [Pull requests](#pull-requests).

Problems with BamBuddy itself — its web interface, its printer connection — belong to [BamBuddy's issue tracker](https://github.com/maziggy/bambuddy/issues).

## Branches

- **`main`** holds the released code. It changes only through the pull request from `dev` and through a release's version commit.
- **`dev`** is where work comes together.
- **Topic branches** start from `dev` and go back into it.

## Pull requests

1. Fork the repository and branch from `dev`.
2. Keep the change focused — one topic per pull request.
3. Write the commit messages as [Conventional Commits](https://www.conventionalcommits.org).
4. Open the pull request against `dev` and fill in the template.
5. Validate checks it automatically with Home Assistant's and HACS's checks of the integration. A first-time contributor's run waits for the maintainer's approval.

**Do not bump the version in `manifest.json`.** The release workflow sets it.

## Development setup

No build step and no dependencies beyond Home Assistant itself.

1. Fork and clone the repository.
2. Copy `custom_components/bambuddy/` into your Home Assistant `config/custom_components/` directory — or symlink it, so edits apply without copying again.
3. Restart Home Assistant.
4. Add the integration: **Settings → Devices & services → Add integration → BamBuddy**.

You need a BamBuddy server and an API key (see the README's [Create an API key](README.md#create-an-api-key)). Test with BamBuddy's authentication on, so that the key's permissions apply, and with a key that has only **Read Status** unless you work on the print controls. **Try the print controls only on a printer that is not printing**: pause, stop and the other commands act on the real printer.

To see what the integration is doing, enable debug logging in `configuration.yaml`:

```yaml
logger:
  logs:
    custom_components.bambuddy: debug
```

## Project layout

Everything lives in `custom_components/bambuddy/`:

| File | Responsibility |
|---|---|
| `__init__.py` | Setup and unload; one coordinator per printer added in the options; deleting a printer's device from its device page (the instance's device cannot be deleted) |
| `api.py` | `BamBuddyClient` — all HTTP calls to BamBuddy |
| `binary_sensor.py` | Printer binary sensors: online, SD card, HMS errors, wired network, developer mode |
| `brand/` | Icon and logo for Home Assistant's brands proxy |
| `button.py` | Printer buttons: pause, resume, stop, clear HMS errors, clear plate, refresh status |
| `camera.py` | MJPEG stream and snapshot through BamBuddy's camera proxy, with a stream token kept for 55 minutes |
| `config_flow.py` | Setup (host, port, API key) and the options (Configure): add and remove printers |
| `const.py` | Domain, config keys, default port, update interval, print speed modes |
| `coordinator.py` | The instance coordinator (`/health`, `/system/info`, `/archives/stats`) and one coordinator per printer (`/printers/{id}`, `/printers/{id}/status`) |
| `entity.py` | `BamBuddyPrinterEntityMixin` — the printer device's info, shared by every printer entity |
| `image.py` | The cover image of the current print job |
| `select.py` | Print speed |
| `sensor.py` | Instance and printer sensors |
| `strings.json`, `translations/` | UI strings, two languages (see [Translations](#translations)) |
| `switch.py` | Chamber light |

Both coordinators poll every 10 seconds.

## Things that are easy to get wrong

**`/health` lies outside `/api/v1` and needs no key.** Every other endpoint is under `/api/v1` and needs the `X-API-Key` header.

**BamBuddy's field names are not always the obvious ones.** The current layer is `layer_num`, not `current_layer`; `remaining_time` is in minutes; the print speed is `speed_level` (1 Silent, 2 Standard, 3 Sport, 4 Ludicrous); the auxiliary and chamber fans are `big_fan1_speed` and `big_fan2_speed`.

**Printers without a chamber sensor report `temperatures.chamber` as `null`** — the A1 Mini, for one. The Chamber Temperature sensor is created only when the printer reports a value at setup.

**Never set `model_id` on a device:** Home Assistant then shows the model twice. A printer's model reads `BamBuddy Printer (<model>)`.

**Permissions count only with BamBuddy's authentication on.** With it off, BamBuddy answers every request, so a missing permission shows only with authentication on. Test with it on: with a key that has only **Read Status**, the print controls must fail with 403.

**Home Assistant 2025.1 is the floor** (`homeassistant` in `hacs.json`): use only Home Assistant APIs that exist there.

## Translations

The integration ships two languages under `translations/`: English (`en`) and German (`de`). Corrections and new languages by native speakers are welcome.

`strings.json` is the source of truth, and `translations/en.json` mirrors it exactly. **Changing a text means changing it in every translation file**: edit `strings.json`, copy it to `translations/en.json`, and change the same key in `translations/de.json` in the same pull request. A new key goes into every file.

Entity names are not translated yet: they are English, set in the code.

Which language a text is shown in depends on who writes it out:

- **Home Assistant's frontend**, in each user's profile language: the setup and options dialogs.
- **Home Assistant's backend**, in its system language: the integration's error messages (`exceptions`), such as the refusal to delete the BamBuddy instance's device.

Write the files as UTF-8 without a BOM, formatted like the others (`json.dumps(..., indent=2, ensure_ascii=False)`).

## Code style

Follow the [Home Assistant developer guidelines](https://developers.home-assistant.io/docs/development_guidelines). In short:

- Type hints on everything new.
- Docstrings on modules, classes and public functions.
- `async`/`await` for anything touching the network.
- Constants in `const.py`, not inline.

## After merging

- A change on `dev` reaches `main` with the next pull request from `dev`.
- Installations get it with the next release.

## License

Contributions are licensed under the repository's [MIT License](LICENSE).
