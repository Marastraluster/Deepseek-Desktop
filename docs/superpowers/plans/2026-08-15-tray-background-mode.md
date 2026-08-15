# Tray Background Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep DeepSeek Desktop running in the system tray after its window is closed, and only exit through the tray context menu.

**Architecture:** Put platform-neutral window lifecycle rules in a small pure TypeScript module, so they can be tested without launching Electron. Wire that module to Electron's `Tray`, `Menu`, `BrowserWindow`, and application quit lifecycle in `main.ts`, retaining the runtime supervisor's existing single shutdown owner.

**Tech Stack:** Electron 40, TypeScript, Vitest, electron-builder.

## Global Constraints

- Support Windows, macOS, and Linux through Electron's cross-platform `Tray` API.
- Use `resources/icons/DeepSeek_AppleStyle.png` as the packaged tray icon.
- Do not add renderer-side IPC or alter conversation state.
- The Harness Host must continue after an ordinary window close and stop exactly once during explicit quit.

---

### Task 1: Testable Background Lifecycle Rules

**Files:**
- Create: `apps/desktop-main/src/lifecycle/background-mode.ts`
- Create: `tests/lifecycle/background-mode.test.ts`

**Interfaces:**
- Produces `hideWindowOnClose(event, window, explicitQuit): boolean` where `true` means the close was converted to hide.
- Produces `shouldKeepProcessAlive(explicitQuit): boolean`.
- Consumes only structural window/event interfaces; it must not import Electron.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { hideWindowOnClose, shouldKeepProcessAlive } from '../../apps/desktop-main/src/lifecycle/background-mode.ts'

describe('background mode lifecycle', () => {
  it('hides an ordinary close and keeps the process alive', () => {
    const event = { preventDefault: vi.fn() }
    const window = { hide: vi.fn(), isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    expect(hideWindowOnClose(event, window, false)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    expect(shouldKeepProcessAlive(false)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lifecycle/background-mode.test.ts`

Expected: FAIL because `background-mode.ts` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export interface ClosableWindow {
  hide(): void
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function hideWindowOnClose(event: { preventDefault(): void }, window: ClosableWindow, explicitQuit: boolean): boolean {
  if (explicitQuit) return false
  event.preventDefault()
  window.hide()
  return true
}

export function shouldKeepProcessAlive(explicitQuit: boolean): boolean {
  return !explicitQuit
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lifecycle/background-mode.test.ts`

Expected: PASS with an ordinary close hidden and process retention asserted.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-main/src/lifecycle/background-mode.ts tests/lifecycle/background-mode.test.ts
git commit -m "feat: add testable background window lifecycle"
```

### Task 2: Wire the System Tray and Explicit Quit

**Files:**
- Modify: `apps/desktop-main/src/main.ts:1-91`
- Modify: `tests/lifecycle/background-mode.test.ts`

**Interfaces:**
- Consumes `hideWindowOnClose`, `showWindow`, and `shouldKeepProcessAlive` from `./lifecycle/background-mode.ts`.
- Produces a module-scoped `Tray` and `explicitQuit: boolean` state.

- [ ] **Step 1: Extend the failing lifecycle test**

```ts
import { showWindow } from '../../apps/desktop-main/src/lifecycle/background-mode.ts'

it('allows explicit quit and restores a minimized window', () => {
  const event = { preventDefault: vi.fn() }
  const window = { hide: vi.fn(), isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
  expect(hideWindowOnClose(event, window, true)).toBe(false)
  expect(event.preventDefault).not.toHaveBeenCalled()
  expect(shouldKeepProcessAlive(true)).toBe(false)
  showWindow(window)
  expect(window.restore).toHaveBeenCalledOnce()
  expect(window.show).toHaveBeenCalledOnce()
  expect(window.focus).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lifecycle/background-mode.test.ts`

Expected: FAIL because `showWindow` is not exported yet.

- [ ] **Step 3: Implement the Electron wiring**

```ts
export function showWindow(window: ClosableWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'

let tray: Tray | undefined
let explicitQuit = false

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(join(process.resourcesPath, 'tray-icon.png')))
  tray.setToolTip('DeepSeek Desktop')
  tray.on('click', () => showWindow(mainWindow))
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show DeepSeek Desktop', click: () => showWindow(mainWindow) },
    { type: 'separator' },
    { label: 'Quit DeepSeek Desktop', click: () => { explicitQuit = true; app.quit() } },
  ]))
}
```

Call `createTray()` in `startDesktop()` before `runtime.start()`. Replace the existing `second-instance` handler with `showWindow(mainWindow)`. Replace the existing `closed` listener with a `close` listener that calls `hideWindowOnClose(event, window, explicitQuit)`. Change `window-all-closed` to quit only when `shouldKeepProcessAlive(explicitQuit)` is false. Preserve the existing `before-quit` runtime stop and release `tray` after explicit quit starts.

- [ ] **Step 4: Run targeted tests**

Run: `pnpm vitest run tests/lifecycle/background-mode.test.ts tests/security/electron-security.test.ts`

Expected: PASS with lifecycle logic tested outside Electron.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-main/src/main.ts apps/desktop-main/src/lifecycle/background-mode.ts tests/lifecycle/background-mode.test.ts
git commit -m "feat: keep desktop running in system tray"
```

### Task 3: Package the Tray Icon and Verify Delivery

**Files:**
- Modify: `electron-builder.yml:11-25`
- Modify: `tests/release/release-staging.test.ts`

**Interfaces:**
- Consumes `resources/icons/DeepSeek_AppleStyle.png`.
- Produces `resources/tray-icon.png` in unpacked application payloads.

- [ ] **Step 1: Write the failing packaging assertion**

```ts
expect(existsSync(join(stagingDirectory, 'tray-icon.png'))).toBe(true)
expect(statSync(join(stagingDirectory, 'tray-icon.png')).size).toBeGreaterThan(0)
```

Place the assertion in the existing release staging test that validates copied runtime resources.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/release/release-staging.test.ts`

Expected: FAIL because staging does not contain `tray-icon.png`.

- [ ] **Step 3: Add the explicit resource entry**

```yaml
  - from: resources/icons/DeepSeek_AppleStyle.png
    to: tray-icon.png
```

Add this under `extraResources` in `electron-builder.yml`; update `scripts/package-release.mjs` only when the release staging test proves it needs an explicit copy.

- [ ] **Step 4: Run release verification**

Run: `pnpm vitest run tests/release/release-staging.test.ts && pnpm build && pnpm dist:win`

Expected: all tests pass, build exits `0`, and `dist/win-unpacked/resources/tray-icon.png` exists and is non-empty.

- [ ] **Step 5: Manually verify the packaged app**

Run: `Start-Process 'D:\marti\Documents\Deepseek\dist\win-unpacked\DeepSeek Desktop.exe'`

Expected: closing hides the main window while the process persists; clicking the tray icon restores it; the tray menu's `Quit DeepSeek Desktop` fully removes the process after the runtime stops.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml tests/release/release-staging.test.ts
git commit -m "build: package tray icon"
```
