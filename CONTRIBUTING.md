# Contributing & Engineering Discipline Guidelines

## Mandatory Standing Documentation Requirement

For any feature work, bug fix, or refactoring in the **PHAROS Reporting Module** (Station Daily Diary, District Diary, PHQ Diary), all contributors and AI agents must adhere to the following mandatory standing practice:

1. **Keep `DECISIONS.md` in Sync**:
   - Any architectural decision, mathematical rule change (e.g., variation %, detection %), reference taxonomy update (e.g., `ref.local_heads` codes, BNS classifications), or sheet addition/removal **MUST** be logged in `DECISIONS.md` before the task is considered complete.
   - Each entry must include: **Decision**, **Rationale/Context**, **Evidence (file:line / query)**, **Files Touched**, and **Confidence**.

2. **Keep `FLOW.md` in Sync**:
   - Any modification to report execution pipelines, data flow diagrams, hierarchy levels (`HQ` $\rightarrow$ `ZONE` $\rightarrow$ `RANGE` $\rightarrow$ `DISTRICT` $\rightarrow$ `SUB_DIV` $\rightarrow$ `PS`), sheet inventories, or rendering engines **MUST** update `FLOW.md` as part of the same pull request.

3. **Fortnightly Diary (FN Diary) Scope Guardrail**:
   - The Fortnightly Diary (`backend/src/modules/report-engine/fn/`, `stat-01` through `stat-41`, and associated cron schedulers) is independent and strictly **OUT OF SCOPE** during Daily, District, and PHQ diary refactoring passes.

4. **Verify Live Code & Invariants**:
   - Source code and database schemas are the primary source of truth. Always verify claims with live file inspections or SQL queries before committing documentation.
