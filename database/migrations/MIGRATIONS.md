# ImageCare ERP - Database Migrations

Version-controlled record of all schema changes.
Run these packs in order against the Supabase SQL Editor.
Never skip a version. Never re-run a completed migration without a verified backup.

---

## Deployed Migrations

| Version | Pack | Description | Status |
|---|---|---|---|
| IMC-DB-001-v1.0 | IMC-DB-001 | Database Architecture - 26 tables, shared engines, views | Deployed |
| IMC-DB-002-v1.0 | IMC-DB-002 | Authentication and Permissions | Deployed |
| IMC-DB-003-v1.0 | IMC-DB-003 | Business Engine - all transaction procedures | Deployed |
| IMC-DB-004-v1.0 | IMC-DB-004 | Offline Synchronization | Deployed |
| IMC-DB-005-v1.0 | IMC-DB-005 | Storage Architecture | Deployed |
| IMC-DB-006-v1.0 | IMC-DB-006 | Database Functions and Triggers | Deployed |
| IMC-DB-007-v1.0 | IMC-DB-007 | Performance and Indexing | Deployed |
| IMC-DB-008-v1.0 | IMC-DB-008 | Backup and Disaster Recovery | Deployed |

---

## Migration Rules

1. Always verify a backup exists before a destructive migration.
2. Test migrations in development before running in production.
3. Log every migration in `imagecare.schema_migrations` using `fn_log_migration()`.
4. Document rollback steps for every destructive change.
5. Never alter or delete audit_logs, inventory_movements, or journal_lines directly.

## Running a new migration

1. Write the SQL file and add it to this folder.
2. Test in development Supabase project.
3. Confirm backup of production database.
4. Run in Supabase SQL Editor (production).
5. Verify with `SELECT * FROM imagecare.fn_health_check();`
6. Log the migration:

```sql
SELECT imagecare.fn_log_migration(
  'IMC-DB-009-v1.0',
  'Description of what changed',
  'your-email@imagecare.ug',
  FALSE,   -- is_destructive
  'Rollback: DROP TABLE imagecare.new_table;',
  'supabase-backup-ref-if-applicable'
);
```

---

## Rollback Reference

| Version | Rollback Strategy |
|---|---|
| IMC-DB-001 | DROP SCHEMA imagecare CASCADE; |
| IMC-DB-002 through 008 | Restore from Supabase PITR to pre-deployment timestamp |

For non-destructive migrations (adding columns, adding indexes, adding functions):
rollback by reverting the specific change (DROP COLUMN, DROP INDEX, DROP FUNCTION).

For destructive migrations: restore from verified backup using IMC-DB-008 procedures.
