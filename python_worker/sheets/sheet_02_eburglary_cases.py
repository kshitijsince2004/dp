from classifiers import is_burglary
from formatters import (
    format_person_no_age,
    format_occurrence,
    format_compiled_address,
    format_recovery,
    format_io,
    _complainant_parent,
)

NUM = 2
TABLE_NAME = 'excel_2eburglary_cases'
LABEL = 'E-Burglary Cases'
COLUMNS = ['sr_no', 'ps', 'efir_no', 'us', 'complainant_details', 'time_of_occurrence', 'stolen_items', 'place_of_occurrence', 'io_name', 'beat_no']
COLUMN_LABELS = {
    'sr_no': 'Sr. No.',
    'ps': 'Police Station',
    'efir_no': 'E-FIR No.',
    'us': 'U/S (Act + Section)',
    'complainant_details': 'Complainant (Name / S/O / R/O Address)',
    'time_of_occurrence': 'Date & Time of Occurrence (DD/MM/YYYY HH:MM)',
    'stolen_items': 'Stolen Property (Details of the stolen property in the case)',
    'place_of_occurrence': 'Place of Occurrence (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)',
    'io_name': 'Name of IO (Rank / Name / PIS No.)',
    'beat_no': 'Beat No.',
}


def filter_records(classified):
    return [r for r in classified['cases'] if is_burglary(r['data'])]


def map_row(r, idx):
    d = r['data']
    stolen = format_recovery(d.get('stolen_properties') or d.get('stolen_items') or d.get('property_description'))
    return {
        'sr_no': idx + 1,
        'ps': r.get('ps_name') or '',
        'efir_no': d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            format_compiled_address(d.get('complainant_address') or d),
            d,
        ),
        'time_of_occurrence': format_occurrence(
            r.get('record_date') or d.get('gd_date') or d.get('occurrence_date'),
            d.get('gd_time') or d.get('time_of_occurrence') or d.get('occurrence_time'),
            d.get('occurrence_end_date'),
            d.get('occurrence_end_time'),
        ),
        'stolen_items': stolen or '',
        'place_of_occurrence': format_compiled_address(d.get('occurrence_place') or d),
        'io_name': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
        'beat_no': d.get('beat_no') or '',
    }
