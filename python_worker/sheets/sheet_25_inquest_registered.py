from formatters import format_person, fmt_date

NUM = 25
TABLE_NAME = 'excel_25inquest_registered'
LABEL = 'Inquest Registered'
COLUMNS = ['sn', 'dd_no', 'date', 'us', 'deceased_details', 'sex', 'cause_of_death', 'place_of_occurrence', 'io']
COLUMN_LABELS = {}


def filter_records(classified):
    # All UIDB records are inquest cases
    return classified['uidb']


def map_row(r, idx):
    d = r['data']
    return {
        'sn': idx + 1,
        'dd_no': d.get('gd_no') or d.get('dd_no') or '',
        'date': fmt_date(d.get('gd_date') or r.get('record_date')),
        'us': d.get('inquest_sections') or d.get('sections') or '',
        'deceased_details': format_person(
            d.get('deceased_name') or d.get('person_name'),
            d.get('age'),
            d.get('deceased_father_husband_name'),
            d.get('deceased_address'),
            d,
        ),
        'sex': d.get('gender') or d.get('sex') or '',
        'cause_of_death': d.get('cause_of_death') or '',
        'place_of_occurrence': d.get('occurrence_place') or d.get('found_place') or '',
        'io': d.get('io_name') or '',
    }
