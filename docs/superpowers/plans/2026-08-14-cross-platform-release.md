# Cross-Platform Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package and publish the Electron client for Windows, macOS, and Linux with shared branding and the requested Windows self-signing policy.

**Architecture:** A platform-neutral release staging script bundles the exact Node runtime and deployed Harness Host for the active native runner. Electron Builder produces native platform artifacts. GitHub Actions builds Windows, Linux, Intel macOS, and Apple Silicon macOS on matching runners and attaches immutable artifacts plus checksums to tag-triggered releases.

**Tech Stack:** Electron 40, Electron Builder 26, Node 24, pnpm 11, TypeScript, Vitest, PowerShell Authenticode tooling, GitHub Actions.

## Global Constraints

- Preserve the official Harness renderer and IPC-only Electron architecture.
- Bundle the runtime: releases must not need a system Node.js or pnpm installation.
- Use `DeepSeek_AppleStyle.ico` as the visual source for every platform.
- Sign Windows executables with a job-local self-signed `CN=Astraluster` certificate; do not commit private key material.
- macOS is unsigned and unnotarized; Linux is unsigned.
- Build macOS and Linux artifacts only on native GitHub-hosted runners; publish separate macOS x64 and arm64 artifacts.
- Publish GitHub Release assets only on pushed tags matching `v*`.

---

### Task 1: Add Cross-Platform Release Contracts

**Files:**
- Modify: `tests/release/release-staging.test.ts`
- Modify: `tests/runtime/runtime-paths.test.ts`
- Modify: `package.json`
- Modify: `resources/node/checksums.json`

**Interfaces:**
- Consumes: `resolveRuntimePaths(options: RuntimePathOptions): RuntimePaths`.
- Produces: `pnpm dist:win`, `pnpm dist:mac`, and `pnpm dist:linux` scripts plus Node archive metadata for every release target.

- [ ] **Step 1: Write failing release contract tests**

```ts
expect(pkg.scripts['dist:mac']).toBe('node scripts/package-release.mjs --mac')
expect(pkg.scripts['dist:linux']).toBe('node scripts/package-release.mjs --linux')
expect(manifest.archives).toHaveProperty('node-v24.18.0-darwin-x64.tar.gz')
expect(manifest.archives).toHaveProperty('node-v24.18.0-linux-x64.tar.xz')
```

- [ ] **Step 2: Run the release contracts to verify they fail**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts tests/runtime/runtime-paths.test.ts`

Expected: FAIL because macOS/Linux commands and runtime checksums do not exist.

- [ ] **Step 3: Add minimal command declarations and runtime metadata**

Declare the three `dist:*` scripts and add SHA-256 checked Node 24 archives for Windows x64, macOS x64, macOS arm64, and Linux x64. Keep the existing Windows checksum unchanged.

- [ ] **Step 4: Run the release contracts to verify they pass**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts tests/runtime/runtime-paths.test.ts`

Expected: PASS.

### Task 2: Stage Native Runtimes And Icons

**Files:**
- Create: `scripts/package-release.mjs`
- Create: `scripts/generate-platform-icons.mjs`
- Create: `resources/icons/DeepSeek_AppleStyle.ico`
- Modify: `electron-builder.yml`
- Modify: `scripts/prepare-node-runtime.mjs`
- Modify: `tests/release/release-staging.test.ts`

**Interfaces:**
- Consumes: Node archive records from `resources/node/checksums.json` and the source ICO.
- Produces: `resources/node`, `resources/host`, platform icon outputs, and Electron Builder target arguments.

- [ ] **Step 1: Extend the failing contract test**

```ts
expect(builder.mac?.target).toEqual(expect.arrayContaining(['dmg', 'zip']))
expect(builder.linux?.target).toContain('AppImage')
expect(existsSync(join(root, 'resources', 'icons', 'DeepSeek_AppleStyle.ico'))).toBe(true)
```

- [ ] **Step 2: Run it to verify the missing target/icon failure**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts`

Expected: FAIL because the builder has only Windows targets and the icon has not been copied.

- [ ] **Step 3: Implement portable staging**

Replace the Windows-only runtime staging assumption with archive selection from `process.platform` and architecture. Preserve hash verification, stage `resources/node`, deploy the production Host closure, and use Electron Builder targets for Windows, macOS, and Linux. Generate `icon.icns` on macOS with `iconutil`; generate the Linux PNG icon set from the source art during CI.

- [ ] **Step 4: Verify contracts and stage locally**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts && pnpm prepare:release`

Expected: PASS and Windows staging creates a usable bundled Node runtime and deployed Host.

### Task 3: Add Release Automation And Signing

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/sign-windows-artifacts.ps1`
- Modify: `tests/release/release-staging.test.ts`

**Interfaces:**
- Consumes: `pnpm dist:win`, `pnpm dist:mac`, `pnpm dist:linux`.
- Produces: Windows `Astraluster.cer`, signed Windows artifacts, per-artifact SHA-256 files, and GitHub Release asset uploads.

- [ ] **Step 1: Write a failing workflow contract test**

```ts
const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
expect(workflow).toMatch(/windows-latest/)
expect(workflow).toMatch(/macos-latest/)
expect(workflow).toMatch(/ubuntu-latest/)
expect(workflow).toMatch(/CN=Astraluster/)
expect(workflow).toMatch(/refs\/tags\/v/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts`

Expected: FAIL because there is no release workflow.

- [ ] **Step 3: Implement the matrix workflow and signing script**

Use native runners. The Windows job creates an ephemeral self-signed code-signing certificate with `CN=Astraluster`, exports the `.cer` release asset, signs unpacked and final `.exe` files, and verifies Authenticode signatures. Every job writes SHA-256 checksum files. The tag-only publish job downloads all assets and uses GitHub CLI to create or update the release.

- [ ] **Step 4: Verify the workflow contract**

Run: `pnpm exec vitest run tests/release/release-staging.test.ts`

Expected: PASS.

### Task 4: Validate, Commit, And Publish Source

**Files:**
- Modify: `README.md`
- Modify: `docs/release.md`

**Interfaces:**
- Consumes: platform scripts and GitHub Actions release workflow.
- Produces: source-development instructions, artifact list, unsigned-platform caveats, self-signed Windows trust guidance, and release trigger documentation.

- [ ] **Step 1: Add release documentation**

Document `pnpm dev`, the three packaging commands, the native-runner requirement, `CN=Astraluster` self-signed certificate caveat, macOS Gatekeeper instructions, Linux AppImage execution, and `v*` tag release flow.

- [ ] **Step 2: Run full local verification**

Run: `pnpm test && pnpm build && pnpm dist:win && git diff --check`

Expected: tests and build PASS, Windows NSIS/portable artifacts exist, and no whitespace errors are reported.

- [ ] **Step 3: Commit and push source**

Run: `git add -A && git commit -m "release: add cross-platform packaging" && git push -u origin feat/windows-deepseek-desktop`

Expected: the source branch is visible at `Marastraluster/Deepseek-Desktop`.

- [ ] **Step 4: Trigger the first release**

Run: `git tag v0.1.0 && git push origin v0.1.0`

Expected: GitHub Actions builds the three native artifact families and publishes a GitHub Release after successful matrix completion.
