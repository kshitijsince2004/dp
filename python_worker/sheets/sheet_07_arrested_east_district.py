from formatters import (
    format_arrestee_person,
    format_compiled_address,
    format_custody_status,
    format_recovery,
    format_io,
    _arrested_parent,
)

NUM = 7
TABLE_NAME = 'excel_7arrested_east_district'
LABEL = 'Arrested - District'
COLUMNS = [
    'sn', 'fir_no', 'us', 'accused_details', 'name_of_io', 'pcjcbail',
    'prev_involvement_no_of_cases', 'recovery', 'whether_accused_is_bc_or_not', 'arrest_scheme'
]
COLUMN_LABELS = {
    'sn': 'S.N.',
    'fir_no': 'FIR No.',
    'us': 'U/S(Act+section)',
    'accused_details': 'Accused (Name / Age / S/O / Address)',
    'name_of_io': 'Name of IO',
    'pcjcbail': 'custody status (unique for every person arrested in a case/record)',
    'prev_involvement_no_of_cases': 'Prev. Involvement (Y/N)',
    'recovery': 'Details of the propert Recovered from arrested person',
    'whether_accused_is_bc_or_not': 'Accused BC(Y/N)',
    'arrest_scheme': 'Arrest Scheme(Integrated PI, group patrolling, cycle patrolling, anti-snatching team, PRAHARI, Eyes&Ears Member)',
}


def filter_records(classified):
    return classified['arrests']


def map_row(r, idx):
    d = r['data']
    scheme = d.get('scheme_of_arrest') or d.get('arrest_scheme') or d.get('scheme_of_arrest_other') or ''

    pi_val = 'Y' if bool(d.get('prev_involvement') or d.get('prev_involvement_no_of_cases') or d.get('previous_involvement') or d.get('pi_flag')) else 'N'
    bc_val = 'Y' if bool(d.get('bad_character') or d.get('whether_accused_is_bc_or_not') or d.get('bc_flag') or d.get('is_bc')) else 'N'

    return {
        'sn': idx + 1,
        'fir_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'accused_details': format_arrestee_person(
            d.get('arrested_name'),
            d.get('age'),
            _arrested_parent(d),
            format_compiled_address(d.get('arrested_address') or d),
            d,
        ),
        'name_of_io': format_io(d.get('io_name') or d.get('arresting_officer_name'), d.get('io_rank'), d.get('io_pis')),
        'pcjcbail': format_custody_status(d.get('status') or d.get('custody_status')),
        'prev_involvement_no_of_cases': pi_val,
        'recovery': format_recovery(d.get('recovery') or d.get('recovered_property') or d.get('stolen_properties')) or '',
        'whether_accused_is_bc_or_not': bc_val,
        'arrest_scheme': scheme,
    }
