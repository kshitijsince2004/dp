from classifiers import is_electronic_case
from formatters import format_person, format_person_no_age, format_occurrence, format_io, _complainant_parent, _arrested_parent

NUM = 1
TABLE_NAME = 'excel_1manual_fir'
LABEL = 'Manual FIR'
COLUMNS = ['ps', 'fir_no', 'us', 'complainant_details', 'time_of_occurrence', 'place_of_occurrence', 'gist', 'arrested_details', 'io_details']
COLUMN_LABELS = {
    'io_details': 'IO (Name / Rank)',
}


def filter_records(classified):
    return [r for r in classified['cases'] if not is_electronic_case(r['data'])]


def map_row(r, idx):
    d = r['data']

    # Occurrence: combine date + time; support from-to range if end fields are present
    occ_datetime = format_occurrence(
        d.get('occurrence_date') or d.get('fir_date'),
        d.get('time_of_occurrence') or d.get('occurrence_time') or d.get('gd_time'),
        d.get('occurrence_end_date'),
        d.get('occurrence_end_time'),
    )

    return {
        'ps': r.get('ps_name') or '',
        'fir_no': d.get('fir_no') or '',
        'us': d.get('sections') or d.get('under_section') or '',
        'complainant_details': format_person_no_age(
            d.get('complainant_name'),
            _complainant_parent(d),
            d.get('complainant_address'),
            d,
        ),
        'time_of_occurrence': occ_datetime,
        'place_of_occurrence': d.get('occurrence_place') or '',
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
        ),
    }
