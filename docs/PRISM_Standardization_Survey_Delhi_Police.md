# DELHI POLICE HEADQUARTERS
## PRISM (Police Reporting Intelligence & Statistics Management) System
### PROJECT CHARTER & DISTRICT SURVEY FRAMEWORK: STANDARDIZATION OF POLICE STATION FORMS & DISTRICT CRIME DIARIES

**Target Audience:** For Official Consultation with District Statistical Officers (SO Branch), Addl. DCPs (Operations/HQ), Station House Officers (SHOs), Duty Officers, and Thana Chiitha/Computer Staff across all 15 Territorial Districts and Specialized Units.

---

## 1. Executive Summary & Policing Background

Across the 15 Territorial Districts and Specialized Units (Crime Branch, Special Cell, Railways, Metro, IGI Airport, Traffic, Vigilance) of Delhi Police, crime statistics and daily operational reports form the backbone of administrative supervision, law and order monitoring, and strategic deployment. Currently, however, the compilation of these reports faces severe operational friction due to format divergence and manual duplicate data entry.

> ### The Core Practical Problem in Delhi Police Today:
> 1. **District & DCP Format Variations:** Every district and every newly posted Deputy Commissioner of Police (DCP) introduces unique Excel formats, custom crime heads, and modified columns for their Daily Diary, Morning Crime Sheets, and Fortnightly Returns.
> 2. **Heavy Thana Data Entry Burden:** At the Police Station (Thana) level, Head Constables, Duty Officers, and Chiitha Munshis spend 3 to 4 hours every evening typing the exact same FIR, arrest, kalandra, and seizure details into 5 to 7 different disconnected spreadsheets.
> 3. **Mismatched Totals & Discrepancies:** When reports reach District SO Branches (Statistical Officer) and Police Headquarters (PHQ), data totals mismatch, categories conflict (e.g. IPC vs BNS transition heads, clubbed Rape & POCSO vs separate heads), and manual calculation errors occur.

To resolve this permanently, Delhi Police is deploying the **PRISM (Police Reporting Intelligence & Statistics Management) System**.

**The PRISM Golden Rule:**
> *"Single Point Data Entry at Thana Level — Automatic 1-Click Generation of All Station, Sub-Division, District, and PHQ Reports."*

Before finalizing the forms and reports in PRISM, a comprehensive **Field Survey** must be conducted across all District SO Branches and representative Police Stations to align on what fields to **Keep**, **Drop**, **Modify**, or **Auto-Calculate**.

---

## 2. Objectives & Operational Needs for Standardization

1. **Eliminate Duplicate Thana Data Entry:** Thana staff should only enter an FIR, Arrest, Seizure, or Kalandra once. The system will automatically populate the Daily Crime Diary, Fortnightly Return (FN Diary), Heinous Crime Register, and Senior Officer Morning Summaries.
2. **Uniformity Across Complete Delhi Police:** A Murder, Snatching, Vehicle Theft, or POCSO case must be categorized and calculated identically whether registered in South District, North-East District, Outer-North, or Crime Branch.
3. **Seamless BNS & BNSS Compliance:** Standardize all crime heads and preventive action sections under the Bharatiya Nyaya Sanhita (BNS) and Bharatiya Nagarik Suraksha Sanhita (BNSS), while maintaining seamless historical comparison with legacy IPC and CrPC data.
4. **Eliminate Calculation Errors & Excel Corruption:** Automate all calculations (Detection / Workout %, Variation % compared to previous year, Age-wise pendency, Stolen vs Recovered property) directly in the database without manual formula alterations.
5. **District SO Branch Consensus:** Provide a clear platform for District SO Branches to review every existing sheet and column, eliminating obsolete fields and finalizing mandatory standardized data points.

---

## 3. Mismatches & Discrepancies in Current Reports Across Districts

| Report Area / Subject | District Practice Variance | PHQ / Standard Practice | Impact & Proposed PRISM Fix |
|---|---|---|---|
| **Heinous Crime Classification** | Some districts include *Attempt to Murder* and *Extortion with Firearm* under Heinous, while others keep Extortion strictly under Non-Heinous. Dacoity & Robbery robbery-with-hurt are grouped differently. | Standard Heinous comprises exactly 7 heads: Dacoity, Murder, Att. to Murder, Robbery, Riot, Kidnapping for Ransom, and Rape. | PRISM will lock the 7 standard Heinous heads across all 15 districts, with automatic sub-classification tags. |
| **Rape & POCSO Reporting** | Certain districts report POCSO cases under IPC/BNS Heinous Rape, while others report POCSO strictly under Local & Special Laws (LSL). In morning summaries, both are clubbed. | PHQ Sheet 9 clubs *Rape & POCSO* for broad morning overview, but FN Diary Stat-25 & Stat-26 track POCSO-only and POCSO-total separately. | PRISM will store exact section details at intake; the system will dynamically generate both separate legal returns and clubbed executive summaries. |
| **Detection / Worked-Out %** | Districts calculate detection % by dividing total cases solved this month (including old cases from previous years) by cases reported this month, sometimes resulting in >100% workout. | Standard policing methodology tracks: (a) Workout % of current period cases, and (b) Total previous cases solved separately. | PRISM will compute true cohort detection rate and display legacy solved cases in a dedicated distinct column. |
| **Motor Vehicle Theft (MV Theft)** | Some districts treat online e-FIRs and regular thana FIRs separately, causing discrepancies in daily theft totals. Stolen vehicle recovery valuation is arbitrarily entered. | Unified MV Theft head covering all e-FIRs and manual FIRs with standardized vehicle type classifications (2-wheeler, car, commercial). | PRISM links directly with e-FIR portal data so all MV thefts reflect automatically in District & PHQ totals. |
| **Narcotics (NDPS) Seizures** | Districts record seizures in non-standard units (Pudiyas, Grams, Packets, Bags) without converting to uniform Kilograms. Commercial vs Non-Commercial is not flagged. | Standard reporting mandates 6 distinct narcotics rows (Heroin/Smack, Cocaine, Charas, Opium, Ganja, Poppy Head) strictly in KG. | PRISM forms will enforce standard metric units (Grams/KG) with auto-conversion and commercial quantity threshold validation. |
| **Preventive Action & Kalandras** | Sections 107/151 CrPC, 107/116 CrPC, 110 CrPC are recorded haphazardly; after 1 July 2024, BNSS 126/170/129/135 mapping is inconsistent across Thanas. | Standardized tracking of persons bound down, kalandras sent to SEM Court, and persons jailed under preventive sections. | PRISM provides direct BNSS & DP Act (Sec 66, 28/112) preventive forms mapped to Special Executive Magistrate (SEM) court registers. |
| **Property Stolen vs Recovered** | Complainants report inflated estimated property value, while Malkhana records recovery at seized value. Total recovery % becomes artificially skewed. | Stat-33 requires tracking Stolen Claimed Value, Assessed Actual Value, and Recovered Valuation with specific item categorisation. | PRISM captures structured itemized property entries (Jewellery, Cash, Electronics, Vehicles, Metal/Cables). |

---

## 4. Data Gaps: Required Report Fields Not Collected in Current Intake Forms

To enable PRISM to automatically generate all 41 Fortnightly Sheets, District Diaries, and Morning Returns without manual Excel files, the following missing fields must be integrated into standard digital forms:

### 4.1 FIR / Case Registration Form Gaps
- **Case Registration Channel / Type:** CCTNS Manual FIR, e-Theft FIR, e-MVT (Motor Vehicle), NCRP (Cyber Portal e-FIR), Zero FIR (Transferred from/to other Thana).
- **Exact Time of Occurrence vs GD Entry Time:** Currently only GD time is recorded. Reports require exact occurrence time interval (Morning, Day, Evening, Night) for crime spot mapping & picket deployment.
- **Detailed Complainant Particulars:** Parent's/Spouse's name, complete residential address, contact number, and demographic tag (Senior Citizen, Minor, Woman, SC/ST, Foreign National).
- **Modus Operandi (MO) & Weapon Category:** Burglary MO (Lock broken, grill cut, entered via roof, open latch) and Weapon used (Firearm, Knife, Blunt object, Physical force).
- **Place of Occurrence Classification:** Beat number, Residential house, Commercial shop, Bank/ATM, Public road, Park, Metro/Bus station, Isolated plot.
- **Investigating Officer (IO) Full Profile:** IO Name, Rank, PIS / Belt Number, and Mobile Number for automated accountability registers.

### 4.2 Arrest & Accused Form Gaps
- **Accused Personal Demographics:** Father's / Mother's name, Exact Age (years), Native District & State, Present Thana & Address.
- **Criminal Classification & History:** Bad Character (BC) flag & Bundle letter, Proclaimed Offender (PO) flag, Previous involvements count (total FIRs), Active Bail status.
- **Operational Catching Agency / Patrol Type:** Arrested by: Integrated Picket Staff, Group Foot Patrolling, Cycle Patrolling, Anti-Snatching Team, Special Staff, Prahari, Eyes & Ears Scheme informer tip-off.
- **Arrest Timing & Arresting Officer (AO):** Exact Time of Arrest, AO Name, PIS Number, and Mobile Contact.
- **Seizure at Time of Arrest:** Direct linkage of weapon, stolen cash, or vehicle recovered from the specific accused during arrest.

### 4.3 Preventive Action & Kalandra Form Gaps (BNSS & DP Act)
- **BNSS Preventive Sections:** Separate structured entry for Sec 126/170 BNSS (Breach of peace), Sec 129 BNSS (Good behaviour), Sec 135 BNSS (Habitual offenders).
- **Delhi Police Act (DP Act) Actions:** Sec 66 DP Act (Unclaimed / suspicious vehicles & property seized), Sec 28/112 DP Act (Unlicensed eateries/hotels/public nuisance), Sec 65 DP Act (Wilful obstruction).
- **SEM Court Details & Disposal:** Name of SEM Court, Kalandra DD Number & Date, Date sent to SEM, Security Bond amount, whether bound down or sent to Judicial Custody (JC).
- **Externment (Tadpaar) Proceedings:** Action under DP Act Sec 47/50: Proposal sent, Order passed, Area externed from, Violation/Arrest of externed criminal.

### 4.4 Property, Seizures & Narcotics Gaps
- **Standardized Narcotics Categories:** Distinct fields for Smack/Heroin, Cocaine, Charas, Ganja, Opium, Poppy Straw/Head with mandatory metric units (Grams/KG) and Commercial Quantity indicator.
- **Excise & Illicit Liquor Breakdown:** Separate count of Quarters (180 ml), Pints (375 ml), Full Bottles (750 ml), Beer Cans, and Illicit Pouch/Lahan liters, with vehicle seized under Excise Act.
- **Arms & Ammunition Specifications:** Country-made pistols (Katta/Tamancha), Factory-made Revolver/Pistol, Automatic weapons, Live cartridges count, Empty shells, Knives/Buttondar.
- **Stolen & Recovered Valuation:** Stolen value claimed by complainant, actual verified loss value, and assessed market value of recovered goods.

### 4.5 Special Focus Groups & Vulnerable Sections Gaps
- **Crimes Against Women Details:** Victim relationship with accused (Husband/In-laws, Known person, Stranger), Workplace sexual harassment, Stalking, Acid attack, Protection Order status.
- **POCSO & Missing Children Tracking:** Exact victim age, Section 4/6/8/10/12 POCSO, Missing date, Date child traced, Traced by (Self/Thana Staff/AHTU), Handover to parents/CWC.
- **Senior Citizen Safety Register:** Senior Citizen verification status, Beat Constable visit date, Nature of complaint (Property dispute, Physical harassment, Cyber fraud).
- **Cyber Crime & NCRP Integration:** NCRP Complaint Acknowledgement No., Cyber category (Financial fraud, Sextortion, Social media harassment), Amount defrauded, Amount frozen in bank/wallet.

### 4.6 Investigation Progress & Court Disposal Gaps
- **Final Disposal Outcome:** Charge-sheet filed, Untraced Report filed, Cancellation Report filed, Quashed by High Court, Transferred to other Agency (CBI/NIA/Crime Branch).
- **Age-Wise Pendency Brackets:** Automatic calculation of pendency: Under 30 Days, 31–60 Days, 61–90 Days, 91–180 Days, Over 1 Year pending, with specific pendency reason (Pending FSL, Pending Post-Mortem/MLC, Accused absconding).
- **Court Trial Status:** Under Trial, Convicted, Acquitted, Discharged, Compounded.

---

## 5. Standard Procedures for District SO Branch Survey

To ensure all 15 districts and specialized units actively participate and agree on the standardized forms and reporting rules, the following 4-step survey procedure is to be executed:

```
┌────────────────────────────────────────────────────────┐
│ STEP 1: PHQ Notification & Distribution of Survey     │
│ Issue official circular & master field discussion proforma│
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│ STEP 2: Formation of District Review Committees        │
│ Addl. DCP/ACP (Ops) + SO In-Charge + 2 SHOs + Chiitha  │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│ STEP 3: Field Review & Decision Marking                │
│ Evaluate each field: [Keep / Drop / Modify / Auto-Calc]│
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│ STEP 4: Central Harmonization Workshop & PHQ Order     │
│ Finalize unified Delhi Police Standard Data Dictionary │
└────────────────────────────────────────────────────────┘
```

1. **Step 1: PHQ Notification & Distribution of Survey Packet:** PHQ Statistics Cell issues a formal circular to all District DCPs containing this PRISM Standardization Charter, the master field list, and the survey questionnaire.
2. **Step 2: Formation of District Review Committees:** Each District DCP constitutes a 4-member District Committee comprising: (1) Addl. DCP / ACP (Operations), (2) In-charge Statistical Branch (SO Branch), (3) Two experienced SHOs (one Heavy Urban Thana, one Suburban/Rural Thana), and (4) Head Constable / Chiitha Munshi.
3. **Step 3: Interactive Field Evaluation & Feedback Submission:** The District Committee reviews every sheet and field against their current operational requirements. Using the Decision Matrix (Section 6), they mark each field as *'Keep as Mandatory'*, *'Drop / Obsolete'*, *'Modify / Rename'*, or *'Auto-Compute'*.
4. **Step 4: Central Harmonization Workshop & CP Delhi Notification:** PHQ convenes a 1-day harmonization session with all District SO In-charges. The finalized Master Data Dictionary is frozen, and an official Delhi Police Standing Order is issued to mandate PRISM standardized forms across all Thanas.

---

## 6. Master Discussion & Decision Matrix for District SO Branches

| S.No. | Report Sheet / Subject | Specific Data Fields to Review | PRISM Standardization Recommendation | District SO Branch Decision |
|---|---|---|---|---|
| **1** | **Stat-01: Cases Reported (Daily & Fortnightly)** | • Case Registration Type (Manual, e-FIR, NCRP, Zero FIR)<br>• Time interval of occurrence<br>• Beat Number & Landmark | **MANDATORY.** Essential for auto-generating Daily Crime Sheets & PCR Call reconciliation. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **2** | **Stat-02: Worked-Out / Detection Rate** | • Date Case Worked Out<br>• Previous Year cases solved<br>• Modus Operandi & Recovery link | **AUTO-CALCULATE.** System computes current cohort detection and separates legacy workouts. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **3** | **Stat-05: Burglary Modus Operandi** | • Day vs Night Burglary<br>• Entry method (Grill cut, lock break, roof)<br>• Stolen property type (Cash/Gold) | **STANDARDIZE.** Replaces free-text remarks with 6 standard dropdown MO options. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **4** | **Stat-08: Motor Vehicle Theft (MV Theft)** | • Vehicle Category (Car, 2-Wheeler, Commercial)<br>• Engine & Chassis Number<br>• e-FIR Portal Sync | **MANDATORY.** Automatic 2-way sync with Delhi Police e-FIR portal. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **5** | **Stat-14 & 21: Preventive Actions & Kalandras** | • BNSS 126/170/129/135<br>• DP Act 66, 28/112<br>• SEM Court status & Bond amount | **STANDARDIZE.** Unifies all thana prevention registers under new criminal laws. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **6** | **Stat-16: NDPS & Narcotics Seizures** | • 6 Drug Heads (Smack, Cocaine, Charas, Opium, Ganja, Poppy)<br>• Metric units (KG/Gram)<br>• Commercial qty flag | **MANDATORY.** Strictly enforce standard metric unit entries with auto-conversion. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **7** | **Stat-17: Arms Act Recoveries** | • Weapon Type (Katta, Revolver, Knife)<br>• Live cartridges & empty shells<br>• Catching Patrol Team type | **STANDARDIZE.** Capture weapon specs and link to arresting patrol team. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **8** | **Stat-19: Missing Persons & Children** | • Missing Date & Time<br>• Child Age & Gender<br>• Traced Date & Location<br>• Handover authority (Parents/CWC) | **MANDATORY.** Real-time auto-calculation of child recovery & tracing percentage. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **9** | **Stat-24 & 28: Crimes Against Women** | • Domestic Violence (BNS 85/86)<br>• Molestation / Eve Teasing<br>• Accused relationship with victim | **STANDARDIZE.** Detailed sub-heads for accurate monitoring at ACP/DCP/PHQ levels. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **10** | **Stat-25 & 26: POCSO Acts (Only vs Total)** | • Standalone POCSO FIRs<br>• POCSO combined with BNS Rape<br>• Victim compensation tracking | **STANDARDIZE.** Eliminates confusion between Sheet 9 clubbed totals and LSL returns. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **11** | **Stat-31: Senior Citizens** | • Senior Citizen Victim flag<br>• Nature of Crime (Physical/Financial)<br>• Thana Beat visit history | **MANDATORY.** Feeds directly into Senior Citizen Security cell reports. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **12** | **Stat-32: Cyber Crime & Financial Frauds** | • NCRP Portal ID / Ack No.<br>• Fraud Sub-type (UPI, Sextortion, Job)<br>• Amount Defrauded vs Frozen | **MANDATORY.** Connects Thana FIRs with Cyber Cell / NCRP recovery statistics. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **13** | **Stat-33: Property Stolen & Recovered** | • Value Stolen (Claimed vs Assessed)<br>• Value Recovered<br>• Property Type (Gold, Cash, Metal) | **AUTO-CALCULATE.** System computes recovery percentage automatically without manual bias. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **14** | **Stat-36 & 37: Disposal & Pendency Aging** | • Brackets: <30d, 31-60d, 61-90d, >1yr<br>• Pendency Reason (FSL, Medical, PO)<br>• Final Form filed date | **AUTO-CALCULATE.** Real-time aging tracker generated automatically from case date. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |
| **15** | **Stat-38 & 39: BNS & LSL No-Arrest Cases** | • Cases where accused not arrested<br>• Reason for non-arrest (BNSS Sec 35 notice issued, untraced, bail) | **STANDARDIZE.** Enforces compliance with BNSS arrest guidelines and notices. | `[ ] Keep`<br>`[ ] Drop`<br>`[ ] Modify`<br>`[ ] Auto-Calc` |

---

## 7. Tangible Operational Benefits for Delhi Police

- **Massive Workload Reduction at Police Stations:** Head Constables, Duty Officers, and Chiitha staff save 3+ hours every evening. Instead of filling 7 separate Excel files, they fill 1 structured online form during routine diary work.
- **Zero Calculation Discrepancies:** Because totals, variation percentages, and detection rates are computed by the system engine, there are zero mathematical mismatches between Thana, Sub-Division, District, and PHQ reports.
- **Instant Senior Officer Briefings:** DCPs, Joint CPs, Special CPs, and CP Delhi can view real-time crime maps, heinous crime alerts, and morning crime reviews instantly without waiting for manual Excel consolidation.
- **Future-Proof Legal Compliance:** Complete, seamless transition to Bharatiya Nyaya Sanhita (BNS) and Bharatiya Nagarik Suraksha Sanhita (BNSS) without losing historical 10-year crime trend baselines.

---

### Prepared & Issued By:
**PRISM Implementation Core Team**  
Statistical Cell & IT Division  
Delhi Police Headquarters, Jai Singh Road, New Delhi
