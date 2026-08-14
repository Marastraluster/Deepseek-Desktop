# DeepSeek Desktop

DeepSeek Desktop packages the official DeepSeek Harness Host and renderer as an
Electron application. The application communicates with its local Host through
Electron IPC and does not start an app-owned HTTP or WebSocket server.

## Releases

Each `v*` tag creates these GitHub Release assets:

- Windows x64: NSIS installer and portable executable, signed with the
  self-signed `CN=Astraluster` certificate.
- macOS x64 and arm64: unsigned DMG and ZIP artifacts.
- Linux x64: unsigned AppImage.

Windows releases include `Astraluster.cer`. Importing that certificate into a
trusted certificate store removes the untrusted-publisher warning for that
specific certificate; SmartScreen reputation is still independent of the
certificate. On macOS, use Finder's Open action for the first launch of an
unsigned app. On Linux, mark the AppImage executable before launching it.

## Development

Node 24 and pnpm 11.19 are required for source development.

```powershell
pnpm install
pnpm harness:prepare
pnpm dev
```

Run the tests with `pnpm test`. The desktop Host and official renderer are
rebuilt automatically by `pnpm dev`.

## Packaging

Run each platform command on its native operating system:

```powershell
pnpm dist:win
pnpm dist:mac
pnpm dist:linux
```

The resulting release assets are written to `dist/`. Packaging bundles the
matching Node runtime and Host dependency closure, so end users do not need to
install Node.js or pnpm.
