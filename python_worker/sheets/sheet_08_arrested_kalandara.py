from classifiers import is_preventive_arrest
from formatters import format_person, _arrested_parent

NUM = 8
TABLE_NAME = 'excel_8arrested_kalandara'
LABEL = 'Arrested - Kalandara / Preventive'
COLUMNS = ['sn', 'fir_no', 'us', 'accused_details', 'place_of_occurrence', 'io', 'pcjcbail', 'prev_involvement', 'recovery', 'whether_accused_is_bc_or_not', 'integrated_pick', 'group_patrolling', 'cycle_patrolling', 'by_antisnatching_team', 'by_prahari', 'by_eyes_ears_scheme_members']
COLUMN_LABELS = {
    'prev_involvement': 'Prev. Involvement',
    'integrated_pick': 'Integrated Pick',
}


def filter_records(classified):
    return [r for r in classified['arrests'] if is_preventive_arrest(r['data'])]


def map_row(r, idx):
    d = r['data']
    return {
        'sn': idx + 1,
        'fir_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'accused_details': format_person(
            d.get('arrested_name'), d.get('age'),
            _arrested_parent(d),
            d.get('arrested_address'), d,
        ),
        'place_of_occurrence': d.get('arrest_place') or '',
        'io': d.get('io_name') or '',
        'pcjcbail': d.get('status') or '',
        'prev_involvement': d.get('prev_involvement') or '0',
        'recovery': d.get('recovery') or 'No',
        'whether_accused_is_bc_or_not': d.get('bad_character') or 'No',
        'integrated_pick': d.get('integrated_pick') or 'No',
        'group_patrolling': d.get('group_patrolling') or 'No',
        'cycle_patrolling': d.get('cycle_patrolling') or 'No',
        'by_antisnatching_team': d.get('by_antisnatching_team') or 'No',
        'by_prahari': d.get('by_prahari') or 'No',
        'by_eyes_ears_scheme_members': d.get('by_eyes_ears_scheme_members') or 'No',
    }
