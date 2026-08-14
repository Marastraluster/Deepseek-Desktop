# Cross-Platform Release Design

## Goal

Publish the existing Electron desktop client from
`Marastraluster/Deepseek-Desktop` for Windows, macOS, and Linux without
changing the official DeepSeek Harness renderer, Host, or IPC architecture.

## Release Artifacts

Each tagged release produces native artifacts from a matching GitHub-hosted
runner:

- Windows x64: NSIS installer and portable executable.
- macOS universal: DMG and ZIP archive.
- Linux x64: AppImage.

Every artifact bundles the matching Node 24 runtime and the deployed Host, so
end users do not need Node.js, pnpm, or a separately running Harness service.

## Branding

`resources/icons/DeepSeek_AppleStyle.ico` is the source branding asset.
Windows consumes the ICO directly. The release preparation step generates and
uses a macOS ICNS file and Linux PNG icon set from the same artwork, so all
platforms display the same icon design in their native formats.

## Signing Policy

Windows artifacts are Authenticode-signed using a self-signed certificate whose
subject is `CN=Astraluster`. The certificate is generated only in the Windows
release job and is never committed. The job signs the unpacked application,
NSIS installer, and portable executable.

Because the issuer is self-signed, Windows systems that have not imported the
certificate will still show SmartScreen or an untrusted-publisher warning. The
release includes the public certificate (`Astraluster.cer`) for users who want
to add it to their trusted certificate store.

macOS artifacts remain unsigned and unnotarized because no Apple Developer
certificate is available. Linux artifacts remain unsigned.

## Build Flow

`scripts/package-release.mjs` performs platform-independent staging:

1. builds the Host, IPC packages, official renderer bootstrap, and Electron
   application;
2. obtains the exact platform/architecture Node 24 archive listed in
   `resources/node/checksums.json`, verifies SHA-256, and stages it under
   `resources/node`;
3. deploys the production Host dependency closure, required Harness patches,
   licenses, and build identity under `resources/host`;
4. invokes Electron Builder with the current platform target.

The same script works on Windows, macOS, and Linux. Runtime path resolution
uses the bundled `node.exe` on Windows and `node` under `resources/node/bin`
on macOS/Linux.

## Automation And Publication

`.github/workflows/release.yml` runs the test suite before releasing, then
fans out to Windows, macOS, and Linux runners. It uploads artifacts and their
SHA-256 checksums to the GitHub Release created for a pushed `v*` tag. The
workflow uses repository `contents: write` permission only for release assets.

Source is pushed to the repository default branch. Releases are tag-driven;
ordinary source pushes run validation only and do not create releases.

## Verification

Release tests assert all three packaging commands, per-platform Node archive
metadata, native artifact targets, icon declarations, and release workflow
matrix. Local Windows verification builds and launches the Windows artifacts.
The GitHub Actions matrix is the authoritative verification for macOS and
Linux native artifacts.
