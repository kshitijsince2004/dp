from classifiers import is_mvt
from formatters import (
    format_person_no_age,
    format_occurrence,
    format_compiled_address,
    format_vehicle_details,
    format_io,
    _complainant_parent,
)

NUM = 5
TABLE_NAME = 'excel_5mvt_cases'
LABEL = 'MVT Cases'
COLUMNS = ['sr', 'ps', 'fir_no', 'us', 'time_of_occurrence', 'place_of_occurrence', 'complainant_details', 'vehicle_details', 'io_name', 'beat_no', '1st_cd_uploaded_in_24_hrs_yesno', 'whether_footage_is_collected_or_not']
COLUMN_LABELS = {
    'sr': 'Sr.',
    'ps': 'Police Station',
    'fir_no': 'FIR No.',
    'us': 'U/S (Act + Section)',
    'time_of_occurrence': 'Date & Time of Occurrence (DD/MM/YYYY HH:MM)',
    'place_of_occurrence': 'Place of Occurrence (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)',
    'complainant_details': 'Complainant (Name / S/O / R/O Address)',
    'vehicle_details': 'Vehicle Details (Type / No.)',
    'io_name': 'Name of IO (Rank / Name / PIS No.)',
    'beat_no': 'Beat No.',
    '1st_cd_uploaded_in_24_hrs_yesno': '1st CD Uploaded in 24 Hrs?',
    'whether_footage_is_collected_or_not': 'Footage Collected?',
}


def filter_records(classified):
    return [r for r in classified['cases'] if is_mvt(r['data'])]


def map_row(r, idx):
    d = r['data']
    v_details = format_vehicle_details(d.get('vehicles') or d.get('vehicle_details') or d)
    return {
        'sr': idx + 1,
        'ps': r.get('ps_name') or '',
        'fir_no': d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'time_of_occurrence': format_occurrence(
            r.get('record_date') or d.get('gd_date') or d.get('occurrence_date'),
            d.get('gd_time') or d.get('time_of_occurrence') or d.get('occurrence_time'),
            d.get('occurrence_end_date'),
            d.get('occurrence_end_time'),
        ),
        'place_of_occurrence': format_compiled_address(d.get('occurrence_place') or d),
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            format_compiled_address(d.get('complainant_address') or d),
            d,
        ),
        'vehicle_details': v_details or '',
        'io_name': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
        'beat_no': d.get('beat_no') or '',
        '1st_cd_uploaded_in_24_hrs_yesno': 'Y' if str(d.get('cd_uploaded_24h')).lower() in ('yes', 'y', 'true', '1') else ('N' if d.get('cd_uploaded_24h') is not None and str(d.get('cd_uploaded_24h')).strip() != '' else ''),
        'whether_footage_is_collected_or_not': 'Y' if str(d.get('footage_collected')).lower() in ('yes', 'y', 'true', '1') else ('N' if d.get('footage_collected') is not None and str(d.get('footage_collected')).strip() != '' else ''),
    }
