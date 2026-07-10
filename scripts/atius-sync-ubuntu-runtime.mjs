#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readlinkSync, readdirSync, symlinkSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ubuntuHome = '/home/ubuntu';
const baseCodexHome = process.env.CODEX_HOME?.trim() || path.join(ubuntuHome, '.codex');
const waylandDataDir = process.env.DATA_DIR?.trim() || path.join(ubuntuHome, '.config', 'Wayland');
const sourceConfigPath = '/var/lib/wayland/.config/Wayland/config/wayland-config.txt';
const targetConfigPath = path.join(waylandDataDir, 'config', 'wayland-config.txt');
const codexSkillsDir = path.join(baseCodexHome, 'skills');
const waylandSkillsDir = path.join(waylandDataDir, 'config', 'skills');
const generatedProviderId = 'atius-chatgpt-subscription';
const generatedAgentPrefix = 'codex-agent-profile-';
const generatedSlashCommandPrefix = 'atius-codex-skill-command-';
const generatedCommandTimestamp = Date.UTC(2026, 6, 10);
const slashCommandNamePattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

function decodeStorage(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) return {};
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(decodeURIComponent(decoded));
}

function encodeStorage(value) {
  return Buffer.from(encodeURIComponent(JSON.stringify(value)), 'utf8').toString('base64');
}

function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseTomlHeader(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escaped}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1].trim() : null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseSkillFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const field = (key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quoted = frontmatter.match(new RegExp(`^${escaped}:[ \\t]*["']([^"'\\n]+)["'][ \\t]*$`, 'm'));
    if (quoted) return quoted[1].trim();
    const plain = frontmatter.match(new RegExp(`^${escaped}:[ \\t]*(.+?)[ \\t]*$`, 'm'));
    return plain ? plain[1].trim().replace(/^['"]|['"]$/g, '') : null;
  };
  const name = field('name');
  if (!name) return null;
  return {
    name,
    description: field('description') || `Codex skill command: ${name}`,
  };
}

function listCodexSkillCommands() {
  if (!existsSync(codexSkillsDir)) return [];
  const commands = [];
  for (const entry of readdirSync(codexSkillsDir)) {
    const sourceDir = path.join(codexSkillsDir, entry);
    try {
      if (!lstatSync(sourceDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillFile = path.join(sourceDir, 'SKILL.md');
    const content = safeRead(skillFile);
    if (!content) continue;
    const parsed = parseSkillFrontmatter(content);
    const name = parsed?.name || entry;
    if (!slashCommandNamePattern.test(name)) continue;
    commands.push({
      name,
      description: parsed?.description || `Codex skill command: ${name}`,
      sourceDir,
    });
  }
  return commands.sort((left, right) => left.name.localeCompare(right.name));
}

function syncCodexSkillsIntoWayland(skills) {
  if (skills.length === 0) return 0;
  mkdirSync(waylandSkillsDir, { recursive: true });
  let changed = 0;
  for (const skill of skills) {
    const targetDir = path.join(waylandSkillsDir, skill.name);
    try {
      const targetStat = lstatSync(targetDir);
      if (targetStat.isSymbolicLink()) {
        const currentTarget = readlinkSync(targetDir);
        if (currentTarget === skill.sourceDir) continue;
        unlinkSync(targetDir);
      } else {
        // User-owned skill with the same name. Preserve it and let the user's
        // copy win while still exposing the slash command.
        continue;
      }
    } catch {
      // Target does not exist yet.
    }
    symlinkSync(skill.sourceDir, targetDir, 'dir');
    changed += 1;
  }
  return changed;
}

function buildGeneratedSlashCommands(skills) {
  return skills.map((skill) => ({
    id: `${generatedSlashCommandPrefix}${slugify(skill.name)}`,
    name: skill.name,
    description: skill.description,
    template: `$${skill.name} `,
    createdAt: generatedCommandTimestamp,
    updatedAt: generatedCommandTimestamp,
  }));
}

function currentCodexModelsFromStorage(config) {
  const models = config?.['acp.cachedModels']?.codex?.availableModels;
  if (!Array.isArray(models)) return [];
  return models
    .map((model) => (model && typeof model.id === 'string' ? model.id : null))
    .filter((model) => typeof model === 'string' && model.length > 0);
}

function currentCodexModelsFromModelConfig(config) {
  const providers = Array.isArray(config?.['model.config']) ? config['model.config'] : [];
  const provider = providers.find((entry) => entry && entry.id === generatedProviderId);
  if (!provider || !Array.isArray(provider.model)) return [];
  return provider.model.filter((model) => typeof model === 'string' && model.length > 0);
}

function listCodexModels(sourceConfig, targetConfig) {
  const cachedModels = currentCodexModelsFromStorage(sourceConfig);
  if (cachedModels.length > 0) return cachedModels;
  const targetCachedModels = currentCodexModelsFromStorage(targetConfig);
  if (targetCachedModels.length > 0) return targetCachedModels;
  const sourceModelConfig = currentCodexModelsFromModelConfig(sourceConfig);
  if (sourceModelConfig.length > 0) return sourceModelConfig;
  const targetModelConfig = currentCodexModelsFromModelConfig(targetConfig);
  if (targetModelConfig.length > 0) return targetModelConfig;

  try {
    const stdout = execFileSync('codex', ['debug', 'models'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: ubuntuHome,
        CODEX_HOME: baseCodexHome,
      },
      timeout: 30000,
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout);
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    return models
      .filter((model) => model && typeof model.slug === 'string' && model.visibility === 'list')
      .map((model) => model.slug);
  } catch {
    return ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex-spark'];
  }
}

function buildGeneratedProvider(existing, sourceConfig, targetConfig) {
  const models = listCodexModels(sourceConfig, targetConfig);
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    id: generatedProviderId,
    platform: 'openai-compatible',
    name: 'Chatgpt Subscription',
    baseUrl: 'https://chatgpt.com/backend-api',
    apiKey: '',
    model: models,
    enabled: true,
    modelEnabled: Object.fromEntries(models.map((model) => [model, true])),
  };
}


function pruneGeneratedCustomAgents(base) {
  const current = Array.isArray(base['acp.customAgents']) ? base['acp.customAgents'] : [];
  base['acp.customAgents'] = current.filter(
    (agent) => typeof agent?.id !== 'string' || !agent.id.startsWith(generatedAgentPrefix)
  );
}

function mergeSlashCommands(base, codexSkills) {
  const current = Array.isArray(base['slash.customCommands']) ? base['slash.customCommands'] : [];
  const preserved = current.filter(
    (command) => typeof command?.id !== 'string' || !command.id.startsWith(generatedSlashCommandPrefix)
  );
  const existingNames = new Set(
    preserved.map((command) => (typeof command?.name === 'string' ? command.name.toLowerCase() : null)).filter(Boolean)
  );
  const generated = buildGeneratedSlashCommands(codexSkills).filter(
    (command) => !existingNames.has(command.name.toLowerCase())
  );
  base['slash.customCommands'] = [...preserved, ...generated];
}

function mergeSkillsPreferences(base, codexSkills) {
  const current =
    base['skills.preferences'] && typeof base['skills.preferences'] === 'object'
      ? base['skills.preferences']
      : { pinned: [], disabled: [], revision: 0 };
  const disabled = Array.isArray(current.disabled) ? current.disabled : [];
  const pinned = Array.isArray(current.pinned) ? current.pinned : [];
  const disabledSet = new Set(disabled);
  const nextPinned = Array.from(new Set([...pinned, ...codexSkills.map((skill) => skill.name).filter((name) => !disabledSet.has(name))]));
  const changed = nextPinned.length !== pinned.length || base['skills.cliDiscovery.enabled'] !== true;
  base['skills.preferences'] = {
    pinned: nextPinned,
    disabled,
    revision: Number(current.revision || 0) + (changed ? 1 : 0),
  };
  base['skills.cliDiscovery.enabled'] = true;
}

function mergeModelConfig(base, sourceConfig, targetConfig) {
  const current = Array.isArray(base['model.config']) ? base['model.config'] : [];
  const preserved = current.filter((provider) => provider?.id !== generatedProviderId);
  const existing = current.find((provider) => provider?.id === generatedProviderId);
  base['model.config'] = [...preserved, buildGeneratedProvider(existing, sourceConfig, targetConfig)];
}

function mergeConfig(sourceConfig, targetConfig) {
  const merged = {
    ...targetConfig,
    ...sourceConfig,
  };

  if (!merged.language) {
    merged.language = sourceConfig.language || targetConfig.language || 'pt-BR';
  }
  if (!merged['guid.lastSelectedAgent']) {
    merged['guid.lastSelectedAgent'] = sourceConfig['guid.lastSelectedAgent'] || 'codex';
  }

  merged['codex.config'] = {
    ...((typeof targetConfig['codex.config'] === 'object' && targetConfig['codex.config']) || {}),
    ...((typeof sourceConfig['codex.config'] === 'object' && sourceConfig['codex.config']) || {}),
    sandboxMode: 'danger-full-access',
  };

  merged['acp.cachedModels'] = undefined;
  merged['acp.cachedConfigOptions'] = undefined;
  merged['acp.cachedInitializeResult'] = undefined;
  merged['acp.cachedModes'] = undefined;

  const codexSkills = listCodexSkillCommands();
  const syncedCodexSkills = syncCodexSkillsIntoWayland(codexSkills);

  mergeModelConfig(merged, sourceConfig, targetConfig);
  pruneGeneratedCustomAgents(merged);
  mergeSlashCommands(merged, codexSkills);
  mergeSkillsPreferences(merged, codexSkills);

  const hiddenAgents = Array.isArray(merged['agents.hidden']) ? merged['agents.hidden'] : [];
  merged['agents.hidden'] = Array.from(new Set([...hiddenAgents, 'gemini']));
  merged['atius.codexSkillSync'] = {
    skills: codexSkills.length,
    symlinksCreated: syncedCodexSkills,
    slashCommands: (merged['slash.customCommands'] || []).filter((command) =>
      String(command.id || '').startsWith(generatedSlashCommandPrefix)
    ).length,
  };
  return merged;
}

function main() {
  const sourceConfig = decodeStorage(sourceConfigPath);
  const targetConfig = decodeStorage(targetConfigPath);
  const merged = mergeConfig(sourceConfig, targetConfig);
  mkdirSync(path.dirname(targetConfigPath), { recursive: true });
  writeFileSync(targetConfigPath, encodeStorage(merged));
  console.log(
    JSON.stringify({
      targetConfigPath,
      generatedModels: (merged['model.config'] || []).find((provider) => provider.id === generatedProviderId)?.model || [],
      remainingGeneratedCustomAgents: (merged['acp.customAgents'] || []).filter((agent) =>
        String(agent.id || '').startsWith(generatedAgentPrefix)
      ).length,
      generatedSlashCommands: (merged['slash.customCommands'] || []).filter((command) =>
        String(command.id || '').startsWith(generatedSlashCommandPrefix)
      ).length,
      codexSkillSync: merged['atius.codexSkillSync'],
    })
  );
}

main();
