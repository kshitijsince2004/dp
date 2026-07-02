from classifiers import is_house_theft
from formatters import format_person_no_age, format_occurrence, _complainant_parent

NUM = 3
TABLE_NAME = 'excel_3ehouse_theft_cases'
LABEL = 'E-House Theft Cases'
COLUMNS = ['sr_no', 'ps', 'efir_no', 'us', 'complainant_details', 'place_of_occurrence', 'time_of_occurrence', 'stolen_items', 'place_of_occurrence_1', 'io_name', 'io_mobile_no', 'beat_no']
COLUMN_LABELS = {}


def filter_records(classified):
    return [r for r in classified['cases'] if is_house_theft(r['data'])]


def map_row(r, idx):
    d = r['data']
    return {
        'sr_no': idx + 1,
        'ps': r.get('ps_name') or '',
        'efir_no': d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            d.get('complainant_address'),
            d,
        ),
        'place_of_occurrence': d.get('occurrence_place') or '',
        'time_of_occurrence': format_occurrence(
            d.get('occurrence_date'),
            d.get('time_of_occurrence') or d.get('occurrence_time') or d.get('gd_time'),
            d.get('occurrence_end_date'), d.get('occurrence_end_time'),
        ),
        'stolen_items': d.get('property_description') or d.get('stolen_items') or 'None',
        'place_of_occurrence_1': d.get('occurrence_place') or '',
        'io_name': d.get('io_name') or '',
        'io_mobile_no': d.get('io_mobile') or d.get('io_mobile_no') or '',
        'beat_no': d.get('beat_no') or '',
    }
