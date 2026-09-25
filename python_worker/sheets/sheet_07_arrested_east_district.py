from formatters import format_person, _arrested_parent

NUM = 7
TABLE_NAME = 'excel_7arrested_east_district'
LABEL = 'Arrested - District'
# 10 columns — matches the "Arrested - District" sheet in the reference template
# (Daily_Diary_16Jul2026_AllStations.xlsx, row 4). The previous 15-column list
# left five unlabeled columns spilling past the template header.
COLUMNS = ['sn', 'fir_no', 'us', 'accused_details', 'name_of_io', 'pcjcbail',
           'prev_involvement_no_of_cases', 'recovery', 'whether_accused_is_bc_or_not', 'arrest_scheme']
COLUMN_LABELS = {
    'sn': 'S.N.',
    'us': 'U/S (Act + Section)',
    'accused_details': 'Accused (Name / Age / S/O / R/O Address)',
    'name_of_io': 'Name of IO (Rank / Name / PIS No.)',
    'pcjcbail': 'Status of Arrested Person',
    'prev_involvement_no_of_cases': 'Prev. Involvement (Y/N)',
    'recovery': 'Recovery (Property Recovered from Accused)',
    'whether_accused_is_bc_or_not': 'Accused BC (Y/N)',
    'arrest_scheme': 'Arrest Scheme',
}

_SCHEME_FIELDS = [
    ('integrated_pi', 'Integrated PI'),
    ('group_patrolling', 'Group Patrolling'),
    ('cycle_patrolling', 'Cycle Patrolling'),
    ('by_antisnatching_team', 'Anti-Snatching Team'),
    ('by_prahari', 'Prahari'),
    ('by_eyes_ears_scheme_members', 'Eyes & Ears Member'),
]


def _yes(v):
    return str(v).strip().lower() in ('yes', 'y', 'true', '1')


def filter_records(classified):
    return classified['arrests']


def map_row(r, idx):
    d = r['data']
    schemes = [label for key, label in _SCHEME_FIELDS if _yes(d.get(key))]
    return {
        'sn': idx + 1,
        'fir_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'accused_details': format_person(
            d.get('arrested_name'), d.get('age'),
            _arrested_parent(d),
            d.get('arrested_address'), d,
        ),
        'name_of_io': d.get('io_name') or d.get('arresting_officer_name') or '',
        'pcjcbail': d.get('status') or '',
        'prev_involvement_no_of_cases': d.get('prev_involvement') or '0',
        'recovery': d.get('recovery') or 'No',
        'whether_accused_is_bc_or_not': d.get('bad_character') or 'No',
        'arrest_scheme': ', '.join(schemes) if schemes else '—',
    }
