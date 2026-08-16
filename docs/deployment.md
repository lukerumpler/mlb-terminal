# Deployment Guide

SKIP is configured for automated builds and deployment on Manus autoscaling infrastructure and production domains (`skipbasebal-mm6hz9ps.manus.space`).

## Environment Configuration

Managed environment variables (such as API keys and JWT secrets) are injected via platform secrets management (`webdev_request_secrets`).

## Release Gate

Every release checkpoint triggers automated deployment. Before checkpointing, always verify:

1. `pnpm run check`
2. `pnpm run lint`
3. `pnpm run test`
4. `pnpm run build`
