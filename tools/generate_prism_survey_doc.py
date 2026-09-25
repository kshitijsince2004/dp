import os
import shutil
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_styled_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(4)
    for run in h.runs:
        run.font.name = 'Calibri'
        if level == 1:
            run.font.size = Pt(15)
            run.font.bold = True
            run.font.color.rgb = RGBColor(0, 32, 96) # Navy Blue
        elif level == 2:
            run.font.size = Pt(12.5)
            run.font.bold = True
            run.font.color.rgb = RGBColor(31, 78, 121) # Medium Blue
        elif level == 3:
            run.font.size = Pt(11)
            run.font.bold = True
            run.font.color.rgb = RGBColor(89, 89, 89) # Dark Gray
    return h

def create_prism_survey_doc(filepath):
    doc = Document()
    
    # Page Margins - Standard 0.8 inch for spacious layout
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Styles setup
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(38, 38, 38)
    normal_style.paragraph_format.line_spacing = 1.15
    normal_style.paragraph_format.space_after = Pt(4)

    # Header / Title Block
    header_table = doc.add_table(rows=1, cols=1)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_table.autofit = False
    header_cell = header_table.cell(0, 0)
    header_cell.width = Inches(6.9)
    set_cell_background(header_cell, "002060") # Dark Navy Blue
    set_cell_margins(header_cell, top=180, bottom=180, left=200, right=200)

    p = header_cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = p.add_run("DELHI POLICE HEADQUARTERS\n")
    r1.font.name = 'Calibri'
    r1.font.size = Pt(14)
    r1.font.bold = True
    r1.font.color.rgb = RGBColor(255, 255, 255)

    r2 = p.add_run("PRISM (Police Reporting Intelligence & Statistics Management) System\n")
    r2.font.name = 'Calibri'
    r2.font.size = Pt(12)
    r2.font.bold = True
    r2.font.color.rgb = RGBColor(255, 217, 102) # Gold accent

    r3 = p.add_run("PROJECT CHARTER & DISTRICT SURVEY FRAMEWORK:\nSTANDARDIZATION OF POLICE STATION FORMS & DISTRICT CRIME DIARIES")
    r3.font.name = 'Calibri'
    r3.font.size = Pt(13)
    r3.font.bold = True
    r3.font.color.rgb = RGBColor(255, 255, 255)

    # Metadata Subtitle
    meta_p = doc.add_paragraph()
    meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta_p.paragraph_format.space_before = Pt(6)
    meta_p.paragraph_format.space_after = Pt(12)
    m_run = meta_p.add_run("For Official Consultation with District Statistical Officers (SO Branch), Addl. DCPs (Ops), SHOs, and Thana Chiitha Staff across all Delhi Police Districts")
    m_run.font.italic = True
    m_run.font.size = Pt(9.5)
    m_run.font.color.rgb = RGBColor(89, 89, 89)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 1. EXECUTIVE SUMMARY & POLICING CONTEXT
    add_styled_heading(doc, "1. Executive Summary & Policing Background", 1)
    
    p = doc.add_paragraph(
        "Across the 15 Territorial Districts and Specialized Units (Crime Branch, Special Cell, Railways, Metro, IGI Airport, Traffic, Vigilance) of Delhi Police, crime statistics and daily operational reports form the backbone of administrative supervision, law and order monitoring, and strategic deployment. Currently, however, the compilation of these reports faces severe operational friction due to format divergence and manual duplicate data entry."
    )
    
    # Callout box for core problem
    box = doc.add_table(rows=1, cols=1)
    box.alignment = WD_TABLE_ALIGNMENT.CENTER
    b_cell = box.cell(0, 0)
    b_cell.width = Inches(6.9)
    set_cell_background(b_cell, "F2F2F2")
    set_cell_margins(b_cell, top=120, bottom=120, left=150, right=150)
    bp = b_cell.paragraphs[0]
    br1 = bp.add_run("The Core Practical Problem in Delhi Police Today:\n")
    br1.font.bold = True
    br1.font.color.rgb = RGBColor(192, 0, 0)
    bp.add_run(
        "1. Every district and every newly posted Deputy Commissioner of Police (DCP) introduces unique Excel formats, custom crime heads, and modified columns for their Daily Diary, Morning Crime Sheets, and Fortnightly Returns.\n"
        "2. At the Police Station (Thana) level, Head Constables, Duty Officers, and Chiitha Munshis spend 3 to 4 hours every day typing the exact same FIR, arrest, kalandra, and seizure details into 5 to 7 different disconnected spreadsheets.\n"
        "3. When reports reach District SO Branches (Statistical Officer) and Police Headquarters (PHQ), data totals mismatch, categories conflict (e.g. IPC vs BNS transition heads, clubbed Rape & POCSO vs separate heads), and manual calculation errors occur."
    )

    p2 = doc.add_paragraph()
    p2.paragraph_format.space_before = Pt(8)
    p2.add_run(
        "To resolve this permanently, Delhi Police is deploying the "
    )
    r_prism = p2.add_run("PRISM (Police Reporting Intelligence & Statistics Management) System")
    r_prism.font.bold = True
    p2.add_run(
        ". PRISM operates on a single golden rule: "
    )
    r_rule = p2.add_run('"Single Point Data Entry at Thana Level — Automatic 1-Click Generation of All Station, Sub-Division, District, and PHQ Reports."')
    r_rule.font.bold = True
    r_rule.font.italic = True

    p3 = doc.add_paragraph(
        "Before finalizing the forms and reports in PRISM, a comprehensive Field Survey must be conducted across all District SO Branches and representative Police Stations. This document outlines the survey procedures, highlights existing mismatches, lists data fields currently missing from digital forms, and provides a structured discussion agenda."
    )

    # 2. OBJECTIVES & NEEDS OF THE STANDARDIZATION SURVEY
    add_styled_heading(doc, "2. Objectives & Operational Needs for Standardization", 1)

    needs = [
        ("Eliminate Duplicate Thana Data Entry:", "Thana staff should only enter an FIR, Arrest, Seizure, or Kalandra once. The system will automatically populate the Daily Crime Diary, Fortnightly Return (FN Diary), Heinous Crime Register, and Senior Officer Morning Summaries."),
        ("Uniformity Across Complete Delhi Police:", "A Murder, Snatching, Vehicle Theft, or POCSO case must be categorized and calculated identically whether registered in South District, North-East District, Outer-North, or Crime Branch."),
        ("Seamless BNS & BNSS Compliance:", "Standardize all crime heads and preventive action sections under the Bharatiya Nyaya Sanhita (BNS) and Bharatiya Nagarik Suraksha Sanhita (BNSS), while maintaining seamless historical comparison with legacy IPC and CrPC data."),
        ("Eliminate Calculation Errors & Excel Corruption:", "Automate all calculations (Detection / Workout %, Variation % compared to previous year, Age-wise pendency, Stolen vs Recovered property) directly in the database without manual formula alterations."),
        ("District SO Branch Consensus:", "Provide a clear platform for District SO Branches to review every existing sheet and column, eliminating obsolete fields and finalizing mandatory standardized data points.")
    ]

    for title, desc in needs:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(3)
        r_t = p.add_run(f"• {title} ")
        r_t.font.bold = True
        r_t.font.color.rgb = RGBColor(0, 32, 96)
        p.add_run(desc)

    # 3. EXISTING REPORT MISMATCHES ACROSS DISTRICTS & PHQ
    add_styled_heading(doc, "3. Mismatches & Discrepancies in Current Reports", 1)
    
    doc.add_paragraph(
        "An in-depth operational audit of District Diaries, Fortnightly Returns (FN Diary - 41 Statistical Sheets), and PHQ Master Diaries revealed significant inconsistencies in how districts compile and interpret police data:"
    )

    # Mismatch Table
    t_mismatch = doc.add_table(rows=1, cols=4)
    t_mismatch.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_mismatch.autofit = False
    
    headers = ["Report Area / Subject", "District Practice Variance", "PHQ / Standard Practice", "Impact & Proposed PRISM Fix"]
    col_widths = [Inches(1.4), Inches(1.8), Inches(1.8), Inches(1.9)]
    
    for i, h_text in enumerate(headers):
        cell = t_mismatch.cell(0, i)
        cell.width = col_widths[i]
        set_cell_background(cell, "1F4E79")
        set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h_text)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
        r.font.size = Pt(9.5)

    mismatch_data = [
        (
            "Heinous Crime Classification",
            "Some districts include 'Attempt to Murder' and 'Extortion with Firearm' under Heinous, while others keep Extortion strictly under Non-Heinous. Dacoity & Robbery robbery-with-hurt are grouped differently.",
            "Standard Heinous comprises exactly 7 heads: Dacoity, Murder, Att. to Murder, Robbery, Riot, Kidnapping for Ransom, and Rape.",
            "PRISM will lock the 7 standard Heinous heads across all 15 districts, with automatic sub-classification tags."
        ),
        (
            "Rape & POCSO Reporting",
            "Certain districts report POCSO cases under IPC/BNS Heinous Rape, while others report POCSO strictly under Local & Special Laws (LSL). In morning summaries, both are clubbed.",
            "PHQ Sheet 9 clubs 'Rape & POCSO' for broad morning overview, but FN Diary Stat-25 & Stat-26 track POCSO-only and POCSO-total separately.",
            "PRISM will store exact section details at intake; the system will dynamically generate both separate legal returns and clubbed executive summaries."
        ),
        (
            "Detection / Worked-Out %",
            "Districts calculate detection % by dividing total cases solved this month (including old cases from previous years) by cases reported this month, sometimes resulting in >100% workout.",
            "Standard policing methodology tracks: (a) Workout % of current period cases, and (b) Total previous cases solved separately.",
            "PRISM will compute true cohort detection rate and display legacy solved cases in a dedicated distinct column."
        ),
        (
            "Motor Vehicle Theft (MV Theft)",
            "Some districts treat online e-FIRs and regular thana FIRs separately, causing discrepancies in daily theft totals. Stolen vehicle recovery valuation is arbitrarily entered.",
            "Unified MV Theft head covering all e-FIRs and manual FIRs with standardized vehicle type classifications (2-wheeler, car, commercial).",
            "PRISM links directly with e-FIR portal data so all MV thefts reflect automatically in District & PHQ totals."
        ),
        (
            "Narcotics (NDPS) Seizures",
            "Districts record seizures in non-standard units (Pudiyas, Grams, Packets, Bags) without converting to uniform Kilograms. Commercial vs Non-Commercial is not flagged.",
            "Standard reporting mandates 6 distinct narcotics rows (Heroin/Smack, Cocaine, Charas, Opium, Ganja, Poppy Head) strictly in KG.",
            "PRISM forms will enforce standard metric units (Grams/KG) with auto-conversion and commercial quantity threshold validation."
        ),
        (
            "Preventive Action & Kalandras",
            "Sections 107/151 CrPC, 107/116 CrPC, 110 CrPC are recorded haphazardly; after 1 July 2024, BNSS 126/170/129/135 mapping is inconsistent across Thanas.",
            "Standardized tracking of persons bound down, kalandras sent to SEM Court, and persons jailed under preventive sections.",
            "PRISM provides direct BNSS & DP Act (Sec 66, 28/112) preventive forms mapped to Special Executive Magistrate (SEM) court registers."
        ),
        (
            "Property Stolen vs Recovered",
            "Complainants report inflated estimated property value, while Malkhana records recovery at seized value. Total recovery % becomes artificially skewed.",
            "Stat-33 requires tracking Stolen Claimed Value, Assessed Actual Value, and Recovered Valuation with specific item categorisation.",
            "PRISM captures structured itemized property entries (Jewellery, Cash, Electronics, Vehicles, Metal/Cables)."
        )
    ]

    for row_idx, data in enumerate(mismatch_data):
        row = t_mismatch.add_row()
        bg_color = "F9F9F9" if row_idx % 2 == 0 else "FFFFFF"
        for col_idx, text in enumerate(data):
            cell = row.cells[col_idx]
            cell.width = col_widths[col_idx]
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=80, bottom=80, left=90, right=90)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            r.font.size = Pt(9.0)
            if col_idx == 0:
                r.font.bold = True
                r.font.color.rgb = RGBColor(0, 32, 96)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 4. DATA GAPS: FIELDS REQUIRED IN REPORTS BUT MISSING FROM INTAKE FORMS
    add_styled_heading(doc, "4. Data Gaps: Required Report Fields Not Collected in Current Forms", 1)
    
    doc.add_paragraph(
        "To enable the PRISM Report Engine to generate all 41 Fortnightly Sheets, District Diaries, and PHQ Crime Reviews automatically without asking Thana staff for manual spreadsheets, the following missing data fields must be integrated into PRISM standard intake forms:"
    )

    gaps = [
        (
            "4.1 FIR / Case Registration Form Gaps",
            [
                ("Case Registration Channel / Type", "Dropdown needed: CCTNS Manual FIR, e-Theft FIR, e-MVT (Motor Vehicle), NCRP (Cyber Portal e-FIR), Zero FIR (Transferred from/to other Thana)."),
                ("Exact Time of Occurrence vs GD Entry Time", "Currently only GD time is recorded. Reports require exact incident occurrence time interval (Morning, Day, Evening, Night) for crime pattern & patrolling analysis."),
                ("Detailed Complainant Particulars", "Parent's / Spouse's name, permanent address, contact number, and demographic tag (Senior Citizen, Minor, Woman, SC/ST, Foreign National)."),
                ("Modus Operandi (MO) & Weapon Category", "Burglary MO (Lock broken, grill cut, entered via roof, open latch) and Weapon used (Firearm, Knife, Blunt object, Physical force)."),
                ("Place of Occurrence Classification", "Beat number, Residential house, Commercial shop, Bank/ATM, Public road, Park, Metro/Bus station, Isolated plot."),
                ("Investigating Officer (IO) Full Profile", "IO Name, Rank, PIS / Belt Number, and Mobile Number for automated accountability registers.")
            ]
        ),
        (
            "4.2 Arrest & Accused Form Gaps",
            [
                ("Accused Personal Demographics", "Father's / Mother's name, Exact Age (years), Native District & State, Present Thana & Address."),
                ("Criminal Classification & History", "Bad Character (BC) flag & Bundle letter, Proclaimed Offender (PO) flag, Previous involvements count (total FIRs), Active Bail status."),
                ("Operational Catching Agency / Patrol Type", "Arrested by: Integrated Picket Staff, Group Foot Patrolling, Cycle Patrolling, Anti-Snatching Team, Special Staff, Prahari, Eyes & Ears Scheme informer tip-off."),
                ("Arrest Timing & Arresting Officer (AO)", "Exact Time of Arrest, AO Name, PIS Number, and Mobile Contact."),
                ("Seizure at Time of Arrest", "Direct linkage of weapon, stolen cash, or vehicle recovered from the specific accused during arrest.")
            ]
        ),
        (
            "4.3 Preventive Action & Kalandra Form Gaps (BNSS & DP Act)",
            [
                ("BNSS Preventive Sections", "Separate structured entry for Sec 126/170 BNSS (Breach of peace), Sec 129 BNSS (Good behaviour), Sec 135 BNSS (Habitual offenders)."),
                ("Delhi Police Act (DP Act) Actions", "Sec 66 DP Act (Unclaimed / suspicious vehicles & property seized), Sec 28/112 DP Act (Unlicensed eateries/hotels/public nuisance), Sec 65 DP Act (Wilful obstruction)."),
                ("SEM Court Details & Disposal", "Name of SEM Court, Kalandra DD Number & Date, Date sent to SEM, Security Bond amount, whether bound down or sent to Judicial Custody (JC)."),
                ("Externment (Tadpaar) Proceedings", "Action under DP Act Sec 47/50: Proposal sent, Order passed, Area externed from, Violation/Arrest of externed criminal.")
            ]
        ),
        (
            "4.4 Property, Seizures & Narcotics Gaps",
            [
                ("Standardized Narcotics Categories", "Distinct fields for Smack/Heroin, Cocaine, Charas, Ganja, Opium, Poppy Straw/Head with mandatory metric units (Grams/KG) and Commercial Quantity indicator."),
                ("Excise & Illicit Liquor Breakdown", "Separate count of Quarters (180 ml), Pints (375 ml), Full Bottles (750 ml), Beer Cans, and Illicit Pouch/Lahan liters, with vehicle seized under Excise Act."),
                ("Arms & Ammunition Specifications", "Country-made pistols (Katta/Tamancha), Factory-made Revolver/Pistol, Automatic weapons, Live cartridges count, Empty shells, Knives/Buttondar."),
                ("Stolen & Recovered Valuation", "Stolen value claimed by complainant, actual verified loss value, and assessed market value of recovered goods.")
            ]
        ),
        (
            "4.5 Special Focus Groups & Vulnerable Sections Gaps",
            [
                ("Crimes Against Women Details", "Victim relationship with accused (Husband/In-laws, Known person, Stranger), Workplace sexual harassment, Stalking, Acid attack, Protection Order status."),
                ("POCSO & Missing Children Tracking", "Exact victim age, Section 4/6/8/10/12 POCSO, Missing date, Date child traced, Traced by (Self/Thana Staff/AHTU), Handover to parents/CWC."),
                ("Senior Citizen Safety Register", "Senior Citizen verification status, Beat Constable visit date, Nature of complaint (Property dispute, Physical harassment, Cyber fraud)."),
                ("Cyber Crime & NCRP Integration", "NCRP Complaint Acknowledgement No., Cyber category (Financial fraud, Sextortion, Social media harassment), Amount defrauded, Amount frozen in bank/wallet.")
            ]
        ),
        (
            "4.6 Investigation Progress & Court Disposal Gaps",
            [
                ("Final Disposal Outcome", "Charge-sheet filed, Untraced Report filed, Cancellation Report filed, Quashed by High Court, Transferred to other Agency (CBI/NIA/Crime Branch)."),
                ("Age-Wise Pendency Brackets", "Automatic calculation of pendency: Under 30 Days, 31–60 Days, 61–90 Days, 91–180 Days, Over 1 Year pending, with specific pendency reason (Pending FSL, Pending Post-Mortem/MLC, Accused absconding)."),
                ("Court Trial Status", "Under Trial, Convicted, Acquitted, Discharged, Compounded.")
            ]
        )
    ]

    for section_title, items in gaps:
        add_styled_heading(doc, section_title, 2)
        for field_name, desc in items:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.2)
            p.paragraph_format.space_after = Pt(2)
            rf = p.add_run(f"• {field_name}: ")
            rf.font.bold = True
            rf.font.color.rgb = RGBColor(31, 78, 121)
            p.add_run(desc)

    # 5. DISTRICT SURVEY PROCEDURE & ROADMAP
    add_styled_heading(doc, "5. Standard Procedures for District SO Branch Survey", 1)
    
    doc.add_paragraph(
        "To ensure all 15 districts and specialized units actively participate and agree on the standardized forms and reporting rules, the following 4-step survey procedure is to be executed:"
    )

    steps = [
        ("Step 1: PHQ Notification & Distribution of Survey Packet", "PHQ Statistics Cell issues a formal circular to all District DCPs containing this PRISM Standardization Charter, the master field list, and the survey questionnaire."),
        ("Step 2: Formation of District Review Committees", "Each District DCP constitutes a 4-member District Committee comprising: (1) Addl. DCP / ACP (Operations), (2) In-charge Statistical Branch (SO Branch), (3) Two experienced SHOs (one Heavy Urban Thana, one Suburban/Rural Thana), and (4) Head Constable / Chiitha Munshi."),
        ("Step 3: Interactive Field Evaluation & Feedback Submission", "The District Committee reviews every sheet and field against their current operational requirements. Using the Decision Matrix (Section 6), they mark each field as 'Keep as Mandatory', 'Drop / Obsolete', 'Modify / Rename', or 'Auto-Compute'."),
        ("Step 4: Central Harmonization Workshop & CP Delhi Notification", "PHQ convenes a 1-day harmonization session with all District SO In-charges. The finalized Master Data Dictionary is frozen, and an official Delhi Police Standing Order is issued to mandate PRISM standardized forms across all Thanas.")
    ]

    for step_num, step_desc in steps:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(4)
        rs = p.add_run(f"{step_num}: ")
        rs.font.bold = True
        rs.font.color.rgb = RGBColor(0, 32, 96)
        p.add_run(step_desc)

    # 6. MASTER SO BRANCH DISCUSSION & DECISION MATRIX
    add_styled_heading(doc, "6. Master Discussion & Decision Matrix for District SO Branches", 1)
    
    doc.add_paragraph(
        "The following matrix represents the formal review sheet for District SO Branches and DCP Offices. Each item requires district feedback to establish Delhi Police standardized baseline:"
    )

    t_matrix = doc.add_table(rows=1, cols=5)
    t_matrix.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_matrix.autofit = False
    
    m_headers = ["S.No.", "Report Sheet / Subject", "Specific Data Fields to Review", "PRISM Standardization Recommendation", "District SO Branch Decision"]
    m_widths = [Inches(0.5), Inches(1.5), Inches(2.1), Inches(1.8), Inches(1.0)]
    
    for i, h_text in enumerate(m_headers):
        cell = t_matrix.cell(0, i)
        cell.width = m_widths[i]
        set_cell_background(cell, "002060")
        set_cell_margins(cell, top=100, bottom=100, left=80, right=80)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h_text)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
        r.font.size = Pt(9.0)

    matrix_rows = [
        (
            "1",
            "Stat-01: Cases Reported\n(Daily & Fortnightly)",
            "• Case Registration Type (Manual, e-FIR, NCRP, Zero FIR)\n• Time interval of occurrence\n• Beat Number & Landmark",
            "MANDATORY. Essential for auto-generating Daily Crime Sheets & PCR Call reconciliation.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "2",
            "Stat-02: Worked-Out / Detection Rate",
            "• Date Case Worked Out\n• Previous Year cases solved\n• Modus Operandi & Recovery link",
            "AUTO-CALCULATE. System computes current cohort detection and separates legacy workouts.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "3",
            "Stat-05: Burglary Modus Operandi",
            "• Day vs Night Burglary\n• Entry method (Grill cut, lock break, roof)\n• Stolen property type (Cash/Gold)",
            "STANDARDIZE. Replaces free-text remarks with 6 standard dropdown MO options.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "4",
            "Stat-08: Motor Vehicle Theft (MV Theft)",
            "• Vehicle Category (Car, 2-Wheeler, Commercial)\n• Engine & Chassis Number\n• e-FIR Portal Sync",
            "MANDATORY. Automatic 2-way sync with Delhi Police e-FIR portal.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "5",
            "Stat-14 & 21: Preventive Actions & Kalandras",
            "• BNSS 126/170/129/135\n• DP Act 66, 28/112\n• SEM Court status & Bond amount",
            "STANDARDIZE. Unifies all thana prevention registers under new criminal laws.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "6",
            "Stat-16: NDPS & Narcotics Seizures",
            "• 6 Drug Heads (Smack, Cocaine, Charas, Opium, Ganja, Poppy)\n• Metric units (KG/Gram)\n• Commercial qty flag",
            "MANDATORY. Strictly enforce standard metric unit entries with auto-conversion.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "7",
            "Stat-17: Arms Act Recoveries",
            "• Weapon Type (Katta, Revolver, Knife)\n• Live cartridges & empty shells\n• Catching Patrol Team type",
            "STANDARDIZE. Capture weapon specs and link to arresting patrol team.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "8",
            "Stat-19: Missing Persons & Children",
            "• Missing Date & Time\n• Child Age & Gender\n• Traced Date & Location\n• Handover authority (Parents/CWC)",
            "MANDATORY. Real-time auto-calculation of child recovery & tracing percentage.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "9",
            "Stat-24 & 28: Crimes Against Women",
            "• Domestic Violence (BNS 85/86)\n• Molestation / Eve Teasing\n• Accused relationship with victim",
            "STANDARDIZE. Detailed sub-heads for accurate monitoring at ACP/DCP/PHQ levels.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "10",
            "Stat-25 & 26: POCSO Acts (Only vs Total)",
            "• Standalone POCSO FIRs\n• POCSO combined with BNS Rape\n• Victim compensation tracking",
            "STANDARDIZE. Eliminates confusion between Sheet 9 clubbed totals and LSL returns.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "11",
            "Stat-31: Senior Citizens",
            "• Senior Citizen Victim flag\n• Nature of Crime (Physical/Financial)\n• Thana Beat visit history",
            "MANDATORY. Feeds directly into Senior Citizen Security cell reports.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "12",
            "Stat-32: Cyber Crime & Financial Frauds",
            "• NCRP Portal ID / Ack No.\n• Fraud Sub-type (UPI, Sextortion, Job)\n• Amount Defrauded vs Frozen",
            "MANDATORY. Connects Thana FIRs with Cyber Cell / NCRP recovery statistics.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "13",
            "Stat-33: Property Stolen & Recovered",
            "• Value Stolen (Claimed vs Assessed)\n• Value Recovered\n• Property Type (Gold, Cash, Metal)",
            "AUTO-CALCULATE. System computes recovery percentage automatically without manual bias.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "14",
            "Stat-36 & 37: Disposal & Pendency Aging",
            "• Brackets: <30d, 31-60d, 61-90d, >1yr\n• Pendency Reason (FSL, Medical, PO)\n• Final Form filed date",
            "AUTO-CALCULATE. Real-time aging tracker generated automatically from case date.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        ),
        (
            "15",
            "Stat-38 & 39: BNS & LSL No-Arrest Cases",
            "• Cases where accused not arrested\n• Reason for non-arrest (BNSS Sec 35 notice issued, untraced, bail)",
            "STANDARDIZE. Enforces compliance with BNSS arrest guidelines and notices.",
            "[ ] Keep\n[ ] Drop\n[ ] Modify\n[ ] Auto-Calc"
        )
    ]

    for row_idx, data in enumerate(matrix_rows):
        row = t_matrix.add_row()
        bg_color = "F2F5F8" if row_idx % 2 == 0 else "FFFFFF"
        for col_idx, text in enumerate(data):
            cell = row.cells[col_idx]
            cell.width = m_widths[col_idx]
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=70, bottom=70, left=70, right=70)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(text)
            r.font.size = Pt(8.5)
            if col_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r.font.bold = True
            elif col_idx == 1:
                r.font.bold = True
                r.font.color.rgb = RGBColor(0, 32, 96)
            elif col_idx == 4:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # 7. TANGIBLE OPERATIONAL BENEFITS FOR DELHI POLICE
    add_styled_heading(doc, "7. Tangible Operational Benefits for Delhi Police", 1)

    benefits = [
        ("Massive Workload Reduction at Police Stations:", "Head Constables, Duty Officers, and Chiitha staff save 3+ hours every evening. Instead of filling 7 separate Excel files, they fill 1 structured online form during routine diary work."),
        ("Zero Calculation Discrepancies:", "Because totals, variation percentages, and detection rates are computed by the system engine, there are zero mathematical mismatches between Thana, Sub-Division, District, and PHQ reports."),
        ("Instant Senior Officer Briefings:", "DCPs, Joint CPs, Special CPs, and CP Delhi can view real-time crime maps, heinous crime alerts, and morning crime reviews instantly without waiting for manual Excel consolidation."),
        ("Future-Proof Legal Compliance:", "Complete, seamless transition to Bharatiya Nyaya Sanhita (BNS) and Bharatiya Nagarik Suraksha Sanhita (BNSS) without losing historical 10-year crime trend baselines.")
    ]

    for b_title, b_desc in benefits:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(4)
        rb = p.add_run(f"✔ {b_title} ")
        rb.font.bold = True
        rb.font.color.rgb = RGBColor(38, 128, 0) # Green accent
        p.add_run(b_desc)

    # Sign-off block
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    sign_table = doc.add_table(rows=1, cols=2)
    sign_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    sign_table.autofit = False
    
    cell_l = sign_table.cell(0, 0)
    cell_l.width = Inches(3.4)
    cell_r = sign_table.cell(0, 1)
    cell_r.width = Inches(3.5)
    
    pl = cell_l.paragraphs[0]
    pl.add_run("Prepared & Issued by:\n").font.bold = True
    pl.add_run("PRISM Implementation Core Team\nStatistical Cell & IT Division\nDelhi Police Headquarters, New Delhi")
    
    pr = cell_r.paragraphs[0]
    pr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    pr.add_run("For Action by:\n").font.bold = True
    pr.add_run("All District DCPs & Additional DCPs (Ops)\nIn-Charge SO Branches & SHOs\nDelhi Police (All 15 Districts & Units)")

    # Save docx
    doc.save(filepath)
    print(f"Document successfully created at: {filepath}")

if __name__ == '__main__':
    target_docx = r"d:\DPI\FIR\pharos-prototype\PRISM_Standardization_Survey_Delhi_Police.docx"
    target_doc = r"d:\DPI\FIR\pharos-prototype\PRISM_Standardization_Survey_Delhi_Police.doc"
    target_docs_docx = r"d:\DPI\FIR\pharos-prototype\docs\PRISM_Standardization_Survey_Delhi_Police.docx"
    
    create_prism_survey_doc(target_docx)
    create_prism_survey_doc(target_docs_docx)
    
    # Also copy / save as .doc (standard Word binary/xml compatible)
    shutil.copyfile(target_docx, target_doc)
    print("Created .doc and .docx files successfully.")
