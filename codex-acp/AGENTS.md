# Codex ACP subtree instructions

This directory is the embedded ATIUS Codex ACP fork used by Wayland.

- Preserve compatibility with Wayland's `WAYLAND_CODEX_ACP_CLI` runtime.
- Keep `CODEX_HOME` account-aware model discovery, agent profiles, model effort,
  speed, permission, and the six-position advanced power ladder covered by
  focused tests.
- Run Rust build/tests under the ATIUS 20% total CPU guardrail through
  `../scripts/atius-build-codex-acp.sh`; do not run raw heavy cargo commands.
- Do not add nested `.git`, `target/`, credentials, or runtime home files.
- Update through `git subtree pull`, never by replacing this directory with an
  unversioned copy.
- Use multiple subagents for independent investigation, implementation, review,
  and validation fronts, with explicit non-overlapping ownership.
- Any Chrome DevTools, Playwright, Chromium, Chrome, or equivalent browser
  automation must run headless. Store screenshots, traces, console/network
  evidence, and reports as files; never open an automated visible browser.

<!-- codex-policy:parallel-headless:start -->
## Paralelismo e automacao de browser

- Use multiplos subagentes sempre que houver trabalho paralelo util. Atribua objetivos delimitados e sem sobreposicao, depois integre e valide os resultados no agente principal.
- Toda automacao de browser deve executar em modo headless, incluindo chrome-devtools, Playwright, Selenium, Puppeteer ou ferramenta equivalente. Nao abra janelas visiveis do browser.

<!-- codex-policy:parallel-headless:end -->
