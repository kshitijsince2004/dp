from classifiers import is_mvt
from formatters import format_person_no_age, fmt_date, _complainant_parent

NUM = 5
TABLE_NAME = 'excel_5mvt_cases'
LABEL = 'MVT Cases'
COLUMNS = ['sr', 'ps', 'fir_no', 'us', 'date_of_occurrence', 'time_of_occurrence', 'place_of_occurrence', 'complainant_details', 'vehicle_no', 'vehicle_type', 'io_name', 'io_mobile_no', 'beat_no', '1st_cd_uploaded_in_24_hrs_yesno', 'whether_footage_is_collected_or_not']
COLUMN_LABELS = {
    '1st_cd_uploaded_in_24_hrs_yesno': '1st CD Uploaded in 24 Hrs?',
    'whether_footage_is_collected_or_not': 'Footage Collected?',
    'vehicle_no': 'Vehicle No.',
    'vehicle_type': 'Vehicle Type',
}


def filter_records(classified):
    return [r for r in classified['cases'] if is_mvt(r['data'])]


def map_row(r, idx):
    d = r['data']
    return {
        'sr': idx + 1,
        'ps': r.get('ps_name') or '',
        'fir_no': d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'date_of_occurrence': fmt_date(d.get('occurrence_date') or r.get('record_date')),
        'time_of_occurrence': d.get('time_of_occurrence') or d.get('occurrence_time') or d.get('gd_time') or '',
        'place_of_occurrence': d.get('occurrence_place') or '',
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            d.get('complainant_address'),
            d,
        ),
        'vehicle_no': d.get('vehicle_no') or '',
        'vehicle_type': d.get('vehicle_type') or '',
        'io_name': d.get('io_name') or '',
        'io_mobile_no': d.get('io_mobile') or d.get('io_mobile_no') or '',
        'beat_no': d.get('beat_no') or '',
        '1st_cd_uploaded_in_24_hrs_yesno': d.get('cd_uploaded_24h') or 'Yes',
        'whether_footage_is_collected_or_not': d.get('footage_collected') or 'Yes',
    }
