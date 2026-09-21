import re
from datetime import date as _date, datetime as _datetime

_DMY_RE = re.compile(r'^\d{2}/\d{2}/\d{4}$')
_ISO_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})')


def fmt_date(d_str):
    """Return DD/MM/YYYY from an ISO date string, dd/mm/yyyy string, date, or datetime."""
    if not d_str:
        return ''
    if isinstance(d_str, (_date, _datetime)):
        return d_str.strftime('%d/%m/%Y')
    s = str(d_str).split('T')[0]
    if _DMY_RE.match(s):
        return s
    m = _ISO_RE.match(s)
    if m:
        y, mo, d = m.groups()
        return f'{d}/{mo}/{y}'
    return str(d_str)


_DMY_PARSE_RE = re.compile(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$')


def parse_date(val):
    """Parse a dd/mm/yyyy or yyyy-mm-dd string (or date/datetime) into a date object, or None."""
    if not val:
        return None
    if isinstance(val, _datetime):
        return val.date()
    if isinstance(val, _date):
        return val
    s = str(val).strip()
    m = _DMY_PARSE_RE.match(s)
    if m:
        d, mo, y = m.groups()
        if len(y) == 2:
            y = f'20{y}'
        try:
            return _date(int(y), int(mo), int(d))
        except ValueError:
            return None
    m = _ISO_RE.match(s)
    if m:
        y, mo, d = m.groups()
        try:
            return _date(int(y), int(mo), int(d))
        except ValueError:
            return None
    return None


def parse_age_gender(age_gender_str):
    """Parse combined '30 / Male' field into (age, gender). Returns (None, None) if blank."""
    if not age_gender_str:
        return None, None
    parts = str(age_gender_str).split('/')
    age = parts[0].strip() if parts else None
    gender = parts[1].strip() if len(parts) > 1 else None
    return age or None, gender or None


def format_occurrence(date_val, time_val, to_date=None, to_time=None):
    """
    Combine occurrence date + time into a single string per convention 2b:
    Format: DD/MM/YYYY; HH:MM (semicolon before the time).
    """
    from_part = ''
    if date_val:
        from_part = fmt_date(date_val)
        if time_val:
            from_part += f'; {time_val}'
    elif time_val:
        from_part = str(time_val)

    if not from_part:
        return ''

    to_part = ''
    if to_date:
        to_part = fmt_date(to_date)
        if to_time:
            to_part += f'; {to_time}'
    elif to_time:
        to_part = str(to_time)

    return f'{from_part} to {to_part}' if to_part else from_part


def format_io(io_name, io_rank=None, io_pis=None):
    """
    Format IO / Officer Detail per convention 2k:
    'Rank, Name, PIS No.' comma-joined.
    """
    if not io_name and not io_rank and not io_pis:
        return ''
    parts = []
    if io_rank and str(io_rank).strip():
        parts.append(str(io_rank).strip())
    if io_name and str(io_name).strip():
        parts.append(str(io_name).strip())
    if io_pis and str(io_pis).strip():
        pis_str = str(io_pis).strip()
        parts.append(pis_str)
    return ', '.join(parts)


def format_compiled_address(d_or_addr):
    """
    Full compiled address per convention 2c:
    House No., Street, Colony, Village/City, Tehsil, Landmark, District, State, Pin Code.
    """
    if not d_or_addr:
        return ''
    if isinstance(d_or_addr, str):
        return d_or_addr.strip()

    parts = []
    keys = [
        'house_no', 'present_house_no', 'street', 'present_street', 'colony', 'present_colony',
        'village_city', 'present_village_city', 'tehsil', 'landmark', 'district', 'present_district',
        'state', 'present_state', 'pin_code', 'present_pin_code'
    ]
    for k in keys:
        v = d_or_addr.get(k)
        if v and str(v).strip() and str(v).strip() not in parts:
            parts.append(str(v).strip())

    if not parts and d_or_addr.get('full_address'):
        return str(d_or_addr.get('full_address')).strip()

    return ', '.join(parts)


def format_missing_present_address(d):
    """
    Missing-Person Address override per convention 2d:
    Present House No., Present Street, Present Colony, Present Village/City/Town, Present State, Present District, Present Pin Code
    Explicitly excludes Landmark, Tehsil, Country, and does NOT fall back to permanent address.
    """
    if not d:
        return ''
    parts = []
    keys = [
        'present_house_no', 'present_street', 'present_colony', 'present_village_city',
        'present_state', 'present_district', 'present_pin_code'
    ]
    for k in keys:
        v = d.get(k)
        if v and str(v).strip() and str(v).strip() not in parts:
            parts.append(str(v).strip())

    if not parts and d.get('present_address'):
        return str(d.get('present_address')).strip()

    return ', '.join(parts)


def format_person(name, age, father_husband_name, address, record_data=None, include_age_inline=False):
    """
    Format Person detail string per convention 2a:
    `{Name} "@" {Alias}, S/O {Parent} R/O {Address}`
    If no alias, omit `@ alias` segment entirely.
    For Arrestee (`include_age_inline=True`):
    `{Name} "@" {Alias}, {Age}, S/O {Parent} R/O {Address}`
    """
    d = record_data or {}
    gender = None
    relation_type = None
    nickname = None

    if d:
        prefix = ''
        if father_husband_name:
            for k, v in d.items():
                if k.endswith('_relative_name') and v == father_husband_name:
                    prefix = k[:-len('_relative_name')]
                    break
                if k.endswith('_father_husband_name') and v == father_husband_name:
                    prefix = k[:-len('_father_husband_name')]
                    break

        if prefix:
            gender = d.get(f'{prefix}_gender')
            relation_type = d.get(f'{prefix}_relation_type') or d.get(f'{prefix}_relationship')
            nickname = d.get(f'{prefix}_nickname') or d.get(f'{prefix}_nick_name')

        if not gender:
            gender = (d.get('gender') or d.get('sex') or d.get('arrested_gender')
                      or d.get('complainant_gender') or d.get('accused_gender') or d.get('deceased_gender'))

        if not gender:
            _, gender = parse_age_gender(d.get('age_gender'))

        if not relation_type:
            relation_type = (d.get('relation_type') or d.get('relationship')
                             or d.get('arrested_relation_type') or d.get('complainant_relation_type')
                             or d.get('accused_relation_type') or d.get('deceased_relation_type'))
        if not nickname:
            nickname = (d.get('nickname') or d.get('nick_name') or d.get('arrested_nickname')
                        or d.get('complainant_nickname') or d.get('accused_nickname') or d.get('alias'))

    if not age and d:
        parsed_age, _ = parse_age_gender(d.get('age_gender'))
        age = parsed_age or d.get('age')

    name_str = (name or '').strip()
    if nickname and str(nickname).strip() and str(nickname).strip() not in name_str:
        name_str += f' @{str(nickname).strip()}'

    head_parts = []
    if name_str:
        head_parts.append(name_str)

    if include_age_inline and age:
        age_str = str(age).strip()
        head_parts.append(age_str)

    head_segment = ', '.join(head_parts)

    rel_prefix = 'S/O'
    if relation_type:
        rel_lower = str(relation_type).lower()
        if rel_lower in ('husband', 'w/o', 'wife'):
            rel_prefix = 'W/O'
        elif rel_lower in ('father', 'mother', 'd/o', 'daughter'):
            rel_prefix = 'D/O' if gender and str(gender).lower() == 'female' else 'S/O'
        elif rel_lower in ('c/o', 'guardian'):
            rel_prefix = 'C/O'
    else:
        if gender and str(gender).lower() == 'female':
            rel_prefix = 'D/O'

    rel_segment = ''
    if father_husband_name and str(father_husband_name).strip():
        rel_segment = f"{rel_prefix} {str(father_husband_name).strip()}"

    addr_segment = ''
    if address and str(address).strip():
        addr_segment = f"R/O {str(address).strip()}"

    body_segment = ' '.join(filter(None, [rel_segment, addr_segment]))

    if head_segment and body_segment:
        return f"{head_segment}, {body_segment}"
    elif head_segment:
        return head_segment
    elif body_segment:
        return body_segment
    return ''


def format_person_no_age(name, father_husband_name, address, record_data=None):
    return format_person(name, None, father_husband_name, address, record_data, include_age_inline=False)


def format_arrestee_person(name, age, father_husband_name, address, record_data=None):
    """Format Arrestee specifically with inline age per 2a: Manoj @Mannu, 35, S/O Shakuntla Devi R/O 236, Jahangirpuri..."""
    return format_person(name, age, father_husband_name, address, record_data, include_age_inline=True)


def format_custody_status(val):
    """
    Format Custody Status per convention 2e (8 distinct values):
    judicial custody / police custody / bail / bound down / release / lockup / 35(3) / apprehension
    """
    if not val:
        return ''
    s = str(val).strip().lower()
    mapping = {
        'jc': 'judicial custody',
        'judicial custody': 'judicial custody',
        'judicial_custody': 'judicial custody',
        'pc': 'police custody',
        'police custody': 'police custody',
        'police_custody': 'police custody',
        'bail': 'bail',
        'bound down': 'bound down',
        'bound_down': 'bound down',
        'release': 'release',
        'released': 'release',
        'lockup': 'lockup',
        '35(3)': '35(3)',
        '35_3': '35(3)',
        'sec_35_3': '35(3)',
        'apprehension': 'apprehension',
        'apprehended': 'apprehension',
    }
    return mapping.get(s, str(val).strip())


def format_accused_history(d_or_pi, po=None, bc=None):
    """
    Format Accused History per convention 2f:
    If previous involvement flagged yes mention PI,
    If proclaimed offender flagged yes mention PO,
    If Listed criminal/bad character flagged yes mention BC.
    Joined order: PI/PO/BC separated by '/'
    """
    pi_flag = False
    po_flag = False
    bc_flag = False

    if isinstance(d_or_pi, dict):
        d = d_or_pi
        pi_flag = bool(d.get('prev_involvement') or d.get('prev_involvement_no_of_cases') or d.get('previous_involvement') or d.get('pi_flag'))
        po_flag = bool(d.get('proclaimed_offender') or d.get('po_flag') or d.get('is_po'))
        bc_flag = bool(d.get('bad_character') or d.get('whether_accused_is_bc_or_not') or d.get('bc_flag') or d.get('is_bc'))
    else:
        pi_flag = bool(d_or_pi)
        po_flag = bool(po)
        bc_flag = bool(bc)

    parts = []
    if pi_flag:
        parts.append('PI')
    if po_flag:
        parts.append('PO')
    if bc_flag:
        parts.append('BC')

    return '/'.join(parts)


def format_recovery(props):
    """
    Format Recovery per convention 2g:
    'Property category, property type, property description, property value' — comma-joined per item.
    """
    if not props:
        return ''
    if isinstance(props, str):
        return props.strip()
    if isinstance(props, dict):
        props = [props]

    items = []
    for p in props:
        if isinstance(p, dict):
            cat = p.get('category') or p.get('property_category') or ''
            ptype = p.get('type') or p.get('property_type') or ''
            desc = p.get('description') or p.get('property_description') or ''
            val = p.get('value') or p.get('property_value') or ''
            parts = [str(x).strip() for x in [cat, ptype, desc, val] if str(x).strip()]
            if parts:
                items.append(', '.join(parts))
        elif isinstance(p, str) and p.strip():
            items.append(p.strip())

    if len(items) > 1:
        return '\n'.join(f"{idx+1}) {item}" for idx, item in enumerate(items))
    return items[0] if items else ''


def format_body_description(d):
    """
    Format Body Description per convention 2h:
    Combining all physical description fields data separated by comma.
    """
    if not d:
        return ''
    if isinstance(d, str):
        return d.strip()

    keys = ['height', 'built', 'complexion', 'face', 'hair', 'moustache', 'mustaches', 'beard',
            'upper_dress', 'upper_dress_color', 'lower_dress', 'lower_dress_color', 'identification_marks']
    parts = []
    for k in keys:
        v = d.get(k)
        if v and str(v).strip() and str(v).strip() not in parts:
            parts.append(str(v).strip())
    return ', '.join(parts)


def format_vehicle_details(props_or_dict):
    """
    Format Vehicle Details per convention 2i (MVT sheet):
    From property records where category = Automobiles and others:
    'Type of property/Vehicle, Vehicle registration No.'
    """
    if not props_or_dict:
        return ''
    if isinstance(props_or_dict, str):
        return props_or_dict.strip()

    if isinstance(props_or_dict, dict):
        vtype = props_or_dict.get('vehicle_type') or props_or_dict.get('type') or props_or_dict.get('property_type') or ''
        vreg = props_or_dict.get('vehicle_reg_no') or props_or_dict.get('registration_no') or props_or_dict.get('reg_no') or ''
        parts = [str(x).strip() for x in [vtype, vreg] if str(x).strip()]
        return ', '.join(parts)

    items = []
    if isinstance(props_or_dict, list):
        for p in props_or_dict:
            if isinstance(p, dict):
                vtype = p.get('vehicle_type') or p.get('type') or p.get('property_type') or ''
                vreg = p.get('vehicle_reg_no') or p.get('registration_no') or p.get('reg_no') or ''
                parts = [str(x).strip() for x in [vtype, vreg] if str(x).strip()]
                if parts:
                    items.append(', '.join(parts))
    if len(items) > 1:
        return '\n'.join(f"{idx+1}) {item}" for idx, item in enumerate(items))
    return items[0] if items else ''


def format_multi_items(items):
    """
    Format multi-value items or arrestees in single cell per Part 3 Strategy:
    1) String 1
    2) String 2
    """
    if not items:
        return ''
    if isinstance(items, str):
        return items.strip()
    valid_items = [str(it).strip() for it in items if str(it).strip()]
    if not valid_items:
        return ''
    if len(valid_items) == 1:
        return valid_items[0]
    return '\n'.join(f"{idx+1}) {it}" for idx, it in enumerate(valid_items))


def _arrested_parent(d):
    """Resolve the arrested person's parent/guardian name across all known field names."""
    return (d.get('arrested_father_husband_name') or d.get('father_husband_name')
            or d.get('parents_name') or d.get('parent_name') or d.get('guardian_name'))


def _complainant_parent(d):
    """Resolve the complainant's parent/guardian name across all known field names."""
    return (d.get('complainant_father_husband_name') or d.get('complainant_parent_name')
            or d.get('complainant_relative_name'))
