# Staging provider-failure hook

The Savant proxy has an intentional failure hook for controlled staging validation. It is disabled unless all three conditions are true: `NODE_ENV` is exactly `staging`, `STAGING_PROVIDER_FAILURE_HOOK_ENABLED` is exactly `true`, and the request supplies the configured `STAGING_PROVIDER_FAILURE_HOOK_TOKEN`.

Production and development requests are rejected even when the token is present. The token is managed as an environment secret and is not stored in this repository.

To force a synthetic Savant failure in staging, send both headers to the normal Savant endpoint:

```bash
curl -H 'x-staging-provider-failure: true' \
  -H "x-staging-provider-failure-token: $STAGING_PROVIDER_FAILURE_HOOK_TOKEN" \
  'https://<staging-host>/api/savant?endpoint=expected_statistics&year=2026'
```

An authorized request returns HTTP `503`, `Cache-Control: no-store`, and the JSON code `STAGING_PROVIDER_FAILURE`. Invalid, missing, development, and production requests do not reach the upstream provider and return HTTP `403` when the failure header is requested.
