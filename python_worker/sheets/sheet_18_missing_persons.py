from formatters import fmt_date

NUM = 18
TABLE_NAME = 'excel_18missing_persons'
LABEL = 'Missing Persons'
COLUMNS = ['sno', 'dd_no', 'dd_date', 'name_of_operator_to_whom_mps', 'name_of_missing_person', 'address_of_missing_person', 'missing_date', 'age', 'height', 'built', 'complexion', 'face', 'hair', 'beard', 'mustaches', 'upper_dress_color', 'lower_dress_color', 'name_of_io']
COLUMN_LABELS = {
    'name_of_missing_person': 'Name of Missing Person',
    'address_of_missing_person': 'Address of Missing Person',
    'missing_date': 'Missing Date',
    'mustaches': 'Mustaches',
}


def filter_records(classified):
    return classified['missing']


def map_row(r, idx):
    d = r['data']
    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or '',
        'dd_date': fmt_date(d.get('dd_date') or r.get('record_date')),
        'name_of_operator_to_whom_mps': d.get('operator_name') or '',
        'name_of_missing_person': d.get('missing_name') or '',
        'address_of_missing_person': d.get('missing_address') or d.get('mp_address') or d.get('address') or '',
        'missing_date': fmt_date(d.get('missing_date')),
        'age': d.get('age') or '',
        'height': d.get('height') or '',
        'built': d.get('built') or '',
        'complexion': d.get('complexion') or '',
        'face': d.get('face') or '',
        'hair': d.get('hair') or '',
        'beard': d.get('beard') or '',
        'mustaches': d.get('moustache') or d.get('mustaches') or '',
        'upper_dress_color': d.get('upper_dress_color') or '',
        'lower_dress_color': d.get('lower_dress_color') or '',
        'name_of_io': d.get('io_name') or '',
    }
