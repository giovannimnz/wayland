/**
 * @license
 * Copyright 2026 Ferrox Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODEX_MODE_AUTO_EDIT = 'autoEdit';
export const CODEX_MODE_FULL_AUTO = 'yolo';
export const CODEX_MODE_FULL_AUTO_NO_SANDBOX = 'yoloNoSandbox';
export const CODEX_MODE_CONFIG_TOML = 'configToml';

export function isCodexNoSandboxMode(mode?: string | null): boolean {
  return mode === CODEX_MODE_FULL_AUTO_NO_SANDBOX;
}

export function isCodexAutoApproveMode(mode?: string | null): boolean {
  return mode === CODEX_MODE_FULL_AUTO || mode === CODEX_MODE_FULL_AUTO_NO_SANDBOX;
}

export function isCodexConfigTomlMode(mode?: string | null): boolean {
  return mode === CODEX_MODE_CONFIG_TOML;
}
