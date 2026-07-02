from formatters import format_person_no_age, _arrested_parent

NUM = 11
TABLE_NAME = 'excel_11proclaimed_offenders'
LABEL = 'Proclaimed Offenders'
COLUMNS = ['sn', 'ps', 'dd_nofir_no', 'us', 'po_details', 'case_in_which_declared_po', 'name_of_court_which_declared_po']
COLUMN_LABELS = {
    'case_in_which_declared_po': 'Case in Which Declared PO',
    'name_of_court_which_declared_po': 'Name of Court Which Declared PO',
}


def filter_records(classified):
    return [
        r for r in classified['arrests']
        if r['data'].get('crime_head') == 'PO' or r['data'].get('proclaimed_offender') is True
    ]


def map_row(r, idx):
    d = r['data']
    return {
        'sn': idx + 1,
        'ps': r.get('ps_name') or '',
        'dd_nofir_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'po_details': format_person_no_age(
            d.get('arrested_name'),
            _arrested_parent(d),
            d.get('arrested_address'), d,
        ),
        'case_in_which_declared_po': d.get('case_declared_po') or '',
        'name_of_court_which_declared_po': d.get('court_declared_po') or '',
    }
