# Deepseek Desktop Design

Date: 2026-08-14

## 1. Summary

Deepseek Desktop is a Windows-first desktop application for DeepSeek Harness. It follows the
desktop integration boundary already reserved by the upstream Harness architecture: the
application reuses the official Client Packages, replaces the Web HTTP/WebSocket carrier with
an Electron IPC carrier, and runs the Harness Host in a bundled Node 24 child process.

The product should feel like the official DeepSeek Harness Web UI while supporting the project,
parallel-task, review, terminal, approval, and recovery workflows expected from a Codex-style
desktop coding client. The first release is a self-contained Windows installer. Source
development remains available through pnpm. macOS and Linux packaging follow after the Windows
runtime and IPC boundaries are proven.

## 2. Goals

- Ship a Windows application that works without a system Node.js or pnpm installation.
- Preserve the official DeepSeek Harness visual language and core interaction behavior.
- Use the upstream Host/Client API contracts and `AbstractApiClient` extension point.
- Avoid opening a local HTTP or WebSocket listening port.
- Support multiple projects and concurrent task Sessions.
- Provide first-class approvals, questions, tool trajectory, produced files, Diff, terminal,
  worktree isolation, notifications, and crash recovery.
- Keep upstream compatibility explicit by pinning an exact Harness Git commit.
- Keep the desktop-specific code modular enough for later macOS and Linux adapters.

## 3. Non-Goals

- Reimplementing the Agent loop, Session log, settings, credentials, or model providers.
- Building a second visual design system or replacing the official conversation UI.
- Exposing the Harness process to a LAN or remote browser.
- Silently sharing one writable Git checkout across concurrent isolated tasks.
- Automatically deleting user worktrees or uncommitted files.
- Claiming compatibility with arbitrary Harness commits at runtime.

## 4. Upstream Baseline

The upstream repository remains a Git submodule at `vendor/deepseek-harness`. The gitlink pins the
complete Host and Client contract pair. Desktop releases record that commit in their build
metadata and About dialog.

The implementation relies on these upstream decisions:

- `packages/host/*` owns Node-side capabilities and the protocol boundary.
- `packages/client/*` owns browser-safe UI and client capabilities.
- `AbstractApiClient` centralizes wire validation and allows a different physical carrier.
- A future Electron application is expected to reuse the same Client Packages over an IPC
  carrier.
- Web UI behavior is composed through Cordis Client Plugins and typed slots.

If a required upstream behavior has no public extension point, the desktop repository carries a
small, documented patch under `patches/deepseek-harness/`. Each patch states the pinned upstream
commit, reason, affected contract, tests, and removal condition. Patches never contain unrelated
UI restyling.

## 5. Repository Layout

```text
Deepseek-Desktop/
  apps/
    desktop-main/        Electron application lifecycle and native integration
    desktop-renderer/    Vite shell that boots official Harness Client Packages
    desktop-host/        Node 24 entry that composes the Harness Host
  packages/
    ipc-contract/        Desktop transport envelopes and runtime validation
    ipc-client/          ElectronIpcApiClient and reconnect behavior
    runtime-manager/     Host process, runtime paths, logs, shutdown and recovery
    desktop-projects/    Project navigation Client Plugin
    desktop-task-status/ Task state and notifications Client/Host plugin pair
    desktop-review/      Git changes, Diff and native file handoff
    desktop-terminal/    Persistent terminal panel integration
    desktop-worktree/    Safe per-task Git worktree lifecycle
  patches/
    deepseek-harness/
  scripts/
    prepare-harness.mjs
    prepare-node-runtime.mjs
    package-windows.mjs
  vendor/
    deepseek-harness/    Pinned Git submodule
  docs/
  resources/             Generated release inputs, ignored by Git
```

Each package has one owner and a narrow public interface. Desktop feature packages cooperate
through Cordis services or declared UI slots, not cross-package implementation imports.

## 6. Runtime Architecture

```text
Electron Renderer (sandboxed)
  official Harness Client Packages + desktop Client Plugins
        |
        | contextBridge: invoke / subscribe / cancel
        v
Electron Main
  sender validation + window lifecycle + native capabilities
        |
        | Node IPC: request / response / stream / cancellation
        v
Bundled Node 24 child process
  desktop-host + Harness Host Runtime + Agent/Session/Tools
```

### 6.1 Renderer

The Renderer has `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`. It boots
the official UI layout, sidebar, conversation, trajectory, theme, workspace, settings, and
deliverables packages. Desktop-specific features register into existing slots. The Renderer does
not receive filesystem, shell, environment, process, or unrestricted Electron APIs.

### 6.2 Preload and Main

The preload exposes only a frozen `desktopHarness` bridge:

- `invoke(request, signal)` for unary protocol calls;
- `openStream(kind)` for Session and Host event streams;
- `respond(response)` for approval and question responses;
- `runtimeStatus()` and `restartRuntime()` for recovery;
- explicit native actions such as application update and log-folder opening.

The Main process rejects calls from unknown WebContents, invalid channels, invalid payloads, and
stale runtime generations. It never accepts arbitrary command names or filesystem paths through a
generic IPC method.

### 6.3 Host Child

The Host runs in a real bundled Node 24 executable so its native dependencies use the ABI they
were installed and tested against. It receives `DSH_HOME`, workspace defaults, log paths, and the
pinned build identity from Main. It composes the upstream Host without the WebServer bundle.

Unary calls preserve official request/response envelopes and schema validation. Session and Host
streams use explicit open, frame, close, error, and cancel envelopes. Backpressure is bounded;
the child pauses or coalesces diagnostic-only frames rather than growing an unbounded parent
queue. Durable Session events are never dropped.

### 6.4 Client Carrier

`ElectronIpcApiClient` extends upstream `AbstractApiClient`. It implements `doFetch` for unary
requests and the official response path. It overrides the streaming aspects where a Fetch body is
not a natural Electron primitive, mapping them to MessagePorts while keeping official frame
schemas, rpcId correlation, history replay, and reconnect rules.

## 7. Product Experience

### 7.1 Projects and Tasks

A Project is an official Harness Workspace with desktop presentation metadata. A Task is an
ordinary Harness Session associated with a Project. The desktop layer does not create a parallel
conversation database.

The official sidebar receives project grouping and task state contributions. Users can open a
folder, create a task, switch tasks, rename, archive, resume, and search. Each task displays one of
`idle`, `running`, `waiting-approval`, `waiting-input`, `completed`, or `failed`, derived from
Harness Agent and Session events rather than filesystem timestamps.

Multiple tasks may run concurrently. Switching views does not stop a task. Completion and
approval events can produce Windows notifications when the task is not focused.

### 7.2 Conversation and Control

The official conversation and trajectory packages render messages, streaming chunks, tool calls,
plans, subagents, and errors. The composer supports prompt, steer, queue, cancel, and resume
operations already represented by the Host contract.

Approval and question cards are actionable. A response uses its stable rpcId and the Host pending
table; first response wins and reconnect replays still-pending requests. If the pinned upstream
commit still has a display-only responder stub, the compatibility patch completes that official
contract and includes replay, duplicate-response, cancellation, and audit-log tests.

### 7.3 Review and Deliverables

The official deliverables row remains the source of produced-file presentation. The desktop
review plugin adds a task-scoped changes panel with file status, unified Diff, refresh, open file,
and show in folder. Diff reads are bounded and binary or oversized files receive explicit
fallbacks.

The review panel does not implement destructive rollback in the first release. It never rewrites
the working tree merely by opening or refreshing the view.

### 7.4 Terminal

The terminal panel uses the official persistent terminal capability and xterm-compatible client
rendering. Terminal identity is scoped to the active task and execution world. Closing the panel
does not kill the terminal; ending or archiving a task prompts before terminating live terminals.

### 7.5 Worktrees

For a Git Project, task creation offers the current checkout or an isolated worktree. Isolated is
the default when another writable task already targets the checkout. The desktop worktree service
creates a validated path under the desktop-managed worktree root and records its owning task.

Creation failure aborts isolated task creation rather than silently falling back to the shared
checkout. Archiving a task does not delete its worktree. Removal is a separate explicit action
that checks ownership, repository identity, uncommitted changes, path containment, and active
terminals before calling Git.

## 8. Data and Paths

- Harness data: `%APPDATA%/Deepseek Desktop/dsh`
- Desktop settings: Electron `userData`
- Logs: `%LOCALAPPDATA%/Deepseek Desktop/logs`
- Managed worktrees: `%LOCALAPPDATA%/Deepseek Desktop/worktrees/<repo-id>/<task-id>`
- Packaged runtime: read-only Electron resources directory

Credentials, model settings, Session logs, and Workspace state remain owned by Harness. Desktop
settings contain only window state, notification preferences, update channel, recent UI state,
and desktop-managed worktree metadata.

## 9. Development and Packaging

The supported source workflow is:

```text
pnpm install
pnpm harness:prepare
pnpm dev
pnpm test
pnpm dist:win
```

`harness:prepare` initializes the submodule, validates the pinned commit, applies declared patches,
and builds the required Host and Client artifacts. Development may use a local Node 24 path but
must run the same desktop-host entry and IPC carrier as release mode.

The Windows release builder:

1. downloads or locates an approved Node 24 archive;
2. verifies its official checksum;
3. installs/builds production dependencies for Windows x64;
4. builds the Renderer, Main, preload, Host, and patched Harness artifacts;
5. stages third-party license notices and build metadata;
6. creates NSIS installer and portable artifacts;
7. runs an unpacked-runtime and packaged-app smoke test.

No package step may fetch runtime code after the release artifact has been assembled. The
installed application starts offline up to the point where a configured model provider is used.

## 10. Failure Handling

- Startup failures keep a diagnostics window open with stage, executable path, exit code, recent
  redacted logs, restart, and open-log-folder actions.
- Main automatically restarts a crashed Host once per application launch. Repeated crashes require
  explicit user action to avoid a crash loop.
- IPC messages carry a runtime generation. Responses from a replaced Host are discarded.
- Renderer reconnect opens fresh streams, refetches Session history, compares sequence positions,
  and backfills gaps according to the upstream reconnect contract.
- Protocol or pinned-build mismatch prevents normal startup and reports both identities.
- Application quit first requests graceful Host shutdown, then terminates the verified child
  process tree after a timeout.
- Secrets and provider request bodies are redacted from desktop logs.

## 11. Security

- No local listening socket is opened by the desktop composition.
- Renderer navigation is restricted to packaged application content; external HTTPS links open in
  the default browser after validation.
- The preload bridge is allowlisted and payloads are runtime-validated on both sides.
- Native file actions resolve paths through the active Workspace and Host policy rather than
  accepting arbitrary Renderer paths.
- Updates require a signed manifest and checksum; unsigned builds keep automatic update disabled.
- Windows code signing is supported by environment-provided credentials and never stored in Git.

## 12. Testing

### 12.1 Unit

- IPC envelope parsing, cancellation, stale-generation rejection, and sender authorization.
- Runtime path resolution in source, unpacked, and packaged modes.
- Task state folding from Session and Agent events.
- Worktree containment, ownership, dirty-state, and active-terminal guards.
- Log redaction and bounded stream queues.

### 12.2 Contract and Integration

- Every used upstream unary RPC round-trips through Electron IPC with official schemas.
- Session/Host streams preserve ordering and rpcId correlation across reconnect.
- Approval/question request, response, duplicate response, refresh replay, and audit events.
- Real bundled-Node Host startup, graceful shutdown, crash restart, and protocol mismatch.
- No app-owned TCP listening socket during normal operation.

### 12.3 Electron End-to-End

Using the upstream mock LLM and deterministic fixtures:

- first launch and model configuration;
- open Project and create Task;
- stream a response and tool trajectory;
- approve and reject guarded operations;
- open produced files and inspect Diff;
- open a persistent terminal;
- run two isolated tasks in separate worktrees;
- restart the application and recover task history and pending interaction;
- exercise Host failure diagnostics and manual restart.

### 12.4 Release Smoke

A clean Windows environment without system Node installs the NSIS artifact, launches the app,
starts the bundled Host, loads the official UI, creates a fixture Session, and uninstalls without
removing Harness user data.

## 13. Acceptance Criteria

The Windows milestone is complete only when all of the following are evidenced:

- A fresh Windows machine can install and launch without Node.js or pnpm.
- The UI is composed from official DeepSeek Client Packages and retains the upstream theme.
- The Renderer communicates with the Host through IPC and the process opens no HTTP server.
- A user can open a Project, create and switch Tasks, and run at least two tasks concurrently.
- Streaming, tool trajectory, approvals, questions, cancel, resume, and restart recovery work.
- Diff, produced-file actions, terminal, and isolated Git worktrees work on a real repository.
- Source development and Windows packaging commands are documented and reproducible.
- Unit, contract, integration, Electron E2E, and release smoke gates pass.
- Third-party notices and the pinned Harness commit are present in the distribution.

macOS and Linux work starts only after this Windows acceptance set passes. Platform-specific code
must already sit behind runtime, notification, updater, path, and packaging adapters so those ports
do not require a client or Host protocol rewrite.
