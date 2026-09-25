from formatters import fmt_date

NUM = 19
TABLE_NAME = 'excel_19uidb'
LABEL = 'UIDB (Unidentified Bodies)'
COLUMNS = ['sno', 'dd_no', 'dd_date', 'found_place', 'found_date', 'sex', 'age', 'height', 'built', 'complexion', 'face', 'hair', 'beard', 'mustaches', 'upper_dress_color', 'lower_dress_color', 'name_of_io']
COLUMN_LABELS = {}


def filter_records(classified):
    return classified['uidb']


def map_row(r, idx):
    d = r['data']
    return {
        'sno': idx + 1,
        'dd_no': d.get('dd_no') or '',
        'dd_date': fmt_date(d.get('dd_date') or r.get('record_date')),
        'found_place': d.get('found_place') or '',
        'found_date': fmt_date(d.get('found_date')),
        'sex': d.get('gender') or d.get('sex') or '',
        'age': d.get('approx_age') or d.get('age') or '',
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
