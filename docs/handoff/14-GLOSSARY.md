# PHAROS — Glossary of Terms
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** All engineers, analysts, and stakeholders

---

## 1. Delhi Police & Indian Legal Domain Terms

| Term | Full Form / Context | Definition |
|---|---|---|
| **FIR** | First Information Report | The initial written document prepared by police when receiving information about the commission of a cognisable offence. |
| **PS** | Police Station | The basic operational unit of policing, commanded by an SHO. |
| **SHO** | Station House Officer | Inspector-rank officer in charge of a police station. |
| **HC** | Head Constable | Senior police constable, often responsible for data entry and maintaining general diaries. |
| **IO** | Investigating Officer | Sub-Inspector, Inspector, or Assistant Sub-Inspector assigned to investigate a specific FIR case. |
| **ACP** | Assistant Commissioner of Police | Gazetted supervisory officer in charge of a Sub-Division (typically 3–4 police stations). |
| **DCP** | Deputy Commissioner of Police | Senior IPS/state officer commanding an entire Police District. |
| **JCP / Addl. CP** | Joint / Additional Commissioner of Police | Supervisory officer commanding a Range (several districts). |
| **SCP / Special CP** | Special Commissioner of Police | Senior officer heading a Zone or specialized department (Law & Order, Crime, Special Cell). |
| **CP** | Commissioner of Police | The highest-ranking officer and head of Delhi Police (PHQ). |
| **PHQ** | Police Headquarters | Central administrative and operational command headquarters of Delhi Police. |
| **BNS** | Bharatiya Nyaya Sanhita, 2023 | The primary criminal code of India, replacing the Indian Penal Code (IPC) from July 1, 2024. |
| **BNSS** | Bharatiya Nagarik Suraksha Sanhita, 2023 | The procedural criminal code of India, replacing the Code of Criminal Procedure (CrPC). |
| **BSA** | Bharatiya Sakshya Adhiniyam, 2023 | The law of evidence in India, replacing the Indian Evidence Act. |
| **L&SL** | Local and Special Laws | Non-BNS acts such as the Arms Act, NDPS Act, Excise Act, POCSO Act, and Delhi Police Act. |
| **Kalandra** | — | A preventive or minor offence complaint filed under sections of the BNSS/CrPC or DP Act rather than a formal FIR. |
| **DD / GD** | Daily Diary / General Diary | Station logbook recording every official action, departure, arrival, arrest, and call during a 24-hour cycle. |
| **PCR** | Police Control Room | Centralized emergency dispatch unit responding to public calls (Dial 112). |
| **UIDB** | Unidentified Dead Body | Inquest case registered when an unidentified deceased person is found within station jurisdiction. |
| **Zero FIR** | — | An FIR registered at any police station regardless of jurisdiction, which is later transferred to the competent station. |
| **PIR-JCL** | Police Investigation Report — Juvenile in Conflict with Law | Specialized investigation report / chargesheet filed when an accused is a juvenile under the Juvenile Justice Act. |
| **Challan** | — | Police chargesheet / final investigation report submitted to a magistrate court u/s 193 BNSS (173 CrPC). |
| **Untraced Report** | — | Final report submitted to court when a case is established but the accused/property could not be traced. |
| **Cancelled / False** | — | Final report submitted when investigation establishes that the complaint was unfounded or false. |
| **BC** | Bad Character | Repeat offender categorized in police registers for surveillance. |
| **HS** | History Sheeter | Person with an opened criminal history sheet subjected to periodic surveillance. |
| **PO** | Proclaimed Offender | Accused person declared a fugitive by court u/s 84 BNSS (82 CrPC). |
| **Worked-Out Case** | — | A registered case that has been successfully detected/solved and accused identified or apprehended (`is_worked_out = true`). |

---

## 2. PHAROS System & Engineering Terms

| Term | Context | Definition |
|---|---|---|
| **Spine Table** | Database Architecture | The central `records` table containing common metadata for all 5 record types (`CASE`, `ARREST`, `PCR_CALL`, `MISSING`, `UIDB`). |
| **Canonical Code** | Report Engine | Standardized string identifier on `ref.local_heads.canonical_code` (e.g. `MURDER`, `DACOITY`) used for consistent aggregation across diary sheets. |
| **FN Diary** | Fortnightly Diary | Standard 41-sheet statistical report compiled every fortnight for every police station. |
| **PHQ Diary** | Headquarters Diary | Master compiled 9-sheet district and state-level crime summary workbook. |
| **`@PRIOR`** | State Machine | Special target status in `workflow_transitions_config` that dynamically restores a record's pre-transfer status from the audit ledger. |
| **`DIRECT_HQ`** | Routing Contracts | Routing rule defined in `level_data_contracts` allowing district approvals to route directly to HQ. |
| **`is_dd_based`** | Data Model | Boolean flag on `arrest_details` indicating whether an arrest is a Kalandra (`true`) or tied to an FIR (`false`). |
| **`is_frozen`** | Data Invariant | Boolean flag on `records` set to `true` upon HQ acceptance, locking the record from direct edits. |
| **Hash Chain** | Tamper Evidence | Cryptographic SHA-256 chain where each `record_revisions` entry hashes its payload combined with the preceding revision's hash. |
| **Field Registry** | Dynamic Forms | The `field_registry` table storing schema, labels, and validation rules that dynamically construct frontend form inputs. |
| **`show_when`** | Form Logic | JSON rule on a field registry entry specifying conditions under which the input should be rendered. |
| **Measure (M-xx)** | Diary Spec | Discrete statistical calculation rule (e.g. M-01 Case Count, M-02 Worked Out, M-05 Arrests). |
| **Window (W-xx)** | Diary Spec | Standardized temporal filter window (e.g. `W-FN` Fortnight, `W-UPTO` Year-to-Date). |
| **`enforceScope`** | Security Middleware | Express middleware restricting database queries strictly to the user's assigned station, district, or global scope. |
