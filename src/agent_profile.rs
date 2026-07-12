use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default)]
pub struct AgentProfileArgs {
    pub agent_file: Option<PathBuf>,
    pub agent_profile: Option<String>,
    pub base_codex_home: Option<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct AgentProfileConfig {
    pub agent_file: PathBuf,
    pub profile_name: String,
    pub description: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub service_tier: Option<String>,
    pub sandbox_mode: Option<String>,
    pub developer_instructions: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct AgentProfileToml {
    name: Option<String>,
    description: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    service_tier: Option<String>,
    sandbox_mode: Option<String>,
    developer_instructions: Option<String>,
}

pub fn split_agent_profile_args(args: Vec<OsString>) -> Result<(AgentProfileArgs, Vec<OsString>)> {
    let mut parsed = AgentProfileArgs::default();
    let mut remaining = Vec::with_capacity(args.len());

    if let Some(arg0) = args.first() {
        remaining.push(arg0.clone());
    }

    let mut index = 1usize;
    while index < args.len() {
        let arg = &args[index];
        match arg.to_string_lossy().as_ref() {
            "--agent-file" => {
                index += 1;
                let value = args.get(index).context("missing value for --agent-file")?;
                parsed.agent_file = Some(PathBuf::from(value));
            }
            "--agent-profile" => {
                index += 1;
                let value = args
                    .get(index)
                    .context("missing value for --agent-profile")?;
                parsed.agent_profile = Some(value.to_string_lossy().into_owned());
            }
            "--base-codex-home" => {
                index += 1;
                let value = args
                    .get(index)
                    .context("missing value for --base-codex-home")?;
                parsed.base_codex_home = Some(PathBuf::from(value));
            }
            _ => remaining.push(arg.clone()),
        }
        index += 1;
    }

    Ok((parsed, remaining))
}

pub fn load_agent_profile(
    args: &AgentProfileArgs,
    codex_home: &Path,
) -> Result<Option<AgentProfileConfig>> {
    let Some(agent_file) = resolve_agent_file(args, codex_home)? else {
        return Ok(None);
    };

    let raw = std::fs::read_to_string(&agent_file)
        .with_context(|| format!("failed to read agent profile {}", agent_file.display()))?;
    let parsed: AgentProfileToml = toml::from_str(&raw)
        .with_context(|| format!("failed to parse agent profile {}", agent_file.display()))?;

    let fallback_name = agent_file
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.to_owned())
        .unwrap_or_else(|| "codex-agent-profile".to_string());

    Ok(Some(AgentProfileConfig {
        agent_file,
        profile_name: parsed.name.unwrap_or(fallback_name),
        description: parsed.description,
        model: parsed.model,
        reasoning_effort: parsed.reasoning_effort,
        service_tier: parsed.service_tier,
        sandbox_mode: parsed.sandbox_mode,
        developer_instructions: parsed.developer_instructions,
    }))
}

fn resolve_agent_file(args: &AgentProfileArgs, codex_home: &Path) -> Result<Option<PathBuf>> {
    if let Some(agent_file) = &args.agent_file {
        if !agent_file.exists() {
            bail!(
                "agent profile file does not exist: {}",
                agent_file.display()
            );
        }
        return Ok(Some(agent_file.clone()));
    }

    let Some(profile_name) = args.agent_profile.as_ref() else {
        return Ok(None);
    };

    let base = args
        .base_codex_home
        .as_ref()
        .cloned()
        .unwrap_or_else(|| codex_home.to_path_buf());
    let file_name = if profile_name.ends_with(".toml") {
        profile_name.clone()
    } else {
        format!("{profile_name}.toml")
    };
    let candidate = base.join("agents").join(file_name);
    if !candidate.exists() {
        bail!(
            "agent profile '{}' was not found under {}",
            profile_name,
            base.join("agents").display()
        );
    }
    Ok(Some(candidate))
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn split_agent_profile_args_preserves_codex_cli_overrides() -> Result<()> {
        let args = vec![
            "codex-acp".into(),
            "--agent-profile".into(),
            "reviewer".into(),
            "--base-codex-home".into(),
            "/tmp/base".into(),
            "--model".into(),
            "gpt-5.4".into(),
        ];

        let (profile, remaining) = split_agent_profile_args(args)?;
        assert_eq!(profile.agent_profile.as_deref(), Some("reviewer"));
        assert_eq!(profile.base_codex_home, Some(PathBuf::from("/tmp/base")));
        assert_eq!(
            remaining,
            vec![
                OsString::from("codex-acp"),
                OsString::from("--model"),
                OsString::from("gpt-5.4")
            ]
        );
        Ok(())
    }

    #[test]
    fn load_agent_profile_reads_runtime_selectors() -> Result<()> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let root = std::env::temp_dir().join(format!(
            "codex-acp-agent-profile-{}-{unique}",
            std::process::id()
        ));
        let agents_dir = root.join("agents");
        std::fs::create_dir_all(&agents_dir)?;
        let profile_path = agents_dir.join("reviewer.toml");
        std::fs::write(
            &profile_path,
            r#"
name = "Reviewer"
model = "gpt-5.4"
reasoning_effort = "high"
service_tier = "priority"
sandbox_mode = "workspace-write"
developer_instructions = "Review before editing."
"#,
        )?;

        let loaded = load_agent_profile(
            &AgentProfileArgs {
                agent_profile: Some("reviewer".to_string()),
                base_codex_home: Some(root.clone()),
                ..Default::default()
            },
            &root,
        )?
        .expect("profile should load");

        assert_eq!(loaded.profile_name, "Reviewer");
        assert_eq!(loaded.model.as_deref(), Some("gpt-5.4"));
        assert_eq!(loaded.reasoning_effort.as_deref(), Some("high"));
        assert_eq!(loaded.service_tier.as_deref(), Some("priority"));
        assert_eq!(loaded.sandbox_mode.as_deref(), Some("workspace-write"));
        assert_eq!(
            loaded.developer_instructions.as_deref(),
            Some("Review before editing.")
        );

        std::fs::remove_dir_all(root)?;
        Ok(())
    }
}
