from formatters import format_person, _arrested_parent

NUM = 9
TABLE_NAME = 'excel_9arrested_efir_theft'
LABEL = 'Arrested - E-FIR Theft'
COLUMNS = ['sn', 'fir_no', 'us', 'accused_details', 'name_of_io', 'pcjcbail', 'prev_involvement_no_of_cases_head', 'recovery', 'whether_accused_is_bc_or_not', 'group_rolling', 'cycle_patrolling', 'by_antisnatching_team', 'by_prahari', 'by_eyes_ears_scheme_members']
COLUMN_LABELS = {
    'prev_involvement_no_of_cases_head': 'Prev. Involvement (No. of Cases) Head',
    'group_rolling': 'Group Rolling',
}


def filter_records(classified):
    return [
        r for r in classified['arrests']
        if '379' in (r['data'].get('sections') or '').lower()
        or 'theft' in (r['data'].get('crime_head') or '').lower()
    ]


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
        'name_of_io': d.get('io_name') or '',
        'pcjcbail': d.get('status') or '',
        'prev_involvement_no_of_cases_head': d.get('prev_involvement_head') or '0',
        'recovery': d.get('recovery') or 'No',
        'whether_accused_is_bc_or_not': d.get('bad_character') or 'No',
        'group_rolling': d.get('group_rolling') or 'No',
        'cycle_patrolling': d.get('cycle_patrolling') or 'No',
        'by_antisnatching_team': d.get('by_antisnatching_team') or 'No',
        'by_prahari': d.get('by_prahari') or 'No',
        'by_eyes_ears_scheme_members': d.get('by_eyes_ears_scheme_members') or 'No',
    }
