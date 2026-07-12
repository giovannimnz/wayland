# ATIUS Codex ACP fork

This directory is a full-history Git subtree imported from
`https://github.com/giovannimnz/codex-acp`. It is the production adapter used
by the ATIUS Wayland fork and is intentionally committed inside the Wayland
repository so a Wayland clone contains the exact adapter source it runs.

## Runtime contract

- Source: `<wayland>/codex-acp`.
- Build: `bash ../scripts/atius-build-codex-acp.sh --test`.
- Installed binary: `/home/ubuntu/.local/bin/codex-acp`.
- Wayland entrypoint: `/home/ubuntu/.local/bin/codex-acp-atius`.
- Runtime homes: `CODEX_HOME=/home/ubuntu/.codex` and
  `HERMES_HOME=/home/ubuntu/.hermes`.
- Wayland service user: `ubuntu`.

The wrapper is kept separate from the compiled binary so runtime homes are
explicit and the service can continue to use `WAYLAND_CODEX_ACP_CLI`.

## ATIUS behavior

The two ATIUS commits imported with the subtree add Codex agent-profile support,
account-aware model configuration, and the six-position advanced power ladder
used by the Wayland model/effort UI. Do not replace this subtree with the npm
adapter without validating those contracts end to end.

The old Zed adapter now recommends `agentclientprotocol/codex-acp` for new
installs. Migrating to that App Server implementation is a separate project;
it must not be coupled to an upstream Wayland sync or this path migration.

## Updating the subtree

Fetch and test the standalone fork first, then update Wayland from a clean
branch or worktree:

```bash
git subtree pull --prefix=codex-acp \
  https://github.com/giovannimnz/codex-acp.git main
bash scripts/atius-build-codex-acp.sh --test --force
bash scripts/atius-verify-codex-acp.sh --live
```

Never copy `.git`, `target/`, `node_modules/`, credentials, or runtime homes
into this directory. `target/` is an ignored local build cache only.

The Apache-2.0 `LICENSE` in this directory must remain present. Fork-sync must
protect `codex-acp/**`; the ATIUS source patch protects the Wayland wiring and
also carries a recovery copy of the fork-owned subtree.
