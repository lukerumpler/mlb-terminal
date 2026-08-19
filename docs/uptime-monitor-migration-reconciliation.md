# Uptime Monitor Migration Reconciliation

The production database already contains `uptime_monitor_checks` and `uptime_monitor_schedules`, with the expected columns and indexes. The generated Drizzle migration `drizzle/0003_dark_jocasta.sql` matches those additive tables.

The production `__drizzle_migrations` table currently contains only the baseline ledger row corresponding to the initial migration timestamp. It does not contain records for every migration represented in the repository journal. Because the ledger is already incomplete, inserting only an uptime-monitor row would create a misleading partial history and could cause future migration tooling to make incorrect assumptions.

For this feature, the safe reconciliation is therefore documentary: the schema was applied idempotently before deployment, the generated migration is retained in source control as the schema record, and no fabricated ledger entry is inserted. Future schema changes should first establish a complete migration-ledger baseline or use an approved migration-runner procedure rather than manually adding a single hash.
