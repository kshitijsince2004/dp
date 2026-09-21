from formatters import (
    fmt_date,
    format_missing_present_address,
    format_io,
)

NUM = 21
TABLE_NAME = 'excel_21traced_persons'
LABEL = 'Traced Persons'
COLUMNS = ['sno', 'dd_no', 'dd_date', 'name_of_operator_to_whom_mps', 'traced_person_details', 'name_of_io']
COLUMN_LABELS = {
    'sno': 'S.No.',
    'dd_no': 'DD No.',
    'dd_date': 'DD Date',
    'name_of_operator_to_whom_mps': 'Name of Operator (MPS)',
    'traced_person_details': 'Traced Person (Name / S/O / R/O Address)',
    'name_of_io': 'Name of IO (Rank / Name / PIS No.)',
}


def filter_records(classified):
    return [r for r in classified['missing'] if (r['data'].get('status') or '').lower() == 'traced']


def map_row(r, idx):
    d = r['data']
    name = (d.get('missing_name') or d.get('person_name') or d.get('name') or '').strip()
    addr = format_missing_present_address(d)
    
    # Distinct simpler person format per 5d: "Name, Present Address"
    if name and addr:
        traced_str = f"{name}, {addr}"
    else:
        traced_str = name or addr or ''

    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or d.get('gd_no') or '',
        'dd_date': fmt_date(d.get('dd_date') or d.get('gd_date') or r.get('record_date')),
        'name_of_operator_to_whom_mps': d.get('operator_name') or d.get('name_of_operator') or '',
        'traced_person_details': traced_str,
        'name_of_io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
    }
