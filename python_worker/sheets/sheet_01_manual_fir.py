from classifiers import is_electronic_case
from formatters import (
    format_person_no_age,
    format_arrestee_person,
    format_occurrence,
    format_compiled_address,
    format_io,
    format_multi_items,
    _complainant_parent,
    _arrested_parent,
)

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

    occ_datetime = format_occurrence(
        r.get('record_date') or d.get('gd_date') or d.get('fir_date') or d.get('occurrence_date'),
        d.get('gd_time') or d.get('time_of_occurrence') or d.get('occurrence_time'),
        d.get('occurrence_end_date'),
        d.get('occurrence_end_time'),
    )

    act = d.get('act_name') or ''
    sec = d.get('sections') or d.get('under_section') or ''
    us_str = f"{act} u/s {sec}".strip() if act and sec else (sec or act or '')

    # Arrested persons (support multiple arrestees formatted per Part 3 strategy)
    arrestees_raw = d.get('arrestees') or d.get('arrested_persons') or []
    if isinstance(arrestees_raw, list) and len(arrestees_raw) > 0:
        formatted_list = []
        for arr in arrestees_raw:
            if isinstance(arr, dict):
                formatted_list.append(format_arrestee_person(
                    arr.get('name') or arr.get('arrested_name'),
                    arr.get('age'),
                    _arrested_parent(arr),
                    format_compiled_address(arr.get('address') or arr),
                    arr
                ))
            elif isinstance(arr, str) and arr.strip():
                formatted_list.append(arr.strip())
        arrested_str = format_multi_items(formatted_list)
    else:
        single = format_arrestee_person(
            d.get('arrested_person') or d.get('accused_name'),
            d.get('accused_age') or d.get('age'),
            _arrested_parent(d),
            format_compiled_address(d.get('accused_address') or d),
            d,
        )
        arrested_str = single or d.get('arrested_person') or d.get('accused_name') or ''

    return {
        'ps': r.get('ps_name') or '',
        'fir_no': d.get('fir_no') or '',
        'us': us_str,
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            format_compiled_address(d.get('complainant_address') or d),
            d,
        ),
        'time_of_occurrence': occ_datetime,
        'place_of_occurrence': format_compiled_address(d.get('occurrence_place') or d),
        'gist': d.get('brief_facts') or d.get('gist') or '',
        'arrested_details': arrested_str,
        'io_details': format_io(
            d.get('io_name'),
            d.get('io_rank') or d.get('rank_of_io'),
            d.get('io_pis'),
        ),
    }
