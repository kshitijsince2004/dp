NUM = 22
TABLE_NAME = 'excel_22women_missing'
LABEL = 'Women Missing'
COLUMNS = ['pcr_call', 'dd_entry_complaint', 'total', 'traced', 'case_registered', 'pending']
COLUMN_LABELS = {
    'dd_entry_complaint': 'DD Entry / Complaint',
    'case_registered': 'Case Registered',
    'pending': 'Pending',
    'total': 'Total',
    'traced': 'Traced',
}

def summarize(classified):
    female = [r for r in classified['missing'] if (r['data'].get('gender') or '').upper() == 'FEMALE']
    traced = sum(1 for r in female if (r['data'].get('status') or '').upper() == 'TRACED')
    return [{
        'pcr_call':           sum(1 for r in female if (r['data'].get('source') or '').upper() == 'PCR'),
        'dd_entry_complaint': sum(1 for r in female if (r['data'].get('source') or '').upper() != 'PCR'),
        'total':              len(female),
        'traced':             traced,
        'case_registered':    sum(1 for r in female if r['data'].get('case_registered') is True),
        'pending':            sum(1 for r in female if (r['data'].get('status') or '').upper() in ('PENDING', 'MISSING', 'MPS')),
    }]
