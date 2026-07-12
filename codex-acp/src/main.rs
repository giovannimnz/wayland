use anyhow::Result;
use clap::Parser;
use codex_arg0::arg0_dispatch_or_else;
use codex_utils_cli::CliConfigOverrides;
use std::env;

fn main() -> Result<()> {
    arg0_dispatch_or_else(|args| async move {
        let (agent_profile_args, remaining_args) =
            codex_acp::agent_profile::split_agent_profile_args(env::args_os().collect())?;
        let cli_config_overrides = CliConfigOverrides::parse_from(remaining_args);
        codex_acp::run_main(
            args.codex_linux_sandbox_exe,
            cli_config_overrides,
            agent_profile_args,
        )
        .await?;
        Ok(())
    })
}
