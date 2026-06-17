# Jennian IQ Deployment Runbook

## Production Target

- Cloudflare account: `haydon.christian@jennian.co.nz`
- Pages project: `jennian-iq-prod`
- Production domains: `https://jennianiq.nz` and `https://www.jennianiq.nz`
- Non-production/dev project observed: `jennian-iq` in the `qiao65162@gmail.com` Cloudflare account

Do not treat a deploy to `jennian-iq` as production. It does not serve the public Jennian IQ domains.

## Preflight

Run these checks before any manual deploy:

```powershell
npx wrangler whoami
npx wrangler pages project list
```

Expected production identity:

- Account email is `haydon.christian@jennian.co.nz`.
- Project list includes `jennian-iq-prod`.
- Project domains include `jennianiq.nz` and `www.jennianiq.nz`.

## Build And Deploy

```powershell
npm run build
npx wrangler pages deploy dist/client --project-name jennian-iq-prod --branch main --commit-dirty=true
```

Only use `--commit-dirty=true` when deliberately deploying an audited local slice before commit.
Record that fact in `STATE.md`.

## Live Verification

After deploy, verify the custom domains, not only the preview URL:

```powershell
$hosts = @(
  "https://jennian-iq-prod.pages.dev",
  "https://jennianiq.nz",
  "https://www.jennianiq.nz"
)

foreach ($baseUrl in $hosts) {
  $html = (Invoke-WebRequest "$baseUrl/login" -Headers @{ "Cache-Control" = "no-cache" } -UseBasicParsing).Content
  $login = ($html | Select-String -Pattern 'login-[A-Za-z0-9_\-]+\.js' -AllMatches |
    ForEach-Object { $_.Matches.Value } | Select-Object -First 1)
  $js = (Invoke-WebRequest "$baseUrl/assets/$login" -Headers @{ "Cache-Control" = "no-cache" } -UseBasicParsing).Content
  [pscustomobject]@{
    Host = $baseUrl
    LoginChunk = $login
    RequiresPasswordSetup = $js.Contains("requiresPasswordSetup")
    SetPasswordRoute = $js.Contains("/auth/set-password")
  }
}
```

For auth-sensitive releases, the production custom domains must show the expected guard strings before invites resume.

## Erin Invite Bug Verification

The invite security fix requires:

- `profiles.status = "invited"` users cannot enter app routes.
- Invited users with a Supabase session redirect to `/auth/set-password`.
- Password setup updates `profiles.status` to `"active"` only after password save succeeds.
- `https://www.jennianiq.nz/login` serves a bundle containing `requiresPasswordSetup`.
