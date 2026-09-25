# PHAROS — Product Requirements Document
**Version:** 1.0 | **Date:** 2026-08-18 | **Status:** Prototype | **Audience:** Product managers, stakeholders, senior police officers, DPI leadership

---

## 1. Executive Summary

PHAROS (Police Hierarchy Analytics and Reporting Operations System) is a digital platform built for Delhi Police to replace paper-based police station record-keeping and the manual compilation of fortnightly crime statistics. It digitises the full lifecycle of five types of daily station records — registered FIR cases, arrests, PCR calls, missing persons, and unknown dead bodies — and routes each record through a verified multi-level approval chain from the police station to district headquarters and ultimately to Police Headquarters (PHQ).

The immediate problem PHAROS solves is the fortnightly diary: today, every Station House Officer manually compiles crime statistics from paper registers into Excel sheets, which are then physically forwarded to district offices, re-keyed into district summaries, and finally consolidated at PHQ — a process taking approximately 8 hours per station, per fortnight, with significant opportunity for error and delay. PHAROS eliminates this entirely by generating the Fortnightly Diary automatically from live record data in under 2 minutes.

As of August 2026, PHAROS is a working prototype with all five record types operational, a complete multi-level workflow, 25+ fortnightly diary sheets producing live data, analytics dashboards at PS, District, and HQ levels, and bulk data import capability. It is ready for supervised pilot deployment at selected Delhi Police stations.

---

## 2. Background & Problem Statement

### 2.1 Current situation

Delhi Police operates 225 police stations (PS) across 23 districts. At each station, records are created manually in physical registers:

- **FIR Register**: First Information Reports for cognisable offences
- **General Diary / Daily Diary**: All station events including PCR responses, arrests, and miscellaneous entries
- **Missing Persons Register**: Cases of persons reported missing
- **UIDB Register**: Unknown/unidentified dead body inquests

At the end of each fortnight, the Station House Officer (SHO) manually tabulates all entries into the **Fortnightly Diary** — a standardised 41-sheet statistical report showing crime counts by category, status, arrests, recoveries, and more. This report is forwarded to the District office, where District Officers aggregate across all stations in their district and produce the **PHQ Diary** — a district-level compiled report sent to headquarters.

### 2.2 Impact of the current situation

| Problem | Impact |
|---|---|
| Manual tabulation every fortnight | ~8 hours per SHO per fortnight for 225 stations |
| No single source of truth | Same data re-entered at PS, District, and PHQ |
| No real-time visibility | DHQ and PHQ see data only after physical file submission |
| No audit trail | No record of who changed what, when, or why |
| Compilation errors | Transcription errors propagate undetected through hierarchy |
| Delayed response | Senior officers cannot act on crime trends until diary is compiled |

---

## 3. Solution Overview

PHAROS digitises the following capabilities:

| Capability | Description |
|---|---|
| **FIR Registration** | Digital creation and management of FIR cases with full offence details |
| **Arrest Management** | FIR-based and Kalandra/DD-based arrests with custody tracking |
| **PCR Call Records** | Emergency PCR call logging with outcome tracking |
| **Missing Persons** | Missing person registration with search status tracking |
| **UIDB Records** | Unknown dead body inquest records |
| **Multi-level Workflow** | Structured approval chain from Head Constable → SHO → District → HQ |
| **Automated Diary Generation** | FN Diary, PHQ Diary, District Diary, Daily Diary — generated from live data |
| **Analytics Dashboards** | Real-time crime statistics for PS, District, and HQ audiences |
| **Bulk Data Import** | Historical record import via validated Excel templates |
| **Audit Trail** | Tamper-evident record of every change to every record |

---

## 4. Users & Roles

| Role | Delhi Police Rank Equivalent | What They Do in PHAROS |
|---|---|---|
| **HC (Head Constable)** | Head Constable / Data Entry Operator | Creates all five record types; submits to SHO for review |
| **SHO (Station House Officer)** | Inspector / ACP (in-charge) | Reviews HC submissions; approves or returns for correction; manages IO assignments |
| **ACP** | Assistant Commissioner of Police | Sub-division oversight; intermediate review (config available but not yet activated) |
| **DISTRICT_OFFICER** | Deputy Commissioner of Police | District-level review and approval; compiles district records; head overrides |
| **JCP** | Joint Commissioner of Police | Senior intermediate level (role defined; transitions not yet configured) |
| **SCP** | Special Commissioner of Police | Senior level (role defined; transitions not yet configured) |
| **HQ_ANALYST** | PHQ Crime Branch Analyst | Read-only access to all districts; generates PHQ diary and analytics |
| **HQ_ADMIN** | PHQ Administration | Manages the platform; seals records; manages schedules |
| **SYSTEM_ADMIN** | Platform Administrator (DPI Team) | Full system access including hierarchy, field registry, and audit chain |

---

## 5. Command Hierarchy

PHAROS mirrors the six-level Delhi Police command structure:

```
HQ (Commissioner of Police)
  └── ZONE (Joint/Additional CP)
        └── RANGE (DCP)
              └── DISTRICT (DCP / District)
                    └── SUB_DIV (ACP)
                          └── PS (SHO / Station)
```

Each level in the hierarchy sees a progressively broader scope of records:
- **PS users** (HC, SHO): See only records belonging to their own station
- **District users** (DISTRICT_OFFICER): See all records in their district
- **HQ users** (HQ_ANALYST, HQ_ADMIN): See all records across all districts
- **System Admin**: Unrestricted access

---

## 6. Key Capabilities

### 6.1 Record Types

| Type | What It Represents | Who Creates It | Key Data |
|---|---|---|---|
| **CASE (FIR)** | Registered First Information Report for a cognisable offence | Head Constable | FIR number, local crime head, offence sections, brief facts, complainant & accused details, property recovered |
| **ARREST** | Arrest of a person — either against an existing FIR or under preventive (Kalandra/DD) powers | Head Constable | Arrest type, accused details, linked FIR or GD number, custody status |
| **PCR_CALL** | Emergency response to a Police Control Room call | Head Constable | Call number, call type, location, responding officer, outcome |
| **MISSING** | Person reported missing at the police station | Head Constable | Missing person description, circumstances, search outcome |
| **UIDB** | Unknown or unidentified dead body found in jurisdiction | Head Constable | Body description, inquest officer, post-mortem details |

### 6.2 Workflow

A record's journey through PHAROS follows a structured path:

1. **HC creates** a record (status: DRAFT) and submits it
2. **SHO reviews** and either approves (forward) or returns it for correction
3. **District Officer** reviews the SHO-approved record and approves
4. **HQ receives** and accepts the record — at which point it is frozen and no further edits are permitted

At any stage, a record can be **returned** to the previous level for correction. The originating HC is notified and can re-edit and resubmit.

**Transfer flow**: A case can be transferred from one PS to another or to a specialised agency. The original PS initiates the transfer; the receiving PS accepts (or rejects). After acceptance, the record's ownership moves to the receiving station.

**Amendments**: Accepted records (frozen) can be amended through a formal amendment flow if significant corrections are needed post-acceptance.

### 6.3 Diary Generation

The **Fortnightly Diary** (FN Diary) is generated per police station for any chosen fortnightly period. It produces a 41-sheet Excel workbook covering all standard statistical categories required by PHQ. The diary is generated from live database records — no manual tabulation required.

The **PHQ Diary** is a district-level compiled report produced by HQ analysts, aggregating all station data across one or more districts.

The **District Diary** and **Daily Diary** provide station-level daily and listing views in standardised format.

### 6.4 Analytics

| Dashboard | Who Sees It | What It Shows |
|---|---|---|
| **PS Dashboard** | SHO, HC | Total cases, arrest rates, case status breakdown, monthly trends for this station |
| **District Dashboard** | DISTRICT_OFFICER | Cross-station comparison, district totals, station performance metrics |
| **HQ Dashboard** | HQ_ANALYST, HQ_ADMIN | All-Delhi crime trends, district comparison, top categories |
| **Analytics Deep-Dive** | All senior roles | Crime head matrix, year-on-year comparison, export to Excel |

---

## 7. What Is NOT in Scope (This Prototype)

- **Court proceedings tracking** — investigation ends at chargesheet; NJDG court data is not integrated
- **Keycloak SSO** — code path exists but is untested; JWT-only mode is active
- **Mobile / PWA** — desktop browser only
- **ZONE and RANGE level workflow** — hierarchy exists but workflow transitions not configured
- **Full Kalandra disposal register** — arrests captured; disposal outcomes (bound down / convicted) not tracked
- **PO (Proclaimed Offender) register** — STAT_15 is structurally defined but data source not built
- **Daily manpower returns** — STAT_34 requires daily deployment data not yet entered
- **Email notifications** — infrastructure exists; SMTP not configured

---

## 8. Success Metrics

| Metric | Current (Manual) | Target (PHAROS) |
|---|---|---|
| Time to generate FN Diary | ~8 hours per station | < 2 minutes |
| Data entry per record | Duplicate (paper + Excel) | Single entry |
| Compilation errors per fortnight | Unknown (unaudited) | 0 (auto-calculated) |
| Real-time visibility for DCP | None | Full (live dashboard) |
| Audit trail coverage | None | 100% (hash-chained revisions) |

---

## 9. Constraints

- Must run on Delhi Police internal network (no public internet exposure required)
- Must support Hindi and English in forms and labels
- Must produce Excel output compatible with the existing PHQ Fortnightly Diary format
- Must preserve backward compatibility with existing paper-based workflows during phased rollout
- Must complete diary generation within 3 minutes for a station with 500 records
