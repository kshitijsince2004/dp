-- ============================================================================
-- PHAROS INTELLIGENCE SYSTEM — COMPLETE LIVE DATABASE SCHEMA DDL FOR DRAW.IO
-- Auto-generated from Live PostgreSQL Database Schema Inspection
-- Total Tables: 71 (Public + Ref Schemas)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ref;

-- Table: ref.act_classification
CREATE TABLE ref.act_classification (
  act_cd integer PRIMARY KEY REFERENCES ref.acts(act_cd) NOT NULL,
  class character varying(8) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.acts
CREATE TABLE ref.acts (
  act_cd integer PRIMARY KEY NOT NULL,
  act_long text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.agencies
CREATE TABLE ref.agencies (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code character varying(50) NOT NULL,
  name character varying(200) NOT NULL,
  category character varying(50) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.arms_categories
CREATE TABLE ref.arms_categories (
  arms_category_cd integer PRIMARY KEY NOT NULL,
  arms_category character varying(100) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.arms_made
CREATE TABLE ref.arms_made (
  arms_made_cd integer PRIMARY KEY NOT NULL,
  arms_made character varying(100) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.automobiles
CREATE TABLE ref.automobiles (
  automobile_cd integer PRIMARY KEY NOT NULL,
  automobile character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.beats
CREATE TABLE ref.beats (
  beat_cd character varying(20) PRIMARY KEY NOT NULL,
  beat_name text NOT NULL,
  source_ps_cd character varying(20) NOT NULL,
  ps_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.burglary_mo
CREATE TABLE ref.burglary_mo (
  mo_cd integer PRIMARY KEY NOT NULL DEFAULT nextval('ref.burglary_mo_mo_cd_seq'::regclass),
  mo_desc character varying(100) NOT NULL
);

-- Table: ref.cultural_properties
CREATE TABLE ref.cultural_properties (
  cultural_prop_cd integer PRIMARY KEY NOT NULL,
  cultural_prop character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.currency_types
CREATE TABLE ref.currency_types (
  currency_type_cd integer PRIMARY KEY NOT NULL,
  currency_type character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.document_types
CREATE TABLE ref.document_types (
  document_type_cd integer PRIMARY KEY NOT NULL,
  document_type character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.drug_types
CREATE TABLE ref.drug_types (
  drug_type_cd integer PRIMARY KEY NOT NULL,
  drug_type character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.electric_goods
CREATE TABLE ref.electric_goods (
  electric_goods_cd integer PRIMARY KEY NOT NULL,
  electric_goods character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.explosive_types
CREATE TABLE ref.explosive_types (
  explosive_type_cd integer PRIMARY KEY NOT NULL,
  explosive_type character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.fire_arms
CREATE TABLE ref.fire_arms (
  fire_arms_cd integer PRIMARY KEY NOT NULL,
  arms_category_cd integer REFERENCES ref.arms_categories(arms_category_cd) NOT NULL,
  fire_arms character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.fire_arms_subtypes
CREATE TABLE ref.fire_arms_subtypes (
  arms_subtype_cd integer PRIMARY KEY NOT NULL,
  arms_type_cd integer REFERENCES ref.fire_arms(fire_arms_cd) NOT NULL,
  arms_subtype character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.jewelry_types
CREATE TABLE ref.jewelry_types (
  jewelry_type_cd integer PRIMARY KEY NOT NULL,
  jewelry_type character varying(150) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.local_heads
CREATE TABLE ref.local_heads (
  local_head_cd integer PRIMARY KEY NOT NULL,
  local_head character varying(200) NOT NULL,
  crime_category character varying(15) NOT NULL DEFAULT 'OTHER'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  canonical_code character varying(100)
);

-- Table: ref.major_heads
CREATE TABLE ref.major_heads (
  major_head_code integer PRIMARY KEY NOT NULL,
  major_head character varying(200) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.major_minor_mapping
CREATE TABLE ref.major_minor_mapping (
  sec_mjrhd_cd integer PRIMARY KEY NOT NULL,
  act_cd integer REFERENCES ref.acts(act_cd) NOT NULL,
  section_code text REFERENCES ref.sections(section_code) NOT NULL,
  major_head_code integer REFERENCES ref.major_heads(major_head_code) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.minor_heads
CREATE TABLE ref.minor_heads (
  minor_head_cd integer PRIMARY KEY NOT NULL,
  major_head_code integer REFERENCES ref.major_heads(major_head_code) NOT NULL,
  minor_head character varying(200) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.other_property_items
CREATE TABLE ref.other_property_items (
  property_cd integer PRIMARY KEY NOT NULL,
  parent_cd integer REFERENCES ref.property_categories(parent_cd) NOT NULL,
  property_type_srno character varying(20),
  property character varying(200) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.property_categories
CREATE TABLE ref.property_categories (
  parent_cd integer PRIMARY KEY NOT NULL,
  parent_srno integer NOT NULL,
  code_type character varying(100),
  parent_type character varying(100),
  major_property integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.ps_manual_fir_codes
CREATE TABLE ref.ps_manual_fir_codes (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  hierarchy_node_id uuid NOT NULL,
  district_code character varying(3) NOT NULL,
  ps_code character varying(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.ps_unified_codes
CREATE TABLE ref.ps_unified_codes (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  hierarchy_node_id uuid NOT NULL,
  ps_code character varying(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.sections
CREATE TABLE ref.sections (
  section_code text PRIMARY KEY NOT NULL,
  section_cd character varying(50),
  act_sec_cd character varying(50) NOT NULL,
  section character varying(200),
  section_desc text,
  pnsh_gt_7yrs boolean,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ref.units
CREATE TABLE ref.units (
  unit_cd integer PRIMARY KEY NOT NULL DEFAULT nextval('ref.units_unit_cd_seq'::regclass),
  unit character varying(50) NOT NULL,
  to_kg_factor numeric NOT NULL DEFAULT 1.0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: arrest_details
CREATE TABLE arrest_details (
  record_id uuid PRIMARY KEY REFERENCES records(id) NOT NULL,
  gd_no character varying(50),
  gd_date date,
  gd_time time without time zone,
  case_type character varying(50),
  case_status character varying(50),
  fir_no character varying(50),
  fir_date date,
  is_dd_based boolean,
  local_head_id integer,
  beat_id character varying(20),
  intimation_datetime timestamp with time zone,
  intimated_relative_name character varying(100),
  intimated_relative_relation character varying(50),
  intimation_mode character varying(50),
  nafis_prepared boolean,
  dossier_prepared boolean,
  arresting_officer_name character varying(100),
  arresting_officer_mobile character varying(20),
  arresting_officer_rank character varying(50),
  custody_status character varying(50),
  other_status_reason character varying(255),
  recovery text,
  seizure_desc text,
  scheme_of_arrest character varying(100),
  integrated_pi boolean,
  group_patrolling boolean,
  cycle_patrolling boolean,
  by_antisnatching_team boolean,
  by_prahari boolean,
  by_eyes_ears_scheme_members boolean,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reason_for_detention text,
  scheme_of_arrest_other character varying(500)
);

-- Table: arrestee_details
CREATE TABLE arrestee_details (
  person_id uuid PRIMARY KEY REFERENCES persons(id) NOT NULL,
  arrest_date date,
  arrest_time time without time zone,
  arrest_location_id uuid REFERENCES locations(id),
  prev_involvement_count integer,
  prev_involvement text,
  is_po boolean,
  po_declared_court character varying(100),
  po_case_reference character varying(100),
  is_bc boolean,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: audit_logs
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  table_name character varying(60) NOT NULL,
  record_id uuid,
  action character varying(30) NOT NULL,
  changed_by_id uuid REFERENCES users(id),
  changed_by_role character varying(20),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  field_name character varying(60),
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address character varying(45)
);

-- Table: compilation_records
CREATE TABLE compilation_records (
  compilation_id uuid REFERENCES compilations(id) NOT NULL,
  record_id uuid REFERENCES records(id) NOT NULL,
  ps_id_at_compile uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  district_id_at_compile uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (record_id, compilation_id)
);

-- Table: compilations
CREATE TABLE compilations (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  source_level character varying(20) NOT NULL,
  target_level character varying(20) NOT NULL,
  route character varying(30) NOT NULL DEFAULT 'OPS_CHAIN'::character varying,
  period date NOT NULL,
  source_entity_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'DRAFT'::character varying,
  compiled_summary jsonb,
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: field_registry
CREATE TABLE field_registry (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  field_key character varying(60) NOT NULL,
  record_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_type character varying(20) NOT NULL,
  labels jsonb NOT NULL,
  section character varying(60),
  section_labels jsonb,
  storage jsonb NOT NULL,
  options jsonb,
  options_source character varying(60),
  depends_on character varying(60),
  show_when jsonb,
  validation_rules jsonb,
  visible_to_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  editable_by_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  introduced_at_level character varying(20) DEFAULT 'PS'::character varying,
  repeater_entity character varying(20),
  sort_order real,
  full_width boolean NOT NULL DEFAULT false,
  readonly boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  scope_level character varying(20) NOT NULL DEFAULT 'global'::character varying,
  scope_id uuid REFERENCES hierarchy_nodes(id),
  checksum character varying(64),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  disabled_when jsonb
);

-- Table: filter_presets
CREATE TABLE filter_presets (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  name character varying(150) NOT NULL,
  scope character varying(20) NOT NULL DEFAULT 'global'::character varying,
  scope_id uuid REFERENCES hierarchy_nodes(id),
  filter_spec jsonb NOT NULL,
  record_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: fir_details
CREATE TABLE fir_details (
  record_id uuid PRIMARY KEY REFERENCES records(id) NOT NULL,
  ps_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  fir_no character varying(50),
  fir_year smallint,
  original_fir_no character varying(50),
  original_fir_year smallint,
  fir_date date,
  gd_no character varying(50),
  gd_date date,
  gd_time time without time zone,
  case_type character varying(50),
  source_reference character varying(255),
  beat_id character varying(20),
  is_important boolean NOT NULL DEFAULT false,
  case_status character varying(50),
  is_worked_out boolean,
  worked_out_date date,
  local_head_id integer,
  brief_facts text,
  occurrence_location_id uuid REFERENCES locations(id),
  occurrence_from_datetime timestamp with time zone,
  occurrence_to_datetime timestamp with time zone,
  info_received_at_ps timestamp with time zone,
  organised_crime boolean,
  cd_uploaded_24h boolean,
  footage_collected boolean,
  rc_no character varying(50),
  disposal_type character varying(50),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  transfer_to_type character varying(20),
  transferred_to_ps_id uuid REFERENCES hierarchy_nodes(id),
  transferred_to_agency_id uuid,
  date_of_transfer date,
  registered_on_direction boolean DEFAULT false,
  direction_authority character varying(100),
  cheating_amount numeric,
  modus_operandi character varying(500),
  burglary_mo_cd integer,
  sent_to_court_date date,
  court_case_no character varying(50),
  court_name character varying(100),
  court_disposal_type character varying(30),
  court_disposal_date date,
  supplementary_chargesheet_details text,
  registration_type character varying(20),
  fir_seq integer,
  fir_type_prefix character varying(5),
  fir_ps_code character varying(3),
  is_legacy_format boolean NOT NULL DEFAULT false
);

-- Table: fir_number_counters
CREATE TABLE fir_number_counters (
  ps_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  fir_year smallint NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ps_id, fir_year)
);

-- Table: hierarchy_nodes
CREATE TABLE hierarchy_nodes (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  node_type character varying(30) NOT NULL,
  name character varying(150) NOT NULL,
  code character varying(30) NOT NULL,
  parent_id uuid REFERENCES hierarchy_nodes(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: import_batch_errors
CREATE TABLE import_batch_errors (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES import_batches(id) NOT NULL,
  row_number integer NOT NULL,
  field_key character varying(60),
  error_code character varying(40),
  severity character varying(10) NOT NULL DEFAULT 'ERROR'::character varying,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: import_batches
CREATE TABLE import_batches (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_type character varying(20) NOT NULL,
  is_legacy boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES users(id) NOT NULL,
  ps_id uuid REFERENCES hierarchy_nodes(id),
  district_id uuid REFERENCES hierarchy_nodes(id),
  file_path character varying(500),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  status character varying(30) NOT NULL DEFAULT 'VALIDATION_PENDING'::character varying,
  error_message text,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: investigating_officers
CREATE TABLE investigating_officers (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name character varying(100) NOT NULL,
  rank character varying(50),
  pis_no character varying(50),
  mobile character varying(20),
  ps_id uuid REFERENCES hierarchy_nodes(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: knex_migrations
CREATE TABLE knex_migrations (
  id integer PRIMARY KEY NOT NULL DEFAULT nextval('knex_migrations_id_seq'::regclass),
  name character varying(255),
  batch integer,
  migration_time timestamp with time zone
);

-- Table: knex_migrations_lock
CREATE TABLE knex_migrations_lock (
  index integer PRIMARY KEY NOT NULL DEFAULT nextval('knex_migrations_lock_index_seq'::regclass),
  is_locked integer
);

-- Table: level_data_contracts
CREATE TABLE level_data_contracts (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code character varying(80) NOT NULL,
  from_level character varying(20) NOT NULL,
  to_level character varying(20) NOT NULL,
  route character varying(30) NOT NULL DEFAULT 'OPS_CHAIN'::character varying,
  record_type character varying(20) NOT NULL DEFAULT '*'::character varying,
  visible_field_keys jsonb NOT NULL,
  aggregate_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  checksum character varying(64),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: link_type_registry
CREATE TABLE link_type_registry (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code character varying(60) NOT NULL,
  source_record_type character varying(20),
  target_record_type character varying(20),
  label character varying(100),
  cardinality character varying(20) NOT NULL DEFAULT 'ONE_TO_MANY'::character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: locations
CREATE TABLE locations (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  house_no character varying(100),
  street character varying(150),
  colony character varying(150),
  landmark character varying(150),
  city_town_village character varying(150),
  tehsil_block_mandal character varying(150),
  district character varying(100),
  state character varying(100),
  country character varying(100),
  police_station character varying(150),
  pincode character varying(10),
  latitude numeric,
  longitude numeric,
  full_address character varying(500),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: missing_details
CREATE TABLE missing_details (
  record_id uuid PRIMARY KEY REFERENCES records(id) NOT NULL,
  gd_no character varying(50),
  gd_date date,
  missing_type character varying(50),
  missing_status character varying(50),
  operator_name character varying(100),
  source character varying(100),
  zipnet_no character varying(50),
  case_registered boolean,
  fir_no character varying(50),
  fir_date date,
  remarks text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: missing_person_details
CREATE TABLE missing_person_details (
  person_id uuid PRIMARY KEY REFERENCES persons(id) NOT NULL,
  missing_date date,
  missing_location_id uuid REFERENCES locations(id),
  last_seen_place text,
  found_date date,
  found_location_id uuid REFERENCES locations(id),
  mp_known boolean,
  mental_state character varying(100),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  type character varying(40) NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  record_id uuid REFERENCES records(id),
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: pcr_call_details
CREATE TABLE pcr_call_details (
  record_id uuid PRIMARY KEY REFERENCES records(id) NOT NULL,
  pcr_no character varying(50),
  gd_no character varying(50),
  gd_date date,
  gd_time time without time zone,
  call_head character varying(100),
  call_gist text,
  incident_location_id uuid REFERENCES locations(id),
  occurrence_location_id uuid REFERENCES locations(id),
  incident_datetime timestamp with time zone,
  arrival_time time without time zone,
  action_taken text,
  final_call_status character varying(50),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: person_descriptions
CREATE TABLE person_descriptions (
  person_id uuid PRIMARY KEY REFERENCES persons(id) NOT NULL,
  height character varying(50),
  built character varying(50),
  complexion character varying(50),
  face character varying(50),
  hair character varying(50),
  beard character varying(50),
  moustache character varying(50),
  upper_dress_color character varying(50),
  lower_dress_color character varying(50),
  identification_marks text,
  physical_description text,
  age_range character varying(20),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: persons
CREATE TABLE persons (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  role character varying(20) NOT NULL,
  name character varying(100),
  relative_name character varying(100),
  relation_type character varying(20),
  gender character varying(20),
  age smallint,
  dob date,
  is_minor boolean,
  nick_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  mobile character varying(20),
  qualification character varying(50),
  present_location_id uuid REFERENCES locations(id),
  perm_location_id uuid REFERENCES locations(id),
  perm_same_as_present boolean NOT NULL DEFAULT false,
  relation_to_subject character varying(50),
  sort_order integer NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  social_category character varying(10),
  education character varying(20),
  financial_status character varying(15),
  uid character varying(30)
);

-- Table: record_amendments
CREATE TABLE record_amendments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  requested_by uuid REFERENCES users(id) NOT NULL,
  status character varying(10) NOT NULL DEFAULT 'PENDING'::character varying,
  field_changes jsonb NOT NULL,
  reason text NOT NULL,
  decided_by uuid REFERENCES users(id),
  decided_at timestamp with time zone,
  decision_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: record_links
CREATE TABLE record_links (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  link_type_id uuid REFERENCES link_type_registry(id) NOT NULL,
  source_record_id uuid REFERENCES records(id) NOT NULL,
  target_record_id uuid REFERENCES records(id) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: record_offences
CREATE TABLE record_offences (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  act_id integer,
  other_act_name character varying(255),
  section_id text,
  major_head_id integer,
  minor_head_id integer,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: record_properties
CREATE TABLE record_properties (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  person_id uuid REFERENCES persons(id),
  major_category_id integer,
  minor_category_id integer,
  status character varying(20) NOT NULL DEFAULT 'STOLEN'::character varying,
  details text,
  uid character varying(100),
  estimated_value numeric,
  automobile_id integer,
  fire_arm_id integer,
  arms_subtype_id integer,
  arms_made_id integer,
  jewelry_type_id integer,
  currency_type_id integer,
  document_type_id integer,
  drug_type_id integer,
  electric_good_id integer,
  explosive_type_id integer,
  cultural_property_id integer,
  phone_number character varying(50),
  phone_make character varying(100),
  phone_model character varying(100),
  phone_imei character varying(50),
  phone_color character varying(50),
  vehicle_no character varying(50),
  vehicle_make character varying(100),
  vehicle_model character varying(100),
  vehicle_color character varying(50),
  vehicle_chassis_no character varying(100),
  vehicle_engine_no character varying(100),
  sort_order integer NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  quantity numeric,
  unit_cd integer,
  recovery_date date,
  recovery_agency character varying(20)
);

-- Table: record_revisions
CREATE TABLE record_revisions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  revision_number integer NOT NULL,
  change_type character varying(30) NOT NULL,
  field_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  level character varying(20) NOT NULL DEFAULT 'PS'::character varying,
  changed_by uuid REFERENCES users(id) NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  comment text,
  reason text,
  ip_address character varying(45),
  prev_hash character(64) NOT NULL,
  row_hash character(64) NOT NULL,
  hash_version smallint NOT NULL DEFAULT 1
);

-- Table: record_status_events
CREATE TABLE record_status_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  property_id uuid REFERENCES record_properties(id),
  status_field character varying(30) NOT NULL,
  old_value character varying(50),
  new_value character varying(50) NOT NULL,
  effective_date date NOT NULL,
  changed_by uuid REFERENCES users(id) NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  comment text
);

-- Table: record_transfers
CREATE TABLE record_transfers (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  from_ps_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  to_ps_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  initiated_by uuid REFERENCES users(id) NOT NULL,
  initiated_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text NOT NULL,
  order_ref character varying(100),
  status character varying(10) NOT NULL DEFAULT 'PENDING'::character varying,
  prior_status character varying(30) NOT NULL,
  prior_level character varying(20) NOT NULL,
  assigned_fir_no character varying(50),
  assigned_fir_year smallint,
  decided_by uuid REFERENCES users(id),
  decided_at timestamp with time zone,
  decision_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: records
CREATE TABLE records (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_type character varying(20) NOT NULL,
  ps_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  district_id uuid REFERENCES hierarchy_nodes(id) NOT NULL,
  sub_div_id uuid REFERENCES hierarchy_nodes(id),
  io_id uuid REFERENCES investigating_officers(id),
  original_ps_id uuid REFERENCES hierarchy_nodes(id),
  current_status character varying(30) NOT NULL DEFAULT 'DRAFT'::character varying,
  current_level character varying(20) NOT NULL DEFAULT 'PS'::character varying,
  record_date date NOT NULL,
  is_frozen boolean NOT NULL DEFAULT false,
  is_legacy boolean NOT NULL DEFAULT false,
  source_system character varying(100),
  legacy_ref character varying(255),
  imported_at timestamp with time zone,
  imported_by uuid REFERENCES users(id),
  created_by uuid REFERENCES users(id) NOT NULL,
  updated_by uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  import_batch_id uuid REFERENCES import_batches(id),
  registration_date date,
  uid character varying(30)
);

-- Table: report_builder_audit
CREATE TABLE report_builder_audit (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  user_role character varying(20),
  run_type character varying(20),
  table_spec jsonb,
  fields_spec jsonb,
  filter_spec jsonb,
  format character varying(10),
  row_count integer,
  job_id uuid REFERENCES report_jobs(id),
  ip_address character varying(45),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: report_builder_saved
CREATE TABLE report_builder_saved (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  name character varying(150) NOT NULL,
  description text,
  query_spec jsonb NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_system_preset boolean NOT NULL DEFAULT false,
  visible_to_roles jsonb
);

-- Table: report_jobs
CREATE TABLE report_jobs (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES report_templates(id),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  format character varying(10) NOT NULL,
  status character varying(10) NOT NULL DEFAULT 'PENDING'::character varying,
  file_path character varying(500),
  custom_definition jsonb,
  error_message text,
  created_by uuid REFERENCES users(id) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: report_templates
CREATE TABLE report_templates (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code character varying(80) NOT NULL,
  name character varying(150) NOT NULL,
  record_types jsonb,
  levels jsonb,
  template_definition jsonb NOT NULL,
  output_formats jsonb NOT NULL DEFAULT '["PDF"]'::jsonb,
  template_type character varying(20) NOT NULL DEFAULT 'PROFORMA'::character varying,
  is_active boolean NOT NULL DEFAULT true,
  checksum character varying(64),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: scheduled_reports
CREATE TABLE scheduled_reports (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES report_templates(id) NOT NULL,
  cron_expr character varying(50) NOT NULL,
  filter_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  format character varying(10) NOT NULL DEFAULT 'PDF'::character varying,
  scope_ps_id uuid REFERENCES hierarchy_nodes(id),
  scope_district_id uuid REFERENCES hierarchy_nodes(id),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamp with time zone,
  last_run_status character varying(20),
  created_by uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: stat_baselines
CREATE TABLE stat_baselines (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  scope_code character varying(50) NOT NULL,
  head_code character varying(100) NOT NULL,
  reported_count integer NOT NULL DEFAULT 0,
  solved_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: system_meta
CREATE TABLE system_meta (
  key character varying(100) PRIMARY KEY NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: uidb_details
CREATE TABLE uidb_details (
  record_id uuid PRIMARY KEY REFERENCES records(id) NOT NULL,
  uidb_no character varying(50),
  gd_no character varying(50),
  gd_date date,
  inquest_sections character varying(255),
  local_head_id integer,
  found_date date,
  found_time time without time zone,
  found_location_id uuid REFERENCES locations(id),
  duty_officer character varying(100),
  zipnet_no character varying(50),
  identified boolean,
  cause_of_death character varying(255),
  deceased_relative_name character varying(100),
  deceased_relation_type character varying(50),
  filed_by_acp_sdm boolean,
  filed_by_acp_sdm_date date,
  mortuary_remarks text,
  uidb_status character varying(50),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cause_of_death_other character varying(500),
  inquest_status character varying(50)
);

-- Table: users
CREATE TABLE users (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  username character varying(50) NOT NULL,
  badge_no character varying(50) NOT NULL,
  name character varying(100) NOT NULL,
  password_hash character varying(255) NOT NULL,
  role character varying(20) NOT NULL,
  ps_id uuid REFERENCES hierarchy_nodes(id),
  district_id uuid REFERENCES hierarchy_nodes(id),
  sub_div_id uuid REFERENCES hierarchy_nodes(id),
  is_active boolean NOT NULL DEFAULT true,
  last_login timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: victim_injury_details
CREATE TABLE victim_injury_details (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES persons(id) NOT NULL,
  injury_severity character varying(20),
  hospitalized boolean DEFAULT false,
  hospital_name character varying(150),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: workflow_transitions
CREATE TABLE workflow_transitions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES records(id) NOT NULL,
  from_status character varying(30),
  to_status character varying(30) NOT NULL,
  from_level character varying(20),
  to_level character varying(20),
  action character varying(30) NOT NULL,
  performed_by uuid REFERENCES users(id),
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  comment text,
  target_fields jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Table: workflow_transitions_config
CREATE TABLE workflow_transitions_config (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code character varying(80) NOT NULL,
  record_type character varying(20) NOT NULL DEFAULT '*'::character varying,
  from_status character varying(30) NOT NULL,
  action character varying(30) NOT NULL,
  to_status character varying(30) NOT NULL,
  from_level character varying(20),
  to_level character varying(20),
  allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_comment boolean NOT NULL DEFAULT false,
  sla_hours integer,
  is_active boolean NOT NULL DEFAULT true,
  checksum character varying(64),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  requires_field_correction boolean NOT NULL DEFAULT false
);
