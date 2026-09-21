from formatters import (
    fmt_date,
    format_missing_present_address,
    format_body_description,
    format_io,
)

NUM = 18
TABLE_NAME = 'excel_18missing_persons'
LABEL = 'Missing Persons'
COLUMNS = ['sno', 'dd_no', 'dd_date', 'name_of_operator_to_whom_mps', 'name_of_missing_person', 'address_of_missing_person', 'missing_date', 'age', 'body_description', 'name_of_io']
COLUMN_LABELS = {
    'sno': 'S.No.',
    'dd_no': 'DD No.',
    'dd_date': 'DD Date',
    'name_of_operator_to_whom_mps': 'Name of Operator (MPS)',
    'name_of_missing_person': 'Name of Missing Person',
    'address_of_missing_person': 'Address of Missing Person',
    'missing_date': 'Missing Date',
    'age': 'Age (Yrs)',
    'body_description': 'Body Description (Height / Built / Complexion / Face / Hair / Dress)',
    'name_of_io': 'Name of IO (Rank / Name / PIS No.)',
}


def filter_records(classified):
    return classified['missing']


def map_row(r, idx):
    d = r['data']
    # Address per 2d (narrower present-address-only override)
    present_addr = format_missing_present_address(d)
    body_desc = format_body_description(d)

    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or d.get('gd_no') or '',
        'dd_date': fmt_date(d.get('dd_date') or d.get('gd_date') or r.get('record_date')),
        'name_of_operator_to_whom_mps': d.get('operator_name') or d.get('name_of_operator') or '',
        'name_of_missing_person': (d.get('missing_name') or d.get('person_name') or d.get('name') or '').strip(),
        'address_of_missing_person': present_addr,
        'missing_date': fmt_date(d.get('missing_date') or d.get('date_missing_since') or d.get('date_missing_found')),
        'age': d.get('age') or '',
        'body_description': body_desc,
        'name_of_io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
    }
