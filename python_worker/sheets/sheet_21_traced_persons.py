from formatters import format_person_no_age, fmt_date

NUM = 21
TABLE_NAME = 'excel_21traced_persons'
LABEL = 'Traced Persons'
COLUMNS = ['sno', 'dd_no', 'dd_date', 'name_of_operator_to_whom_mps', 'traced_person_details', 'name_of_io']
COLUMN_LABELS = {}


def filter_records(classified):
    return [r for r in classified['missing'] if (r['data'].get('status') or '').lower() == 'traced']


def map_row(r, idx):
    d = r['data']
    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or '',
        'dd_date': fmt_date(d.get('dd_date') or r.get('record_date')),
        'name_of_operator_to_whom_mps': d.get('operator_name') or '',
        'traced_person_details': format_person_no_age(
            d.get('missing_name') or d.get('person_name'),
            d.get('parents_name') or d.get('relative_name') or d.get('father_husband_name'),
            d.get('missing_address') or d.get('address'),
            d,
        ),
        'name_of_io': d.get('io_name') or '',
    }
