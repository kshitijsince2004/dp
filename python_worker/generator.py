import json
import os
import re
import pandas as pd
import openpyxl
from datetime import datetime, date
from db import engine
from sqlalchemy import text
from formatters import fmt_date, parse_date

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), 'templates')

def load_local_template(template_id):
    """Load a template definition from python_worker/templates/<id>.json if it exists."""
    path = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return None

def load_template(template_id, engine):
    with engine.connect() as conn:
        res = conn.execute(
            text("SELECT id, name, template_type, template_definition, record_types FROM report_templates WHERE id::text = :id OR code = :id"),
            {'id': str(template_id)}
        )
        row = res.mappings().fetchone()

    if not row:
        return None

    raw_def = json.loads(row['template_definition']) if isinstance(row['template_definition'], str) else (row['template_definition'] or {})
    applicable = json.loads(row['record_types']) if isinstance(row['record_types'], str) else (row['record_types'] or ['CASE'])
    record_type = applicable[0] if applicable else 'CASE'

    # DB templates store definition as {layout, header, sections[{fields}]}.
    # Python expects {filter_spec, fixed_fields, header}.  Normalize here.
    if 'filter_spec' not in raw_def:
        fixed_fields = []
        for section in raw_def.get('sections', []):
            fixed_fields.extend(section.get('fields', []))
        raw_def = {
            'filter_spec': {'record_type': record_type},
            'fixed_fields': fixed_fields,
            'header': raw_def.get('header', {'title_en': row['name']}),
            'template_type': row['template_type'] or 'PROFORMA',
        }

    return {
        'id': row['id'],
        'name_en': row['name'],
        'template_type': row['template_type'] or 'PROFORMA',
        'template_definition': raw_def,
    }

def get_predefined_definition(template_id):
    local = load_local_template(template_id)
    if local:
        return local
    if template_id == 'arrest-summary':
        return {
            'filter_spec': { 'record_type': 'ARREST' },
            'fixed_fields': ['uid', 'arrest_date', 'arrested_name', 'crime_head', 'io_name'],
            'header': { 'title_en': 'Arrest Summary Report', 'short_name_en': 'Arrest Summary' }
        }
    elif template_id == 'pcr-call-log':
        return {
            'filter_spec': { 'record_type': 'PCR_CALL' },
            'fixed_fields': ['pcr_no', 'gd_date', 'caller_mobile', 'occurrence_place', 'call_head', 'status'],
            'header': { 'title_en': 'PCR Call Log', 'short_name_en': 'PCR Call Log' }
        }
    elif template_id == 'cases-register':
        return {
            'filter_spec': { 'record_type': 'CASE' },
            'fixed_fields': ['fir_no', 'fir_date', 'complainant_name', 'local_head', 'brief_facts'],
            'header': { 'title_en': 'Cases Register', 'short_name_en': 'Cases Register' }
        }
    else:
        return {
            'filter_spec': { 'record_type': 'CASE' },
            'fixed_fields': ['uid', 'fir_no', 'fir_date'],
            'header': { 'title_en': 'PHAROS REPORT', 'short_name_en': 'Report' }
        }

def load_field_registry(field_keys, engine):
    if not field_keys:
        return {}
    with engine.connect() as conn:
        try:
            res = conn.execute(
                text("SELECT field_key, labels, field_type FROM field_registry WHERE field_key IN :keys"),
                {'keys': tuple(field_keys)}
            ).fetchall()
            meta = {}
            for r in res:
                lbls = r[1]
                if isinstance(lbls, str):
                    try: lbls = json.loads(lbls)
                    except: lbls = {}
                elif not isinstance(lbls, dict):
                    lbls = {}
                meta[r[0]] = {
                    'label_en': lbls.get('en') or r[0].replace('_', ' ').title(),
                    'label_hi': lbls.get('hi') or '',
                    'field_type': r[2]
                }
            return meta
        except Exception:
            return {k: {'label_en': k.replace('_', ' ').title(), 'label_hi': '', 'field_type': 'STRING'} for k in field_keys}

def query_records(definition, user_filters, engine):
    filter_spec = definition.get('filter_spec', {})
    record_type = filter_spec.get('record_type')
    data_filter = filter_spec.get('data_filter', {})
    field_keys = definition.get('fixed_fields', [])

    raw_date_from = user_filters.get('date_from') or user_filters.get('from_date') or user_filters.get('date') or user_filters.get('dateFrom') or user_filters.get('startDate')
    raw_date_to = user_filters.get('date_to') or user_filters.get('to_date') or user_filters.get('dateTo') or user_filters.get('endDate')
    date_from = parse_date(raw_date_from) or date(2020, 1, 1)
    date_to = parse_date(raw_date_to) or (date_from if raw_date_from else date(2030, 1, 1))
    ps_id = user_filters.get('ps_id') or user_filters.get('psId')
    district_id = user_filters.get('district_id') or user_filters.get('districtId')

    # Fetch records using existing robust helper
    all_records = _fetch_records({
        'date': date_from,
        'date_to': date_to,
        'ps_id': ps_id,
        'district_id': district_id
    })

    # Filter by record_type if specified
    if record_type:
        all_records = [r for r in all_records if r.get('record_type') == record_type]

    # Filter by data_filter
    if data_filter:
        filtered = []
        for r in all_records:
            d = r.get('data') or {}
            match = True
            for k, v in data_filter.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(r)
        all_records = filtered

    # Filter by dynamic user filters
    system_keys = {'date_from', 'from_date', 'date_to', 'to_date', 'ps_id', 'psId', 'district_id', 'districtId', 'selected_sub_templates', 'page', 'limit'}
    core_columns = {'id', 'current_status', 'current_level'}

    for k, v in user_filters.items():
        if k in system_keys or v is None or v == '':
            continue
        filtered = []
        for r in all_records:
            if k in core_columns:
                val = r.get(k)
            else:
                d = r.get('data') or {}
                val = d.get(k)
            if str(val) == str(v):
                filtered.append(r)
        all_records = filtered

    # Construct rows dictionary array matching field_keys
    rows = []
    for r in all_records:
        d = r.get('data') or {}
        row = {
            'ps_name': r.get('ps_name', ''),
            'record_date': fmt_date(r.get('record_date'))
        }
        for k in field_keys:
            row[k] = d.get(k) or r.get(k) or ''
        rows.append(row)

    df = pd.DataFrame(rows)
    if df.empty:
        df = pd.DataFrame(columns=['ps_name', 'record_date'] + field_keys)

    # Load field registry metadata for header renames
    fields_meta = load_field_registry(field_keys, engine)

    # Add Sr. No. column at the start
    if not df.empty:
        df.insert(0, 'Sr. No.', range(1, len(df) + 1))
        
        # Rename columns to label_en from registry
        rename_map = {k: fields_meta.get(k, {}).get('label_en', k.replace('_', ' ').title()) for k in field_keys}
        df.rename(columns=rename_map, inplace=True)
        
        # Drop raw fields like ps_name and record_date if they are not explicitly asked in fixed_fields
        drop_cols = []
        if 'ps_name' not in field_keys:
            drop_cols.append('ps_name')
        if 'record_date' not in field_keys:
            drop_cols.append('record_date')
        df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)
        
    return df

def write_header_rows(ws, header_def, user_filters, engine):
    title_en = header_def.get('title_en', 'PHAROS REPORT')
    title_hi = header_def.get('title_hi', '')
    
    ws.append([f"{title_en} {title_hi}".strip()])
    ws.append([f"Generated At: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
    
    ps_id = user_filters.get('ps_id') or user_filters.get('psId')
    jurisdiction = "All jurisdictions"
    if ps_id:
        with engine.connect() as conn:
            r = conn.execute(text("SELECT name FROM hierarchy_nodes WHERE id::text = :id OR code = :id"), {'id': str(ps_id)}).fetchone()
        if r:
            jurisdiction = r[0]
                
    date_from = user_filters.get('date_from', user_filters.get('from_date', 'N/A'))
    date_to = user_filters.get('date_to', user_filters.get('to_date', 'N/A'))
    date_range = f"Date Range: {date_from} to {date_to}"
    ws.append([f"Jurisdiction: {jurisdiction} | {date_range}"])
    ws.append([]) # empty separator row
    
    from openpyxl.styles import Font
    ws.cell(row=1, column=1).font = Font(name='Arial', size=13, bold=True, color='1F4E79')
    ws.cell(row=2, column=1).font = Font(name='Arial', size=9, italic=True, color='595959')
    ws.cell(row=3, column=1).font = Font(name='Arial', size=9, color='595959')

def write_dataframe(ws, df, start_row=5, engine=None):
    headers = list(df.columns)
    ws.append(headers)
    
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    header_fill = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid')
    header_font = Font(name='Arial', size=10, bold=True, color='FFFFFF')
    header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )
    
    header_row_idx = ws.max_row
    ws.row_dimensions[header_row_idx].height = 25
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=header_row_idx, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align
        cell.border = thin_border
        
    data_font = Font(name='Arial', size=9)
    data_align_left = Alignment(horizontal='left', vertical='center')
    data_align_center = Alignment(horizontal='center', vertical='center')
    zebra_fill = PatternFill(start_color='F2F6F9', end_color='F2F6F9', fill_type='solid')
    
    for row_idx, row in enumerate(df.itertuples(index=False), start=header_row_idx + 1):
        ws.row_dimensions[row_idx].height = 20
        use_zebra = (row_idx % 2 == 0)
        
        for col_idx, val in enumerate(row, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border
            if use_zebra:
                cell.fill = zebra_fill
            
            if isinstance(val, (int, float)) or str(val).startswith('Sr. No.'):
                cell.alignment = data_align_center
            else:
                cell.alignment = data_align_left
                
    for col in ws.columns:
        max_len = 10
        for cell in col:
            if cell.row < header_row_idx:
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max_len + 3, 45)

def generate_single_sheet_workbook(definition, user_filters, engine):
    df = query_records(definition, user_filters, engine)
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = definition.get('header', {}).get('short_name_en', 'Report')[:30]
    
    write_header_rows(ws, definition.get('header', {}), user_filters, engine)
    
    if df.empty:
        ws.append(["No records found for the selected period and filters."])
        ws.append([f"Filter applied: {json.dumps(definition.get('filter_spec', {}))}"])
    else:
        write_dataframe(ws, df, start_row=5, engine=engine)
        
    return wb

def generate_composite(definition, user_filters, engine):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    
    sub_ids = definition.get('sub_template_ids', [])
    selected_sub_templates = user_filters.get('selected_sub_templates')
    
    if selected_sub_templates:
        sub_ids = [sid for sid in sub_ids if sid in selected_sub_templates]
        
    for sub_id in sub_ids:
        template = load_template(sub_id, engine)
        if not template:
            # Check if it maps to predefined ones as fallback
            sub_def = get_predefined_definition(sub_id)
            sub_name = sub_id.replace('-', ' ').title()
        else:
            sub_def = template['template_definition']
            sub_name = template['name_en']
            
        sheet_name = sub_def.get('header', {}).get('short_name_en', sub_name)
        for char in ':\\/?*[]':
            sheet_name = sheet_name.replace(char, '')
        sheet_name = sheet_name[:31]
        
        ws = wb.create_sheet(title=sheet_name)
        df = query_records(sub_def, user_filters, engine)
        
        write_header_rows(ws, sub_def.get('header', {}), user_filters, engine)
        
        if df.empty:
            ws.append(["No records found for the selected period and filters."])
            ws.append([f"Filter applied: {json.dumps(sub_def.get('filter_spec', {}))}"])
        else:
            write_dataframe(ws, df, start_row=5, engine=engine)
            
    return wb

def generate_custom_workbook(custom_definition, user_filters, engine):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    
    sheets = custom_definition.get('sheets', [])
    if not sheets:
        wb.create_sheet(title="Report").append(["No sheets defined in custom report definition."])
        return wb
        
    for i, sheet in enumerate(sheets):
        record_type = sheet.get('record_type')
        field_keys = sheet.get('field_keys', [])
        sheet_title = sheet.get('sheet_name', f"Sheet {i+1}")
        
        sheet_def = {
            'filter_spec': { 'record_type': record_type },
            'fixed_fields': field_keys,
            'header': {
                'title_en': custom_definition.get('title_en', 'Custom Report'),
                'short_name_en': sheet_title
            }
        }
        
        sheet_name = sheet_title
        for char in ':\\/?*[]':
            sheet_name = sheet_name.replace(char, '')
        sheet_name = sheet_name[:31]
        
        ws = wb.create_sheet(title=sheet_name)
        df = query_records(sheet_def, user_filters, engine)
        
        write_header_rows(ws, sheet_def.get('header', {}), user_filters, engine)
        
        if df.empty:
            ws.append(["No records found for the selected period and filters."])
            ws.append([f"Filter applied: {json.dumps(sheet_def.get('filter_spec', {}))}"])
        else:
            write_dataframe(ws, df, start_row=5, engine=engine)
            
    return wb

def query_linked_records(definition, user_filters, engine):
    direction = definition.get('direction', 'source_to_target')
    link_code = definition.get('link_type_code', 'CASE_ARREST')

    def jf(col, key):
        return f"({col}::jsonb)->>'{key}'"

    params = {
        # date_from/date_to arrive as dd/mm/yyyy from the frontend; record_date is a
        # native DATE column so parse into real date objects before binding.
        'date_from': parse_date(user_filters.get('date_from') or user_filters.get('from_date')) or date(2020, 1, 1),
        'date_to':   parse_date(user_filters.get('date_to')   or user_filters.get('to_date'))   or date(2030, 1, 1),
        'link_code': link_code,
    }

    if direction == 'target_to_source':
        # ARREST primary, LEFT JOIN to parent CASE
        coalesce = f"COALESCE({jf('c.data', 'fir_no')}, {jf('a.data', 'linked_fir_dd_no')})"
        sql = f"""
            SELECT
              COALESCE(pa.name, '')                       AS arrested_name,
              COALESCE(pa.father_name, pa.relative_name, '') AS parents_name,
              COALESCE(loc_a.full_address, '')            AS arrested_address,
              COALESCE(CONCAT_WS('/', pa.age, pa.gender), '') AS age_gender,
              COALESCE(fd.fir_no, ad.fir_no, ad.gd_no, '') AS fir_dd_no,
              ad.arrest_datetime                          AS arrest_date,
              ad.act_sections                             AS sections,
              hn.name                                     AS ps_name,
              COALESCE(io_a.name, ad.arresting_officer_name, '') AS io_name,
              COALESCE(io_a.rank, ad.arresting_officer_rank, '') AS io_rank,
              COALESCE(io_a.mobile, '')                   AS io_mobile,
              ad.case_status                              AS status
            FROM records a
            JOIN hierarchy_nodes hn ON hn.id = a.ps_id
            LEFT JOIN arrest_details ad ON ad.record_id = a.id
            LEFT JOIN locations loc_a ON loc_a.id = ad.arrest_location_id
            LEFT JOIN investigating_officers io_a ON io_a.id = a.io_id
            LEFT JOIN persons pa ON pa.record_id = a.id AND pa.role = 'ARRESTEE'
            LEFT JOIN record_links rl
              ON rl.target_record_id = a.id
            LEFT JOIN link_type_registry ltr
              ON ltr.id = rl.link_type_id AND ltr.code = :link_code
            LEFT JOIN records c ON c.id = rl.source_record_id
            LEFT JOIN fir_details fd ON fd.record_id = c.id
            WHERE a.record_type IN ('ARREST', 'ARRESTS')
              AND COALESCE(a.registration_date, ad.arrest_datetime::date, a.record_date) BETWEEN :date_from AND :date_to
              AND a.current_status != 'DELETED'
        """
        if user_filters.get('ps_id') or user_filters.get('psId'):
            sql += " AND a.ps_id = :ps_id"
            params['ps_id'] = user_filters.get('ps_id') or user_filters.get('psId')
        elif user_filters.get('district_id') or user_filters.get('districtId'):
            sql += " AND a.district_id = :district_id"
            params['district_id'] = user_filters.get('district_id') or user_filters.get('districtId')
        sql += " ORDER BY COALESCE(a.registration_date, ad.arrest_datetime::date, a.record_date) DESC"

    else:
        # CASE primary, LEFT JOIN to linked ARRESTed persons
        sql = f"""
            SELECT
              hn.name                                     AS ps_name,
              COALESCE(fd.fir_no, '')                     AS fir_no,
              COALESCE(fd.act_sections, '')               AS sections,
              COALESCE(pc.name, '')                       AS complainant_name,
              COALESCE(pc.father_name, pc.relative_name, '') AS complainant_parent_name,
              COALESCE(loc_c.full_address, '')            AS complainant_address,
              COALESCE(fd.occurrence_from_datetime::text, '') AS time_of_occurrence,
              COALESCE(loc_occ.full_address, '')          AS occurrence_place,
              fd.occurrence_from_datetime                 AS occurrence_date,
              COALESCE(fd.brief_facts, '')                AS brief_facts,
              COALESCE(pa.name, '')                       AS arrested_name,
              COALESCE(pa.father_name, pa.relative_name, '') AS parents_name,
              COALESCE(loc_a.full_address, '')            AS arrested_address,
              COALESCE(CONCAT_WS('/', pa.age, pa.gender), '') AS age_gender,
              COALESCE(io_c.name, '')                     AS io_name
            FROM records c
            JOIN hierarchy_nodes hn ON hn.id = c.ps_id
            LEFT JOIN fir_details fd ON fd.record_id = c.id
            LEFT JOIN locations loc_occ ON loc_occ.id = fd.occurrence_location_id
            LEFT JOIN investigating_officers io_c ON io_c.id = c.io_id
            LEFT JOIN persons pc ON pc.record_id = c.id AND pc.role = 'COMPLAINANT'
            LEFT JOIN locations loc_c ON loc_c.id = pc.address_id
            LEFT JOIN record_links rl
              ON rl.source_record_id = c.id
            LEFT JOIN link_type_registry ltr
              ON ltr.id = rl.link_type_id AND ltr.code = :link_code
            LEFT JOIN records a ON a.id = rl.target_record_id
            LEFT JOIN arrest_details ad ON ad.record_id = a.id
            LEFT JOIN persons pa ON pa.record_id = a.id AND pa.role = 'ARRESTEE'
            LEFT JOIN locations loc_a ON loc_a.id = ad.arrest_location_id
            WHERE c.record_type IN ('CASE', 'CASES')
              AND COALESCE(c.registration_date, fd.fir_date, c.record_date) BETWEEN :date_from AND :date_to
              AND c.current_status != 'DELETED'
        """
        if user_filters.get('ps_id') or user_filters.get('psId'):
            sql += " AND c.ps_id = :ps_id"
            params['ps_id'] = user_filters.get('ps_id') or user_filters.get('psId')
        elif user_filters.get('district_id') or user_filters.get('districtId'):
            sql += " AND c.district_id = :district_id"
            params['district_id'] = user_filters.get('district_id') or user_filters.get('districtId')
        sql += " ORDER BY COALESCE(c.registration_date, fd.fir_date, c.record_date) DESC"

    with engine.connect() as conn:
        df = pd.read_sql(text(sql), conn, params=params)

    # Map column order to match definition['columns']
    col_keys = [c['key'] for c in definition.get('columns', [])]
    ordered_cols = [k for k in col_keys if k in df.columns]
    df = df[ordered_cols] if ordered_cols else df

    if not df.empty:
        df.insert(0, 'Sr. No.', range(1, len(df) + 1))

    # Rename to display labels
    label_map = {c['key']: c['label'] for c in definition.get('columns', [])}
    df.rename(columns=label_map, inplace=True)

    return df


def generate_linked_workbook(definition, user_filters, engine):
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    df = query_linked_records(definition, user_filters, engine)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = definition.get('header', {}).get('short_name_en', 'Report')[:30]

    write_header_rows(ws, definition.get('header', {}), user_filters, engine)

    header_groups = definition.get('header_groups', [])

    dark_blue  = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid')
    mid_blue   = PatternFill(start_color='2E75B6', end_color='2E75B6', fill_type='solid')
    white_bold = Font(name='Arial', size=10, bold=True, color='FFFFFF')
    white_norm = Font(name='Arial', size=9, bold=False, color='FFFFFF')
    center     = Alignment(horizontal='center', vertical='center', wrap_text=True)
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'), right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),  bottom=Side(style='thin', color='D9D9D9')
    )

    # Row 4: group headers with merged cells
    group_row = ws.max_row + 1
    ws.row_dimensions[group_row].height = 25
    col = 1
    for group in header_groups:
        span = group.get('span', 1)
        end = col + span - 1
        if span > 1:
            ws.merge_cells(start_row=group_row, start_column=col, end_row=group_row, end_column=end)
        cell = ws.cell(row=group_row, column=col, value=group['label'])
        cell.fill = dark_blue
        cell.font = white_bold
        cell.alignment = center
        cell.border = thin_border
        col = end + 1

    # Row 5: sub-column labels (one per actual data column, Sr. No. first)
    sub_row = group_row + 1
    ws.row_dimensions[sub_row].height = 22
    sub_labels = ['Sr. No.'] + [c['label'] for c in definition.get('columns', [])]
    for ci, label in enumerate(sub_labels, start=1):
        cell = ws.cell(row=sub_row, column=ci, value=label)
        cell.fill = mid_blue
        cell.font = white_norm
        cell.alignment = center
        cell.border = thin_border

    if df.empty:
        ws.append(['No records found for the selected period and filters.'])
    else:
        # write data rows manually (write_dataframe starts from current max_row+1)
        data_font  = Font(name='Arial', size=9)
        left_align = Alignment(horizontal='left',   vertical='center')
        ctr_align  = Alignment(horizontal='center', vertical='center')
        zebra_fill = PatternFill(start_color='F2F6F9', end_color='F2F6F9', fill_type='solid')

        for row_idx, row in enumerate(df.itertuples(index=False), start=sub_row + 1):
            ws.row_dimensions[row_idx].height = 20
            use_zebra = (row_idx % 2 == 0)
            for ci, val in enumerate(row, start=1):
                cell = ws.cell(row=row_idx, column=ci, value=val)
                cell.font = data_font
                cell.border = thin_border
                if use_zebra:
                    cell.fill = zebra_fill
                cell.alignment = ctr_align if isinstance(val, (int, float)) else left_align

        # Auto-fit column widths
        for col_cells in ws.columns:
            max_len = 10
            for cell in col_cells:
                if cell.row < group_row:
                    continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = len(val_str)
            col_letter = openpyxl.utils.get_column_letter(col_cells[0].column)
            ws.column_dimensions[col_letter].width = min(max_len + 3, 45)

    return wb


def render_pdf(df, definition, filters, file_path):
    title = definition.get('header', {}).get('title_en', 'PHAROS REPORT')
    headers_html = "".join(f"<th>{col}</th>" for col in df.columns)
    
    body_rows = []
    for row in df.itertuples(index=False):
        cells_html = "".join(f"<td>{str(val or '')}</td>" for val in row)
        body_rows.append(f"<tr>{cells_html}</tr>")
    body_html = "".join(body_rows)

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; padding: 20px; color: #333; }}
        h1 {{ color: #1F4E79; font-size: 18px; margin-bottom: 5px; }}
        p {{ color: #595959; font-size: 10px; margin: 2px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th, td {{ border: 1px solid #D9D9D9; padding: 6px 8px; text-align: left; font-size: 9px; }}
        th {{ background-color: #1F4E79; color: white; font-weight: bold; }}
        tr:nth-child(even) {{ background-color: #F2F6F9; }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <p>Generated At: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    <table>
        <thead>
            <tr>
                {headers_html}
            </tr>
        </thead>
        <tbody>
            {body_html}
        </tbody>
    </table>
</body>
</html>"""
    try:
        from weasyprint import HTML
        HTML(string=html_content).write_pdf(file_path)
        print("[Worker] PDF generated successfully using WeasyPrint.")
    except Exception as e:
        print(f"[Worker] WeasyPrint generation failed ({e}). Saving HTML layout directly to disk.")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

DAILY_DIARY_PARALLEL_TEMPLATE_IDS = {
    'daily-diary', 'dd-manual-fir', 'dd-eburglary-ehouse-theft-mvt',
    'dd-arrested-east-district', 'dd-arrested-kalandara',
    'dd-arrested-efir-theft', 'dd-arrested-efir-mv-theft', 'dd-proclaimed-offenders',
    'dd-arrested-24hrs', 'dd-missing-uidb', 'dd-women-children-missing',
    'dd-preventive-action', 'dd-inquest-registered', 'dd-important-cases',
    'dd-fir-goswara-summary', 'dd-financial-fraud-arrest', 'dd-ndps-action',
    'dd-arrest-count-summary',
}

# Maps each template ID to the subset of table_names it covers (None = all sheets)
TEMPLATE_TO_TABLE_NAMES = {
    'daily-diary': [
        'excel_1manual_fir', 'excel_2eburglary_cases', 'excel_3ehouse_theft_cases', 'excel_4eother_theft_cases',
        'excel_5mvt_cases', 'excel_7arrested_east_district', 'excel_8arrested_kalandara',
        'excel_9arrested_efir_theft', 'excel_10arrested_efir_mv_theft', 'excel_11proclaimed_offenders',
        'excel_13arrested_24_hrs_list', 'excel_14pi_disposal_manual', 'excel_15pi_disposal_eproperty',
        'excel_16pi_disposal_emvt', 'excel_18missing_persons', 'excel_19uidb', 'excel_20abandoned_persons',
        'excel_21traced_persons', 'excel_22women_missing', 'excel_23children_missing',
        'excel_25inquest_registered', 'excel_26inquest_acpsdm_disposal', 'excel_28fir_goswara_summary',
        'excel_29arrest_count_summary'
    ],
    'dd-manual-fir': ['excel_1manual_fir'],
    'dd-eburglary-ehouse-theft-mvt': ['excel_2eburglary_cases', 'excel_3ehouse_theft_cases', 'excel_4eother_theft_cases', 'excel_5mvt_cases'],
    'dd-arrested-east-district': ['excel_7arrested_east_district'],
    'dd-arrested-kalandara': ['excel_8arrested_kalandara'],
    'dd-arrested-efir-theft': ['excel_9arrested_efir_theft'],
    'dd-arrested-efir-mv-theft': ['excel_10arrested_efir_mv_theft'],
    'dd-proclaimed-offenders': ['excel_11proclaimed_offenders'],
    'dd-arrested-24hrs': ['excel_13arrested_24_hrs_list'],
    'dd-missing-uidb': ['excel_18missing_persons', 'excel_19uidb', 'excel_20abandoned_persons', 'excel_21traced_persons'],
    'dd-women-children-missing': ['excel_22women_missing', 'excel_23children_missing'],
    'dd-preventive-action': [],
    'dd-inquest-registered': ['excel_25inquest_registered', 'excel_26inquest_acpsdm_disposal'],
    'dd-important-cases': [],
    'dd-fir-goswara-summary': ['excel_28fir_goswara_summary'],
    'dd-financial-fraud-arrest': [],
    'dd-ndps-action': [],
    'dd-arrest-count-summary': ['excel_29arrest_count_summary'],
}

from registry import map_all_sheets, SHEETS as REGISTRY_SHEETS
from builder import build_workbook


def _fetch_records(filters):
    """Query records + hierarchy join for daily-diary generation."""
    raw_date = (
        filters.get('date') or filters.get('date_from') or filters.get('from_date') or
        filters.get('startDate') or filters.get('from') or filters.get('cutoffDate')
    )
    raw_date_to = (
        filters.get('date_to') or filters.get('dateTo') or filters.get('to_date') or
        filters.get('endDate') or filters.get('to')
    )

    date_from_val = parse_date(raw_date)
    date_to_val = parse_date(raw_date_to)

    if not date_from_val and not date_to_val:
        date_from_val = date(2020, 1, 1)
        date_to_val = date(2030, 1, 1)
    elif not date_from_val:
        date_from_val = date_to_val
    elif not date_to_val:
        date_to_val = date_from_val

    ps_id = filters.get('ps_id') or filters.get('psId')
    district_id = filters.get('district_id') or filters.get('districtId')
    sub_div_id = filters.get('sub_div_id') or filters.get('subDivId')

    conditions = ["COALESCE(r.registration_date, f.fir_date, r.record_date) BETWEEN :date_from AND :date_to", "r.current_status != 'DELETED'"]
    params = {'date_from': date_from_val, 'date_to': date_to_val}

    if ps_id:
        if isinstance(ps_id, list):
            placeholders = ', '.join(f':ps_{i}' for i in range(len(ps_id)))
            conditions.append(f'(r.ps_id IN ({placeholders}) OR ps.code IN ({placeholders}) OR ps.name IN ({placeholders}))')
            for i, p in enumerate(ps_id):
                params[f'ps_{i}'] = str(p)
        elif isinstance(ps_id, str) and ',' in ps_id:
            ps_list = [p.strip() for p in ps_id.split(',')]
            placeholders = ', '.join(f':ps_{i}' for i in range(len(ps_list)))
            conditions.append(f'(r.ps_id IN ({placeholders}) OR ps.code IN ({placeholders}) OR ps.name IN ({placeholders}))')
            for i, p in enumerate(ps_list):
                params[f'ps_{i}'] = p
        else:
            ps_str = str(ps_id).strip()
            if ps_str.upper() in ('ALL', 'ALL_STATIONS', 'ALL_DELHI_TOTAL', 'ALL_DELHI'):
                pass
            elif re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', ps_str, re.I):
                conditions.append('r.ps_id = :ps_id')
                params['ps_id'] = ps_str
            else:
                conditions.append('(ps.code = :ps_id OR ps.name = :ps_id OR LOWER(ps.name) = LOWER(:ps_id))')
                params['ps_id'] = ps_str
    elif district_id:
        dist_str = str(district_id).strip()
        if dist_str.upper() in ('ALL', 'ALL_DISTRICTS'):
            pass
        elif re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', dist_str, re.I):
            conditions.append('r.district_id = :district_id')
            params['district_id'] = dist_str
        else:
            conditions.append('(dist.code = :district_id OR dist.name = :district_id OR LOWER(dist.name) = LOWER(:district_id))')
            params['district_id'] = dist_str
    elif sub_div_id:
        conditions.append('r.sub_div_id = :sub_div_id')
        params['sub_div_id'] = str(sub_div_id)

    where = ' AND '.join(conditions)
    sql = f"""
        SELECT r.*,
               ps.name   AS ps_name,
               ps.code   AS ps_code,
               dist.name AS district_name,
               dist.code AS district_code
        FROM records r
        LEFT JOIN fir_details f        ON r.id          = f.record_id
        LEFT JOIN hierarchy_nodes ps   ON r.ps_id       = ps.id
        LEFT JOIN hierarchy_nodes dist ON r.district_id = dist.id
        WHERE {where}
        ORDER BY COALESCE(r.registration_date, f.fir_date, r.record_date) DESC, r.created_at DESC
    """

    with engine.connect() as conn:
        result = conn.execute(text(sql), params)
        rows = result.mappings().all()

    records = []
    for row in rows:
        r = dict(row)
        r['data'] = {}
        records.append(r)

    _enrich_records(records)
    return records


def _enrich_records(records):
    """Populate r['data'] from typed detail tables via bulk queries (no records.data column)."""
    if not records:
        return records

    all_ids    = [str(r['id']) for r in records]
    case_ids   = [str(r['id']) for r in records if r.get('record_type') in ('CASE', 'CASES')]
    arrest_ids = [str(r['id']) for r in records if r.get('record_type') in ('ARREST', 'ARRESTS')]
    missing_ids= [str(r['id']) for r in records if r.get('record_type') in ('MISSING', 'MISSINGS')]
    uidb_ids   = [str(r['id']) for r in records if r.get('record_type') in ('UIDB', 'UIDBS')]

    # Process details for all records via _q batching
    display_ids = all_ids

    idx = {str(r['id']): r for r in records}

    def ph(lst):   return ', '.join(f':p{i}' for i in range(len(lst)))
    def pm(lst):   return {f'p{i}': v for i, v in enumerate(lst)}
    def yn(v):     return 'Yes' if v else 'No'

    import time
    def _q(sql, ids):
        if not ids:
            return []
        all_rows = []
        batch_size = 5000
        for i in range(0, len(ids), batch_size):
            batch = ids[i:i + batch_size]
            for attempt in range(3):
                try:
                    with engine.connect() as conn:
                        rows = conn.execute(text(sql.replace('__PH__', ph(batch))), pm(batch)).mappings().all()
                        all_rows.extend(rows)
                        break
                except Exception as ex:
                    if attempt == 2:
                        raise ex
                    time.sleep(0.3)
        return all_rows

    # 1. CASE — fir_details + local_head + occurrence location
    if case_ids:
        for row in _q("""
            SELECT fd.record_id,
                   fd.fir_no, fd.fir_date, fd.gd_no, fd.gd_date, fd.gd_time,
                   fd.brief_facts, fd.case_status, fd.disposal_type, fd.is_worked_out,
                   fd.occurrence_from_datetime, fd.occurrence_to_datetime,
                   lh.local_head, lh.canonical_code,
                   COALESCE(NULLIF(TRIM(loc.full_address),''),
                            NULLIF(TRIM(CONCAT_WS(', ', NULLIF(loc.house_no,''),
                                   NULLIF(loc.street,''), NULLIF(loc.colony,''),
                                   NULLIF(loc.city_town_village,''))), '')) AS occ_place
            FROM fir_details fd
            LEFT JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
            LEFT JOIN locations loc ON loc.id = fd.occurrence_location_id
            WHERE fd.record_id IN (__PH__)
        """, case_ids):
            r = idx.get(str(row['record_id']))
            if not r: continue
            d = r['data']
            d['fir_no']         = row['fir_no'] or ''
            d['fir_date']       = fmt_date(row['fir_date'])
            d['gd_no']          = row['gd_no'] or ''
            d['gd_date']        = fmt_date(row['gd_date'])
            d['brief_facts']    = row['brief_facts'] or ''
            d['case_status']    = row['case_status'] or ''
            d['status']         = row['case_status'] or ''      # for is_disposed()
            d['disposal_type']  = row['disposal_type'] or ''
            d['is_worked_out']  = bool(row['is_worked_out'])
            d['local_head']     = row['local_head'] or ''
            d['canonical_code'] = row['canonical_code'] or ''
            d['crime_head']     = row['local_head'] or ''       # alias for sheets 09/10/11
            d['occurrence_place'] = row['occ_place'] or ''
            if row['occurrence_from_datetime']:
                dt = row['occurrence_from_datetime']
                d['occurrence_date']    = fmt_date(dt)
                d['time_of_occurrence'] = dt.strftime('%H:%M') if hasattr(dt, 'strftime') else ''
            if row['occurrence_to_datetime']:
                dt_to = row['occurrence_to_datetime']
                d['occurrence_end_date'] = fmt_date(dt_to)
                d['occurrence_end_time'] = dt_to.strftime('%H:%M') if hasattr(dt_to, 'strftime') else ''

    # 2. ARREST — arrest_details + local_head
    if arrest_ids:
        for row in _q("""
            SELECT ad.record_id,
                   ad.fir_no, ad.gd_no, ad.gd_date, ad.case_type, ad.case_status,
                   ad.custody_status, ad.recovery,
                   ad.scheme_of_arrest, ad.scheme_of_arrest_other,
                   ad.integrated_pi, ad.group_patrolling, ad.cycle_patrolling,
                   ad.by_antisnatching_team, ad.by_prahari, ad.by_eyes_ears_scheme_members,
                   ad.arresting_officer_name, ad.arresting_officer_rank,
                   lh.local_head, lh.canonical_code
            FROM arrest_details ad
            LEFT JOIN ref.local_heads lh ON lh.local_head_cd = ad.local_head_id
            WHERE ad.record_id IN (__PH__)
        """, arrest_ids):
            r = idx.get(str(row['record_id']))
            if not r: continue
            d = r['data']
            d['linked_fir_dd_no']  = row['fir_no'] or ''
            d['fir_no']            = row['fir_no'] or ''
            d['gd_no']             = row['gd_no'] or ''
            d['gd_date']           = fmt_date(row['gd_date'])
            d['case_type']         = row['case_type'] or ''
            d['case_status']       = row['case_status'] or ''
            d['custody_status']    = row['custody_status'] or ''
            d['status']            = row['custody_status'] or ''  # pcjcbail in sheet 07
            d['io_name']           = row['arresting_officer_name'] or d.get('io_name') or ''
            d['io_rank']           = row['arresting_officer_rank'] or d.get('io_rank') or ''
            _rec = (row['recovery'] or '').strip()
            if _rec.lower().startswith('undefined:'):
                _rec = _rec.split(':', 1)[1].strip()
            d['recovery']          = _rec or ''

            scheme_val = row['scheme_of_arrest'] or ''
            if scheme_val == 'Other' and row['scheme_of_arrest_other']:
                scheme_val = row['scheme_of_arrest_other']
            if not scheme_val:
                booleans = []
                if row['integrated_pi']: booleans.append('Integrated Pride')
                if row['group_patrolling']: booleans.append('Group Patrolling')
                if row['cycle_patrolling']: booleans.append('Cycle Patrolling')
                if row['by_antisnatching_team']: booleans.append('Anti-snatching')
                if row['by_prahari']: booleans.append('By Prahari')
                if row['by_eyes_ears_scheme_members']: booleans.append('By Eyes & Ears Scheme Members')
                scheme_val = ', '.join(booleans) if booleans else ''
            d['scheme_of_arrest'] = scheme_val
            d['scheme_of_arrest_other'] = row['scheme_of_arrest_other'] or ''
            d['arrest_scheme'] = scheme_val

            d['integrated_pi']            = yn(row['integrated_pi'])
            d['integrated_rate_picked']   = yn(row['integrated_pi'])  # sheet 10 alias
            d['group_patrolling']  = yn(row['group_patrolling'])
            d['group_rolling']     = yn(row['group_patrolling'])  # sheet 09 alias
            d['cycle_patrolling']  = yn(row['cycle_patrolling'])
            d['by_antisnatching_team']       = yn(row['by_antisnatching_team'])
            d['by_prahari']                  = yn(row['by_prahari'])
            d['by_eyes_ears_scheme_members'] = yn(row['by_eyes_ears_scheme_members'])
            d['local_head']        = row['local_head'] or ''
            d['canonical_code']    = row['canonical_code'] or ''
            d['crime_head']        = row['local_head'] or ''

    # 3. MISSING — missing_details
    if missing_ids:
        for row in _q("""
            SELECT md.record_id, md.gd_no, md.gd_date, md.missing_type,
                   md.missing_status, md.zipnet_no, md.fir_no,
                   md.operator_name, md.case_registered, md.source
            FROM missing_details md
            WHERE md.record_id IN (__PH__)
        """, missing_ids):
            r = idx.get(str(row['record_id']))
            if not r: continue
            d = r['data']
            d['gd_no']           = row['gd_no'] or ''
            d['gd_date']         = fmt_date(row['gd_date'])
            d['dd_no']           = row['gd_no'] or ''           # sheets 18/21 alias
            d['dd_date']         = fmt_date(row['gd_date'])     # sheets 18/21 alias
            d['missing_type']    = row['missing_type'] or ''
            d['missing_status']  = row['missing_status'] or ''
            d['status']          = row['missing_status'] or ''  # sheets 20/21/22/23
            d['zipnet_no']       = row['zipnet_no'] or ''
            d['fir_no']          = row['fir_no'] or ''
            d['operator_name']   = row['operator_name'] or ''
            d['case_registered'] = bool(row['case_registered'])
            d['source']          = row['source'] or ''

    # 4. UIDB — uidb_details + local_head + found location
    if uidb_ids:
        for row in _q("""
            SELECT ud.record_id, ud.uidb_no, ud.gd_no, ud.gd_date,
                   ud.cause_of_death, ud.uidb_status, ud.inquest_sections, ud.filed_by_acp_sdm, ud.inquest_status,
                   ud.found_date,
                   lh.local_head, lh.canonical_code,
                   COALESCE(NULLIF(TRIM(loc.full_address),''),
                            NULLIF(TRIM(CONCAT_WS(', ', NULLIF(loc.house_no,''), NULLIF(loc.street,''),
                                   NULLIF(loc.colony,''), NULLIF(loc.city_town_village,''),
                                   NULLIF(loc.district,''))), '')) AS found_place_addr
            FROM uidb_details ud
            LEFT JOIN ref.local_heads lh ON lh.local_head_cd = ud.local_head_id
            LEFT JOIN locations loc ON loc.id = ud.found_location_id
            WHERE ud.record_id IN (__PH__)
        """, uidb_ids):
            r = idx.get(str(row['record_id']))
            if not r: continue
            d = r['data']
            d['uidb_no']          = row['uidb_no'] or ''
            d['gd_no']            = row['gd_no'] or ''
            d['gd_date']          = fmt_date(row['gd_date'])
            d['dd_no']            = row['gd_no'] or ''          # sheet 19/25/26 alias
            d['dd_date']          = fmt_date(row['gd_date'])    # sheet 19/25/26 alias
            d['cause_of_death']   = row['cause_of_death'] or ''
            d['uidb_status']      = row['uidb_status'] or ''
            d['status']           = row['uidb_status'] or ''
            d['inquest_sections'] = row['inquest_sections'] or ''
            d['inquest_status']   = row['inquest_status'] or ''
            d['filed_by_acp_sdm'] = bool(row['filed_by_acp_sdm'])
            d['found_date']       = fmt_date(row['found_date'])
            d['local_head']       = row['local_head'] or 'UIDB'
            d['canonical_code']   = row['canonical_code'] or 'UIDB'
            d['crime_head']       = row['local_head'] or 'UIDB'
            d['occurrence_place'] = row['found_place_addr'] or ''
            d['found_place']      = row['found_place_addr'] or ''  # sheet 19 alias

    # 5. PERSONS — all roles, with arrest sub-details + address locations
    if display_ids:
        from collections import defaultdict
        person_rows = _q("""
            SELECT p.record_id, p.role, p.name, p.relative_name, p.relation_type,
                   p.gender, p.age, p.mobile, p.extra AS p_extra,
                   ad.extra AS ad_extra,
                   COALESCE(NULLIF(TRIM(ploc.full_address),''),
                            NULLIF(TRIM(CONCAT_WS(', ', NULLIF(ploc.house_no,''), NULLIF(ploc.street,''),
                                   NULLIF(ploc.colony,''), NULLIF(ploc.city_town_village,''))), '')) AS p_addr,
                   COALESCE(NULLIF(TRIM(permloc.full_address),''),
                            NULLIF(TRIM(CONCAT_WS(', ', NULLIF(permloc.house_no,''), NULLIF(permloc.street,''),
                                   NULLIF(permloc.colony,''), NULLIF(permloc.city_town_village,''))), '')) AS a_addr
            FROM persons p
            LEFT JOIN arrest_details ad ON ad.record_id = p.record_id
            LEFT JOIN locations ploc ON ploc.id = p.present_location_id
            LEFT JOIN locations permloc ON permloc.id = p.perm_location_id
            WHERE p.record_id IN (__PH__)
            ORDER BY p.record_id, p.created_at
        """, display_ids)

        by_rec = defaultdict(list)
        for row in person_rows:
            by_rec[str(row['record_id'])].append(dict(row))

        for rid, plist in by_rec.items():
            r = idx.get(rid)
            if not r: continue
            d = r['data']
            arrestees = []
            for p in plist:
                role = p['role']
                pextra = p.get('p_extra') or {}
                if isinstance(pextra, str):
                    try: pextra = json.loads(pextra)
                    except: pextra = {}
                adextra = p.get('ad_extra') or {}
                if isinstance(adextra, str):
                    try: adextra = json.loads(adextra)
                    except: adextra = {}

                prev_inv_val = (
                    pextra.get('prev_involvement_count') or pextra.get('prev_involvement') or pextra.get('pi_count')
                    or adextra.get('prev_involvement_count') or adextra.get('prev_involvement') or adextra.get('pi_count')
                    or 0
                )
                is_po_val = bool(
                    pextra.get('is_po') or pextra.get('proclaimed_offender') or pextra.get('po_flag')
                    or adextra.get('is_po') or adextra.get('proclaimed_offender') or adextra.get('po_flag')
                )
                is_bc_val = bool(
                    pextra.get('is_bc') or pextra.get('bad_character') or pextra.get('bc_flag')
                    or pextra.get('listed_criminal') or pextra.get('whether_accused_is_bc_or_not')
                    or adextra.get('is_bc') or adextra.get('bad_character') or adextra.get('bc_flag')
                    or adextra.get('listed_criminal') or adextra.get('whether_accused_is_bc_or_not')
                )

                if role == 'COMPLAINANT' and not d.get('complainant_name'):
                    d['complainant_name']          = p['name'] or ''
                    d['complainant_relative_name'] = p['relative_name'] or ''
                    d['complainant_relation_type'] = p['relation_type'] or ''
                    d['complainant_address']       = p['p_addr'] or ''
                elif role == 'IO' and not d.get('io_name'):
                    d['io_name'] = p['name'] or ''
                elif role == 'ACCUSED' and not d.get('accused_name'):
                    d['accused_name']    = p['name'] or ''
                    d['accused_age']     = p['age']
                    d['accused_address'] = p['p_addr'] or ''
                elif role == 'VICTIM' and not d.get('victim_name'):
                    d['victim_name'] = p['name'] or ''
                    d['victim_age']  = p['age']
                elif role == 'ARRESTEE':
                    if not d.get('arrested_name'):
                        d['arrested_name']    = p['name'] or ''
                        d['age']              = p['age']
                        d['relative_name']    = p['relative_name'] or ''
                        d['parents_name']     = p['relative_name'] or ''  # _arrested_parent key
                        d['relation_type']    = p['relation_type'] or ''
                        d['arrested_address'] = p['p_addr'] or ''
                        d['arrest_place']     = p['a_addr'] or ''
                        d['prev_involvement'] = str(prev_inv_val)
                        d['bad_character']    = yn(is_bc_val)
                        d['is_po']            = yn(is_po_val)
                    if p.get('name'):
                        arrestees.append(p['name'])
                elif role == 'MISSING' and not d.get('person_name'):
                    d['person_name']    = p['name'] or ''
                    d['missing_name']   = p['name'] or ''        # sheet 18/21 alias
                    d['gender']         = p['gender'] or ''
                    d['age']            = p['age']
                    d['relative_name']  = p['relative_name'] or ''
                    d['parents_name']   = p['relative_name'] or ''
                    d['missing_address']= p['p_addr'] or ''
                elif role == 'DECEASED' and not d.get('person_name'):
                    d['person_name']    = p['name'] or ''
                    d['deceased_name']  = p['name'] or ''        # sheets 25/26 alias
                    d['gender']         = p['gender'] or ''
                    d['deceased_father_husband_name'] = p['relative_name'] or ''
                    d['deceased_address'] = p['p_addr'] or ''

            if arrestees:
                d['arrested_person'] = ', '.join(arrestees)

    # 6. PERSON DESCRIPTIONS — for MISSING and DECEASED persons (sheets 18, 19, 20, 21)
    if display_ids:
        for row in _q("""
            SELECT p.record_id,
                   pd.height, pd.built, pd.complexion, pd.face, pd.hair,
                   pd.beard, pd.moustache, pd.upper_dress_color, pd.lower_dress_color,
                   pd.identification_marks, pd.physical_description
            FROM person_descriptions pd
            JOIN persons p ON p.id = pd.person_id
            WHERE p.record_id IN (__PH__)
              AND p.role IN ('MISSING', 'DECEASED')
        """, display_ids):
            r = idx.get(str(row['record_id']))
            if not r: continue
            d = r['data']
            d['height']               = row['height'] or ''
            d['built']                = row['built'] or ''
            d['complexion']           = row['complexion'] or ''
            d['face']                 = row['face'] or ''
            d['hair']                 = row['hair'] or ''
            d['beard']                = row['beard'] or ''
            d['moustache']            = row['moustache'] or ''
            d['upper_dress_color']    = row['upper_dress_color'] or ''
            d['lower_dress_color']    = row['lower_dress_color'] or ''
            d['identification_marks'] = row['identification_marks'] or ''

    # 7. OFFENCES — sections + act names formatted as "<Act Name> u/s <Section(s)>"
    if display_ids:
        offence_rows = _q("""
            SELECT ro.record_id,
                   COALESCE(NULLIF(a.act_long, ''), NULLIF(ro.other_act_name, '')) AS act_name,
                   COALESCE(NULLIF(s.section, ''), REGEXP_REPLACE(ro.section_id, '^[0-9]+-', ''), ro.section_id) AS sec_clean
            FROM record_offences ro
            LEFT JOIN ref.acts a ON a.act_cd = ro.act_id
            LEFT JOIN ref.sections s ON s.section_code = ro.section_id OR s.section_cd::text = ro.section_id
            WHERE ro.record_id IN (__PH__)
        """, display_ids)

        offences_by_rec = defaultdict(list)
        for orow in offence_rows:
            offences_by_rec[str(orow['record_id'])].append(orow)

        for rid, olist in offences_by_rec.items():
            r = idx.get(rid)
            if not r: continue
            d = r['data']

            act_sections = defaultdict(set)
            all_acts = set()
            all_secs = set()

            for item in olist:
                act = (item['act_name'] or '').strip()
                sec = (item['sec_clean'] or '').strip()
                if act: all_acts.add(act)
                if sec: all_secs.add(sec)
                if act and sec:
                    act_sections[act].add(sec)

            formatted_parts = []
            if act_sections:
                for act, secs in act_sections.items():
                    sec_str = ', '.join(sorted(list(secs)))
                    formatted_parts.append(f"{act} u/s {sec_str}")
            elif all_acts and all_secs:
                act_str = ', '.join(sorted(list(all_acts)))
                sec_str = ', '.join(sorted(list(all_secs)))
                formatted_parts.append(f"{act_str} u/s {sec_str}")
            elif all_secs:
                sec_str = ', '.join(sorted(list(all_secs)))
                formatted_parts.append(f"u/s {sec_str}")
            elif all_acts:
                formatted_parts.append(', '.join(sorted(list(all_acts))))

            final_us_str = '; '.join(formatted_parts) or d.get('local_head') or d.get('crime_head') or ''
            d['sections']        = final_us_str
            d['us']              = final_us_str
            d['act_section']     = final_us_str
            d['us_act_section']  = final_us_str
            d['act_name']        = ', '.join(sorted(list(all_acts))) if all_acts else ''

    # 8. IO USER RESOLUTION — fallback when io_name is missing
    io_uuids = list(set([str(r['io_id']) for r in records if r.get('io_id') and not r['data'].get('io_name')]))
    if io_uuids:
        user_rows = _q("""
            SELECT u.id, u.name, u.role
            FROM users u
            WHERE u.id IN (__PH__)
        """, io_uuids)
        user_map = {str(u['id']): u for u in user_rows}
        for r in records:
            io_id_str = str(r.get('io_id') or '')
            if io_id_str in user_map and not r['data'].get('io_name'):
                r['data']['io_name'] = user_map[io_id_str]['name'] or ''
                r['data']['io_rank'] = user_map[io_id_str].get('role') or ''

    return records


def _classify_records(records):
    """Split raw records into type buckets expected by sheet functions."""
    return {
        'cases':   [r for r in records if r.get('record_type') in ('CASE', 'CASES')],
        'arrests': [r for r in records if r.get('record_type') == 'ARREST'],
        'missing': [r for r in records if r.get('record_type') == 'MISSING'],
        'uidb':    [r for r in records if r.get('record_type') == 'UIDB'],
        'records': records,
    }


def generate_report(job_id):
    print(f"[Worker] Starting report job: {job_id}")
    with engine.connect() as conn:
        job = conn.execute(
            text("SELECT template_id, custom_definition, filters, format, file_path, created_by FROM report_jobs WHERE id = :id"),
            {'id': job_id}
        ).fetchone()
        
    if not job:
        raise Exception(f"Report job {job_id} not found in database")
        
    template_id = job[0]
    custom_definition = job[1]
    filters = job[2]
    format_type = job[3].upper()
    file_path = job[4]
    user_id = job[5]
    
    if not os.path.isabs(file_path):
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend'))
        file_path = os.path.abspath(os.path.join(backend_dir, file_path))
        
    if isinstance(custom_definition, str):
        custom_definition = json.loads(custom_definition)
    if isinstance(filters, str):
        filters = json.loads(filters)
        
    template = None
    if template_id:
        template = load_template(template_id, engine)
        if not template:
            print(f"[Worker] Predefined template row {template_id} not found in DB. Falling back to predefined structures.")
            template = {
                'id': template_id,
                'name_en': template_id.replace('-', ' ').title(),
                'template_type': 'PROFORMA',
                'template_definition': get_predefined_definition(template_id)
            }
        definition = template['template_definition']
    else:
        definition = custom_definition
        # Map first sheet for CSV/PDF formats
        if format_type in ['CSV', 'PDF']:
            sheets = custom_definition.get('sheets', []) if custom_definition else []
            if sheets:
                first_sheet = sheets[0]
                definition = {
                    'filter_spec': { 'record_type': first_sheet.get('record_type') },
                    'fixed_fields': first_sheet.get('field_keys', []),
                    'header': {
                        'title_en': custom_definition.get('title_en', 'Custom Report'),
                        'short_name_en': first_sheet.get('sheet_name', 'Report')
                    }
                }
        
    dir_name = os.path.dirname(file_path)
    if dir_name and not os.path.exists(dir_name):
        os.makedirs(dir_name, exist_ok=True)
        
    template_type = definition.get('template_type', 'PROFORMA') if definition else 'PROFORMA'

    if template and (template.get('template_definition') or template_type in ('PROFORMA_MATRIX', 'STATEMENT', 'MATRIX')):
        print(f"[Worker] Metadata-driven template '{template_id}' is handled by Node.js engine. Skipping Python generator.")
        return

    if format_type == 'CSV':
        if template_type in ('COMPOSITE', 'LINKED'):
            raise Exception(f"CSV format not supported for {template_type} templates")
        df = query_records(definition, filters, engine)
        df.to_csv(file_path, index=False)

    elif format_type in ['EXCEL', 'XLSX']:
        target_template_id = template_id or (custom_definition.get('template_id') if isinstance(custom_definition, dict) else None)
        is_daily_diary = (
            (not template and custom_definition and custom_definition.get('type') == 'DAILY_DIARY')
            or target_template_id in DAILY_DIARY_PARALLEL_TEMPLATE_IDS
        )
        if is_daily_diary:
            print(f"[Worker] Running Python daily-diary engine for template: {target_template_id}")
            records = _fetch_records(filters or {})
            classified = _classify_records(records)
            # Resolve active table names: per-template override → filter param → all
            active_tables = TEMPLATE_TO_TABLE_NAMES.get(target_template_id) if target_template_id else None
            if active_tables is None:
                raw_tnames = (filters or {}).get('table_names') or (filters or {}).get('tableNames')
                if isinstance(raw_tnames, str):
                    active_tables = [t.strip() for t in raw_tnames.split(',') if t.strip()]
                elif isinstance(raw_tnames, list):
                    active_tables = raw_tnames
            # Default to the reference template's 20 sheets if no specific table subset passed
            if active_tables is None:
                active_tables = TEMPLATE_TO_TABLE_NAMES.get('daily-diary')
            elif len(active_tables) == 0:
                active_tables = TEMPLATE_TO_TABLE_NAMES.get('daily-diary')
            _dd_date = (filters or {}).get('date', '')
            _dd_date_to = (filters or {}).get('date_to') or (filters or {}).get('dateTo')
            if _dd_date_to and _dd_date_to != _dd_date:
                date_label = f"{fmt_date(_dd_date)} to {fmt_date(_dd_date_to)}"
            else:
                date_label = fmt_date(_dd_date)
            sheets_data = map_all_sheets(classified, active_tables)
            active_sheet_defs = [s for s in REGISTRY_SHEETS if active_tables is None or s['table_name'] in active_tables]
            build_workbook(sheets_data, active_sheet_defs, file_path, date=date_label)
        elif template_type == 'LINKED':
            wb = generate_linked_workbook(definition, filters, engine)
            wb.save(file_path)
        elif template_type == 'COMPOSITE' or (template and template.get('template_type') == 'COMPOSITE'):
            wb = generate_composite(definition, filters, engine)
            wb.save(file_path)
        elif not template:
            wb = generate_custom_workbook(definition, filters, engine)
            wb.save(file_path)
        else:
            wb = generate_single_sheet_workbook(definition, filters, engine)
            wb.save(file_path)

    elif format_type == 'PDF':
        if template_type == 'LINKED':
            df = query_linked_records(definition, filters, engine)
        else:
            df = query_records(definition, filters, engine)
        render_pdf(df, definition, filters, file_path)
        
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE report_jobs SET status='READY', updated_at=:now WHERE id=:id"),
            {'now': datetime.now().isoformat(), 'id': job_id}
        )

    file_size = os.path.getsize(file_path)
    if os.getenv('PHAROS_TEST') == 'true':
        print(f"[Worker] Skipping event publishing in test mode for job: {job_id}")
    else:
        try:
            from events import publish_event
            publish_event('report.generated', {
                'job_id': str(job_id),
                'template_id': str(template_id) if template_id else None,
                'requested_by': str(user_id) if user_id else None,
                'file_path': str(file_path),
                'format': format_type,
                'file_size_bytes': file_size
            })
        except Exception as err:
            print(f"[WorkerError] Failed to publish event: {err}")
    print(f"[Worker] Completed report job: {job_id}. File size: {file_size} bytes")
