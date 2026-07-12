import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('ATIUS embedded Codex ACP runtime', () => {
  it('tracks the adapter source without nested Git metadata', () => {
    expect(existsSync(resolve(root, 'codex-acp/Cargo.toml'))).toBe(true);
    expect(existsSync(resolve(root, 'codex-acp/Cargo.lock'))).toBe(true);
    expect(existsSync(resolve(root, 'codex-acp/LICENSE'))).toBe(true);
    expect(existsSync(resolve(root, 'codex-acp/.git'))).toBe(false);
  });

  it('builds and installs only from the embedded path', () => {
    const postinstall = read('scripts/atius-postinstall-hook.sh');
    expect(postinstall).toContain('CODEX_ACP_ROOT="${ROOT}/codex-acp"');
    expect(postinstall).toContain('scripts/atius-build-codex-acp.sh');
    expect(postinstall).not.toContain('CODEX_ACP_ROOT="/home/ubuntu/GitHub/codex-acp"');
  });

  it('keeps subtree recovery and fork-sync patch coverage explicit', () => {
    const refresh = read('scripts/atius-refresh-source-patch.sh');
    expect(refresh).toContain('codex-acp/');
    expect(refresh).toContain('scripts/atius-build-codex-acp.sh');
    expect(refresh).toContain('scripts/atius-verify-codex-acp.sh');
  });

  it('keeps Cargo and npm adapter versions aligned', () => {
    const cargoVersion = read('codex-acp/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1];
    const npm = JSON.parse(read('codex-acp/npm/package.json')) as {
      version: string;
      optionalDependencies: Record<string, string>;
    };

    expect(cargoVersion).toBe('0.17.0');
    expect(npm.version).toBe(cargoVersion);
    expect(Object.values(npm.optionalDependencies).every((version) => version === cargoVersion)).toBe(true);
  });
});
