from formatters import (
    fmt_date,
    format_person,
    format_compiled_address,
    _arrested_parent,
)

NUM = 26
TABLE_NAME = 'excel_26inquest_acpsdm_disposal'
LABEL = 'Inquest ACP/SDM Disposal'
COLUMNS = ['sno', 'dd_no', 'date', 'us', 'deceased_details', 'sex', 'cause_of_death', 'date_of_filed_by_acpsdm']
COLUMN_LABELS = {
    'sno': 'S.No.',
    'dd_no': 'DD No.',
    'date': 'FIR / DD Date',
    'us': 'U/S (Act + Section)',
    'deceased_details': 'Deceased (Name / Age / S/O / R/O Address)',
    'sex': 'Sex (M / F)',
    'cause_of_death': 'Cause of Death',
    'date_of_filed_by_acpsdm': 'Date Filed by ACP/SDM',
}


def filter_records(classified):
    return [
        r for r in classified['uidb']
        if r['data'].get('filed_by_acp_sdm') or r['data'].get('inquest_status') in ['Disposal', 'Closure', 'DISPOSAL', 'CLOSURE']
    ]


def map_row(r, idx):
    d = r['data']
    deceased_str = format_person(
        d.get('deceased_name') or d.get('person_name') or d.get('name'),
        d.get('approx_age') or d.get('age'),
        d.get('deceased_father_husband_name') or d.get('father_husband_name') or _arrested_parent(d),
        format_compiled_address(d.get('deceased_address') or d.get('address') or d),
        d,
        include_age_inline=True
    )

    act = d.get('act_name') or ''
    sec = d.get('inquest_sections') or d.get('sections') or d.get('under_section') or ''
    us_str = f"{act} u/s {sec}".strip() if act and sec else (sec or act or '')

    disposal_date = fmt_date(d.get('date_filed_by_acp_sdm') or d.get('date_filed_acp_sdm') or d.get('inquest_filed_date') or d.get('filed_date') or r.get('updated_at'))

    return {
        'sno': idx + 1,
        'dd_no': d.get('gd_no') or d.get('dd_no') or '',
        'date': fmt_date(d.get('gd_date') or d.get('dd_date') or r.get('record_date')),
        'us': us_str,
        'deceased_details': deceased_str,
        'sex': d.get('gender') or d.get('sex') or '',
        'cause_of_death': d.get('cause_of_death_other') or d.get('cause_of_death') or '',
        'date_of_filed_by_acpsdm': disposal_date,
    }
