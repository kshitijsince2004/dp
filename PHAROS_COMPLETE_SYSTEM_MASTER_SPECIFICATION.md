# PHAROS: Complete Master Specification & Feature Status Report (All 65 Features)

---

## Executive Summary & System Overview

**PHAROS (Police Hierarchical Analysis, Reporting & Operations System)** is the enterprise digital operating system designed for Delhi Police to unify police station records, operational diaries, crime classification, hierarchical approvals, and statutory headquarters reporting into one integrated platform.

The system replaces manual station registers, detached spreadsheets, and physical paper files with a unified digital workflow spanning from ground-level station personnel (Head Constables, Investigating Officers, and Station House Officers) to senior supervisory command (ACPs, District DCPs, and Police Headquarters).

To provide complete, transparent visibility across the entire platform, all **65 distinct features, sub-modules, and capabilities** are documented under **three distinct, non-overlapping categories**:

1. **COMPLETED (Done)**: Features fully developed, merged in git, active in the codebase, and operational.
2. **ONGOING (In-Progress)**: Features actively being refactored, formulas being aligned, open bug fixes being patched, or validation tests currently running.
3. **LEFT (Pending to Build)**: Features that are planned, scheduled for upcoming production sprints, or awaiting external integrations (e.g., SMS gateways, 112 CAD server APIs).

---

## SECTION 1: Authentication, Security & Jurisdictional Hierarchy (Features 1–5)

---

### Feature 1: User Authentication, Session Security & Password Vault
* **Category 1: Completed (Done)**:
  * User login with encrypted JSON Web Tokens (JWT) and refresh token rotation.
  * Passwords securely hashed with `bcrypt` salt rounds.
  * API session authentication middleware on all protected backend routes.
* **Category 2: Ongoing (In-Progress)**:
  * Optimizing refresh token renewal during concurrent tab usage in web browsers.
* **Category 3: Left (Pending to Build)**:
  * Two-factor authentication (SMS OTP / Authenticator App) for SHO sign-offs.
  * Automatic inactivity session logout after 15 minutes of idle time on station terminals.

---

### Feature 2: 7-Tier Hierarchical Role-Based Access Control (RBAC)
* **Category 1: Completed (Done)**:
  * 7 distinct ranks mapped: Head Constable (`HC`), Investigating Officer (`IO`), Station House Officer (`SHO`), Assistant Commissioner (`ACP`), Deputy Commissioner (`DCP`), Joint Commissioner (`JCP`), and Headquarters Admin (`PHQ_ADMIN`).
  * Backend route authorization middleware (`authorize(['SHO', 'DCP'])`).
* **Category 2: Ongoing (In-Progress)**:
  * Fine-tuning permission sets for Reader / Statistical Clerks at the District level.
* **Category 3: Left (Pending to Build)**:
  * Temporary rank delegation workflow for acting SHOs while regular officers are on leave.

---

### Feature 3: Geographic Jurisdictional Scoping Engine
* **Category 1: Completed (Done)**:
  * 8-level administrative tree: State $\to$ Zone $\to$ Range $\to$ District $\to$ Sub-Division $\to$ Police Station $\to$ Beat $\to$ Outpost.
  * Centralized `scopeResolver.js` automatically enforcing data boundaries per user rank.
* **Category 2: Ongoing (In-Progress)**:
  * Multi-district aggregation speed optimizations for Delhi-wide queries.
* **Category 3: Left (Pending to Build)**:
  * Specialized non-geographic unit scoping (Crime Branch, Special Cell, Traffic, Metro Police).

---

### Feature 4: Specialized Police Units & Non-Geographic Jurisdictions
* **Category 1: Completed (Done)**:
  * Database schema support for specialized police units (Special Cell, Crime Branch, Cyber Police, Traffic Police, Metro Police).
* **Category 2: Ongoing (In-Progress)**:
  * Cross-district data routing for multi-jurisdictional crime cases.
* **Category 3: Left (Pending to Build)**:
  * Dedicated specialized unit operational dashboards with cross-district search filters.

---

### Feature 5: Immutable Audit Trail & Action History Logging
* **Category 1: Completed (Done)**:
  * Dedicated `audit_logs` table tracking user ID, IP address, timestamp, action type, and field-level before/after diffs.
  * Non-deletable, append-only architecture.
* **Category 2: Ongoing (In-Progress)**:
  * Indexing audit log tables to support high-speed historical searching.
* **Category 3: Left (Pending to Build)**:
  * Cryptographic hash-chaining across audit rows to make logs mathematically tamper-evident.
  * Visual audit diff viewer in the admin control panel.

---

## SECTION 2: Dynamic Form Engine & Case Intake (Features 6–12)

---

### Feature 6: Zero-Hardcoding JSON Form Field Engine (419 Master Fields)
* **Category 1: Completed (Done)**:
  * 419 master fields configured across 6 modular JSON configs: `case.json` (163), `common.json` (118), `arrest.json` (65), `uidb.json` (33), `missing.json` (32), `pcr_call.json` (8).
  * Dynamic React form builder rendering text inputs, selects, date-pickers, textareas, and cascading dropdowns.
* **Category 2: Ongoing (In-Progress)**:
  * Fixing the boolean radio button state restoration bug where Yes/No fields occasionally reset to unchecked on form reopen.
* **Category 3: Left (Pending to Build)**:
  * Offline LocalStorage caching in the browser to prevent data loss during station internet drops.

---

### Feature 7: Case & First Information Report (FIR) Intake Pipeline
* **Category 1: Completed (Done)**:
  * FIR indexing (`FIR No. / Registration Year / Police Station`).
  * Occurrence date vs registration date validation.
  * Complainant details, incident location, statutory sections, and narrative summary.
* **Category 2: Ongoing (In-Progress)**:
  * Validation rules preventing future-dated occurrence timestamps.
* **Category 3: Left (Pending to Build)**:
  * Automated PDF generator for official Delhi Police State FIR Form 1.
  * Spell-check and auto-complete for commonly used legal terms in incident narratives.

---

### Feature 8: Dual Statutory Law Engine (IPC & BNS 2023 Cross-Referencer)
* **Category 1: Completed (Done)**:
  * Dual-law search allowing selection of sections from either Indian Penal Code (IPC) or Bharatiya Nyaya Sanhita (BNS 2023).
  * Cross-reference lookup table connecting legacy IPC sections to corresponding BNS provisions.
* **Category 2: Ongoing (In-Progress)**:
  * Updating statutory schedule mappings for special local laws (SLL).
* **Category 3: Left (Pending to Build)**:
  * AI-assisted section recommendation based on entered incident description keywords.

---

### Feature 9: Primary vs. Secondary Offence Classification Engine
* **Category 1: Completed (Done)**:
  * Database flag `record_offences.is_primary = TRUE` ensuring cases with multiple charges are grouped under the most heinous crime.
  * Statutory reports use this flag to eliminate duplicate counts.
* **Category 2: Ongoing (In-Progress)**:
  * Enforcing primary section rules across all remaining Fortnightly report renderers.
* **Category 3: Left (Pending to Build)**:
  * Automatic validation warning if a minor bailable charge is mistakenly marked primary over a heinous charge.

---

### Feature 10: Arrest Memo & Custody Intake Logging
* **Category 1: Completed (Done)**:
  * Date/time of arrest, arresting officer, grounds of arrest, relative intimation, and medical examination record.
  * Fixed Bug 1 (`crime_head` mapping) routing arrest classification to `$detail.local_head_id`.
* **Category 2: Ongoing (In-Progress)**:
  * Splitting free-text "Place of Arrest" in `arrest.json` into structured location fields.
* **Category 3: Left (Pending to Build)**:
  * Automated 24-hour court production countdown timer with visual alerts for SHOs.

---

### Feature 11: Preventive Detention & Kalandra Module
* **Category 1: Completed (Done)**:
  * Separate tracking for preventive detentions (Sections 107/151 CrPC / Sections 126/170 BNSS).
  * Preventive actions flagged with `is_dd_based = true` within the configured General Diary time window (`PREVENTIVE_ACTION_START_TIME` to `PREVENTIVE_ACTION_END_TIME`).
* **Category 2: Ongoing (In-Progress)**:
  * Isolating preventive detentions from FIR auto-linking queries.
* **Category 3: Left (Pending to Build)**:
  * Executive magistrate bail bond and surety verification tracking.

---

### Feature 12: General Diary (GD) Time Window Enforcement
* **Category 1: Completed (Done)**:
  * Enforces configured GD time parameters for valid preventive action logging.
* **Category 2: Ongoing (In-Progress)**:
  * Time-drift validation between station server clock and database clock.
* **Category 3: Left (Pending to Build)**:
  * Automatic alerting if preventive action entries are submitted outside the official time window.

---

## SECTION 3: Entity Registries & Demographics (Features 13–16)

---

### Feature 13: Centralized Person & Demographics Registry
* **Category 1: Completed (Done)**:
  * Centralized `persons` table for Accused, Victims, Complainants, Informers, and Witnesses.
  * Stores full name, alias, parentage/spouse, age, gender, mobile, ID proofs, and addresses.
* **Category 2: Ongoing (In-Progress)**:
  * Standardizing alias and nickname indexing for high-speed search.
* **Category 3: Left (Pending to Build)**:
  * Biometric fingerprint template ID reference field.

---

### Feature 14: Sensitive Victim Identity & DPDP Compliance Protection
* **Category 1: Completed (Done)**:
  * Identification of vulnerable categories: Minors/Juveniles, Women, Senior Citizens, Foreign Nationals.
  * Automated identity masking for POCSO and Rape victims on dashboards and public exports in strict compliance with the law.
* **Category 2: Ongoing (In-Progress)**:
  * Role-based unmasking permissions for authorized IOs and Court Prosecutors.
* **Category 3: Left (Pending to Build)**:
  * Automated Legal Aid notification flag for minor and female victims.

---

### Feature 15: Missing Persons & Children Recovery Register
* **Category 1: Completed (Done)**:
  * Data intake for missing adults and children under `missing.json`.
  * Physical markers, height, complexion, build, clothing worn, and mental state.
  * Status lifecycle (`Missing` $\to$ `Traced` $\to$ `Restored to Family`).
* **Category 2: Ongoing (In-Progress)**:
  * Traced person recovery date and police station verification workflows.
* **Category 3: Left (Pending to Build)**:
  * Photo upload and automated comparison with the Unidentified Dead Body (UIDB) gallery.
  * 24-hour, 7-day, and 30-day missing child investigation milestone alerts.

---

### Feature 16: Unidentified Dead Bodies (UIDB) Register
* **Category 1: Completed (Done)**:
  * Intake for unidentified deceased persons found across Delhi under `uidb.json`.
  * Estimated age, gender, place found, mortuary preservation, and post-mortem number.
* **Category 2: Ongoing (In-Progress)**:
  * Standardization of mortuary preservation timeframes across districts.
* **Category 3: Left (Pending to Build)**:
  * Automated cross-matching between newly registered UIDB records and active Missing Person profiles.

---

## SECTION 4: Property, Seizures & Evidence Management (Features 17–22)

---

### Feature 17: 5-Category Property & Seizure Hierarchy
* **Category 1: Completed (Done)**:
  * 5 major categories and 13 subcategories: Motor Vehicles, Electronics, Valuables, Arms/Ammunition, and Narcotics (NDPS).
  * Tracks estimated stolen value versus actual recovered value.
* **Category 2: Ongoing (In-Progress)**:
  * Property category cascade linking with crime head classifiers.
* **Category 3: Left (Pending to Build)**:
  * Automated court custody disposal order logging.

---

### Feature 18: Malkhana (Station Evidence Room) Register
* **Category 1: Completed (Done)**:
  * Seizure memo details, custody officer name, stolen value, and recovered valuation.
* **Category 2: Ongoing (In-Progress)**:
  * Malkhana register number formatting per station register rules.
* **Category 3: Left (Pending to Build)**:
  * Physical bin/shelf location mapping and barcode tracking for physical evidence.

---

### Feature 19: Motor Vehicle Theft (MVT) Intelligence Engine
* **Category 1: Completed (Done)**:
  * Dedicated vehicle fields: Registration No, Engine No, Chassis No, Make, Model, Color, and Class.
  * Powers daily MVT statistics and recovery tracking.
* **Category 2: Ongoing (In-Progress)**:
  * Normalizing vehicle registration number formats across older and newer plates.
* **Category 3: Left (Pending to Build)**:
  * Cross-district duplicate alert: instant notification when a recovered vehicle matches a stolen report in another district.

---

### Feature 20: Mobile Phone & IMEI Stolen Goods Tracker
* **Category 1: Completed (Done)**:
  * Dual IMEI number recording, phone brand, model, and SIM details.
  * Classified under `local_head_cd = 36` (Mobile Phone Theft) with category hierarchy `major_category_id = 2`.
* **Category 2: Ongoing (In-Progress)**:
  * IMEI checksum validation (Luhn algorithm) on form input.
* **Category 3: Left (Pending to Build)**:
  * Real-time cross-station IMEI matching engine.

---

### Feature 21: Firearms, Weapons & Arms Act Seizure Tracker
* **Category 1: Completed (Done)**:
  * Tracking of illegal country-made firearms (katta, pistols), factory-made weapons, live ammunition, cartridges, and knives.
  * Integrated with Arms Act statutory reporting sheets.
* **Category 2: Ongoing (In-Progress)**:
  * Firearm bore and calibre standardization dropdowns.
* **Category 3: Left (Pending to Build)**:
  * Ballistics laboratory report tracking and forensic matching.

---

### Feature 22: NDPS Narcotics & Contraband Seizure Tracker
* **Category 1: Completed (Done)**:
  * Seizure records for Ganja, Heroin, Smack, Opium, Cocaine, and synthetic narcotics.
  * Quantity tracking in grams/kilograms.
* **Category 2: Ongoing (In-Progress)**:
  * Linking seized quantities directly to NDPS Commercial vs. Intermediate quantity schedules.
* **Category 3: Left (Pending to Build)**:
  * Chemical examiner lab certificate tracking and court destruction orders.

---

## SECTION 5: Record Linking & Case Workflow Engine (Features 23–28)

---

### Feature 23: Smart Record Link Resolver Engine
* **Category 1: Completed (Done)**:
  * Automatically links auxiliary records (Arrests, Seizures, Inquests) to parent FIRs by matching `(fir_number, registration_year, police_station_id)`.
  * Fixed Bug 2 (Year Scoping) in `linkResolver.js` to strictly enforce registration year.
* **Category 2: Ongoing (In-Progress)**:
  * Event listener concurrency tuning during bulk data ingestion.
* **Category 3: Left (Pending to Build)**:
  * Visual Link/Unlink management screen for SHOs with mandatory audit reason logging.

---

### Feature 24: Orphan Record Backfilling Engine
* **Category 1: Completed (Done)**:
  * Holds auxiliary records (Arrests, Seized Items) entered before the formal FIR is assigned a number.
  * Automatically links all orphaned auxiliary records the moment the parent FIR is registered.
* **Category 2: Ongoing (In-Progress)**:
  * Timeout cleanup for long-unresolved orphaned records.
* **Category 3: Left (Pending to Build)**:
  * Dedicated "Unlinked Auxiliary Records" review tab for station duty officers.

---

### Feature 25: Finite State Machine Case Lifecycle Engine
* **Category 1: Completed (Done)**:
  * State progression: `DRAFT` $\to$ `SUBMITTED` $\to$ `APPROVED` $\to$ `RETURNED / REJECTED` $\to$ `LOCKED`.
  * `DRAFT` is editable; `SUBMITTED` is locked from IO; `APPROVED` is included in reports; `LOCKED` is frozen at period end.
* **Category 2: Ongoing (In-Progress)**:
  * Validating state transition boundaries in `workflow.controller.js`.
* **Category 3: Left (Pending to Build)**:
  * Digital cryptographic signatures for formal court filing status.

---

### Feature 26: Head Constable & IO Operational Queue
* **Category 1: Completed (Done)**:
  * Dedicated interface (`MyRecords.jsx`) for data entry staff to manage personal drafts, submitted records, and returned records.
* **Category 2: Ongoing (In-Progress)**:
  * Optimizing queue pagination and search filters.
* **Category 3: Left (Pending to Build)**:
  * Batch date-range filtering for station operators.

---

### Feature 27: SHO Review, Scrutiny & Approval Queue
* **Category 1: Completed (Done)**:
  * Review queue (`Queue.jsx`) for SHOs to review pending cases, verify section mappings, and issue approvals or rejection remarks.
* **Category 2: Ongoing (In-Progress)**:
  * Improving UI responsiveness during high-volume morning queue reviews.
* **Category 3: Left (Pending to Build)**:
  * Batch approval capability for routine non-heinous records.

---

### Feature 28: Investigating Officer (IO) Performance & Case Tracker
* **Category 1: Completed (Done)**:
  * Tracks case assignment, pending investigations, chargesheet timelines, and case disposal rates per IO.
* **Category 2: Ongoing (In-Progress)**:
  * Calculating average case disposal turnaround times per police station.
* **Category 3: Left (Pending to Build)**:
  * 60-day and 90-day statutory chargesheet deadline reminder alerts.

---

## SECTION 6: Emergency Response & Magisterial Proceedings (Features 29–34)

---

### Feature 29: Emergency PCR / 112 Call Ingestion & Dispatch Log
* **Category 1: Completed (Done)**:
  * Logs 112 emergency calls (Call ID, Caller Phone, Location, Nature of Emergency, Dispatched Van).
* **Category 2: Ongoing (In-Progress)**:
  * Duplicate emergency call detection and merging.
* **Category 3: Left (Pending to Build)**:
  * Response time calculation (call receipt to on-scene arrival).
  * Direct API integration connector with Delhi Police Central 112 CAD server.

---

### Feature 30: PCR Call Legal Conversion Pipeline
* **Category 1: Completed (Done)**:
  * Tracks legal outcome of emergency calls: converted to FIR, converted to Kalandra, or closed with a Daily Diary entry.
* **Category 2: Ongoing (In-Progress)**:
  * Automatic status synchronization when an FIR is filed from a PCR call ID.
* **Category 3: Left (Pending to Build)**:
  * Daily PCR call conversion efficiency reports by police station.

---

### Feature 31: Inquest Proceedings & Section 174/194 CrPC/BNSS Register
* **Category 1: Completed (Done)**:
  * Tracks unnatural deaths, suicides, accidental fatalities, and mortuary preservation records.
* **Category 2: Ongoing (In-Progress)**:
  * Post-mortem report receipt status tracking.
* **Category 3: Left (Pending to Build)**:
  * Automated conversion trigger from Inquest to Murder/Dowry Death FIR upon receipt of post-mortem report indicating homicide.

---

### Feature 32: Mandatory SDM / Executive Magistrate 7-Year Inquest Scrutiny
* **Category 1: Completed (Done)**:
  * Dedicated workflow for mandatory SDM inquiries for married women who die within 7 years of marriage.
* **Category 2: Ongoing (In-Progress)**:
  * Magisterial disposal order tracking.
* **Category 3: Left (Pending to Build)**:
  * Automated SDM inquiry statutory reminder alerts after 15 and 30 days of pendency.

---

### Feature 33: Proclaimed Offenders (PO) & Fugitive Tracking Registry
* **Category 1: Completed (Done)**:
  * Tracks fugitives declared under Section 82/83 CrPC (Sections 84/85 BNSS), issuing court, date of declaration, and property attachment proceedings.
* **Category 2: Ongoing (In-Progress)**:
  * Linking PO records to historical case files.
* **Category 3: Left (Pending to Build)**:
  * Automated cross-district fugitive alerts when an arrested suspect matches an active PO record.

---

### Feature 34: Bail Monitoring & Court Warrant Tracking
* **Category 1: Completed (Done)**:
  * Records Anticipatory Bail, Regular Bail, Interim Bail, and Non-Bailable Warrants (NBW).
* **Category 2: Ongoing (In-Progress)**:
  * Warrant execution status tracking (Executed, Unserved, Recalled).
* **Category 3: Left (Pending to Build)**:
  * Automatic alerts when interim bail periods expire.

---

## SECTION 7: Classification, Daily Diary & District Compilation (Features 35–46)

---

### Feature 35: 210 Standard Local Crime Heads Taxonomy Engine
* **Category 1: Completed (Done)**:
  * Maps all criminal acts to 210 standardized Delhi Police crime heads (`ref.local_heads`).
* **Category 2: Ongoing (In-Progress)**:
  * Freezing validation rules across all 43 statutory report templates to ensure 100% adherence to standard crime heads.
* **Category 3: Left (Pending to Build)**:
  * Admin UI for creating new specialized local heads when new legislation is passed.

---

### Feature 36: Canonical Code Dictionary & Code Repository
* **Category 1: Completed (Done)**:
  * Centralized dictionary (`canonical-codes.js`) defining standardized identifiers for all crime categories, disposal types, and property classes.
* **Category 2: Ongoing (In-Progress)**:
  * Synchronizing canonical code exports with the Python worker registry.
* **Category 3: Left (Pending to Build)**:
  * Automated schema drift checker between backend codes and database seeds.

---

### Feature 37: Daily Diary (DD / General Diary) 24/7 Chronological Logging
* **Category 1: Completed (Done)**:
  * 24/7 chronological log of all station occurrences, staff movements, duty deployments, and incident entries.
* **Category 2: Ongoing (In-Progress)**:
  * Chronological entry number sequence verification across high-concurrency station desks.
* **Category 3: Left (Pending to Build)**:
  * Tamper-evident cryptographic timestamping to prevent retroactive entry modifications.

---

### Feature 38: Daily Diary Midnight Book Rollover Engine
* **Category 1: Completed (Done)**:
  * Daily rollover automatically closes the diary at 23:59:59 each night and opens the next day's register.
* **Category 2: Ongoing (In-Progress)**:
  * Automatic diary volume numbering rollover at the start of each calendar year.
* **Category 3: Left (Pending to Build)**:
  * Automated PDF archive export of each closed daily diary volume.

---

### Feature 39: District Daily Compilation Service (29 Daily Sheets)
* **Category 1: Completed (Done)**:
  * Aggregates daily crime counts and operational logs across all stations into 29 daily sheets (Sheets 1–29).
  * Date-range filters and station aggregations active in `compilation.service.js`.
* **Category 2: Ongoing (In-Progress)**:
  * Optimizing SQL queries for large multi-station compilations.
* **Category 3: Left (Pending to Build)**:
  * Redis query caching for daily counts to ensure district-wide compilation completes in under 2 seconds.

---

### Feature 40: Daily e-Theft, e-Burglary & e-FIR Compilers
* **Category 1: Completed (Done)**:
  * Compilers for online e-FIR categories: e-Burglary (Sheet 2), e-House Theft (Sheet 3), e-Other Theft (Sheet 4), e-MVT (Sheet 5), e-Theft Arrests (Sheet 9), and e-MVT Arrests (Sheet 10).
* **Category 2: Ongoing (In-Progress)**:
  * Reconciling online portal sync timestamps with station compilation dates.
* **Category 3: Left (Pending to Build)**:
  * Automated disparity flagging between central e-portal counts and station records.

---

### Feature 41: 24-Hour Arrest & Custody Daily Dispatch Compiler
* **Category 1: Completed (Done)**:
  * Compiles 24-hour arrest roster (Sheet 13) for daily district intelligence and magistrate court production monitoring.
* **Category 2: Ongoing (In-Progress)**:
  * Filtering out preventive detentions from the 24-hour criminal arrest roster.
* **Category 3: Left (Pending to Build)**:
  * Automated daily PDF export for the District Public Prosecutor's morning briefing.

---

### Feature 42: Daily Missing, UIDB & Traced Compilation Pipeline
* **Category 1: Completed (Done)**:
  * Aggregates daily counters for Missing Persons (Sheet 18), UIDB Bodies (Sheet 19), Abandoned Persons (Sheet 20), Traced Persons (Sheet 21), Women Missing (Sheet 22), and Children Missing (Sheet 23).
* **Category 2: Ongoing (In-Progress)**:
  * Standardizing gender and age breakdowns across all 6 missing/traced sheets.
* **Category 3: Left (Pending to Build)**:
  * Automated daily missing person bulletin generator for inter-district dissemination.

---

### Feature 43: District Period-Locking & Data Freeze Engine
* **Category 1: Completed (Done)**:
  * Enables District DCPs to freeze reporting periods after scrutiny, preventing retroactive edits during statutory review.
* **Category 2: Ongoing (In-Progress)**:
  * Lock status visual indicators across station dashboards.
* **Category 3: Left (Pending to Build)**:
  * Formal unlock request workflow requiring written justification from the SHO.

---

### Feature 44: High-Performance Count Fetcher & SQL Aggregator
* **Category 1: Completed (Done)**:
  * High-performance SQL aggregation service (`count-fetcher.js`) providing instant totals for all summary tables.
* **Category 2: Ongoing (In-Progress)**:
  * Index optimization on multi-table joins.
* **Category 3: Left (Pending to Build)**:
  * Pre-aggregated materialized views for multi-year historical datasets.

---

### Feature 45: Detail Fetcher & Drill-Down Query Pipeline
* **Category 1: Completed (Done)**:
  * Retrieves full underlying line-item records (`detail-fetcher.js`) when a user clicks on any statistical summary count.
* **Category 2: Ongoing (In-Progress)**:
  * Column selection filtering for drill-down tables.
* **Category 3: Left (Pending to Build)**:
  * Paginated streaming for drill-down lists exceeding 1,000 records.

---

### Feature 46: Interactive Record Trace Panel Component
* **Category 1: Completed (Done)**:
  * Interactive modal component (`RecordTracePanel.jsx`) allowing senior officers to click any summary cell on a report and view the underlying FIRs and Arrests.
* **Category 2: Ongoing (In-Progress)**:
  * Enhancing mobile modal rendering on smaller laptop screens.
* **Category 3: Left (Pending to Build)**:
  * One-click CSV export of drill-down lists directly from the modal view.

---

## SECTION 8: Statutory Headquarters (PHQ) Reporting (Features 47–56)

---

### Feature 47: PHQ Fortnightly (15-Day) Crime Review Engine (43 Sheets)
* **Category 1: Completed (Done)**:
  * 43 statutory statistical sheets covering Heinous Crimes, Crimes Against Women/Children, Property Crimes, Preventive Actions, and Disposal Goswaras.
  * Date-range filtering and district scoping active in `scopeResolver.js`.
* **Category 2: Ongoing (In-Progress)**:
  * Updating all remaining renderer files under `backend/src/modules/report-engine/fn/renderers/` to strictly enforce primary section filtering (`is_primary = TRUE`).
  * Cross-sheet total reconciliation to ensure summary counts match detail tables across all 43 sheets.
* **Category 3: Left (Pending to Build)**:
  * Automated historical trend comparison (e.g., current 15 days vs. corresponding period last year).

---

### Feature 48: Heinous Crimes Review Statement Generators
* **Category 1: Completed (Done)**:
  * Detailed statutory reporting renderers for Murder, Attempt to Murder, Dacoity, Robbery, Extortion, and Kidnapping for Ransom.
* **Category 2: Ongoing (In-Progress)**:
  * Heinous crime weapon classification alignment (Firearm vs Knife vs Blunt Object).
* **Category 3: Left (Pending to Build)**:
  * Automated heinous crime intelligence briefs for the Commissioner of Police.

---

### Feature 49: Crime Against Women & Children Statement Generators
* **Category 1: Completed (Done)**:
  * Dedicated statutory reporting renderers for Rape, Molestation, Eve Teasing, Dowry Death, and POCSO cases.
* **Category 2: Ongoing (In-Progress)**:
  * Age bracket reconciliation between juvenile victims and adult victims across sheets.
* **Category 3: Left (Pending to Build)**:
  * Automated Special Juvenile Police Unit (SJPU) statistical export.

---

### Feature 50: Local & Special Laws (SLL) Statement Generators
* **Category 1: Completed (Done)**:
  * Dedicated statutory reporting renderers for Arms Act, NDPS Act, Excise Act, Gambling Act, and Delhi Police (DP) Act.
* **Category 2: Ongoing (In-Progress)**:
  * Cross-referencing seizure weights with statutory case registration counts.
* **Category 3: Left (Pending to Build)**:
  * Automated special drive compliance scorecards for district DCPs.

---

### Feature 51: Disposal Goswara & Judicial Case Progress Engine
* **Category 1: Completed (Done)**:
  * Aggregates case disposals: cases challaned to court, untraced cases, cancelled cases, and judicial conviction/acquittal rates.
* **Category 2: Ongoing (In-Progress)**:
  * Aligning court disposal status codes with CCTNS standard disposal codes.
* **Category 3: Left (Pending to Build)**:
  * Automated court pendency aging analysis (cases pending trial > 1 yr, > 3 yrs, > 5 yrs).

---

### Feature 52: Python High-Fidelity Excel Generation Microservice
* **Category 1: Completed (Done)**:
  * Dedicated Python microservice using OpenPyXL to build Excel files with official Delhi Police headers, cell borders, fonts, and native SUM formulas.
* **Category 2: Ongoing (In-Progress)**:
  * Integrating all 43 sheet templates into the Python generation pipeline.
* **Category 3: Left (Pending to Build)**:
  * Direct headless PDF generation (exporting generated workbooks straight to signed PDF documents).

---

### Feature 53: Excel Cell Styling, Hierarchy Headers & Formula Formatter
* **Category 1: Completed (Done)**:
  * Modular styling engine (`formatters.py`) creating multi-level merged headers, standardized column widths, and native Excel `=SUM()` formulas.
* **Category 2: Ongoing (In-Progress)**:
  * Ensuring zero-fill (`0`) on empty count cells across all generated sheets.
* **Category 3: Left (Pending to Build)**:
  * Custom header logo and official emblem embedding.

---

### Feature 54: 25 Modular Python Sheet Generator Scripts
* **Category 1: Completed (Done)**:
  * 25 modular Python scripts under `python_worker/sheets/` (from `sheet_01_manual_fir.py` to `sheet_29_arrest_count_summary.py`).
* **Category 2: Ongoing (In-Progress)**:
  * Adding scripts for the remaining statutory fortnightly sheets.
* **Category 3: Left (Pending to Build)**:
  * Automated visual layout snapshot testing for generated Excel workbooks.

---

### Feature 55: Official Print Setup, Orientation & Page Layout Engine
* **Category 1: Completed (Done)**:
  * Automatically applies standard page margins, landscape orientation, repeated table header rows on page breaks, and standard footers (`print-setup.js`).
* **Category 2: Ongoing (In-Progress)**:
  * Print preview verification across different paper sizes (A4, Legal, A3).
* **Category 3: Left (Pending to Build)**:
  * Customizable watermarking ("CONFIDENTIAL - DELHI POLICE").

---

### Feature 56: Ad-Hoc Custom Report Builder & Cross-Tabulator
* **Category 1: Completed (Done)**:
  * Allows supervisory officers to generate custom cross-tabulated reports by selecting custom date ranges, police stations, crime heads, and person attributes.
* **Category 2: Ongoing (In-Progress)**:
  * Adding multi-variable pivot tables to the web UI.
* **Category 3: Left (Pending to Build)**:
  * Saved report templates so officers can re-run custom queries with a single click.

---

## SECTION 9: Bulk Ingestion, Analytics & Infrastructure (Features 57–65)

---

### Feature 57: Bulk Data Importer & Legacy Migration Pipeline
* **Category 1: Completed (Done)**:
  * Ingestion pipeline (`import-fields.config.js`) for importing historical crime data and spreadsheets with column mapping, header validation, and data normalization.
  * Transactional batch processing with automated rollback on error.
* **Category 2: Ongoing (In-Progress)**:
  * Error report generation detailing specific row-level validation errors in uploaded CSVs.
* **Category 3: Left (Pending to Build)**:
  * Interactive visual column mapping wizard in the admin web UI.

---

### Feature 58: Data Warehouse ETL Aggregation Pipeline
* **Category 1: Completed (Done)**:
  * ETL aggregation service pre-calculating monthly, quarterly, and annual crime totals in `backend/src/modules/warehouse/`.
* **Category 2: Ongoing (In-Progress)**:
  * Warehouse table partition optimization by calendar year.
* **Category 3: Left (Pending to Build)**:
  * Nightly automated cron job to refresh warehouse summary tables.

---

### Feature 59: Multi-Dimensional Universal Search Engine
* **Category 1: Completed (Done)**:
  * Universal search (`PersonSearchPage.jsx` & `search.controller.js`) across Name, Alias, Mobile, Aadhaar, Vehicle Reg No, Chassis/Engine No, and Physical Traits.
* **Category 2: Ongoing (In-Progress)**:
  * Wildcard search query tuning for fast autocomplete.
* **Category 3: Left (Pending to Build)**:
  * Phonetic search (Soundex/Metaphone) to find names despite spelling variations.

---

### Feature 60: Crime Trend Analytics & Repeat Offender Profiler
* **Category 1: Completed (Done)**:
  * Aggregates crime trends by time of day, day of week, and crime head.
  * Identifies repeat criminal profiles across different stations.
* **Category 2: Ongoing (In-Progress)**:
  * Visual crime trend charts in district analytics dashboards.
* **Category 3: Left (Pending to Build)**:
  * Geographic crime density heatmaps by police beat.

---

### Feature 61: Modern Responsive React Frontend & Role-Based Workspaces
* **Category 1: Completed (Done)**:
  * Fast React & Vite Single Page App with clean data tables and tailored role dashboards for HC, SHO, DCP, and PHQ.
* **Category 2: Ongoing (In-Progress)**:
  * Consolidating all 24 frontend navigation tabs into the 7 canonical operational hubs (Overview, Intelligence, Station Operations, Legal Scrutiny, Assurance, Reports, Admin).
* **Category 3: Left (Pending to Build)**:
  * Tablet-optimized touch layout for mobile field entry.

---

### Feature 62: In-App Real-Time Notifications & Broadcast Dispatcher
* **Category 1: Completed (Done)**:
  * Delivers in-app alerts for pending approvals, returned drafts, and system announcements (`notifications.controller.js`).
* **Category 2: Ongoing (In-Progress)**:
  * Real-time WebSocket connection stability during station network reconnects.
* **Category 3: Left (Pending to Build)**:
  * Email and SMS gateway integration for automated morning summary dispatches to senior leadership.

---

### Feature 63: Level Contracts & JSON Schema API Validation Gate
* **Category 1: Completed (Done)**:
  * Validates JSON schemas on every API payload (`level-contracts/`), rejecting invalid data before it reaches the database.
* **Category 2: Ongoing (In-Progress)**:
  * Expanding contract test suite to cover all edge-case payload combinations.
* **Category 3: Left (Pending to Build)**:
  * Automated TypeScript interface generation from backend JSON contracts.

---

### Feature 64: System Diagnostics, Health Monitoring & Error Log Viewer
* **Category 1: Completed (Done)**:
  * Health check endpoints monitoring database connection status, memory usage, and background worker availability (`logs/`).
* **Category 2: Ongoing (In-Progress)**:
  * Log rotation and disk space monitoring scripts.
* **Category 3: Left (Pending to Build)**:
  * Automatic Slack/Telegram/Email alerts to system administrators on any database error.

---

### Feature 65: Multi-Station Data Export Center
* **Category 1: Completed (Done)**:
  * Export center allowing authorized officers to download raw datasets and compiled reports in CSV and Excel formats.
* **Category 2: Ongoing (In-Progress)**:
  * Asynchronous export job dispatching for large multi-station date ranges.
* **Category 3: Left (Pending to Build)**:
  * Scheduled automated email delivery of monthly export archives to District DCPs.

---

## SECTION 10: Complete 65-Feature Status Summary Table

| # | Feature / Module Name | Primary User | Category 1: Completed | Category 2: Ongoing | Category 3: Left |
|:---:|:---|:---|:---:|:---:|:---:|
| **1** | User Authentication & Session Security | All Personnel | JWT, bcrypt, session middleware | Refresh token tab sync | MFA for SHO, 15-min auto-logout |
| **2** | 7-Tier Hierarchical RBAC | All Personnel | 7 ranks, gate middleware | District clerk permissions | Temporary rank delegation |
| **3** | Geographic Scoping Engine | System | 8-level tree, scopeResolver | Multi-district query speed | Special units integration |
| **4** | Specialized Police Units Scoping | Special Units | DB schema support for Special Cell | Multi-jurisdiction routing | Dedicated special unit dashboards |
| **5** | Immutable Audit Trail & History | Admin / Legal | Diff logging, user tracking | Indexing for fast search | Cryptographic hash chaining |
| **6** | JSON Form Engine (419 Fields) | HC / IO | Zero-hardcoding, 6 configs | Radio state reopen bug fix | Offline LocalStorage caching |
| **7** | Case & FIR Intake System | IO / SHO | FIR indexing, date validation | Future-date validation | PDF Form 1 export, spell-check |
| **8** | Dual Law Engine (IPC & BNS 2023) | IO / SHO | Dual section search, cross-map | Special local laws mapping | AI section recommender |
| **9** | Primary vs Secondary Offence Engine| System / Reports| `is_primary = TRUE` flag | Enforce across 43 sheets | Heinous section validation warning |
| **10**| Arrest Memo & Custody Logging | IO / SHO | Bug 1 fixed, medical & intimation | Structured arrest address | 24-hr court production timer |
| **11**| Preventive Detention & Kalandra | IO / SHO | `is_dd_based`, GD time window | Isolate from FIR auto-link | Magistrate bail bond tracking |
| **12**| GD Time Window Enforcement | System | Configured GD time parameters | Time-drift validation | Out-of-window submission alert |
| **13**| Centralized Person Model | All | Demographics, ID proofs | Alias/nickname indexing | Fingerprint template ID |
| **14**| Sensitive Victim DPDP Protection | System | POCSO/Rape identity masking | Role-based unmasking | Legal Aid auto-flag |
| **15**| Missing Persons & Children | IO / Staff | Physical markers, traced lifecycle| Traced recovery workflows | Photo match, milestone alerts |
| **16**| Unidentified Dead Bodies (UIDB) | IO / Staff | Intake, mortuary details | Mortuary preservation rules | Missing person cross-match |
| **17**| 5-Category Property & Seizures | Malkhana / IO | 5 major/13 subcategories | Category cascade linking | Court custody disposal logging |
| **18**| Malkhana (Evidence Room) Register | Malkhana / IO | Seizure memos, valuation logs | Register number formatting | Malkhana barcode tracking |
| **19**| Motor Vehicle Theft (MVT) Engine | IO / Malkhana | Engine/Chassis tracking | Registration format normalizer | Cross-district duplicate alert |
| **20**| Mobile Phone & IMEI Stolen Goods | IO / Malkhana | `local_head_cd = 36`, IMEI logs | Luhn IMEI checksum | Real-time IMEI match engine |
| **21**| Firearms & Arms Act Seizures | IO / Malkhana | Firearm & ammo tracking | Bore/calibre dropdowns | Ballistics report tracking |
| **22**| NDPS Narcotics Seizure Tracker | IO / Malkhana | NDPS drug intake, quantity logs | Commercial quantity schedule | Chemical lab report tracking |
| **23**| Smart Record Link Resolver | System | Bug 2 fixed, orphan backfilling | Batch import event tuning | Manual link/unlink UI |
| **24**| Orphan Record Backfilling Engine | System | Provisional hold & auto-link | Orphan timeout cleanup | Unlinked records review tab |
| **25**| Finite State Machine Case Lifecycle| All | Draft $\to$ Approved $\to$ Locked | State boundary validation | Digital cryptographic signature |
| **26**| HC / IO Operational Queue | HC / IO | Drafts, submissions, returns | Queue pagination tuning | Batch date-range filter |
| **27**| SHO Review & Approval Queue | SHO | Review, corrections, sign-offs | Morning review performance | Bulk routine approvals |
| **28**| IO Performance & Case Tracker | SHO / ACP | Case disposal, pending tracking | Average turnaround calculation | 60/90 day chargesheet alerts |
| **29**| Emergency PCR / 112 Call Register | Duty Officer | 112 intake, caller phone, van | Duplicate call merging | Central 112 CAD API |
| **30**| PCR Call Legal Conversion | Duty Officer | Conversion to FIR/Kalandra/DD | Auto-sync on FIR registration| Conversion efficiency reports |
| **31**| Inquest Proceedings (Sec 174/194) | IO / ACP | Unnatural deaths, mortuary data | Post-mortem status tracking | Auto-convert to Murder FIR |
| **32**| Mandatory SDM 7-Yr Inquest Inquiry| IO / ACP | 7-year dowry death workflow | Magisterial disposal tracking | SDM 15/30-day reminder alerts |
| **33**| Proclaimed Offenders (PO) Register | IO / Legal | Sec 82/83, property attachment | Historical case linking | Cross-district arrest match |
| **34**| Bail & Warrant Monitoring | IO / Legal | Regular/Anticipatory bail | Warrant execution status | Interim bail expiry alerts |
| **35**| 210 Standard Local Crime Heads | System | `ref.local_heads` taxonomy | Freeze all 43 sheet rules | Admin UI for new local heads |
| **36**| Canonical Code Repository | System | Unified naming dictionary | Python worker sync | Schema drift checker |
| **37**| Daily Diary 24/7 Logging | Duty Officer | Chronological log, daily rollover| Entry sequence concurrency | Tamper-proof timestamp |
| **38**| Daily Diary Midnight Rollover | Duty Officer | Auto 23:59:59 rollover | Annual volume rollover | Auto PDF volume archive export |
| **39**| District Daily Compilation (29 Sheets)| District / DCP| 29 daily sheet compilers | Large compilation query speed | Redis query caching |
| **40**| Daily e-Theft & e-FIR Compilers | District / DCP| Sheets 2, 3, 4, 5, 9, 10 | Portal sync timestamps | Central e-portal disparity flag |
| **41**| 24-Hour Arrest Daily Dispatch | District / DCP| Sheet 13: 24-hr arrest roster | Exclude preventive detentions | Daily Prosecutor briefing PDF |
| **42**| Daily Missing & UIDB Compilers | District / DCP| Sheets 18–23 daily counters | Gender/age standardization | Daily missing person bulletin |
| **43**| District Period-Locking System | District / DCP| Period freeze, data lock | Visual lock indicators | Formal unlock request workflow |
| **44**| Count Fetcher & Aggregator | System | High-performance SQL counts | Join index optimization | Materialized summary views |
| **45**| Detail Fetcher & Drill-Down | System | Line-item drill-down pipeline | Column selection filtering | Paginated stream (>1000 items) |
| **46**| Interactive Record Trace Panel | Senior Officers| Drill-down modal on cell click | Mobile modal responsiveness | One-click CSV export in modal |
| **47**| PHQ Fortnightly Review (43 Sheets)| PHQ / CP | 43 statutory sheet engines | Primary section & total reconcile| Historical trend comparison |
| **48**| Heinous Crimes Statement Generator| PHQ / CP | Murder, Dacoity, Robbery sheets| Weapon classification align | Heinous crime CP intelligence brief |
| **49**| Crimes Against Women/Children | PHQ / CP | Rape, Molestation, POCSO sheets| Victim age reconciliation | SJPU statistical export |
| **50**| Local & Special Laws (SLL) Sheets | PHQ / CP | Arms, NDPS, Excise, Gambling | Seizure weight cross-check | DCP special drive scorecards |
| **51**| Disposal Goswara & Judicial Progress| PHQ / CP | Challan, untraced, convictions | CCTNS disposal code align | Court pendency aging analysis |
| **52**| Python Excel Generation Worker | System | OpenPyXL styling, formulas | Remaining sheet templates | Headless PDF export |
| **53**| Excel Cell Styling & Formatter | System | Merged headers, native `=SUM()` | Zero-fill on empty count cells| Emblem/logo embedding |
| **54**| 25 Modular Python Sheet Scripts | System | 25 scripts (sheet_01 to 29) | Add remaining fortnightly sheets| Workbook layout snapshot tests |
| **55**| Print Setup & Layout Engine | System | Landscape, headers, margins | Multi-page paper sizes | Confidential watermarking |
| **56**| Ad-Hoc Report Builder | Supervisory | Custom cross-tabulated reports | Pivot tables in UI | Saved report query templates |
| **57**| Bulk Data Importer & Migration | Admin | Batch transactions, rollback | Row-level error reporting | Visual mapping wizard |
| **58**| Data Warehouse Pipeline | System | ETL pre-calculated aggregates | Partition by calendar year | Nightly cron scheduler |
| **59**| Multi-Dimensional Search Engine | All | Person/Vehicle/Trait search | Wildcard autocomplete tuning | Phonetic name search |
| **60**| Crime Analytics & Offender Intel | ACP / DCP / CP| Crime trends, repeat offenders | Trend graphs in dashboard | Beat heatmap overlays |
| **61**| Modern Frontend Web App | All | React SPA, Vite, trace panel | 7-hub tab consolidation | Tablet touch-friendly layout |
| **62**| In-App Notifications & Alerts | All | In-app alerts for reviews | WebSocket reconnect stability | SMS/Email gateway |
| **63**| Schema & Level Contracts | System | JSON schema API validation | Edge-case contract tests | Automated TypeScript generator |
| **64**| Diagnostics, Health & Log Viewer | Admin | System health endpoints | Log rotation & disk monitor | Admin alert notifications |
| **65**| Multi-Station Data Export Center | Authorized | CSV and Excel bulk exports | Async export job dispatch | Automated monthly email archives |

---

## SECTION 11: Production Deployment & Verification Roadmap

1. **Phase 1: Reporting Engine Freezing (Sheets 1–43)**
   * Enforce primary section filtering (`is_primary = TRUE`) and local head grouping across all remaining Fortnightly report renderers.
2. **Phase 2: Database Address Synchronization**
   * Apply automatic address normalization hook in `records.mapper.js` and split "Place of Arrest" in `arrest.json` into structured fields.
3. **Phase 3: Frontend Navigation Consolidation**
   * Consolidate navigation tabs into the 7 primary operational hubs and resolve radio button state persistence on form reopen.
4. **Phase 4: Full End-to-End Operational Sign-Off**
   * Execute complete lifecycle test: **HC Data Entry** $\to$ **SHO Approval** $\to$ **District Daily Compilation** $\to$ **PHQ 43-Sheet Excel Export**.
