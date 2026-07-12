# ATIUS embedded Codex ACP runtime

## Decision

Wayland vendors the full-history `giovannimnz/codex-acp` fork as a Git subtree
at `codex-acp/`. Production no longer depends on a sibling checkout at
`/home/ubuntu/GitHub/codex-acp`.

A subtree was selected because it keeps one clone/deploy unit, preserves the
adapter history and merge base, and does not create a nested `.git` or require
`git submodule update`. The imported history is not squashed.

## Architecture

```text
Wayland WebUI
  -> Wayland ACP connector
  -> /home/ubuntu/.local/bin/codex-acp-atius
  -> /home/ubuntu/.local/bin/codex-acp
  -> embedded source: <wayland>/codex-acp
  -> Codex runtime: CODEX_HOME=/home/ubuntu/.codex
```

`scripts/atius-postinstall-hook.sh` builds the embedded source when its Git tree
hash differs from the installed stamp, installs the ATIUS wrapper, and writes
`WAYLAND_CODEX_ACP_CLI` into the systemd overlay. No secret is stored in the
repository; Codex authentication remains in the `ubuntu` runtime home/Vault
hydration boundary.

## Adapter-specific behavior

The embedded Rust fork carries ATIUS behavior required by the current UI:

- account-aware Codex model discovery instead of a broad static catalog;
- Codex agent-profile parsing and ACP session config;
- separate model, reasoning effort, speed, and permission controls;
- the six-position advanced power ladder used by GPT-5.6 UI mapping;
- runtime forwarding to the installed Codex components pinned in `Cargo.lock`.

GSD skills and slash commands remain Wayland command-layer entries. They are not
ACP runtime agents. Hermes Agent remains a separate runtime.

## Build and install

Use the managed script only:

```bash
bash scripts/atius-build-codex-acp.sh --test --force
```

The script enforces the global 20% total CPU ceiling with a systemd scope,
limits Cargo workers, runs release tests when requested, builds with the locked
dependency graph, atomically installs the binary, and writes the embedded tree
hash to `/home/ubuntu/.cache/wayland/codex-acp-tree`.

`scripts/atius-postinstall-hook.sh` invokes the same script without `--force`;
unchanged adapter trees therefore skip recompilation.

## Validation

Repository and runtime checks:

```bash
bash scripts/atius-verify-codex-acp.sh
bash scripts/atius-build-codex-acp.sh --test --force
bash scripts/atius-postinstall-hook.sh
ATIUS_REQUIRE_LEGACY_ACP_ABSENT=1 \
  bash scripts/atius-verify-codex-acp.sh --live
```

The verifier checks source completeness, lockfile/license presence, nested Git
metadata absence, Cargo metadata, postinstall wiring, installed wrapper/binary,
systemd state, the local auth endpoint, and optional legacy-path removal.

Wayland validation remains required after adapter changes:

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run \
  tests/unit/AcpAgentManagerSkillInjection.test.ts \
  tests/unit/process/task/codexConfigEffort.test.ts \
  tests/unit/process/task/codexNativeSandbox.test.ts \
  tests/unit/renderer/guidModelSelector.dom.test.tsx \
  tests/unit/useGuidSend.dom.test.ts
npm run typecheck
```

Any browser validation must run headless. Save screenshots, traces, console and
network evidence under `out/atius-qa/`; never open an automated visible browser.

## Updating from the adapter fork

From a clean Wayland branch/worktree:

```bash
git subtree pull --prefix=codex-acp \
  https://github.com/giovannimnz/codex-acp.git main
bash scripts/atius-build-codex-acp.sh --test --force
bash scripts/atius-verify-codex-acp.sh --live
```

Review changes to `Cargo.toml`, `Cargo.lock`, model/config options,
`agent_profile.rs`, and `codex_agent.rs`. Keep Cargo and npm package versions
aligned. Do not automatically migrate to `agentclientprotocol/codex-acp`; that
new App Server adapter needs a dedicated compatibility phase.

## Fork-sync protection

`omni-srv-admin/modules/fork-sync/projects/wayland/sync.yaml` protects
`codex-acp/`, build/verify/postinstall scripts, this guide, the runtime guide,
and the generated ATIUS source patch. After an upstream Wayland merge,
fork-sync restores the fork-owned subtree and refreshes the Wayland delta.

## Rollback

Before cutover, create a Git bundle of the standalone adapter and retain its
complete checkout outside the old canonical path. To roll back, restore the
bundle/checkout, point `CODEX_ACP_ROOT` back temporarily, rebuild the systemd
overlay, and restart Wayland. Do not delete the embedded tree or rewrite Git
history during an incident.
