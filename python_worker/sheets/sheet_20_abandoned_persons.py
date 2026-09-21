from formatters import (
    fmt_date,
    format_compiled_address,
    format_body_description,
    format_io,
)

NUM = 20
TABLE_NAME = 'excel_20abandoned_persons'
LABEL = 'Abandoned Persons'
COLUMNS = ['sno', 'dd_no', 'found_place', 'found_date', 'sex', 'age', 'body_description', 'name_of_io']
COLUMN_LABELS = {
    'sno': 'S.No.',
    'dd_no': 'DD No.',
    'found_place': 'Found Place (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)',
    'found_date': 'Found Date',
    'sex': 'Sex (M / F)',
    'age': 'Age (Yrs)',
    'body_description': 'Body Description (Height / Built / Complexion / Face / Hair / Dress)',
    'name_of_io': 'Name of IO (Rank / Name / PIS No.)',
}


def filter_records(classified):
    return [
        r for r in classified['missing']
        if (r['data'].get('status') or '').lower() == 'abandoned' or r['data'].get('abandoned') is True
    ]


def map_row(r, idx):
    d = r['data']
    found_addr = format_compiled_address(d.get('found_place') or d.get('missing_place') or d.get('last_seen_place') or d)
    body_desc = format_body_description(d)

    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or d.get('gd_no') or '',
        'found_place': found_addr,
        'found_date': fmt_date(d.get('found_date') or d.get('missing_date') or d.get('date_missing_found')),
        'sex': d.get('gender') or d.get('sex') or '',
        'age': d.get('age') or '',
        'body_description': body_desc,
        'name_of_io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
    }
