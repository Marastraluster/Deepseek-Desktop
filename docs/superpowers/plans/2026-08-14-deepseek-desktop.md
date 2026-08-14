# DeepSeek Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a Windows-first Electron client that reuses the pinned official DeepSeek Harness Client Packages over an IPC carrier and ships with its own Node 24 runtime, while keeping pnpm source development and reserving platform adapters for macOS/Linux.

**Architecture:** A sandboxed Renderer boots the official @deepseek-ai/dsh-client-web shell and desktop Cordis plugins. A minimal preload bridge exposes only validated unary, stream, response, and recovery operations to Electron Main; Main supervises a bundled Node 24 child running the official Harness Host composition without dsh web or a listening socket. Desktop features consume official Session/Workspace APIs and UI slots, so the official DeepSeek theme remains the visual source of truth.

**Tech Stack:** Electron 40, TypeScript 6, React 18, Vite, pnpm 11.19, Vitest, Playwright, Zod, official Cordis packages, child_process, electron-builder NSIS/portable targets, bundled Node 24.

## Global Constraints

- Upstream Harness is a git submodule pinned to 47f943859bef60e4160492346772ded9b24f765a (master, @deepseek-ai/dsh-root 0.1.0-rc.5).
- Renderer security is fixed: sandbox true, contextIsolation true, nodeIntegration false, packaged-content navigation only.
- The desktop composition does not import or start @deepseek-ai/dsh-host-webserver; no app-owned HTTP or WebSocket listening socket is allowed.
- All wire payloads are validated by upstream schemas plus desktop Zod envelopes on both Main and Host sides.
- Release contains approved Node 24.x, production dependencies, Harness artifacts, licenses, and build identity; it works without system Node or pnpm.
- Harness owns credentials, Session logs, and Workspace state. Desktop persistence contains only window/update/notification state and managed worktree metadata.
- Windows is the first acceptance platform. Runtime, notification, updater, path, and packaging code sits behind adapters for later macOS/Linux ports.
- Every task follows red-test, green implementation, focused verification, and a commit before the next task.

---

### Task 1: Repository Foundation And Pinned Harness

**Files:**
- Create: package.json; pnpm-workspace.yaml; tsconfig.base.json; tsconfig.json; .npmrc; electron-builder.yml
- Create: scripts/prepare-harness.mjs; tests/foundation/repository-layout.test.ts
- Create: vendor/deepseek-harness (git submodule at the pinned commit)
- Modify: .gitignore

**Interfaces:**
- prepare-harness.mjs has no positional arguments, initializes the submodule, checks git -C vendor/deepseek-harness rev-parse HEAD, and exits non-zero unless it equals the pinned commit.
- Root scripts are harness:prepare, dev, test, test:e2e, dist:win, and dist:portable.

- [ ] Step 1: Write the failing layout test.

~~~ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { it, expect } from 'vitest'
const root = join(import.meta.dirname, '..', '..')
it('declares the pinned Harness and release scripts', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  expect(pkg.packageManager).toBe('pnpm@11.19.0')
  expect(pkg.scripts['harness:prepare']).toBe('node scripts/prepare-harness.mjs')
  expect(pkg.scripts['dist:win']).toBe('electron-builder --config electron-builder.yml --win')
  expect(existsSync(join(root, 'vendor', 'deepseek-harness', '.git'))).toBe(true)
})
~~~

- [ ] Step 2: Run pnpm exec vitest run tests/foundation/repository-layout.test.ts; expected FAIL because the manifest and submodule are absent.
- [ ] Step 3: Add the workspace and submodule. Use git submodule add https://github.com/deepseek-ai/deepseek-harness.git vendor/deepseek-harness, fetch the pinned commit, and checkout it detached. prepare-harness runs pnpm install --frozen-lockfile, pnpm --dir vendor/deepseek-harness build, and writes resources/build-identity.json containing harnessCommit and packageVersion. electron-builder.yml declares NSIS and portable targets, asar, extraResources for resources/node, resources/host, licenses, and build-identity.json.
- [ ] Step 4: Set NodeNext/ES2022/strict/exactOptionalPropertyTypes in tsconfig.base.json. tsconfig.json references all apps and desktop packages while excluding vendor sources. .npmrc enables a shared workspace lockfile and the upstream peer-dependency behavior.
- [ ] Step 5: Run pnpm install; pnpm harness:prepare; pnpm exec vitest run tests/foundation/repository-layout.test.ts; expected PASS with the pinned gitlink and build identity.
- [ ] Step 6: Commit with git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc electron-builder.yml scripts/prepare-harness.mjs tests/foundation/repository-layout.test.ts .gitignore .gitmodules vendor/deepseek-harness; git commit -m "build: add pinned DeepSeek Harness workspace".

### Task 2: IPC Contract And Electron Carrier

**Files:**
- Create: packages/ipc-contract/src/index.ts; packages/ipc-contract/src/schemas.ts; package.json; tsconfig.json
- Create: packages/ipc-client/src/electron-ipc-api-client.ts; packages/ipc-client/src/stream-readable.ts; package.json; tsconfig.json
- Create: apps/desktop-main/src/ipc/main-router.ts; apps/desktop-main/src/preload.ts
- Create: tests/ipc/ipc-contract.test.ts; tests/ipc/electron-ipc-api-client.test.ts

**Interfaces:**
- DesktopRequest = { generation: number; request: ClientRequest }; DesktopResponse = { generation: number; response: ServerResponse }.
- DesktopStreamOpen = { generation: number; stream: mux | host; port: MessagePort }; DesktopStreamFrame = { generation: number; message: ServerRequest }; DesktopStreamClose = { generation: number; reason?: string }.
- DesktopBridge exposes invoke(request), openStream(stream, generation), respond(message, generation), runtimeStatus(), and restartRuntime().
- ElectronIpcApiClient extends upstream AbstractApiClient, implements doFetch for unary calls, overrides openMux/openHost for MessagePort-backed AsyncIterable streams, and never mints business rpcIds outside the upstream base class.

- [ ] Step 1: Write a red test that rejects a response from an older generation and a stream test that preserves order and closes its MessagePort on AbortSignal.
- [ ] Step 2: Run pnpm exec vitest run tests/ipc; expected FAIL because the contract and carrier are absent.
- [ ] Step 3: Implement Zod discriminated unions for unary, unary-response, stream-open, stream-frame, stream-close, cancel, and runtime-status. Reject unknown stream names, negative generations, malformed upstream message types, and unknown object keys. Export assertDesktopRequest, assertDesktopResponse, and assertRuntimeStatus.
- [ ] Step 4: Implement doFetch by sending the upstream ClientRequest through desktopHarness.invoke, converting the validated ServerResponse into Response.json, and rejecting a mismatched generation before upstream parsing. Implement stream queue bounds of 256 diagnostic frames, never dropping durable Session frames, and cancellation propagation.
- [ ] Step 5: In preload expose a frozen contextBridge desktopHarness object only with invoke/openStream/respond/runtimeStatus/restartRuntime. In main-router validate event.sender against the owned BrowserWindow webContents id, allow only the named channels, and route to RuntimeSupervisor.
- [ ] Step 6: Run pnpm exec vitest run tests/ipc --coverage; expected PASS for schemas, sender authorization, stale generations, cancellation, ordered frames, and bounded queues. Commit feat: add validated Electron IPC carrier.

### Task 3: Bundled Host And Runtime Supervisor

**Files:**
- Create: apps/desktop-host/src/main.ts; apps/desktop-host/src/compose-host.ts; package.json; tsconfig.json
- Create: apps/desktop-main/src/runtime/runtime-supervisor.ts; runtime-paths.ts; runtime-log.ts
- Create: tests/runtime/runtime-supervisor.test.ts; tests/runtime/runtime-paths.test.ts

**Interfaces:**
- RuntimeSupervisor.start(), invoke(request), openStream(kind), respond(message), restart(), and stop() as Promise-returning methods.
- RuntimeStatus = { state: starting | ready | reconnecting | failed | stopped; generation: number; protocolVersion: string; buildCommit: string; pid?: number; lastExit?: { code: number|null; signal: string|null } }.
- Host stdio is newline-delimited JSON: request, response, stream, and cancel frames. Host writes protocol frames to stdout and redacted diagnostics to its log.

- [ ] Step 1: Write a red supervisor test for one crash/restart, stale-generation rejection, graceful stop, and repeated-crash failure.
- [ ] Step 2: Run pnpm exec vitest run tests/runtime; expected FAIL because child supervision and path resolution are absent.
- [ ] Step 3: compose-host boots the official Cordis Host using @deepseek-ai/dsh-cordis-host-runner, @deepseek-ai/dsh-host-apiproxy (ApiProxyService), and the official Session/Workspace/LLM/credentials/tools/terminal plugins. It passes %APPDATA%/Deepseek Desktop/dsh as Harness home and task workspace as cwd. It never imports dsh-host-webserver.
- [ ] Step 4: main.ts validates one JSON request per stdin line, maps unary calls to the in-memory toFetchHandler(ctx.apiProxy).fetch, maps mux/host streams to ctx.apiProxy.events, forwards respond, and aborts matching requests on cancel. It sends ready with protocolVersion, buildCommit, and Node version, then stopped on SIGTERM.
- [ ] Step 5: runtime-paths resolves source, unpacked, and packaged paths. runtime-supervisor spawns the verified Node executable with stdio pipes, sets DSH_HOME/DSH_DESKTOP_BUILD_COMMIT/DSH_DESKTOP_PROTOCOL_VERSION, increments generation, restarts once after unexpected exit, then reports failed diagnostics. runtime-log redacts credentials/provider bodies.
- [ ] Step 6: Run pnpm exec vitest run tests/runtime --coverage; pnpm --filter desktop-host build; expected PASS for startup, mismatch, restart, shutdown, paths, redaction, and no listening socket. Commit feat: supervise bundled Harness Host over stdio.

### Task 4: Official Renderer Boot And Desktop Connection Plugin

**Files:**
- Create: apps/desktop-renderer/src/main.tsx; src/boot-manifest.ts; index.html; vite.config.ts; package.json; tsconfig.json
- Create: packages/desktop-connection/src/client/index.ts; src/client/connection-handle.ts; package.json; tsconfig.json
- Create: tests/renderer/official-boot.test.ts; tests/renderer/desktop-connection.test.ts

**Interfaces:**
- Renderer entry calls new AppWebEntry(document.getElementById('root')!).run() from @deepseek-ai/dsh-client-web.
- DesktopConnectionHandle implements the official ConnectionHandle shape: api, rpc, hostDescription, isLoopback, and start(sinks: ConnectionSinks, config?: ConnectionConfig): { stop(): void }.

- [ ] Step 1: Write a red test that asserts AppWebEntry is used, no replacement Conversation markup exists, and the desktop plugin provides connection.
- [ ] Step 2: Run pnpm exec vitest run tests/renderer; expected FAIL because the Renderer shell and plugin are absent.
- [ ] Step 3: boot-manifest reads pinned client metadata and emits window.__DSH_BOOT__ rows for official modules, locale, runtime, theme, layout, sidebar, conversation, trajectory, deliverables, user-questions, terminal, and desktop plugins. Only the connection row is replaced; all official UI rows remain.
- [ ] Step 4: connection-handle wraps ElectronIpcApiClient, starts the upstream ConnectionController with mux/host sinks, publishes HostDescription per ready generation, clears it while reconnecting, and provides service connection through a Cordis plugin that imports only browser-safe upstream types.
- [ ] Step 5: main.tsx mounts AppWebEntry and installs the manifest before run(). Vite aliases official @deepseek-ai packages to built pinned Harness packages; no custom theme CSS or replacement chat markup is added.
- [ ] Step 6: Run pnpm exec vitest run tests/renderer; pnpm --filter desktop-renderer build; expected PASS. Commit feat: boot official DeepSeek UI over desktop connection.

### Task 5: Projects, Concurrent Tasks, Status, Approvals, And Recovery UI

**Files:**
- Create: packages/desktop-projects/src/client/index.ts; project-store.ts
- Create: packages/desktop-task-status/src/client/index.ts; status-fold.ts
- Create: packages/desktop-interactions/src/client/index.ts; pending-store.ts
- Create: packages/desktop-notifications/src/main/windows-notifications.ts; src/client/index.ts
- Create: apps/desktop-main/src/window/main-window.ts
- Create: tests/product/project-task-flow.test.ts; status-fold.test.ts; approval-recovery.test.ts

**Interfaces:**
- ProjectStore.open(path), createTask(projectId, mode), switchTask(sessionId), and archiveTask(sessionId).
- foldTaskStatus(events) returns exactly idle | running | waiting-approval | waiting-input | completed | failed.
- PendingInteraction contains rpcId, sessionId, kind approval|question, payload, and createdAt; respondOnce atomically marks rpcId and calls connection.api.respond.

- [ ] Step 1: Write red tests for two concurrent tasks, status precedence, approval duplicate rejection, and pending replay.
- [ ] Step 2: Run pnpm exec vitest run tests/product; expected FAIL.
- [ ] Step 3: Use official workspace/session APIs and existing sidebar/layout slots for project grouping, task creation/switch/rename/archive, prompt/steer/queue/cancel/resume. Do not store duplicate transcripts.
- [ ] Step 4: Fold durable mux/session events, persist only last sequence per Session in userData, refetch history and backfill gaps on reconnect.
- [ ] Step 5: Register official user-question and approval cards, route server requests to pending-store, deduplicate by rpcId, replay unanswered requests after reconnect/restart, and write redacted audit records.
- [ ] Step 6: Notify only for state changes on non-focused tasks; diagnostics view offers restart and validated log-folder action.
- [ ] Step 7: Run pnpm exec vitest run tests/product --coverage; expected PASS. Commit feat: add project task and interaction workflows.

### Task 6: Review, Diff, Persistent Terminal, And Safe Worktrees

**Files:**
- Create: packages/desktop-review/src/client/index.ts; diff-service.ts
- Create: packages/desktop-terminal/src/client/index.ts; terminal-store.ts
- Create: packages/desktop-worktree/src/main/worktree-service.ts; src/client/index.ts; src/shared/worktree-policy.ts
- Create: tests/review/diff-service.test.ts; tests/terminal/terminal-store.test.ts; tests/worktree/worktree-policy.test.ts

**Interfaces:**
- readUnifiedDiff(repoRoot, taskId) returns DiffFile entries with status added|modified|deleted|renamed|binary|oversize and capped hunks.
- TerminalStore.open/write/resize/closePanel/terminate; closePanel does not terminate.
- validateWorktreeRemoval(record, fsState, activeTerminals) rejects path escape, repository mismatch, owner mismatch, dirty state, and active terminals.

- [ ] Step 1: Write red tests for bounded Diff, terminal persistence, and all worktree removal guards.
- [ ] Step 2: Run pnpm exec vitest run tests/review tests/terminal tests/worktree; expected FAIL.
- [ ] Step 3: Run git diff in the validated task worktree, cap each file at 2 MiB, classify binary/oversize, and register the panel into official deliverables/review slots. Use host.openPath for approved file handoff; opening/refreshing never writes the tree.
- [ ] Step 4: Use the upstream terminal capability and xterm-compatible UI. Key terminal state by sessionId/executionWorld, stream output through Host, keep PTY alive while hidden, and confirm before task archive termination.
- [ ] Step 5: Create worktrees only under %LOCALAPPDATA%/Deepseek Desktop/worktrees/<repo-id>/<task-id>, verify canonical repo identity, record ownership, default to isolated when another writable task uses the checkout, and make removal explicit and guarded.
- [ ] Step 6: Run pnpm exec vitest run tests/review tests/terminal tests/worktree --coverage; expected PASS. Commit feat: add review terminal and safe worktrees.

### Task 7: Electron Security, Packaging, And Clean Windows Smoke

**Files:**
- Create: apps/desktop-main/src/main.ts; src/security/navigation-policy.ts; src/adapters/windows-notifications.ts; src/adapters/windows-paths.ts
- Create: scripts/prepare-node-runtime.mjs; scripts/package-windows.mjs
- Create: tests/security/electron-security.test.ts; tests/e2e/desktop.spec.ts; tests/release/packaged-smoke.ps1
- Modify: electron-builder.yml; package.json

**Interfaces:**
- createMainWindow() always sets sandbox true, contextIsolation true, nodeIntegration false.
- resolveExternalNavigation(url) returns allow|external|deny; only validated HTTPS links can be external.
- prepare-node-runtime.mjs verifies the approved Node 24 Windows x64 archive against resources/node/checksums.json and leaves no network dependency in the final artifact.

- [ ] Step 1: Write red security and E2E tests asserting no process/require exposure, blocked file navigation, first launch, mock Session streaming, approval, Diff, terminal, two worktrees, restart recovery, and no listening socket.
- [ ] Step 2: Run pnpm exec vitest run tests/security; pnpm exec playwright test tests/e2e/desktop.spec.ts; expected FAIL.
- [ ] Step 3: Implement single-instance Main lifecycle, BrowserWindow policy, protocol/build identity gate, graceful child shutdown, crash diagnostics, and Windows path/notification adapters.
- [ ] Step 4: Stage Node 24, production dependencies, Host/Renderer output, third-party notices, and build identity; invoke electron-builder for NSIS and portable targets. NSIS uninstall preserves %APPDATA%/Deepseek Desktop/dsh.
- [ ] Step 5: Run pnpm dist:win; powershell -ExecutionPolicy Bypass -File tests/release/packaged-smoke.ps1 -Artifact dist\\Deepseek-Desktop-Setup.exe; expected PASS on a clean Windows profile without Node/pnpm and with no app-owned netstat listener.
- [ ] Step 6: Run pnpm test; pnpm test:e2e; pnpm dist:portable; expected PASS. Commit release: package secure Windows DeepSeek Desktop.

### Task 8: Source Workflow, Recovery Documentation, And Acceptance Record

**Files:**
- Create: README.md; docs/development.md; docs/release-windows.md; docs/architecture/ipc.md; docs/architecture/platform-adapters.md
- Create: tests/acceptance/windows-acceptance.test.ts

**Interfaces:**
- Documented commands are pnpm install, pnpm harness:prepare, pnpm dev, pnpm test, and pnpm dist:win.
- windows-acceptance.test.ts reads resources/build-identity.json and asserts harnessCommit equals 47f943859bef60e4160492346772ded9b24f765a.

- [ ] Step 1: Write a red documentation/acceptance test for the five source/release commands and pinned build identity.
- [ ] Step 2: Run pnpm exec vitest run tests/acceptance/windows-acceptance.test.ts; expected FAIL until docs and build identity are present.
- [ ] Step 3: Document source startup, submodule preparation, mock LLM tests, checksum/signing environment variables, NSIS/portable artifacts, offline startup, uninstall data preservation, IPC envelopes, cancellation/backpressure, approval replay, and platform adapter contracts.
- [ ] Step 4: Run pnpm exec vitest run tests/acceptance; pnpm test; git diff --check; expected PASS and the acceptance record points to real NSIS/portable outputs. Commit docs: document development and Windows acceptance.

## Self-Review Checklist

- [x] Official DeepSeek UI is booted through AppWebEntry; desktop code contributes slots/plugins only.
- [x] AbstractApiClient, IApiClient, and ConnectionHandle are used as the carrier boundary.
- [x] Host is a bundled Node 24 child over stdio; dsh web, HTTP, and WebSocket listening are excluded.
- [x] Projects, concurrent Sessions, status folding, approvals/questions, replay, Diff, files, terminal, worktrees, notifications, and recovery each have a task and test gate.
- [x] Renderer security, sender authorization, payload validation, generation fencing, redacted logs, and external-navigation policy are covered.
- [x] NSIS, portable, third-party notices, build identity, source commands, and clean-Windows smoke are covered.
- [x] No task depends on an unpinned Harness commit.
