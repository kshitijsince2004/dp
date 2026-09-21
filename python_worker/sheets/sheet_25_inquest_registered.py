from formatters import (
    fmt_date,
    format_person,
    format_compiled_address,
    format_io,
    _arrested_parent,
)

NUM = 25
TABLE_NAME = 'excel_25inquest_registered'
LABEL = 'Inquest Registered'
COLUMNS = ['sn', 'dd_no', 'date', 'us', 'deceased_details', 'sex', 'cause_of_death', 'place_of_occurrence', 'io']
COLUMN_LABELS = {
    'sn': 'S.N.',
    'dd_no': 'DD No.',
    'date': 'FIR / DD Date',
    'us': 'U/S (Act + Section)',
    'deceased_details': 'Deceased (Name / Age / S/O / R/O Address)',
    'sex': 'Sex (M / F)',
    'cause_of_death': 'Cause of Death',
    'place_of_occurrence': 'Place of Occurrence (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)',
    'io': 'Name of IO (Rank / Name / PIS No.)',
}


def filter_records(classified):
    return classified['uidb']


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

    return {
        'sn': idx + 1,
        'dd_no': d.get('gd_no') or d.get('dd_no') or '',
        'date': fmt_date(d.get('gd_date') or d.get('dd_date') or r.get('record_date')),
        'us': us_str,
        'deceased_details': deceased_str,
        'sex': d.get('gender') or d.get('sex') or '',
        'cause_of_death': d.get('cause_of_death_other') or d.get('cause_of_death') or '',
        'place_of_occurrence': format_compiled_address(d.get('occurrence_place') or d.get('found_place') or d),
        'io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
    }
