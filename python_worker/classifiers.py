def _head(d):
    return (d.get('local_head') or d.get('case_head') or d.get('crime_head') or '').lower()

def _sec(d):
    return (d.get('sections') or '').lower()

def _act(d):
    return (d.get('act_name') or '').lower()

def _code(d):
    return (d.get('canonical_code') or '').upper()


def is_burglary(d):
    return _code(d) == 'BURGLARY' or 'burglary' in _head(d)

def is_house_theft(d):
    return _code(d) == 'HOUSE_THEFT' or 'house theft' in _head(d)

def is_mvt(d):
    ss = (d.get('source_system') or '').upper()
    if ss == 'E_MVT':
        return True
    if _code(d) == 'MV_THEFT':
        return True
    h = _head(d)
    return 'mvt' in h or 'mvct' in h or 'vehicle' in h or 'm.v.' in h

def is_other_theft(d):
    code = _code(d)
    if code == 'OTHER_THEFT':
        return True
    h = _head(d)
    return 'theft' in h and not is_house_theft(d) and not is_mvt(d) and 'mobile' not in h

def is_electronic_case(d):
    ss = (d.get('source_system') or '').upper()
    if ss in ('E_THEFT', 'E_MVT'):
        return True
    if ss == 'MANUAL':
        return False
    return is_burglary(d) or is_house_theft(d) or is_other_theft(d) or is_mvt(d)

def is_inquest_case(d):
    return 'inquest' in _head(d)

def is_ndps_case(d):
    code = _code(d)
    if code == 'NDPS_ACT':
        return True
    return 'ndps' in _head(d) or 'ndps' in _act(d)

def is_mobile_recovery_case(d):
    h = _head(d)
    return 'mobile' in h or 'phone' in h or 'recovery' in h

def is_important_case(d):
    if d.get('important') is True or d.get('is_important') is True:
        return True
    code = _code(d)
    if code in ('MURDER', 'ROBBERY', 'DACOITY', 'RAPE', 'POCSO', 'KID_FOR_RANSOM'):
        return True
    h = _head(d)
    return any(k in h for k in ('murder', 'robbery', 'dacoity', 'rape', 'pocso', 'sensitive'))

def is_preventive_arrest(d):
    if (d.get('case_type') or '').upper() == 'KALANDAR':
        return True
    h = _head(d)
    s = _sec(d)
    if 'preventive' in h or 'preventive' in _act(d):
        return True
    return any(k in s for k in ('107', '109', '110', '151', '126', '128', '129', 'dp act'))

def is_financial_fraud_arrest(d):
    code = _code(d)
    if code in ('CHEATING', 'CRIMINAL_BREACH_OF_TRUST'):
        return True
    h = _head(d)
    if any(k in h for k in ('fraud', 'cyber', 'cheating')):
        return True
    return '420' in _sec(d)

def is_disposed(d):
    status = (d.get('status') or d.get('case_status') or '').lower()
    if status in ('chargesheeted', 'closed', 'charge sheet', 'charge_sheet'):
        return True
    disposal = (d.get('disposal_type') or '').upper()
    return disposal in ('CHARGE_SHEET', 'CHARGESHEETED', 'FINAL_REPORT')
