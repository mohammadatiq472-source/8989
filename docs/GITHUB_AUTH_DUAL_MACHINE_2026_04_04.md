# GitHub Auth Hardening for Dual-Machine A/B

## Goal

Move from classic PAT usage to a cleaner dual-machine model:

- SSH key per machine (`A` and `B`) as the primary auth path.
- Fine-grained PAT only as short-lived emergency fallback.
- No token embedded in remote URLs.
- A/B GitHub identities are fixed:
  - A: `mohammadatiq472-source`
  - B: `rltsgxol4437`

## Threats We Eliminate

- Accidental PAT leak in terminal history.
- Shared PAT reused across both machines.
- Local git config pinning stale credential usernames.
- Hidden `extraheader` token left in local repo config.

## Repo-Side Scripts

- `scripts/security/setup_github_ssh.ps1`
- `scripts/security/harden_repo_git_auth.ps1`
- `scripts/security/validate_git_auth_posture.ps1`

Formal entry commands:

- `npm run security:auth:validate`
- `npm run security:auth:harden`
- `npm run security:branch:protect`

## Machine A / B Setup

Run on each machine once:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/setup_github_ssh.ps1 -MachineId A -GitHubUser mohammadatiq472-source -Email your-email@example.com
```

For machine B, run:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/setup_github_ssh.ps1 -MachineId B -GitHubUser rltsgxol4437 -Email your-email@example.com
```

Then add the printed public key into GitHub:

- GitHub -> Settings -> SSH and GPG keys -> New SSH key
- Title recommendation: `8989-A` or `8989-B`

## Harden Existing Repo

Optional SSH remote switch:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/harden_repo_git_auth.ps1 -RepoPath . -SwitchRemoteToSsh -RemoteHostAlias github.com -Owner mohammadatiq472-source -Repository 8989
```

This also clears risky local credential overrides:

- `credential.username`
- `http.https://github.com/.extraheader`

## Validation Chain (Reproducible)

1. Run posture check:

```powershell
npm run security:auth:validate
```

2. If risk items exist, run hardening:

```powershell
npm run security:auth:harden
```

3. Re-run posture check and confirm `riskCount` drops.

## Branch Protection and Review Gate

Apply standard dual-machine PR policy (when account plan supports branch protection on this repo):

```powershell
npm run security:branch:protect
```

Expected rules:

- Require status checks:
  - `phase5-hardening-gate / hardening-gate`
  - `dual-machine-pr-gate / dual-machine-review-gate`
- Require 1 approval (the workflow gate enforces that approval must come from the other machine account)
- Require CODEOWNERS review
- Require conversation resolution
- Block force-push and branch deletion

`dual-machine-pr-gate` enforcement details:

- PR author must be one of: `mohammadatiq472-source`, `rltsgxol4437`
- At least one `APPROVED` must come from the counterpart account (not PR author)
- PR body required checklist items must all be checked

If GitHub returns plan limitation (`Upgrade to GitHub Pro...`), keep using workflow+template+CODEOWNERS fallback until plan upgrade or public repo mode.

## PAT Fallback Policy

Use fine-grained PAT only when SSH is unavailable:

- Scope to this single repository.
- Limit permission to minimum required (`Contents: Read/Write`, `Pull requests: Read/Write`).
- Expire quickly (for example 7 days).
- Never store token in remote URL.

After recovery, return to SSH and revoke fallback PAT immediately.
