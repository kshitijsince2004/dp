from datetime import date as _date, datetime as _datetime


def fmt_date(d_str):
    """Return DD/MM/YYYY from an ISO date string, date, or datetime."""
    if not d_str:
        return ''
    if isinstance(d_str, (_date, _datetime)):
        return d_str.strftime('%d/%m/%Y')
    s = str(d_str).split('T')[0]
    parts = s.split('-')
    if len(parts) == 3:
        return f'{parts[2]}/{parts[1]}/{parts[0]}'
    return str(d_str)


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
    Combine occurrence date + time into a single string.
    If to_date/to_time present, renders as a range: 'DD/MM/YYYY HH:MM to DD/MM/YYYY HH:MM'.
    """
    from_part = ''
    if date_val:
        from_part = fmt_date(date_val)
        if time_val:
            from_part += f' {time_val}'
    elif time_val:
        from_part = str(time_val)

    if not from_part:
        return ''

    to_part = ''
    if to_date:
        to_part = fmt_date(to_date)
        if to_time:
            to_part += f' {to_time}'
    elif to_time:
        to_part = str(to_time)

    return f'{from_part} to {to_part}' if to_part else from_part


def format_io(io_name, io_rank=None, io_pis=None):
    """Format IO details as 'Rank Name (PIS XXXXX)'."""
    if not io_name:
        return ''
    parts = []
    if io_rank:
        parts.append(str(io_rank))
    parts.append(str(io_name))
    if io_pis:
        parts.append(f'(PIS {io_pis})')
    return ' '.join(parts)


def format_person(name, age, father_husband_name, address, record_data=None):
    """
    Build "Name @ Nickname S/O Father R/O Address Age- N yrs" string.

    Field-name resolution order:
      parent  : explicit arg → *_father_husband_name → *_relative_name → parents_name
      gender  : prefix fields → top-level gender/sex fields → age_gender split
      relation: prefix fields → top-level relation_type fields
      nickname: prefix fields → top-level nickname fields
    """
    d = record_data or {}
    gender = None
    relation_type = None
    nickname = None

    if d:
        # Try to find which prefix owns father_husband_name
        prefix = ''
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

        # Fallback: parse gender from combined 'age_gender' field e.g. "30 / Male"
        if not gender:
            _, gender = parse_age_gender(d.get('age_gender'))

        if not relation_type:
            relation_type = (d.get('relation_type') or d.get('relationship')
                             or d.get('arrested_relation_type') or d.get('complainant_relation_type')
                             or d.get('accused_relation_type') or d.get('deceased_relation_type'))
        if not nickname:
            nickname = (d.get('nickname') or d.get('nick_name') or d.get('arrested_nickname')
                        or d.get('complainant_nickname') or d.get('accused_nickname'))

    # Also parse age from combined field when not passed explicitly
    if not age and d:
        parsed_age, _ = parse_age_gender(d.get('age_gender'))
        age = parsed_age

    parts = []

    name_str = name or ''
    if nickname and name_str and nickname not in name_str:
        name_str += f' @ {nickname}'
    if name_str:
        parts.append(name_str)

    rel_prefix = 'S/O'
    if relation_type:
        rel_lower = str(relation_type).lower()
        if rel_lower == 'husband':
            rel_prefix = 'W/O'
        elif rel_lower in ('father', 'mother'):
            rel_prefix = 'D/O' if gender and str(gender).lower() == 'female' else 'S/O'
        else:
            rel_prefix = 'C/O'
    else:
        if gender and str(gender).lower() == 'female':
            rel_prefix = 'D/O'

    if father_husband_name:
        parts.append(f'{rel_prefix} {father_husband_name}')
    if address:
        parts.append(f'R/O {address}')
    if age:
        parts.append(f'Age- {age} yrs')

    return ' '.join(parts)


def format_person_no_age(name, father_husband_name, address, record_data=None):
    return format_person(name, None, father_husband_name, address, record_data)


def _arrested_parent(d):
    """Resolve the arrested person's parent/guardian name across all known field names."""
    return (d.get('arrested_father_husband_name') or d.get('father_husband_name')
            or d.get('parents_name') or d.get('parent_name') or d.get('guardian_name'))


def _complainant_parent(d):
    """Resolve the complainant's parent/guardian name across all known field names."""
    return (d.get('complainant_father_husband_name') or d.get('complainant_parent_name')
            or d.get('complainant_relative_name'))
