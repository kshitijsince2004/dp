# PHAROS Report Column Specification — Daily Diary, District Diary, PHQ Diary

2026-09-20 · @Someone

Column-by-column reference for every sheet in the three in-scope report suites, reflecting the taxonomy and formula corrections already confirmed for this project (Fortnightly Diary excluded, as throughout).

## Shared Formulas & Conventions

Every sheet below references these by name instead of restating the logic per column.

**Variation %** (year-over-year or period-over-period change):

```latex
\text{Variation\%} = \begin{cases} "-" & \text{Current} = 0 \text{ and Previous} = 0 \\ "+\infty" & \text{Current} > 0 \text{ and Previous} = 0 \\ \dfrac{\text{Current} - \text{Previous}}{\text{Previous}} \times 100 & \text{otherwise} \end{cases}
```

**Detection % / Solved %** (worked-out cases as a share of reported cases):

```latex
\text{Detection\%} = \begin{cases} "-" & \text{Reported} = 0 \\ \dfrac{\text{Solved}}{\text{Reported}} \times 100 & \text{otherwise} \end{cases}
```

**Not Worked Out** = Reported − Solved (floored at 0).

**E-FIR naming rule**: a column or sheet title using the bare word "E-FIR" with no qualifier means E\_THEFT-source and E\_MVT-source registrations combined. A qualified title ("E-FIR Theft", "E-FIR MV Theft", "E-Burglary", "E-House Theft") means only that one specific registration type.

**Crime-head classification authority**: every statistical count in every sheet below is driven solely by `fir_details.local_head_id` joined to `ref.local_heads`. The `record_offences` table (multi-row per case, one row per Act/Section cited) is supplementary legal detail only — it never drives a count or subtotal.

**The 7-head Heinous list is closed and fixed**: Dacoity, Murder, Attempt to Murder, Robbery, Riot, Kidnapping for Ransom, Rape. No other offense — however severe — expands this list. Specifically: **POCSO Act** and **BNS 111 (Organized Crime) / BNS 113 (Terrorist Acts)** all roll into **Total Act**, each as its own line item, never into Heinous or Non-Heinous.

**Person detail template**: `{First+Middle+Last name} "@" {Alias}, S/O {parent/guardian name}, R/O {compiled address}`. Omit the `@ alias` segment if no alias exists. For Arrestee specifically, inline age is included after the alias/name: `{Name} "@" {Alias}, {Age}, S/O {parent}, R/O {address}`. Verbatim examples: `Amit Jain @Anmol, S/O Mohan Jain R/O 107, Janpath, New Delhi - 110001` (complainant/accused), `Manoj @Mannu, 35, S/O Shakuntla Devi R/O 236, Jahangirpuri, New Delhi` (arrestee).

**Date & Time of Occurrence**: `DD/MM/YYYY; HH:MM` (semicolon before time), e.g., `16/07/2026; 21:49`. Plain date-only fields elsewhere use `DD/MM/YYYY`.

**Missing Person Address Override**: Sheet 15 (Missing Persons) uses a narrower present-address-only field set (`Present House No., Present Street, Present Colony, Present Village/City/Town, Present State, Present District, Present Pin Code`), explicitly excluding Landmark, Tehsil, Country, and not falling back to permanent address.

**Custody Status**: full real value set covering 8 distinct normalized values: `judicial custody / police custody / bail / bound down / release / lockup / 35(3) / apprehension`.

**Accused History (PI / PO / BC)**: combines flags for Previous Involvement (`PI`), Proclaimed Offender (`PO`), and Bad Character (`BC`) separated by `/` in exact fixed join order (e.g. `PO/BC`, `PI/PO/BC`).

**Recovery (property recovered)**: `Property category, property type, property description, property value` — comma-joined per item. Multi-item cells use numbered multi-line formatting (`1) ... \n 2) ...`).

**Body Description (Missing/UIDB/Abandoned)**: joins all populated physical description fields (height, built, complexion, face, hair, moustache, beard, dress colors) with commas, skipping blank fields.

**Vehicle Details (MVT sheet)**: `Type of property/Vehicle, Vehicle registration No.` (comma-joined).

**U/S (Act + Section) display**: every Act and Section cited on the case, concatenated together in one cell.

**Name of IO / Officer Detail**: `Rank, Name, PIS No.` comma-joined (e.g., `Inspector, Insp. Sharma, PIS10007`).

**Multi-Value Cell Strategy**: cells holding multiple distinct people or property items render each entry on a separate line within the same cell: `1) ... \n 2) ...`.

**Record Date (every list-grain sheet)**: every row carries its own explicit date field (`DD/MM/YYYY`).

**Boolean display convention**: renders as `Y` / `N` or `Yes` / `No` per sheet requirement — never raw `true`/`false`.

**Template Safety Discipline**: reference workbooks with hand-annotated specification rows (row 5) are stripped programmatically (`ws.delete_rows(5, ws.max_row - 4)`) before any generated report is exported, ensuring instruction rows never appear in real output.

**Sub-division grouping**: several District Diary sheets (D-8, D-9 FIR Arrests, D-9 Kal Arrests) insert a full-width header row reading `SUB DIVISION - [NAME]` between groups of records. This grouping is derived directly from `hierarchy_nodes.parent_id` (every Police Station's real parent Sub-Division), not assembled by hand.

**Jurisdiction levels**: `HQ → ZONE (2: L&O Zone 1/2) → RANGE (6) → DISTRICT (23) → SUB_DIV (92) → PS (226)`. The same sheet template is reused at PS level, District level, and Delhi-wide level — only the data's jurisdiction scope changes, not the column layout.

**Sheet 06 ("Arrested — All Heads / Section Breakdown") has been permanently removed** from the Station Daily Diary and does not appear in the inventory below. **Sheet 29 ("Police Station vs Crime Category Arrest Matrix") is a separate, retained sheet** — arrests by station and crime head, not by legal section number — and is documented in its place below.

## Station Daily Diary (24 sheets, PS-level)

Generated per Police Station per report date. "Sheet 06" is intentionally absent (removed by decision); the four previously-dormant sheets (Proclaimed Offenders, Women Missing Summary, Children Missing Summary, Arrest Count Summary) are included as now-live.

### 1. Manual FIR

Row grain: one row per manually-registered FIR at this PS today.

| Column | Holds |
| --- | --- |
| Police Station | The PS name |
| FIR No. | The 14-digit statutory FIR number |
| FIR Date | The date this FIR was registered — the record date for this row |
| U/S (Act + Section) | Every Act/Section cited on the case, per the U/S display convention |
| Complainant | Full name / S/O / R/O compiled address, per the person template |
| Date & Time of Occurrence | `fir_details.occurrence_from_datetime` — when the incident happened, distinct from the FIR Date above |
| Place of Occurrence | Compiled address of the occurrence location |
| Brief Facts / Gist of Case | `fir_details.brief_facts`, verbatim, no transformation |
| Arrested Person | Linked arrestee(s), via the person template, if any exist yet |
| Name of IO | Investigating Officer assigned to the case |

### 2–4. E-Burglary Cases / E-House Theft Cases / E-Other Theft Cases

Same column layout across all three; each filtered to a different local-head set, all restricted to `source_system = E_THEFT`.

| Column | Holds |
| --- | --- |
| Sr. No. | Row sequence |
| Police Station | The PS name |
| E-FIR No. | The 14-digit statutory number for this e-filed case |
| E-FIR Date | The date this e-FIR was registered — the record date for this row |
| U/S (Act + Section) | Sections cited, per the U/S display convention |
| Complainant | Full name / S/O / R/O compiled address, per the person template |
| Date & Time of Occurrence | Occurrence timestamp — distinct from the E-FIR Date above |
| Stolen Property | Free-text description from the property repeater |
| Place of Occurrence | Compiled address |
| Name of IO | Investigating Officer |
| Beat No. | Foot-patrol beat code |

Filter per sheet: **E-Burglary** = `local_head_id IN (12,13,209,210)`; **E-House Theft** = `local_head_id = 18`; **E-Other Theft** = the full Misc-Theft set `(17,19,20,21,22,23,24,25,26,27,28,208)`.

### 5. MVT Cases

Same base layout as above, filtered to `local_head_id = 16`, `source_system IN (E_MVT, E_THEFT)` per the E-FIR combining rule.

| Column | Holds |
| --- | --- |
| Sr. | Row sequence |
| Police Station | PS name |
| FIR No. | Statutory number |
| FIR Date | Registration date — the record date for this row |
| U/S | Sections cited, per the U/S display convention |
| Date & Time of Occurrence | Occurrence timestamp |
| Place of Occurrence | Compiled address |
| Complainant | Full name / S/O / R/O compiled address, per the person template |
| Vehicle Details | Type / registration number, from the property repeater |
| Name of IO | Investigating Officer |
| Beat No. | Patrol beat code |
| 1st CD Uploaded in 24 Hrs? | Yes/No/Pending flag |
| Footage Collected? | Yes/No flag |

### 6. Arrested — Kalandra / Preventive

Row grain: one preventive (non-FIR) arrest, registered under a DD/GD number rather than an FIR number.

| Column | Holds |
| --- | --- |
| S.N. | Row sequence |
| Date | The DD/GD registration date — the record date for this row |
| FIR No. | Blank for this sheet — preventive arrests key off a DD number instead |
| U/S (Act + Section) | The preventive section invoked |
| Accused | Person template |
| Place of Occurrence | Compiled address |
| Name of IO | Officer handling the proceeding |
| Custody Status | Per the Custody Status convention |
| Accused History | Per the Accused History convention |
| Recovery | Property recovered, if any |
| Arrest Scheme | Which patrol/scheme caught the person (regular patrol, cycle patrol, anti-snatching team, Prahari, Eyes & Ears) |

### 7. Arrested — E-FIR Theft

Arrests tied to any app-filed theft case (Burglary + House Theft + Other Theft combined, per the qualified "E-FIR Theft" scope — vehicle theft is excluded, covered separately in Sheet 8).

| Column | Holds |
| --- | --- |
| S.N. | Row sequence |
| Date of Arrest | The record date for this row |
| FIR No. | Linked e-FIR number |
| U/S | Sections cited, per the U/S display convention |
| Accused | Person template |
| Name of IO | Officer |
| Custody Status | Per the Custody Status convention |
| Accused History | Per the Accused History convention |
| Recovery | Property recovered |
| Arrest Scheme | Patrol/scheme attribution |

### Arrested — District

Row grain: every FIR-based arrest across **every PS in the district**, not just this station — the one district-wide arrest roundup.

| Column | Holds |
| --- | --- |
| S.N. | Row sequence |
| Date of Arrest | The record date for this row |
| FIR No. | Statutory number |
| U/S (Act + Section) | Sections, aggregated via `STRING_AGG` when multiple |
| Accused | Person template |
| Name of IO | Officer |
| Custody Status | Per the Custody Status convention |
| Prev. Involvement (Y/N) | Whether the arrestee has prior recorded cases |
| Property Recovered | Recovery detail |
| Accused BC (Y/N) | Bad-Character flag — shown as its own Yes/No column on this sheet rather than combined into a single Accused History cell the way Sheets 6–8 do |
| Arrest Scheme | Integrated PI / group patrolling / cycle patrolling / anti-snatching team / Prahari / Eyes & Ears |

### 8. Arrested — E-FIR MV Theft

Same layout as Sheet 7, filtered to vehicle-theft e-FIRs only.

### 11. Arrested — Last 24 Hrs

Row grain: every arrest in the rolling 24 hours ending at report-generation time.

| Column | Holds |
| --- | --- |
| S. No. | Row sequence |
| Date & Time of Arrest | The record date/time for this row — relevant here since the 24-hour window can span two calendar dates |
| Accused | Person template, with age |
| FIR / DD No. | Whichever reference applies (FIR-based or preventive) |
| U/S | Sections cited |
| Police Station | PS of arrest |
| Name of IO | Officer |
| Custody Status | Per the Custody Status convention |

### 12–14. PI Disposal — Manual / E-Theft / E-MVT

Row grain: a case whose police-side investigation concluded today, for the given registration channel.

| Column | Holds |
| --- | --- |
| S. No. | Row sequence |
| FIR No. | Statutory number |
| FIR / DD Date | The date the case was originally registered — may be well before the report period |
| Disposal Date | The date the police-side investigation actually concluded — the record date for this row |
| U/S | Sections cited |
| RC No. | Court/charge-sheet reference number, once sent |
| Disposal | Charge-sheet (Challan) / Untraced / Cancelled — the police's own investigation outcome, distinct from any later court verdict |

### 15. Missing Persons

Row grain: one person reported missing today.

| Column | Holds |
| --- | --- |
| S.No. | Row sequence |
| DD No. | Daily Diary entry number |
| DD Date | Entry date |
| Name of Operator (MPS) | Who logged the intake |
| Name of Missing Person | Person template (name only) |
| Address of Missing Person | Compiled address |
| Missing Date | Date last seen / reported missing |
| Age (Yrs) | Age |
| Body Description | Height / build / complexion / face / hair / dress |
| Name of IO | Officer assigned |

### 16. UIDB (Unidentified Bodies)

Row grain: one unidentified body found and logged today.

| Column | Holds |
| --- | --- |
| S.No. | Row sequence |
| DD No. / DD Date | Entry reference |
| Found Place | Compiled address |
| Found Date | Date recovered |
| Sex (M/F) | Recorded or estimated gender |
| Age (Yrs) | Estimated age or range |
| Body Description | Identifying features |
| Name of IO | Officer |

### 17. Abandoned Persons

Same layout as UIDB but for living persons found/abandoned rather than deceased.

### 18. Traced Persons

Row grain: a missing-person case whose status flips to Traced today.

| Column | Holds |
| --- | --- |
| S.No. / DD No. / DD Date | Entry reference |
| Name of Operator (MPS) | Who logged the original intake |
| Traced Person | Person template |
| Name of IO | Officer |

### 19. Inquest Registered

Row grain: a death requiring formal inquest, opened today.

| Column | Holds |
| --- | --- |
| S.N. / DD No. / FIR-DD Date | Entry reference |
| U/S | The inquest section invoked |
| Deceased | Person template |
| Sex (M/F) | Gender |
| Cause of Death | Recorded cause |
| Place of Occurrence | Compiled address |
| Name of IO | Officer |

### 20. Inquest ACP/SDM Disposal

Same base columns as Sheet 19, replacing the last column with **Date Filed by ACP/SDM** — the date a magistrate/ACP formally closed the inquest.

### 21. FIR Goswara Summary

Row grain: one row per district, a same-day scoreboard of arrests by registration channel.

| Column | Holds |
| --- | --- |
| District | District name |
| Total arrest in Manual FIR | Count of arrests tied to manually-registered FIRs today |
| Total arrest in Theft E-FIR | All e-theft-channel arrests minus the House Theft and Burglary e-FIR subsets — i.e. the Misc-Theft e-FIR arrests specifically |
| Total arrest in House Theft E-FIR | House-theft cases registered via the e-theft channel |
| Total arrest in Burglary E-FIR | Burglary cases registered via the e-theft channel |
| Total arrest in M.V. Theft | Vehicle-theft e-FIR arrests |
| Total | Sum of the five arrest counts above |

### Proclaimed Offenders (re-enabled)

Row grain: one arrestee/wanted person formally declared a Proclaimed Offender by a court.

| Column | Holds |
| --- | --- |
| S.N. | Row sequence |
| Police Station | PS |
| DD/FIR No. | Reference case |
| U/S | Sections |
| PO Name | Person template |
| PO Parentage | Parent/guardian name |
| PO Address | Compiled address |
| Case Declared | Date the court declared PO status |
| Court Name | Issuing court |

### Women Missing Summary (re-enabled)

Row grain: one funnel summary per district/PS per period.

| Column | Holds |
| --- | --- |
| Total Missing Women | Count of women reported missing (intake logged) |
| Traced Women | Count moved to Traced/Recovered status |
| Pending Women | Count still in Pending status |

### Children Missing Summary (re-enabled)

Same funnel as above, split by gender (boy / girl).

| Column | Holds |
| --- | --- |
| Total Missing (Boys / Girls) | Intake-logged count per gender |
| Traced (Boys / Girls) | Recovered count per gender |
| Pending (Boys / Girls) | Still-pending count per gender |

### Arrest Count Summary (re-enabled, Sheet 29)

Row grain: a station-by-crime-category crosstab — distinct from the removed Sheet 06 (which was arrests by *legal section number*; this is arrests by *station and crime head*).

| Column | Holds |
| --- | --- |
| Police Station | One row per PS |
| (one column per major crime-head group) | Count of arrests at that PS falling under that crime-head group, for the period |

## District Diary (17 sheets, District-level)

Same report engine as the Station Daily Diary and PHQ Diary, scoped to one district and its own police stations/sub-divisions.

### Rcell DD

Row grain: one row per PS, columns = every canonical crime head (Heinous + Non-Heinous + Act), one period.

| Column | Holds |
| --- | --- |
| (PS name column) | One row per station in the district, plus a TOTAL row |
| One column per crime head | Reported count for that head at that PS |
| Total IPC / Total BNS | Sum of Heinous + Non-Heinous columns for that row |
| Total Act | Sum of the Act columns for that row |
| Grand Total | Total IPC/BNS + Total Act |

### R Cell — Distt Crime

Row grain: one row per crime head, comparative statement for the whole district.

| Column | Holds |
| --- | --- |
| Head | Crime head name |
| Upto Date (prior year) — Rep. / W/O | Reported and Worked-Out counts, prior year, year-to-date |
| % age (prior year) | Detection % for that head, prior year |
| Upto Date (current year) — Rep. / W/O | Same, current year |
| % age (current year) | Detection % for that head, current year |
| % Variation | Variation % between the two years' Reported counts |

### E-FIR (bare word — combined E\_THEFT + E\_MVT)

Row grain: one row per fine-grained theft head, one column-pair per PS.

| Column | Holds |
| --- | --- |
| Head | Burglary / House Theft / MV Theft / Pickpocketing / Other Theft, etc. |
| REP / W/O (per PS) | Reported and Worked-Out counts at that PS, e-filed channel only, both E\_THEFT and E\_MVT sources combined |
| Total | Row sum across all PS columns |

### N-1, N-2, N-3

Three-tier comparative matrix: **N-1** = Police-Station level, **N-2** = Sub-Division rollup, **N-3** = District-aggregate + Range/Zone comparative rollup, all sharing one sheet. Row grain = fine-grained local crime head (the full granular list: Violent/Night/Day Burglary, Servant/Shop/Pickpocketing/Cycle/Bag-Lifting/Mobile/Other Theft, Simple/Grievous Hurt, Organized Crime, Terrorist Acts, Drugging, etc.), columns = one PS (or Sub-Division, or District, depending on tier) with REP/W/O sub-columns.

| Column | Holds |
| --- | --- |
| Head | The fine-grained local crime head |
| REP / W/O (per PS / Sub-Div / District) | Reported and Worked-Out counts at that jurisdiction unit |
| Heinous Total, Total IPC/BNS, Total Act, Grand Total | Row-group subtotals, same rules as the shared conventions |

*(The "For esakshya" block that previously appeared at the bottom of this sheet has been removed — it had no backing data source.)*

### D1, N-1,2,3 Res

Row grain: one row per crime head, a same-day resolution statement.

| Column | Holds |
| --- | --- |
| Head | Crime head |
| Today (current year) — Rep. / W/O | Today's counts, current year |
| Today (prior year) — Rep. / W/O | Today's counts, same date, prior year |
| Inc/Dec % upto date | Variation % on the year-to-date totals |
| Upto Date (current year) — Rep. / W/O / Not-W/O | Year-to-date figures, current year |
| % age (current year) | Detection % |
| Upto Date (prior year) — Rep. / W/O | Year-to-date figures, prior year |
| % age (prior year) | Detection % |

### Morning-Daily Diary

MV Theft only, PS-wise.

| Column | Holds |
| --- | --- |
| Police Station | PS name |
| During Day (current / prior year) | Today's Reported/Worked-Out MVT counts, both years |
| Upto Date (current / prior year) | Year-to-date Reported/Worked-Out, both years |
| Not Worked Out | Reported minus Worked-Out, current year, year-to-date |
| Solved % (prior / current year) | Detection % for MVT, both years |

### Daily Chart, Heinous, IPC

PS-wise, one block of columns per category (Total Heinous, Other BNS, Total BNS, Total Act, Grand Total).

| Column | Holds |
| --- | --- |
| Police Station | PS name |
| (per category block) Upto Date — Rep./W/O, prior & current year | Reported/Worked-Out for that category, both years |
| Not Worked (current year) | Reported minus Worked-Out |
| Solved % (prior / current year) | Detection % for that category |

### DCsP — Crime Chart

Same comparative structure as D1,N-1,2,3 Res, but head-by-head rather than subtotal-only, and includes an **E-Robbery** row (robbery filed via the E-FIR app) alongside standard Robbery.

### D-2 Heinous Brief Fact

**Corrected scope**: filters to exactly the 7 real statutory Heinous heads — Dacoity, Murder, Attempt to Murder, Robbery, Riot, Kidnapping for Ransom, Rape. (POCSO and ordinary Kidnapping were previously included in error and have been removed; Riot and Attempt to Murder were previously excluded in error and have been added back.)

| Column | Holds |
| --- | --- |
| S. No. | Row sequence |
| Police Station | PS name |
| FIR No. | Statutory number |
| FIR Date | Registration date — the record date for this row |
| U/Section | Sections cited, per the U/S display convention |
| Place of Occurrence | Compiled address |
| Date/Time of Occurrence | Occurrence timestamp — distinct from FIR Date above |
| Beat No. | Patrol beat code |
| Name of I.O. | Investigating Officer |
| Brief Facts of Case | `fir_details.brief_facts`, verbatim |
| Stolen / Recovery of Property | Property detail, if any |
| W/Out or Not | Whether the case is worked out |
| Name and Address of Accused | Full name / S/O / R/O compiled address, per the person template |
| Yet to be Arrested | Any accused still at large |
| Head of Crime | Which of the 7 Heinous heads this case falls under |

### Upto PCR Calls

Generic multi-head PCR dispatch summary (not restricted to any single crime type, despite an older sample file's title suggesting otherwise).

| Column | Holds |
| --- | --- |
| S.No. / Police Station | Row identity |
| During Day (prior / current year) | Today's PCR call counts, per call category, both years |
| Upto Date (prior / current year) | Year-to-date PCR call counts, both years |

### D-8 Brief Facts

All FIRs (not just Heinous), grouped under inserted "SUB DIVISION — \[NAME\]" header rows.

| Column | Holds |
| --- | --- |
| S.No. | Row sequence |
| Police Station | PS name |
| FIR No. | Statutory number |
| FIR Date | Registration date — the record date for this row |
| U/Section | Sections cited |
| Name of Complainant | Full name / S/O / R/O compiled address, per the person template |
| Time of Occurrence | Occurrence time |
| Place of Occurrence | Compiled address |
| Brief Facts of Case | `fir_details.brief_facts` |
| Accused Arrested (Yes/No) | Whether any accused has been arrested |
| Stolen / Recovery of Property | Property detail |
| Left Over Criminal | Any accused still at large |
| Head of Crime | The case's crime head |
| Beat No. | Patrol beat code |

### D-9 FIR Arrests

Arrest narrative for FIR-based arrests, grouped by sub-division.

| Column | Holds |
| --- | --- |
| S. No. / Police Station | Row identity |
| Name / Age / Parentage / Address | Full arrestee detail, per the person template |
| FIR No. & Date | Linked case reference and its registration date — the record date for this row |
| U/S | Sections cited |
| Name of Arresting Officer | Officer who made the arrest |
| No. of Previous Involvement / BC | Prior-case count and Bad-Character flag, per the Accused History convention |
| PO, History Sheeter, Type of Criminal | Any special classification |
| Place of Arrest | Compiled address |
| J/C, P/C, On Bail | Per the Custody Status convention |
| Tagging Officer | Officer responsible for follow-up |

### D-9 Kal Arrests

Same layout as D-9 FIR Arrests, but for Kalandra/preventive arrests — the reference column holds the DD/GD number instead of an FIR number.

### D-10 Action of 66 DP Act

Row grain: one row per PS, articles impounded under Delhi Police Act §66.

| Column | Holds |
| --- | --- |
| Police Station | PS name |
| Two Wheeler (Daily / Upto Date) | Count of two-wheelers impounded, today and year-to-date |
| Four Wheeler (Daily / Upto Date) | Same, four-wheelers |
| Other Article (Daily / Upto Date) | Same, all other article types |
| Total 66 DP Act | Sum of the three categories, year-to-date |

*(An earlier sample workbook showed this same data repeated a second time in a separate block of columns — that was a template copy-paste artifact, not two distinct figures, and is not part of the corrected layout.)*

### D-13 66DP

Row grain: one row per PS, vehicles specifically **seized** (a distinct action from impounded, covered in D-10) under the same Act.

| Column | Holds |
| --- | --- |
| Police Station | PS name |
| 66 DP Act — Daily | Vehicles seized today |
| 66 DP Act — Upto Date | Vehicles seized, year-to-date |

### G-22 Daily Crime

Four-quadrant matrix, district-wide, today's figures.

| Column | Holds |
| --- | --- |
| Quadrant I — Heinous | Reported/Worked-Out for the 7 statutory Heinous heads |
| Quadrant II — Non-Heinous Property | Reported/Worked-Out for Snatching, Burglary, House Theft, MV Theft, Other Theft, Cheating, Extortion, etc. |
| Quadrant III — Special Acts | Reported/Worked-Out for Arms, NDPS, Excise, Gambling, and other Act heads — **including BNS 111 (Organized Crime) and BNS 113 (Terrorist Acts)**, each as its own line item |
| Quadrant IV — Preventive Action | Kalandra/preventive-arrest counts |
| (select heads) PS-sourced vs E-FIR-App-sourced | For heads where both channels apply, Reported/Worked-Out shown split by how the case was filed |

### Accident Cases

Row grain: one row per district, today plus two years of year-to-date comparison, plus a free-text block.

| Column | Holds |
| --- | --- |
| District | District name |
| Simple/Grievous Accident — Today / Upto Date (2 years) | Non-fatal accident counts |
| Fatal Accident — Today / Upto Date (2 years) | Fatal accident counts |
| Brief Facts of All Fatal Cases | Free-text narrative block below the table, one entry per fatal case in the period — each entry carries its own date, since "Upto Date" can span several days |

## PHQ Diary (9 sheets, Delhi-wide)

The statutory Police-HQ package, comparing all 23 districts/units. Years shown below are placeholders — every sheet computes its own current/prior year from the report date, never a hardcoded string.

### Upto\_Date

Base data matrix: every crime head × every one of the 23 districts/units × multiple years, side by side.

| Column | Holds |
| --- | --- |
| Crime Head | One row per canonical head |
| (per district) Year columns | Reported count for that head, that district, that year |

### DISTRICTS

Same matrix as Upto\_Date, condensed to two years per district.

### L&O SOUTH

Same matrix, restricted to the 7 districts in the Southern L&O range: New Delhi, South-West, South, South-East, Dwarka, Outer, West.

### L&O NORTH

Same matrix, restricted to the 8 districts in the Northern L&O range: Central, North, North-West, Outer-North, Rohini, East, Shahdara, North-East.

### Daily Diary (feeder sheet)

Per-head Reported/Detected comparison, two years, that other PHQ sheets (notably Monday\_Morning) read their figures from.

| Column | Holds |
| --- | --- |
| Crime Head | One row per head |
| Comparative (2 years) | Reported count, each year |
| Variation % | Year-over-year change |
| Detection (2 years) — Cases / %age | Solved count and Detection % for each year |

### for week

Same style as the Daily Diary feeder sheet, computed over a weekly window instead of year-to-date.

### Variation% (mvt)

Same comparative style, focused on MVT/theft heads specifically.

### MANUALY

Three period types side by side, for each crime head: **Day** (current day vs. previous day), **Fortnight** (— *out of scope for this project's current work; the underlying 15-day comparison logic exists but is not part of the sheets covered here* —), and **Upto-Date** (multi-year cumulative). Each period block includes its own Variation %.

### Monday\_Morning

The primary morning-briefing sheet. Row grain: one row per crime head (21 rows total).

| Column | Holds |
| --- | --- |
| Crime Head | Head name — with one special case: **RAPE & POCSO are merged into a single row on this sheet only**; every other PHQ sheet keeps Rape (Heinous) and POCSO (Act) strictly separate |
| Case Reported (2 years) | Reported count, prior and current year |
| Variation | Variation % between the two years |
| Cases Solved (2 years) | Solved count, prior and current year |
| % age Solved | Detection %, current year |
| Total Heinous | Sum of the 7 statutory Heinous rows |
| Total Non Heinous | Sum of all Non-Heinous rows, including this sheet's "Other IPC" row |
| Other IPC | A specific derived sum of named rows (House Theft + Other Theft + Fatal Accident + Simple Accident, plus one further named row) — not an open DB catch-all category |
| Total IPC | Total Heinous + Total Non Heinous |
