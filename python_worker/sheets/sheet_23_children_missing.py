NUM = 23
TABLE_NAME = 'excel_23children_missing'
LABEL = 'Children Missing'
COLUMNS = ['pcr_call_male', 'pcr_call_female', 'dd_entrycomplaint_male', 'dd_entrycomplaint_female', 'total_male', 'total_female', 'traced_male', 'traced_female', 'case_registered_male', 'case_registered_female']
COLUMN_LABELS = {
    'pcr_call_male': 'PCR Call (Male)',
    'pcr_call_female': 'PCR Call (Female)',
    'dd_entrycomplaint_male': 'DD Entry / Complaint (Male)',
    'dd_entrycomplaint_female': 'DD Entry / Complaint (Female)',
    'total_male': 'Total (Male)',
    'total_female': 'Total (Female)',
    'traced_male': 'Traced (Male)',
    'traced_female': 'Traced (Female)',
    'case_registered_male': 'Case Registered (Male)',
    'case_registered_female': 'Case Registered (Female)',
}

def summarize(classified):
    children = [r for r in classified['missing'] if _is_child(r['data'].get('age'))]
    m = [r for r in children if (r['data'].get('gender') or '').upper() == 'MALE']
    f = [r for r in children if (r['data'].get('gender') or '').upper() == 'FEMALE']
    return [{
        'pcr_call_male':            sum(1 for r in m if (r['data'].get('source') or '').upper() == 'PCR'),
        'pcr_call_female':          sum(1 for r in f if (r['data'].get('source') or '').upper() == 'PCR'),
        'dd_entrycomplaint_male':   sum(1 for r in m if (r['data'].get('source') or '').upper() != 'PCR'),
        'dd_entrycomplaint_female': sum(1 for r in f if (r['data'].get('source') or '').upper() != 'PCR'),
        'total_male':               len(m),
        'total_female':             len(f),
        'traced_male':              sum(1 for r in m if (r['data'].get('status') or '').upper() == 'TRACED'),
        'traced_female':            sum(1 for r in f if (r['data'].get('status') or '').upper() == 'TRACED'),
        'case_registered_male':     sum(1 for r in m if r['data'].get('case_registered') is True),
        'case_registered_female':   sum(1 for r in f if r['data'].get('case_registered') is True),
    }]


def _is_child(age_val):
    try:
        return int(str(age_val).strip()) < 18
    except (TypeError, ValueError):
        return False
