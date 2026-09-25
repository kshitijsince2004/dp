# Warehouse / Ad-Hoc Report Builder — Implementation & Fix Report
**Date:** 2026-08-24  
**System:** PRISM (Police Reporting Intelligence and Statistics Management)

---

## 1. Phase 1 Findings

- **Warehouse Module State:** The `rpt.*` relational reporting schema was an unpopulated stub (0 tables in `rpt` schema). Per design spec §2.2, the pivot engine queries `records` and domain joins directly with parameterized filters, row-limit guards, and Node.js matrix pivoting.
- **`report_builder_saved` State:** Table existed but lacked `is_system_preset` and `visible_to_roles` columns. Migration `20260824000001_report_builder_presets.js` was created and applied.
- **Frontend Usage Before Work:** No interactive pivot table UI existed; previous pages were fixed multi-select drop-downs.

---

## 2. Component Implementation Matrix

| Component | File / Location | Status |
| :--- | :--- | :--- |
| **Reportable Fields Catalogue** | [`backend/config/warehouse/reportable-fields.json`](file:///d:/DPI/FIR/pharos-prototype/backend/config/warehouse/reportable-fields.json) | ✅ 14 Dimensions, 5 Measures |
| **Pivot Query Engine** | [`backend/src/modules/warehouse/pivot-engine.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/warehouse/pivot-engine.js) | ✅ Live JS matrix pivoting |
| **Field Catalogue & Run API** | [`backend/src/modules/warehouse/warehouse.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/warehouse/warehouse.controller.js) | ✅ `/api/v1/warehouse/fields`, `/run`, `/export` |
| **Warehouse Router** | [`backend/src/modules/warehouse/warehouse.router.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/warehouse/warehouse.router.js) | ✅ Routes mounted |
| **Saved & Quick Access API** | [`backend/src/modules/report-builder/reportBuilder.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-builder/reportBuilder.controller.js) | ✅ `/quick-access`, `/saved`, `/saved/:id/run` |
| **Role-Based Presets Seeding** | [`backend/scripts/seed-report-presets.js`](file:///d:/DPI/FIR/pharos-prototype/backend/scripts/seed-report-presets.js) | ✅ 10 preset rows seeded |
| **Report Builder Frontend** | [`frontend/src/pages/reports/ReportBuilder.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/pages/reports/ReportBuilder.jsx) | ✅ Drag/Click chips + Live 2D Matrix Grid |
| **Reports Page Nav & Quick Access** | [`frontend/src/pages/reports/ReportsPage.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/pages/reports/ReportsPage.jsx) | ✅ Tabbed view + Quick Access tiles |
| **Excel (.xlsx) Stream Export** | [`backend/src/modules/warehouse/warehouse.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/warehouse/warehouse.controller.js#L78) | ✅ ExcelJS formatted workbook export |

---

## 3. Security & Scope Verification

- **SQL Injection Guard:** **PASSED.** Unapproved field keys (e.g. `password_hash`) are rejected prior to query construction with `Invalid or unapproved dimension key: password_hash`.
- **Scope Enforcement:** **PASSED.** PS and District users are automatically constrained to `r.ps_id = :scopeId` or `r.district_id = :scopeId`.
- **Row Limit Guard:** **PASSED.** Limit set to `5000` rows maximum per pivot query; user is alerted if results exceed row limit.

---

## 4. Fields Available at Launch

### Dimensions (Rows / Columns):
1. **Police Station** (`ps_name`)
2. **District** (`district_name`)
3. **Crime Head** (`crime_head`)
4. **Act** (`act_name`)
5. **Case Status** (`case_status`)
6. **Record Type** (`record_type`)
7. **Workflow Status** (`workflow_status`)
8. **Month** (`month`)
9. **Year** (`year`)
10. **Arrest Type** (`arrest_type`)
11. **Gender** (`gender`)
12. **Social Status** (`social_category` - SC/ST/OBC/General)
13. **Educational Status** (`education`)
14. **Financial Status** (`financial_status`)

### Measures (Values):
1. **Number of Cases** (`case_count`)
2. **Number of Arrests** (`arrest_count`)
3. **Number of Persons** (`person_count`)
4. **Value of Property Stolen (₹)** (`property_value_stolen`)
5. **Value of Property Recovered (₹)** (`property_value_recovered`)

---

## 5. System Presets Seeded

1. **Cases by Police Station** (SHO, District Officer, HQ, Admin)
2. **Cases by Crime Head This Month** (SHO, District Officer, HQ, Admin)
3. **PS × Crime Head Cross-tab** (District Officer, HQ, Admin)
4. **Arrests by Type** (SHO, District Officer, HQ, Admin)
5. **Property Value Stolen by PS** (District Officer, HQ, Admin)
