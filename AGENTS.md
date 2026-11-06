# BELL agent instructions

Read `docs/PRD.md`, `docs/OPTIONAL_COVER.md`, `docs/DEPLOYMENTS_AND_DEMO.md` and `docs/HOSTED_DEMO.md` before changing the application.

- No git writes without Pallavi's authorization. Preserve the owner's author and committer identity; no coauthors.
- Ask before structural changes, new dependencies, contract/interface changes or money-logic changes.
- Keep the frontend design, layouts and visual assets unchanged.
- Money logic lives in `contracts/`; engine parity is exact. Never hard-code demo outcomes.
- Actors sign their own financial transactions. Never inspect or request wallet secrets.
- Keys and credentials stay in ignored runtime environment files. Never print, commit or upload local env files, private keys, tokens or signed journals.
- Preserve source, tests, documentation and operational instructions. Never clean the project tree to prepare an upload or deployment. Create a separate staging directory and copy an explicit allowlist into it.
- Never run broad destructive cleanup commands in the workspace. Limit any authorized staging cleanup to the exact temporary directory created for that task.
- Recover public files from the authoritative repository using hashes. Restore missing files without overwriting unrelated work. Do not use old partial documentation as a substitute for the current version.
- Report actual checks separately from unverified claims. A build, preview or health response does not establish successful connected-wallet replay.
