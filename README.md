# Story Memory Manager v0.11.12 HYBRID

This release is a correctness fix for the v0.11.11 hybrid 0-API rebuild pipeline.

The pipeline remains:

1. Use a reliable preset `<abstract><plot>` directly when available.
2. Otherwise accept only conservative deterministic factual extraction.
3. If neither is safe, create no visible timeline event; record the source rows as checked and `needs AI`.

v0.11.12 fixes the runtime triage initialization bug and makes the reliable/needs-AI accounting correspond to events that were actually accepted.

Recommended recovery after upgrading from v0.11.11:

- Keep automatic summarization, memory injection, and automatic hiding disabled.
- Re-run the desired 0-API code rebuild range.
- Verify the completion message reports `reliable N / needs AI M` and does not show `triage is not defined`.
- Only after reviewing the rebuilt timeline should injection/hiding be re-enabled.
