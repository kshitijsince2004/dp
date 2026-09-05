from classifiers import is_electronic_case
from formatters import format_person, format_person_no_age, format_occurrence, format_io, _complainant_parent, _arrested_parent

NUM = 1
TABLE_NAME = 'excel_1manual_fir'
LABEL = 'Manual FIR'

MANUAL_FIR_COLUMNS = [
    ('ps',                  'Police Station'),
    ('fir_no',              'FIR No.'),
    ('us',                  'U/S (Act + Section)'),
    ('complainant_details', 'Complainant (Name / S/O / R/O Address)'),
    ('time_of_occurrence',  'Date & Time of Occurrence (DD/MM/YYYY HH:MM)'),
    ('place_of_occurrence', 'Place of Occurrence (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)'),
    ('gist',                'Brief Facts / Gist of Case'),
    ('arrested_details',    'Arrested Person (Name / Age / S/O / R/O Address)'),
    ('io_details',          'Name of IO (Rank / Name / PIS No.)'),
]

COLUMNS = [key for key, _ in MANUAL_FIR_COLUMNS]

COLUMN_LABELS = {key: label for key, label in MANUAL_FIR_COLUMNS}


def filter_records(classified):
    return [r for r in classified['cases'] if not is_electronic_case(r['data'])]


def map_row(r, idx):
    d = r['data']

    # Occurrence: combine date + time; support from-to range if end fields are present.
    occ_datetime = format_occurrence(
        r.get('record_date') or d.get('gd_date') or d.get('fir_date') or d.get('occurrence_date'),
        d.get('gd_time') or d.get('time_of_occurrence') or d.get('occurrence_time'),
        d.get('occurrence_end_date'),
        d.get('occurrence_end_time'),
    )

    act = d.get('act_name') or ''
    sec = d.get('sections') or d.get('under_section') or ''
    us_str = f"{act} u/s {sec}".strip() if act and sec else (sec or act or '')

    return {
        'ps': r.get('ps_name') or '',
        'fir_no': d.get('fir_no') or '',
        'us': us_str,
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            d.get('complainant_address'),
            d,
        ),
        'time_of_occurrence': occ_datetime,
        'place_of_occurrence': d.get('occurrence_place') or d.get('place_of_occurrence') or '',
        'gist': d.get('brief_facts') or '',
        'arrested_details': format_person(
            d.get('arrested_person') or d.get('accused_name'),
            d.get('accused_age'),
            _arrested_parent(d),
            d.get('accused_address'),
            d,
        ) or d.get('arrested_person') or d.get('accused_name') or 'None',
        'io_details': format_io(
            d.get('io_name'),
            d.get('io_rank') or d.get('rank_of_io'),
            d.get('io_pis'),
        ) or d.get('io_name') or '',
    }
