<p align="center">
  <img src="docs/assets/deepseek-desktop-logo.png" alt="DeepSeek Desktop" width="160" />
</p>

<h1 align="center">DeepSeek Desktop</h1>

<p align="center">
  A desktop client built on DeepSeek Harness
</p>

<p align="center">
  <a href="README.md">简体中文</a> | <a href="README.en.md">English</a>
</p>

DeepSeek Desktop is an Electron client for local development work. It is an
iteration built on the official Host and renderer architecture of
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), bringing
Harness agent workflows to Windows, macOS, and Linux desktops.

> This is a community-maintained desktop implementation. It is not an official
> DeepSeek client and does not represent DeepSeek endorsement.

## Features

- **Harness-based architecture**: Reuses the DeepSeek Harness Host, client
  connection layer, and official Web renderer. It is not a WebUI wrapped in a
  browser window.
- **Native desktop communication**: The Electron main process communicates with
  the local Host through Electron IPC. The application does not run an
  application-owned HTTP or WebSocket server.
- **Workspaces and sessions**: Select local workspaces, create sessions, and
  move between sessions in one desktop client.
- **Agent presets**: Choose an Agent preset to adjust collaboration behavior by
  task type.
- **Ready-to-run releases**: Packages include the matching Node runtime and
  Host dependency closure, so end users do not need Node.js or pnpm.
- **Source development remains available**: Install dependencies, run the
  development client, test, and produce native packages from source.
- **Three-platform delivery**: The release workflow targets Windows x64,
  macOS Intel/Apple Silicon, and Linux x64.

## Download a Release

Download the package for your platform from
[GitHub Releases](https://github.com/Marastraluster/Deepseek-Desktop/releases):

- Windows x64: NSIS installer and portable EXE.
- macOS Apple Silicon (arm64): DMG and ZIP. Current builds are unsigned and
  unnotarized; use Finder's Open action for the first launch. Intel Mac does
  not currently have a prebuilt package; build it from source with `pnpm dist:mac`.
- Linux x64: AppImage. Mark the downloaded file executable before launching.

Windows builds use a `CN=Astraluster` self-signed certificate. Each release
includes the `Astraluster.cer` public certificate. Importing it into a trusted
certificate store removes the warning for this certificate, but does not
establish Microsoft SmartScreen reputation.

## Run from Source

Node.js 24 and pnpm 11.19 are required.

```powershell
pnpm install
pnpm harness:prepare
pnpm dev
```

`pnpm dev` builds the desktop connection layer, Host, and plugins required by
the official renderer before starting Electron.

Useful commands:

```powershell
pnpm test
pnpm build
pnpm dist:win
pnpm dist:mac
pnpm dist:linux
```

Build native packages on their matching operating systems. Artifacts are
written to `dist/`. See [docs/release.md](docs/release.md) for the full release
process.

## Project Layout

- `apps/desktop-main/`: Electron main process, window lifecycle, and IPC
  boundary.
- `apps/desktop-renderer/`: Desktop entry point based on the official Harness
  renderer.
- `packages/desktop-connection/`: Connection implementation between Host and
  renderer.
- `vendor/deepseek-harness/`: DeepSeek Harness, referenced as the upstream
  source.
- `scripts/`: Harness preparation, release staging, and local packaging.

## Recommended Next Steps

1. **Stabilize the Windows experience first**: Add end-to-end coverage for
   first launch, workspace switching, new sessions, Agent presets, error
   recovery, and diagnostic-log export.
2. **Add cross-platform smoke validation**: Exercise first launch, file
   permissions, window behavior, and Host lifecycle on real macOS and Linux
   machines instead of relying only on successful packaging.
3. **Improve updates and diagnostics**: Add an auditable update strategy, a
   version page, and one-click export of redacted diagnostic logs.
4. **Manage settings and secrets**: Persist workspace preferences, model/service
   settings, and credentials separately; store sensitive values in the system
   credential store where possible.
5. **Improve usability**: Add keyboard navigation, accessible semantics,
   localized UI, and high-DPI display testing.
6. **Define an extension boundary**: Design a permission-constrained extension
   mechanism for commands, tools, and workflow presets without changing the
   Harness core protocol.

## Acknowledgements and License

This project is iterated from
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Upstream
Harness licenses, copyrights, and third-party notices continue to apply to the
corresponding upstream code. Additions in this repository are available under
the [MIT License](LICENSE).
