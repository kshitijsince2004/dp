--
-- PostgreSQL database dump
--

\restrict 57THCLjTtbVQkPhK0GRZBylOfVdLtewewdAK7q7zRUUEJEpbsHKSJ9qofB1lhey

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: rpt; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA rpt;


ALTER SCHEMA rpt OWNER TO postgres;

--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.gender_type AS ENUM (
    'Male',
    'Female',
    'Transgender',
    'Unknown'
);


ALTER TYPE public.gender_type OWNER TO postgres;

--
-- Name: yes_no_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.yes_no_type AS ENUM (
    'Yes',
    'No'
);


ALTER TYPE public.yes_no_type OWNER TO postgres;

--
-- Name: rpt_06_arrested_all_heads_fn(date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rpt_06_arrested_all_heads_fn(p_date date) RETURNS TABLE("BNS/IPC" text, "TOTAL NO DD – 126/170 BNSS" bigint, "TOTAL NO DD – 126/169 BNSS" bigint, "TOTAL NO DD – 109 BNSS" bigint, "109 G" bigint, "TOTAL L NO DD – 110 BNSS" bigint, "110 G" bigint, "92/93/97 DP ACT" bigint, "TOTAL NO DD – 40 EX." bigint, "40 EX." bigint, "35.1D" bigint, "A.ACT" bigint, "G.ACT" bigint, "33 EX." bigint, "NDPS" bigint, "OTHERS ACT" bigint, "OTHERS BNSS" bigint, "PO" bigint)
    LANGUAGE sql STABLE
    AS $$
      SELECT
        ps.ps_name::text AS "BNS/IPC",
        COUNT(*) FILTER (WHERE a.sections LIKE '%126/170%') AS "TOTAL NO DD – 126/170 BNSS",
        COUNT(*) FILTER (WHERE a.sections LIKE '%126/169%') AS "TOTAL NO DD – 126/169 BNSS",
        COUNT(*) FILTER (WHERE a.sections LIKE '%109%' AND a.sections NOT LIKE '%126/169%') AS "TOTAL NO DD – 109 BNSS",
        COUNT(*) FILTER (WHERE a.sections LIKE '%109 G%') AS "109 G",
        COUNT(*) FILTER (WHERE a.sections LIKE '%110%') AS "TOTAL L NO DD – 110 BNSS",
        COUNT(*) FILTER (WHERE a.sections LIKE '%110 G%') AS "110 G",
        COUNT(*) FILTER (WHERE a.sections LIKE '%92%' OR a.sections LIKE '%93%' OR a.sections LIKE '%97 DP%') AS "92/93/97 DP ACT",
        COUNT(*) FILTER (WHERE a.sections LIKE '%40 EX%' OR a.sections LIKE '%40EX%') AS "TOTAL NO DD – 40 EX.",
        COUNT(*) FILTER (WHERE a.sections LIKE '%40 EX%' OR a.sections LIKE '%40EX%') AS "40 EX.",
        COUNT(*) FILTER (WHERE a.sections LIKE '%35.1D%') AS "35.1D",
        COUNT(*) FILTER (WHERE a.sections LIKE '%Arms Act%' OR a.sections LIKE '%A.Act%') AS "A.ACT",
        COUNT(*) FILTER (WHERE a.sections LIKE '%Gambling%' OR a.sections LIKE '%G.Act%') AS "G.ACT",
        COUNT(*) FILTER (WHERE a.sections LIKE '%33 EX%') AS "33 EX.",
        COUNT(*) FILTER (WHERE a.sections LIKE '%NDPS%') AS "NDPS",
        COUNT(*) FILTER (WHERE a.sections NOT LIKE '%126%' AND a.sections NOT LIKE '%109%' AND a.sections NOT LIKE '%110%'
          AND a.sections NOT LIKE '%92%' AND a.sections NOT LIKE '%40 EX%' AND a.sections NOT LIKE '%NDPS%'
          AND a.sections NOT LIKE '%Arms%' AND a.sections NOT LIKE '%Gambling%' AND a.sections NOT LIKE '%33 EX%'
          AND a.section_category_id IS NOT NULL) AS "OTHERS ACT",
        COUNT(*) FILTER (WHERE a.section_category_id IS NULL) AS "OTHERS BNSS",
        COUNT(*) FILTER (WHERE a.is_po = 'Yes') AS "PO"
      FROM arrest_master a
      JOIN ref_police_station ps ON ps.ps_id = a.ps_id
      WHERE a.diary_record_date = p_date
      GROUP BY ps.ps_name
      ORDER BY ps.ps_name;
    $$;


ALTER FUNCTION public.rpt_06_arrested_all_heads_fn(p_date date) OWNER TO postgres;

--
-- Name: rpt_28_fir_goswara_summary_fn(date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rpt_28_fir_goswara_summary_fn(p_date date) RETURNS TABLE("DISTRICT" text, "MANUAL FIR" bigint, "Theft (E-FIR)" bigint, "House Theft (E-FIR)" bigint, "Burglary (E-FIR)" bigint, "MVT" bigint, "TOTAL" bigint)
    LANGUAGE sql STABLE
    AS $$
      SELECT
        d.district_name::text AS "DISTRICT",
        COUNT(*) FILTER (WHERE f.case_reg_type_id = 1) AS "MANUAL FIR",
        COUNT(*) FILTER (WHERE ch.theft_category = 'OTHER_THEFT') AS "Theft (E-FIR)",
        COUNT(*) FILTER (WHERE ch.theft_category = 'HOUSE_THEFT') AS "House Theft (E-FIR)",
        COUNT(*) FILTER (WHERE ch.theft_category = 'BURGLARY') AS "Burglary (E-FIR)",
        COUNT(*) FILTER (WHERE ch.theft_category = 'MVT') AS "MVT",
        COUNT(*) AS "TOTAL"
      FROM fir_master f
      JOIN ref_police_station ps ON ps.ps_id = f.ps_id
      JOIN ref_district d ON d.district_id = ps.district_id
      LEFT JOIN ref_crime_head ch ON ch.crime_head_id = f.crime_head_id
      WHERE f.diary_record_date = p_date
      GROUP BY d.district_name
      ORDER BY d.district_name;
    $$;


ALTER FUNCTION public.rpt_28_fir_goswara_summary_fn(p_date date) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.records (
    id character varying(36) NOT NULL,
    record_type character varying(20) NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    data text DEFAULT '{}'::text NOT NULL,
    current_status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    current_level character varying(20) DEFAULT 'PS'::character varying NOT NULL,
    record_date date NOT NULL,
    created_by character varying(36) NOT NULL,
    updated_by character varying(36),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_legacy boolean DEFAULT false,
    source_system character varying(255),
    imported_at timestamp with time zone,
    imported_by character varying(36),
    legacy_ref character varying(255)
);


ALTER TABLE public.records OWNER TO postgres;

--
-- Name: bridge_fir_arrest; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.bridge_fir_arrest (
    id bigint NOT NULL,
    fir_sk bigint NOT NULL,
    arrest_sk bigint NOT NULL,
    link_type character varying(30) DEFAULT 'FIR_NO_MATCH'::character varying NOT NULL,
    linked_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.bridge_fir_arrest OWNER TO postgres;

--
-- Name: fact_arrest; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.fact_arrest (
    sk bigint NOT NULL,
    source_record_id character varying(36) NOT NULL,
    source_updated_at timestamp with time zone,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    warehouse_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    district_sk integer,
    ps_sk integer,
    officer_sk integer,
    crime_head_sk integer,
    status_sk integer,
    act_law_sk integer,
    workflow_status character varying(30),
    linked_fir_dd_no character varying(100),
    act_name character varying(300),
    sections character varying(500),
    crime_head character varying(255),
    arrested_name character varying(200),
    arrested_address character varying(500),
    arrest_date date,
    arrest_place character varying(300),
    custody_status character varying(100),
    officer_name character varying(200),
    nafis_prepared boolean,
    dossier_prepared boolean,
    record_date date
);


ALTER TABLE rpt.fact_arrest OWNER TO postgres;

--
-- Name: fact_fir; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.fact_fir (
    sk bigint NOT NULL,
    source_record_id character varying(36) NOT NULL,
    source_record_uid character varying(100),
    source_updated_at timestamp with time zone,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    warehouse_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    district_sk integer,
    ps_sk integer,
    officer_sk integer,
    crime_head_sk integer,
    status_sk integer,
    act_law_sk integer,
    workflow_status character varying(30),
    fir_no character varying(100),
    fir_date date,
    gd_no character varying(100),
    gd_date date,
    gd_time character varying(20),
    beat_no character varying(50),
    occurrence_date date,
    occurrence_place character varying(500),
    local_head character varying(255),
    act_name character varying(300),
    sections character varying(500),
    brief_facts text,
    complainant_name character varying(200),
    complainant_address character varying(500),
    accused_name character varying(200),
    accused_address character varying(500),
    officer_name character varying(200),
    officer_pis character varying(50),
    officer_mobile character varying(30),
    property_description text,
    property_status character varying(50),
    case_status character varying(100),
    remarks text,
    cctns_flag boolean,
    zero_fir_flag boolean,
    record_date date
);


ALTER TABLE rpt.fact_fir OWNER TO postgres;

--
-- Name: arrest_master; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.arrest_master AS
 SELECT a.source_record_id AS record_uid,
    a.district_sk AS district_id,
    a.ps_sk AS ps_id,
    'Submitted'::character varying AS submission_status,
    f.source_record_id AS linked_fir_record_uid,
    a.linked_fir_dd_no AS fir_dd_no,
        CASE
            WHEN (((r.data)::jsonb ->> 'is_dd_based'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS is_dd_based,
    a.crime_head_sk AS crime_head_id,
    a.act_law_sk AS act_law_id,
    a.sections,
        CASE
            WHEN (((a.sections)::text ~~ '%126%'::text) OR ((a.sections)::text ~~ '%170%'::text)) THEN 1
            WHEN ((a.sections)::text ~~ '%Excise%'::text) THEN 2
            WHEN ((a.sections)::text ~~ '%DP Act%'::text) THEN 3
            ELSE 1
        END AS section_category_id,
    a.arrested_name AS arrestee_name,
    (((r.data)::jsonb ->> 'arrested_parent_name'::text))::character varying AS arrestee_parent_name,
    a.arrested_address AS arrestee_address,
    (((r.data)::jsonb ->> 'arrested_age'::text))::integer AS arrestee_age,
    a.arrest_date AS date_of_arrest,
    (COALESCE(((r.data)::jsonb ->> 'arrest_time'::text), '12:00:00'::text))::time without time zone AS time_of_arrest,
    a.arrest_place AS place_of_arrest,
    a.officer_name AS io_name,
    (((r.data)::jsonb ->> 'io_mobile'::text))::character varying AS io_mobile_no,
    (((r.data)::jsonb ->> 'io_rank'::text))::character varying AS io_rank,
    a.status_sk AS arrest_status_id,
    COALESCE((((r.data)::jsonb ->> 'prev_involvement_count'::text))::integer, 0) AS prev_involvement_count,
        CASE
            WHEN (((r.data)::jsonb ->> 'is_po'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS is_po,
    (((r.data)::jsonb ->> 'po_declared_court'::text))::character varying AS po_declared_court,
    (((r.data)::jsonb ->> 'po_case_reference'::text))::character varying AS po_case_reference,
    ((r.data)::jsonb ->> 'seizure_desc'::text) AS seizure_desc,
        CASE
            WHEN (((r.data)::jsonb ->> 'is_bc'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS is_bc,
        CASE
            WHEN (a.nafis_prepared = true) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS nafis_prepared,
        CASE
            WHEN (a.dossier_prepared = true) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS dossier_prepared,
        CASE
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'INTEGRATED_PI'::text) THEN 1
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'GROUP_PATROLLING'::text) THEN 2
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'CYCLE_PATROLLING'::text) THEN 3
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'ANTI_SNATCHING'::text) THEN 4
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'PRAHARI'::text) THEN 5
            WHEN (((r.data)::jsonb ->> 'special_scheme'::text) = 'EYES_EARS'::text) THEN 6
            ELSE NULL::integer
        END AS special_scheme_id,
    (((r.data)::jsonb ->> 'arresting_officer_name'::text))::character varying AS arresting_officer_name,
    (((r.data)::jsonb ->> 'arresting_officer_mobile'::text))::character varying AS arresting_officer_mobile,
    (((r.data)::jsonb ->> 'beat_no'::text))::character varying AS beat_no,
    a.custody_status,
    a.record_date AS diary_record_date,
    a.warehouse_loaded_at AS created_at,
    a.warehouse_updated_at AS updated_at
   FROM (((rpt.fact_arrest a
     JOIN public.records r ON (((a.source_record_id)::text = (r.id)::text)))
     LEFT JOIN rpt.bridge_fir_arrest br ON ((br.arrest_sk = a.sk)))
     LEFT JOIN rpt.fact_fir f ON ((br.fir_sk = f.sk)));


ALTER VIEW public.arrest_master OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id character varying(36) NOT NULL,
    table_name character varying(40) NOT NULL,
    record_id character varying(36),
    action character varying(20) NOT NULL,
    changed_by_id character varying(36) NOT NULL,
    changed_by_role character varying(20) NOT NULL,
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    field_name character varying(60),
    old_value text,
    new_value text,
    reason text,
    ip_address character varying(45)
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: compilation_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compilation_records (
    id character varying(36) NOT NULL,
    compilation_id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL
);


ALTER TABLE public.compilation_records OWNER TO postgres;

--
-- Name: compilations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compilations (
    id character varying(36) NOT NULL,
    source_level character varying(20) NOT NULL,
    target_level character varying(20) NOT NULL,
    route character varying(30) NOT NULL,
    period date NOT NULL,
    source_entity_id character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    record_ids text DEFAULT '[]'::text NOT NULL,
    compiled_summary text,
    submitted_by character varying(36),
    submitted_at timestamp with time zone
);


ALTER TABLE public.compilations OWNER TO postgres;

--
-- Name: custom_field_definitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_field_definitions (
    id character varying(36) NOT NULL,
    module character varying(20) NOT NULL,
    field_key character varying(60) NOT NULL,
    field_label character varying(120) NOT NULL,
    field_type character varying(20) NOT NULL,
    options_json text,
    is_required boolean DEFAULT false,
    scope_level character varying(20) NOT NULL,
    scope_id character varying(36),
    is_active boolean DEFAULT true,
    created_by character varying(36),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.custom_field_definitions OWNER TO postgres;

--
-- Name: custom_field_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_field_values (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    record_type character varying(20) NOT NULL,
    field_definition_id character varying(36) NOT NULL,
    value_text text,
    created_by character varying(36),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.custom_field_values OWNER TO postgres;

--
-- Name: excel_acts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_acts (
    id integer NOT NULL,
    act_cd integer,
    act_long text
);


ALTER TABLE public.excel_acts OWNER TO postgres;

--
-- Name: excel_acts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_acts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_acts_id_seq OWNER TO postgres;

--
-- Name: excel_acts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_acts_id_seq OWNED BY public.excel_acts.id;


--
-- Name: excel_arms_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_arms_categories (
    id integer NOT NULL,
    arms_category_cd integer,
    arms_category character varying(255)
);


ALTER TABLE public.excel_arms_categories OWNER TO postgres;

--
-- Name: excel_arms_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_arms_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_arms_categories_id_seq OWNER TO postgres;

--
-- Name: excel_arms_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_arms_categories_id_seq OWNED BY public.excel_arms_categories.id;


--
-- Name: excel_arms_made; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_arms_made (
    id integer NOT NULL,
    arms_made_cd integer,
    arms_made character varying(255)
);


ALTER TABLE public.excel_arms_made OWNER TO postgres;

--
-- Name: excel_arms_made_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_arms_made_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_arms_made_id_seq OWNER TO postgres;

--
-- Name: excel_arms_made_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_arms_made_id_seq OWNED BY public.excel_arms_made.id;


--
-- Name: excel_automobiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_automobiles (
    id integer NOT NULL,
    automobile_cd integer,
    automobile character varying(255)
);


ALTER TABLE public.excel_automobiles OWNER TO postgres;

--
-- Name: excel_automobiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_automobiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_automobiles_id_seq OWNER TO postgres;

--
-- Name: excel_automobiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_automobiles_id_seq OWNED BY public.excel_automobiles.id;


--
-- Name: excel_beats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_beats (
    id integer NOT NULL,
    beat_cd character varying(255),
    beat_name text,
    ps_cd character varying(255)
);


ALTER TABLE public.excel_beats OWNER TO postgres;

--
-- Name: excel_beats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_beats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_beats_id_seq OWNER TO postgres;

--
-- Name: excel_beats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_beats_id_seq OWNED BY public.excel_beats.id;


--
-- Name: excel_cultural_properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_cultural_properties (
    id integer NOT NULL,
    cultural_prop_cd integer,
    cultural_prop character varying(255)
);


ALTER TABLE public.excel_cultural_properties OWNER TO postgres;

--
-- Name: excel_cultural_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_cultural_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_cultural_properties_id_seq OWNER TO postgres;

--
-- Name: excel_cultural_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_cultural_properties_id_seq OWNED BY public.excel_cultural_properties.id;


--
-- Name: excel_currency_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_currency_types (
    id integer NOT NULL,
    currency_type_cd integer,
    currency_type character varying(255)
);


ALTER TABLE public.excel_currency_types OWNER TO postgres;

--
-- Name: excel_currency_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_currency_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_currency_types_id_seq OWNER TO postgres;

--
-- Name: excel_currency_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_currency_types_id_seq OWNED BY public.excel_currency_types.id;


--
-- Name: excel_document_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_document_types (
    id integer NOT NULL,
    document_type_cd integer,
    document_type character varying(255)
);


ALTER TABLE public.excel_document_types OWNER TO postgres;

--
-- Name: excel_document_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_document_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_document_types_id_seq OWNER TO postgres;

--
-- Name: excel_document_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_document_types_id_seq OWNED BY public.excel_document_types.id;


--
-- Name: excel_drug_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_drug_types (
    id integer NOT NULL,
    drug_type_cd integer,
    drug_type character varying(255)
);


ALTER TABLE public.excel_drug_types OWNER TO postgres;

--
-- Name: excel_drug_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_drug_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_drug_types_id_seq OWNER TO postgres;

--
-- Name: excel_drug_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_drug_types_id_seq OWNED BY public.excel_drug_types.id;


--
-- Name: excel_electric_goods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_electric_goods (
    id integer NOT NULL,
    electric_goods_cd integer,
    electric_goods character varying(255)
);


ALTER TABLE public.excel_electric_goods OWNER TO postgres;

--
-- Name: excel_electric_goods_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_electric_goods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_electric_goods_id_seq OWNER TO postgres;

--
-- Name: excel_electric_goods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_electric_goods_id_seq OWNED BY public.excel_electric_goods.id;


--
-- Name: excel_explosive_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_explosive_types (
    id integer NOT NULL,
    explosive_type_cd integer,
    explosive_type character varying(255)
);


ALTER TABLE public.excel_explosive_types OWNER TO postgres;

--
-- Name: excel_explosive_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_explosive_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_explosive_types_id_seq OWNER TO postgres;

--
-- Name: excel_explosive_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_explosive_types_id_seq OWNED BY public.excel_explosive_types.id;


--
-- Name: excel_fire_arms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_fire_arms (
    id integer NOT NULL,
    fire_arms_cd integer,
    arms_category_cd integer,
    fire_arms character varying(255)
);


ALTER TABLE public.excel_fire_arms OWNER TO postgres;

--
-- Name: excel_fire_arms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_fire_arms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_fire_arms_id_seq OWNER TO postgres;

--
-- Name: excel_fire_arms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_fire_arms_id_seq OWNED BY public.excel_fire_arms.id;


--
-- Name: excel_jewelry_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_jewelry_types (
    id integer NOT NULL,
    jewelry_type_cd integer,
    jewelry_type character varying(255)
);


ALTER TABLE public.excel_jewelry_types OWNER TO postgres;

--
-- Name: excel_jewelry_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_jewelry_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_jewelry_types_id_seq OWNER TO postgres;

--
-- Name: excel_jewelry_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_jewelry_types_id_seq OWNED BY public.excel_jewelry_types.id;


--
-- Name: excel_local_heads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_local_heads (
    id integer NOT NULL,
    local_head_cd integer,
    local_head character varying(255)
);


ALTER TABLE public.excel_local_heads OWNER TO postgres;

--
-- Name: excel_local_heads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_local_heads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_local_heads_id_seq OWNER TO postgres;

--
-- Name: excel_local_heads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_local_heads_id_seq OWNED BY public.excel_local_heads.id;


--
-- Name: excel_major_heads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_major_heads (
    id integer NOT NULL,
    major_head_code integer,
    major_head character varying(255)
);


ALTER TABLE public.excel_major_heads OWNER TO postgres;

--
-- Name: excel_major_heads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_major_heads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_major_heads_id_seq OWNER TO postgres;

--
-- Name: excel_major_heads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_major_heads_id_seq OWNED BY public.excel_major_heads.id;


--
-- Name: excel_major_minor_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_major_minor_mapping (
    id integer NOT NULL,
    sec_mjrhd_cd integer,
    act_cd integer,
    section_code text,
    major_head_code integer
);


ALTER TABLE public.excel_major_minor_mapping OWNER TO postgres;

--
-- Name: excel_major_minor_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_major_minor_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_major_minor_mapping_id_seq OWNER TO postgres;

--
-- Name: excel_major_minor_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_major_minor_mapping_id_seq OWNED BY public.excel_major_minor_mapping.id;


--
-- Name: excel_minor_heads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_minor_heads (
    id integer NOT NULL,
    minor_head_cd integer,
    major_head_code integer,
    minor_head character varying(255)
);


ALTER TABLE public.excel_minor_heads OWNER TO postgres;

--
-- Name: excel_minor_heads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_minor_heads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_minor_heads_id_seq OWNER TO postgres;

--
-- Name: excel_minor_heads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_minor_heads_id_seq OWNED BY public.excel_minor_heads.id;


--
-- Name: excel_other_property_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_other_property_categories (
    id integer NOT NULL,
    parent_srno integer,
    parent_cd integer,
    code_type character varying(255),
    parent_type character varying(255),
    major_property integer
);


ALTER TABLE public.excel_other_property_categories OWNER TO postgres;

--
-- Name: excel_other_property_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_other_property_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_other_property_categories_id_seq OWNER TO postgres;

--
-- Name: excel_other_property_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_other_property_categories_id_seq OWNED BY public.excel_other_property_categories.id;


--
-- Name: excel_other_property_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_other_property_items (
    id integer NOT NULL,
    property_cd integer,
    parent_cd integer,
    property_type_srno character varying(255),
    property character varying(255)
);


ALTER TABLE public.excel_other_property_items OWNER TO postgres;

--
-- Name: excel_other_property_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_other_property_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_other_property_items_id_seq OWNER TO postgres;

--
-- Name: excel_other_property_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_other_property_items_id_seq OWNED BY public.excel_other_property_items.id;


--
-- Name: excel_property_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_property_types (
    id integer NOT NULL,
    parent_srno integer,
    parent_cd integer,
    code_type character varying(255),
    parent_type character varying(255),
    major_property integer
);


ALTER TABLE public.excel_property_types OWNER TO postgres;

--
-- Name: excel_property_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_property_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_property_types_id_seq OWNER TO postgres;

--
-- Name: excel_property_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_property_types_id_seq OWNED BY public.excel_property_types.id;


--
-- Name: excel_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.excel_sections (
    id integer NOT NULL,
    section_code text,
    section_cd character varying(255),
    act_sec_cd character varying(255),
    section character varying(255),
    section_desc text,
    pnsh_gt_7yrs character varying(255)
);


ALTER TABLE public.excel_sections OWNER TO postgres;

--
-- Name: excel_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.excel_sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.excel_sections_id_seq OWNER TO postgres;

--
-- Name: excel_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.excel_sections_id_seq OWNED BY public.excel_sections.id;


--
-- Name: field_registry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.field_registry (
    id character varying(36) NOT NULL,
    field_key character varying(60) NOT NULL,
    field_type character varying(20) NOT NULL,
    applicable_record_types text NOT NULL,
    label_en character varying(120) NOT NULL,
    label_hi character varying(120) NOT NULL,
    options text,
    validation_rules text,
    visible_to_levels text NOT NULL,
    editable_by_levels text NOT NULL,
    introduced_at_level character varying(30) DEFAULT 'PS'::character varying NOT NULL,
    section character varying(60),
    sort_order real,
    full_width boolean DEFAULT false,
    show_when text,
    is_active boolean DEFAULT true NOT NULL,
    scope_level character varying(50) DEFAULT 'global'::character varying NOT NULL,
    scope_id text,
    created_by text,
    section_label_en character varying(120),
    section_label_hi character varying(120),
    readonly boolean DEFAULT false,
    repeater_entity character varying(50),
    depends_on character varying(60),
    options_source character varying(255)
);


ALTER TABLE public.field_registry OWNER TO postgres;

--
-- Name: filter_presets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.filter_presets (
    id character varying(36) NOT NULL,
    name_en character varying(255) NOT NULL,
    name_hi character varying(255) NOT NULL,
    scope character varying(20) NOT NULL,
    scope_id character varying(36),
    filter_spec text NOT NULL,
    applicable_record_types text,
    created_by character varying(36),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone
);


ALTER TABLE public.filter_presets OWNER TO postgres;

--
-- Name: fir_master; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.fir_master AS
 SELECT f.source_record_id AS record_uid,
    f.district_sk AS district_id,
    f.ps_sk AS ps_id,
    'Submitted'::character varying AS submission_status,
        CASE
            WHEN ((f.local_head)::text = 'M.V. Theft'::text) THEN 3
            WHEN ((f.local_head)::text = ANY ((ARRAY['Theft'::character varying, 'Robbery'::character varying, 'Burglary'::character varying, 'House Theft'::character varying, 'Other Theft'::character varying, 'Night Burglary'::character varying, 'Day Burglary'::character varying, 'Mobile Phone Theft'::character varying, 'Cycle Theft'::character varying, 'Snatching'::character varying])::text[])) THEN 2
            ELSE 1
        END AS case_reg_type_id,
    f.fir_no AS fir_number,
    f.fir_date,
    f.gd_no AS dd_number,
    f.gd_date AS dd_date,
    (COALESCE(f.gd_time, '12:00:00'::character varying))::time without time zone AS dd_time,
    f.crime_head_sk AS crime_head_id,
    f.act_law_sk AS act_law_id,
    f.sections,
    f.beat_no,
    f.occurrence_date AS date_of_occurrence,
    (COALESCE(((r.data)::jsonb ->> 'occurrence_time'::text), '12:00:00'::text))::time without time zone AS time_of_occurrence,
    f.occurrence_place AS place_of_occurrence,
    f.brief_facts,
    f.complainant_name,
    (((r.data)::jsonb ->> 'complainant_parent_name'::text))::character varying AS complainant_parent_name,
    f.complainant_address,
    f.accused_name,
    (((r.data)::jsonb ->> 'accused_parent_name'::text))::character varying AS accused_parent_name,
    f.accused_address,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM rpt.bridge_fir_arrest b
              WHERE (b.fir_sk = f.sk))) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS has_arrested_person,
    f.property_description AS stolen_property_desc,
    (((r.data)::jsonb ->> 'stolen_property_value'::text))::numeric AS stolen_property_value,
    ((r.data)::jsonb ->> 'recovered_property_desc'::text) AS recovered_property_desc,
    (((r.data)::jsonb ->> 'vehicle_no'::text))::character varying AS vehicle_no,
    (((r.data)::jsonb ->> 'vehicle_type'::text))::character varying AS vehicle_type,
        CASE
            WHEN (((r.data)::jsonb ->> 'cd_uploaded_24hrs'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS cd_uploaded_24hrs,
        CASE
            WHEN (((r.data)::jsonb ->> 'footage_collected'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS footage_collected,
    f.status_sk AS case_status_id,
    f.officer_name AS io_name,
    f.officer_pis AS io_pis_no,
    f.officer_mobile AS io_mobile_no,
        CASE
            WHEN (f.cctns_flag = true) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS cctns_flag,
        CASE
            WHEN (f.zero_fir_flag = true) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS zero_fir_flag,
    f.local_head,
    f.remarks,
    f.record_date AS diary_record_date,
    f.warehouse_loaded_at AS created_at,
    f.warehouse_updated_at AS updated_at
   FROM (rpt.fact_fir f
     JOIN public.records r ON (((f.source_record_id)::text = (r.id)::text)));


ALTER VIEW public.fir_master OWNER TO postgres;

--
-- Name: hierarchy_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hierarchy_nodes (
    id character varying(36) NOT NULL,
    node_type character varying(30) NOT NULL,
    name_en character varying(100) NOT NULL,
    name_hi character varying(100) NOT NULL,
    code character varying(30),
    parent_id character varying(36),
    metadata text,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.hierarchy_nodes OWNER TO postgres;

--
-- Name: import_batch_errors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.import_batch_errors (
    id character varying(36) NOT NULL,
    batch_id character varying(36) NOT NULL,
    row_number integer NOT NULL,
    field_key character varying(60),
    error_code character varying(50) NOT NULL,
    error_message text NOT NULL
);


ALTER TABLE public.import_batch_errors OWNER TO postgres;

--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.import_batches (
    id character varying(36) NOT NULL,
    record_type character varying(50) NOT NULL,
    is_legacy boolean DEFAULT false NOT NULL,
    uploaded_by character varying(36) NOT NULL,
    ps_id character varying(36),
    district_id character varying(36),
    file_path character varying(255) NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    status character varying(50) DEFAULT 'VALIDATION_PENDING'::character varying NOT NULL,
    imported_rows integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    confirmed_at timestamp with time zone
);


ALTER TABLE public.import_batches OWNER TO postgres;

--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: legacy_amendments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.legacy_amendments (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    requested_by character varying(36) NOT NULL,
    approved_by character varying(36),
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp with time zone,
    status character varying(30) DEFAULT 'PENDING'::character varying NOT NULL,
    field_changes text NOT NULL,
    reason text NOT NULL
);


ALTER TABLE public.legacy_amendments OWNER TO postgres;

--
-- Name: legacy_import_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.legacy_import_batches (
    id character varying(36) NOT NULL,
    ps_id character varying(36) NOT NULL,
    record_type character varying(30) NOT NULL,
    source_file character varying(255) NOT NULL,
    imported_by character varying(36),
    imported_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    total_rows integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'PENDING'::character varying NOT NULL,
    error_log text DEFAULT '[]'::text NOT NULL
);


ALTER TABLE public.legacy_import_batches OWNER TO postgres;

--
-- Name: level_data_contracts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.level_data_contracts (
    id character varying(36) NOT NULL,
    from_level character varying(20) NOT NULL,
    to_level character varying(20) NOT NULL,
    route character varying(30) DEFAULT 'OPS_CHAIN'::character varying NOT NULL,
    record_type character varying(30) DEFAULT '*'::character varying NOT NULL,
    visible_field_keys text NOT NULL,
    aggregate_definitions text DEFAULT '[]'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.level_data_contracts OWNER TO postgres;

--
-- Name: link_type_registry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.link_type_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    source_record_type character varying(20) NOT NULL,
    target_record_type character varying(20) NOT NULL,
    label_en character varying(120) NOT NULL,
    label_hi character varying(120) NOT NULL,
    cardinality character varying(20) DEFAULT 'ONE_TO_MANY'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.link_type_registry OWNER TO postgres;

--
-- Name: fact_missing; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.fact_missing (
    sk bigint NOT NULL,
    source_record_id character varying(36) NOT NULL,
    source_updated_at timestamp with time zone,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    warehouse_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    district_sk integer,
    ps_sk integer,
    officer_sk integer,
    status_sk integer,
    workflow_status character varying(30),
    dd_no character varying(100),
    dd_date date,
    missing_name character varying(200),
    age integer,
    gender character varying(20),
    major_minor character varying(20),
    missing_date date,
    missing_place character varying(300),
    physical_description text,
    informant_name character varying(200),
    informant_mobile character varying(30),
    officer_name character varying(200),
    zipnet_no character varying(100),
    missing_status character varying(100),
    record_date date
);


ALTER TABLE rpt.fact_missing OWNER TO postgres;

--
-- Name: missing_master; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.missing_master AS
 SELECT m.source_record_id AS record_uid,
    m.district_sk AS district_id,
    m.ps_sk AS ps_id,
    'Submitted'::character varying AS submission_status,
        CASE
            WHEN (((m.missing_status)::text = 'Abandoned'::text) OR (((r.data)::jsonb ->> 'abandoned'::text) = 'true'::text)) THEN 2
            ELSE 1
        END AS category_id,
    m.dd_no AS dd_fir_ref_number,
    m.dd_date AS reference_entry_date,
    m.missing_name AS missing_person_name,
    (((r.data)::jsonb ->> 'missing_parent_name'::text))::character varying AS missing_person_parent_name,
    m.age AS age_approx,
        CASE
            WHEN ((m.gender)::text = 'Male'::text) THEN 'Male'::public.gender_type
            WHEN ((m.gender)::text = 'Female'::text) THEN 'Female'::public.gender_type
            WHEN ((m.gender)::text = 'Transgender'::text) THEN 'Transgender'::public.gender_type
            ELSE 'Unknown'::public.gender_type
        END AS gender,
    (((r.data)::jsonb ->> 'last_seen_address'::text))::character varying AS last_seen_address,
    (((r.data)::jsonb ->> 'found_place'::text))::character varying AS found_recovery_address,
    m.missing_date AS date_missing,
    (((r.data)::jsonb ->> 'found_date'::text))::date AS date_recovered,
    m.informant_name AS complainant_informant_name,
    m.informant_mobile,
    m.officer_name AS io_name,
        CASE
            WHEN ((((r.data)::jsonb ->> 'source'::text) = 'PCR'::text) OR (((r.data)::jsonb ->> 'pcr_call'::text) = 'true'::text)) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS pcr_call,
    (((r.data)::jsonb ->> 'height'::text))::character varying AS height,
    (((r.data)::jsonb ->> 'built'::text))::character varying AS built,
    (((r.data)::jsonb ->> 'complexion'::text))::character varying AS complexion,
    (((r.data)::jsonb ->> 'face'::text))::character varying AS face,
    (((r.data)::jsonb ->> 'hair'::text))::character varying AS hair,
    (((r.data)::jsonb ->> 'beard'::text))::character varying AS beard,
    (((r.data)::jsonb ->> 'mustaches'::text))::character varying AS mustaches,
    (((r.data)::jsonb ->> 'upper_dress_color'::text))::character varying AS upper_dress_color,
    (((r.data)::jsonb ->> 'lower_dress_color'::text))::character varying AS lower_dress_color,
    m.missing_status AS current_status,
        CASE
            WHEN (((r.data)::jsonb ->> 'case_registered'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS case_registered,
    ((r.data)::jsonb ->> 'remarks'::text) AS remarks,
    m.record_date AS diary_record_date,
    m.warehouse_loaded_at AS created_at,
    m.warehouse_updated_at AS updated_at
   FROM (rpt.fact_missing m
     JOIN public.records r ON (((m.source_record_id)::text = (r.id)::text)));


ALTER VIEW public.missing_master OWNER TO postgres;

--
-- Name: mv_record_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.mv_record_stats AS
 SELECT r.ps_id,
    ps.name_en AS ps_name,
    r.district_id,
    dist.name_en AS district_name,
    r.sub_div_id,
    r.record_type,
    r.current_status,
    r.record_date,
    count(*) AS record_count
   FROM ((public.records r
     JOIN public.hierarchy_nodes ps ON (((ps.id)::text = (r.ps_id)::text)))
     JOIN public.hierarchy_nodes dist ON (((dist.id)::text = (r.district_id)::text)))
  GROUP BY r.ps_id, ps.name_en, r.district_id, dist.name_en, r.sub_div_id, r.record_type, r.current_status, r.record_date
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.mv_record_stats OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id character varying(36) NOT NULL,
    title_en character varying(255) NOT NULL,
    title_hi character varying(255) NOT NULL,
    message_en text,
    message_hi text,
    user_id character varying(36) NOT NULL,
    record_id character varying(36),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: fact_pcr; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.fact_pcr (
    sk bigint NOT NULL,
    source_record_id character varying(36) NOT NULL,
    source_updated_at timestamp with time zone,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    warehouse_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    district_sk integer,
    ps_sk integer,
    officer_sk integer,
    crime_head_sk integer,
    status_sk integer,
    workflow_status character varying(30),
    pcr_no character varying(100),
    gd_no character varying(100),
    gd_date date,
    gd_time character varying(20),
    call_head character varying(255),
    call_gist text,
    caller_name character varying(200),
    caller_mobile character varying(30),
    officer_name character varying(200),
    arrival_time character varying(20),
    call_status character varying(100),
    record_date date
);


ALTER TABLE rpt.fact_pcr OWNER TO postgres;

--
-- Name: pcr_kalandra_master; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.pcr_kalandra_master AS
 SELECT p.source_record_id AS record_uid,
    p.district_sk AS district_id,
    p.ps_sk AS ps_id,
    'Submitted'::character varying AS submission_status,
    p.gd_no AS gd_entry_number,
    p.gd_date AS gd_entry_date,
    (COALESCE(p.gd_time, '12:00:00'::character varying))::time without time zone AS gd_entry_time,
    p.call_head AS pcr_call_category,
    p.caller_name AS complainant_caller_name,
    (((r.data)::jsonb ->> 'caller_address'::text))::character varying AS caller_address,
    p.call_gist AS pcr_dispatch_gist,
    p.officer_name AS responding_officer_name,
    p.officer_name AS enquiry_officer_name,
    ((r.data)::jsonb ->> 'action_taken'::text) AS action_taken_report,
    p.call_status AS final_call_status,
    p.record_date AS diary_record_date,
    p.warehouse_loaded_at AS created_at,
    p.warehouse_updated_at AS updated_at
   FROM (rpt.fact_pcr p
     JOIN public.records r ON (((p.source_record_id)::text = (r.id)::text)));


ALTER VIEW public.pcr_kalandra_master OWNER TO postgres;

--
-- Name: record_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.record_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    link_type_id uuid NOT NULL,
    source_record_id character varying(36) NOT NULL,
    target_record_id character varying(36) NOT NULL,
    metadata text DEFAULT '{}'::text,
    created_by character varying(36) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT record_links_no_self_link CHECK (((source_record_id)::text <> (target_record_id)::text))
);


ALTER TABLE public.record_links OWNER TO postgres;

--
-- Name: record_persons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.record_persons (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    person_type character varying(30) NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    mobile character varying(20),
    city character varying(100),
    district character varying(100),
    data jsonb DEFAULT '{}'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.record_persons OWNER TO postgres;

--
-- Name: record_properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.record_properties (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    major_category character varying(50),
    minor_category character varying(100),
    status character varying(20) DEFAULT 'Stolen'::character varying,
    details text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    uid text,
    fir_no text,
    extra_data jsonb,
    updated_at text
);


ALTER TABLE public.record_properties OWNER TO postgres;

--
-- Name: record_revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.record_revisions (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    revision_number integer NOT NULL,
    changed_by character varying(36) NOT NULL,
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    level character varying(20) DEFAULT 'PS'::character varying NOT NULL,
    change_type character varying(30) NOT NULL,
    field_changes text DEFAULT '[]'::text NOT NULL,
    comment text,
    reason text,
    ip_address character varying(45),
    prev_hash character varying(64),
    row_hash character varying(64)
);


ALTER TABLE public.record_revisions OWNER TO postgres;

--
-- Name: dim_act_law; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_act_law (
    sk integer NOT NULL,
    value_raw character varying(300) NOT NULL,
    value_normalized character varying(300) NOT NULL,
    is_unmapped boolean DEFAULT false NOT NULL,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_act_law OWNER TO postgres;

--
-- Name: ref_act_law; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_act_law AS
 SELECT sk AS act_law_id,
    (value_normalized)::character varying(50) AS act_code,
    (value_raw)::character varying(150) AS act_name
   FROM rpt.dim_act_law;


ALTER VIEW public.ref_act_law OWNER TO postgres;

--
-- Name: ref_arrest_section_category; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_arrest_section_category AS
 SELECT 1 AS section_category_id,
    'S_126_170_BNSS'::character varying(40) AS code,
    'Preventive BNSS'::character varying(100) AS label
UNION ALL
 SELECT 2 AS section_category_id,
    'S_40_EX'::character varying(40) AS code,
    'Excise'::character varying(100) AS label
UNION ALL
 SELECT 3 AS section_category_id,
    'S_92_93_97_DP'::character varying(40) AS code,
    'DP Act'::character varying(100) AS label;


ALTER VIEW public.ref_arrest_section_category OWNER TO postgres;

--
-- Name: dim_case_status; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_case_status (
    sk integer NOT NULL,
    record_type character varying(20) NOT NULL,
    value_raw character varying(100) NOT NULL,
    value_normalized character varying(100) NOT NULL,
    is_unmapped boolean DEFAULT false NOT NULL,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_case_status OWNER TO postgres;

--
-- Name: ref_arrest_status; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_arrest_status AS
 SELECT sk AS arrest_status_id,
    (value_normalized)::character varying(30) AS code,
    (value_raw)::character varying(80) AS label
   FROM rpt.dim_case_status
  WHERE ((record_type)::text = 'ARREST'::text);


ALTER VIEW public.ref_arrest_status OWNER TO postgres;

--
-- Name: ref_case_reg_type; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_case_reg_type AS
 SELECT 1 AS case_reg_type_id,
    'MANUAL_FIR'::character varying(30) AS code,
    'Manual FIR'::character varying(100) AS label
UNION ALL
 SELECT 2 AS case_reg_type_id,
    'E_THEFT'::character varying(30) AS code,
    'E-FIR Theft'::character varying(100) AS label
UNION ALL
 SELECT 3 AS case_reg_type_id,
    'E_MVT'::character varying(30) AS code,
    'E-FIR MVT'::character varying(100) AS label;


ALTER VIEW public.ref_case_reg_type OWNER TO postgres;

--
-- Name: ref_case_status; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_case_status AS
 SELECT sk AS case_status_id,
    (value_normalized)::character varying(40) AS code,
    value_raw AS label,
        CASE
            WHEN ((value_raw)::text = ANY ((ARRAY['Closed'::character varying, 'Chargesheeted'::character varying])::text[])) THEN true
            ELSE false
        END AS is_disposed
   FROM rpt.dim_case_status
  WHERE ((record_type)::text = 'CASE'::text);


ALTER VIEW public.ref_case_status OWNER TO postgres;

--
-- Name: dim_crime_head; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_crime_head (
    sk integer NOT NULL,
    value_raw character varying(255) NOT NULL,
    value_normalized character varying(255) NOT NULL,
    is_unmapped boolean DEFAULT false NOT NULL,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_crime_head OWNER TO postgres;

--
-- Name: ref_crime_head; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_crime_head AS
 SELECT sk AS crime_head_id,
    (value_normalized)::character varying(50) AS crime_head_code,
    (value_raw)::character varying(150) AS crime_head_name,
    (
        CASE
            WHEN ((value_raw)::text = ANY ((ARRAY['Burglary'::character varying, 'Night Burglary'::character varying, 'Day Burglary'::character varying])::text[])) THEN 'BURGLARY'::text
            WHEN ((value_raw)::text = 'House Theft'::text) THEN 'HOUSE_THEFT'::text
            WHEN ((value_raw)::text = ANY ((ARRAY['Other Theft'::character varying, 'Theft In Shop'::character varying, 'Servant Theft'::character varying, 'Stereo Theft'::character varying, 'Cattle Theft'::character varying, 'M.V. Accessories Theft'::character varying])::text[])) THEN 'OTHER_THEFT'::text
            WHEN ((value_raw)::text = 'M.V. Theft'::text) THEN 'MVT'::text
            ELSE NULL::text
        END)::character varying(20) AS theft_category
   FROM rpt.dim_crime_head;


ALTER VIEW public.ref_crime_head OWNER TO postgres;

--
-- Name: dim_district; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_district (
    sk integer NOT NULL,
    source_district_id character varying(36) NOT NULL,
    name_en character varying(120) NOT NULL,
    name_hi character varying(120) DEFAULT ''::character varying NOT NULL,
    code character varying(30),
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_district OWNER TO postgres;

--
-- Name: ref_district; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_district AS
 SELECT sk AS district_id,
    (name_en)::character varying(100) AS district_name
   FROM rpt.dim_district;


ALTER VIEW public.ref_district OWNER TO postgres;

--
-- Name: ref_missing_category; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_missing_category AS
 SELECT 1 AS category_id,
    'MISSING'::character varying(30) AS code,
    'Missing Person'::character varying(100) AS label
UNION ALL
 SELECT 2 AS category_id,
    'ABANDONED_UNCONSCIOUS'::character varying(30) AS code,
    'Abandoned / Unconscious'::character varying(100) AS label;


ALTER VIEW public.ref_missing_category OWNER TO postgres;

--
-- Name: dim_police_station; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_police_station (
    sk integer NOT NULL,
    source_ps_id character varying(36) NOT NULL,
    name_en character varying(120) NOT NULL,
    name_hi character varying(120) DEFAULT ''::character varying NOT NULL,
    code character varying(30),
    district_sk integer NOT NULL,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_police_station OWNER TO postgres;

--
-- Name: ref_police_station; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_police_station AS
 SELECT sk AS ps_id,
    district_sk AS district_id,
    (name_en)::character varying(150) AS ps_name
   FROM rpt.dim_police_station;


ALTER VIEW public.ref_police_station OWNER TO postgres;

--
-- Name: ref_special_scheme; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.ref_special_scheme AS
 SELECT 1 AS scheme_id,
    'INTEGRATED_PI'::character varying(40) AS code,
    'INTEGRATED PI'::character varying(100) AS label
UNION ALL
 SELECT 2 AS scheme_id,
    'GROUP_PATROLLING'::character varying(40) AS code,
    'GROUP PATROLLING'::character varying(100) AS label
UNION ALL
 SELECT 3 AS scheme_id,
    'CYCLE_PATROLLING'::character varying(40) AS code,
    'CYCLE PATROLLING'::character varying(100) AS label
UNION ALL
 SELECT 4 AS scheme_id,
    'ANTI_SNATCHING'::character varying(40) AS code,
    'ANTI SNATCHING'::character varying(100) AS label
UNION ALL
 SELECT 5 AS scheme_id,
    'PRAHARI'::character varying(40) AS code,
    'PRAHARI'::character varying(100) AS label
UNION ALL
 SELECT 6 AS scheme_id,
    'EYES_EARS'::character varying(40) AS code,
    'EYES EARS'::character varying(100) AS label;


ALTER VIEW public.ref_special_scheme OWNER TO postgres;

--
-- Name: report_builder_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_builder_audit (
    id character varying(36) NOT NULL,
    user_id character varying(36),
    user_role character varying(50),
    run_type character varying(20) NOT NULL,
    table_spec text,
    fields_spec text,
    filter_spec text,
    format character varying(10),
    row_count integer,
    job_id character varying(36),
    ip_address character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.report_builder_audit OWNER TO postgres;

--
-- Name: report_builder_saved; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_builder_saved (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    query_spec text NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    created_by character varying(36) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.report_builder_saved OWNER TO postgres;

--
-- Name: report_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_jobs (
    id character varying(36) NOT NULL,
    template_id character varying(36),
    filters text,
    format character varying(10),
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    file_path text,
    created_by character varying(36) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    custom_definition text,
    error_message text
);


ALTER TABLE public.report_jobs OWNER TO postgres;

--
-- Name: report_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_templates (
    id character varying(36) NOT NULL,
    name_en character varying(255) NOT NULL,
    name_hi character varying(255) NOT NULL,
    applicable_record_types text NOT NULL,
    applicable_levels text NOT NULL,
    template_definition text NOT NULL,
    output_formats text,
    is_active boolean DEFAULT true NOT NULL,
    created_by character varying(36),
    created_at timestamp with time zone,
    template_type character varying(50) DEFAULT 'PROFORMA'::character varying NOT NULL
);


ALTER TABLE public.report_templates OWNER TO postgres;

--
-- Name: rpt_01_manual_fir; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_01_manual_fir AS
 SELECT row_number() OVER (PARTITION BY f.diary_record_date, f.ps_id ORDER BY f.fir_number) AS "S.N.",
    ps.ps_name AS "P.S.",
    f.fir_number AS "FIR NO.",
    f.sections AS "U/S",
    f.complainant_name AS "NAME OF COMPLAINANT",
    f.complainant_parent_name AS "FATHER/ HUSBAND NAME OF COMPLAINANT",
    f.complainant_address AS "ADDRESS OF COMPLAINANT",
    f.date_of_occurrence,
    (f.time_of_occurrence)::text AS "TIME OF OCCURRENCE",
    f.place_of_occurrence AS "PLACE OF OCCURRENCE",
    f.brief_facts AS "GIST",
    f.io_name AS "IO NAME",
    f.ps_id,
    f.district_id,
    f.diary_record_date
   FROM (public.fir_master f
     JOIN public.ref_police_station ps ON ((ps.ps_id = f.ps_id)))
  WHERE (f.case_reg_type_id = 1);


ALTER VIEW public.rpt_01_manual_fir OWNER TO postgres;

--
-- Name: rpt_02_e_burglary_cases; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_02_e_burglary_cases AS
 SELECT row_number() OVER (PARTITION BY f.diary_record_date, f.ps_id ORDER BY f.fir_number) AS "SR. NO.",
    ps.ps_name AS "P.S.",
    f.fir_number AS "E-FIR NO.",
    f.sections AS "U/S",
    f.complainant_name AS "NAME OF COMPLAINANT",
    f.complainant_parent_name AS "FATHER/ HUSBAND NAME OF COMPLAINANT",
    f.complainant_address AS "ADDRESS OF COMPLAINANT",
    f.date_of_occurrence,
    (f.time_of_occurrence)::text AS "TIME OF OCCURRENCE",
    f.stolen_property_desc AS "STOLEN ITEMS",
    f.place_of_occurrence AS "PLACE OF OCCURRENCE",
    f.io_name AS "IO NAME",
    f.io_mobile_no AS "IO MOBILE NO.",
    f.beat_no AS "BEAT NO.",
    f.ps_id,
    f.district_id,
    f.diary_record_date
   FROM ((public.fir_master f
     JOIN public.ref_police_station ps ON ((ps.ps_id = f.ps_id)))
     JOIN public.ref_crime_head ch ON ((ch.crime_head_id = f.crime_head_id)))
  WHERE ((ch.theft_category)::text = 'BURGLARY'::text);


ALTER VIEW public.rpt_02_e_burglary_cases OWNER TO postgres;

--
-- Name: rpt_03_e_house_theft_cases; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_03_e_house_theft_cases AS
 SELECT row_number() OVER (PARTITION BY f.diary_record_date, f.ps_id ORDER BY f.fir_number) AS "SR. NO.",
    ps.ps_name AS "P.S.",
    f.fir_number AS "E-FIR NO.",
    f.sections AS "U/S",
    f.complainant_name AS "NAME OF COMPLAINANT",
    f.complainant_parent_name AS "FATHER/ HUSBAND NAME OF COMPLAINANT",
    f.complainant_address AS "ADDRESS OF COMPLAINANT",
    f.date_of_occurrence,
    (f.time_of_occurrence)::text AS "TIME OF OCCURRENCE",
    f.stolen_property_desc AS "STOLEN ITEMS",
    f.place_of_occurrence AS "PLACE OF OCCURRENCE",
    f.io_name AS "IO NAME",
    f.io_mobile_no AS "IO MOBILE NO.",
    f.beat_no AS "BEAT NO.",
    f.ps_id,
    f.district_id,
    f.diary_record_date
   FROM ((public.fir_master f
     JOIN public.ref_police_station ps ON ((ps.ps_id = f.ps_id)))
     JOIN public.ref_crime_head ch ON ((ch.crime_head_id = f.crime_head_id)))
  WHERE ((ch.theft_category)::text = 'HOUSE_THEFT'::text);


ALTER VIEW public.rpt_03_e_house_theft_cases OWNER TO postgres;

--
-- Name: rpt_04_e_other_theft_cases; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_04_e_other_theft_cases AS
 SELECT row_number() OVER (PARTITION BY f.diary_record_date, f.ps_id ORDER BY f.fir_number) AS "SR. NO.",
    ps.ps_name AS "P.S.",
    f.fir_number AS "E-FIR NO.",
    f.sections AS "U/S",
    f.complainant_name AS "NAME OF COMPLAINANT",
    f.complainant_parent_name AS "FATHER/ HUSBAND NAME OF COMPLAINANT",
    f.complainant_address AS "ADDRESS OF COMPLAINANT",
    f.date_of_occurrence,
    (f.time_of_occurrence)::text AS "TIME OF OCCURRENCE",
    f.stolen_property_desc AS "STOLEN ITEMS",
    f.place_of_occurrence AS "PLACE OF OCCURRENCE",
    f.io_name AS "IO NAME",
    f.io_mobile_no AS "IO MOBILE NO.",
    f.beat_no AS "BEAT NO.",
    f.ps_id,
    f.district_id,
    f.diary_record_date
   FROM ((public.fir_master f
     JOIN public.ref_police_station ps ON ((ps.ps_id = f.ps_id)))
     JOIN public.ref_crime_head ch ON ((ch.crime_head_id = f.crime_head_id)))
  WHERE ((ch.theft_category)::text = 'OTHER_THEFT'::text);


ALTER VIEW public.rpt_04_e_other_theft_cases OWNER TO postgres;

--
-- Name: rpt_05_mvt_cases; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_05_mvt_cases AS
 SELECT row_number() OVER (PARTITION BY f.diary_record_date, f.ps_id ORDER BY f.fir_number) AS "SR.",
    ps.ps_name AS "P.S.",
    f.fir_number AS "FIR NO.",
    f.sections AS "U/S",
    f.complainant_name AS "NAME OF COMPLAINANT",
    f.complainant_parent_name AS "FATHER/ HUSBAND NAME OF COMPLAINANT",
    f.complainant_address AS "ADDRESS OF COMPLAINANT",
    f.date_of_occurrence AS "DATE OF OCCURRENCE",
    (f.time_of_occurrence)::text AS "TIME OF OCCURRENCE",
    f.vehicle_no AS "VEHICLE NO.",
    f.vehicle_type AS "VEHICLE TYPE",
    f.place_of_occurrence AS "PLACE OF OCCURRENCE",
    f.io_name AS "IO NAME",
    f.io_mobile_no AS "IO MOBILE NO.",
    f.beat_no AS "BEAT NO.",
    f.ps_id,
    f.district_id,
    f.diary_record_date
   FROM ((public.fir_master f
     JOIN public.ref_police_station ps ON ((ps.ps_id = f.ps_id)))
     JOIN public.ref_crime_head ch ON ((ch.crime_head_id = f.crime_head_id)))
  WHERE ((ch.theft_category)::text = 'MVT'::text);


ALTER VIEW public.rpt_05_mvt_cases OWNER TO postgres;

--
-- Name: rpt_07_arrested_east_district; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_07_arrested_east_district AS
 SELECT row_number() OVER (PARTITION BY a.diary_record_date ORDER BY a.fir_dd_no, a.arrestee_name) AS "S.N.",
    a.fir_dd_no AS "FIR NO.",
    a.sections AS "U/S",
    a.arrestee_name AS "NAME ",
    a.arrestee_parent_name AS "FATHER/ HUSBAND NAME ",
    a.arrestee_address AS "ADDRESS ",
    a.arrestee_age AS "AGE",
    a.io_name AS "NAME OF IO",
    a.custody_status AS "PC/JC/BAIL",
    a.prev_involvement_count AS "PREV. INVOLVEMENT (NO. OF CASES)",
    a.seizure_desc AS "RECOVERY",
    a.is_bc AS "WHETHER ACCUSED IS BC OR NOT",
        CASE
            WHEN (a.special_scheme_id = 1) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "INTEGRATED PI",
        CASE
            WHEN (a.special_scheme_id = 2) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "GROUP PATROLLING",
        CASE
            WHEN (a.special_scheme_id = 3) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "CYCLE PATROLLING",
        CASE
            WHEN (a.special_scheme_id = 4) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY ANTI-SNATCHING TEAM",
        CASE
            WHEN (a.special_scheme_id = 5) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY PRAHARI",
        CASE
            WHEN (a.special_scheme_id = 6) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY EYES & EARS SCHEME MEMBERS",
    a.ps_id,
    a.district_id,
    a.diary_record_date
   FROM ((public.arrest_master a
     JOIN public.ref_police_station ps ON ((ps.ps_id = a.ps_id)))
     JOIN public.ref_district d ON ((d.district_id = ps.district_id)));


ALTER VIEW public.rpt_07_arrested_east_district OWNER TO postgres;

--
-- Name: rpt_08_arrested_kalandara; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_08_arrested_kalandara AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY fir_dd_no) AS "S.N.",
    fir_dd_no AS "FIR/DD NO.",
    sections AS "Under section (U/S)",
    arrestee_name AS "NAME ",
    arrestee_parent_name AS "FATHER/ HUSBAND NAME ",
    arrestee_address AS "ADDRESS ",
    arrestee_age AS "AGE",
    place_of_arrest AS "PLACE OF OCCURRENCE",
    io_name AS "IO",
    custody_status AS "BAIL",
    prev_involvement_count AS "PREV. INVOLVEMENT",
    seizure_desc AS "RECOVERY",
    is_bc AS "WHETHER ACCUSED IS BC OR NOT",
        CASE
            WHEN (special_scheme_id = 1) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "INTEGRATED PICK",
        CASE
            WHEN (special_scheme_id = 2) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "GROUP PATROLLING",
        CASE
            WHEN (special_scheme_id = 3) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "CYCLE PATROLLING",
        CASE
            WHEN (special_scheme_id = 4) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY ANTI-SNATCHING TEAM",
        CASE
            WHEN (special_scheme_id = 5) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY PRAHARI",
        CASE
            WHEN (special_scheme_id = 6) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY EYES & EARS SCHEME MEMBERS",
    ps_id,
    district_id,
    diary_record_date
   FROM public.arrest_master a
  WHERE (section_category_id = 1);


ALTER VIEW public.rpt_08_arrested_kalandara OWNER TO postgres;

--
-- Name: rpt_09_arrested_efir_theft; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_09_arrested_efir_theft AS
 SELECT row_number() OVER (PARTITION BY a.diary_record_date, a.ps_id ORDER BY a.fir_dd_no) AS "S.N.",
    COALESCE(a.fir_dd_no, fm.fir_number) AS "FIR/DD NO.",
    a.sections AS "U/S",
    a.arrestee_name AS "NAME ",
    a.arrestee_parent_name AS "FATHER/ HUSBAND NAME ",
    a.arrestee_address AS "ADDRESS ",
    a.arrestee_age AS "AGE",
    a.io_name AS "NAME OF IO",
    a.custody_status AS "PC/JC/BAIL",
    a.prev_involvement_count AS "PREV. INVOLVEMENT (NO. OF CASES) HEAD",
    a.seizure_desc AS "RECOVERY",
    a.is_bc AS "WHETHER ACCUSED IS BC OR NOT",
        CASE
            WHEN (a.special_scheme_id = 2) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "GROUP ROLLING",
        CASE
            WHEN (a.special_scheme_id = 3) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "CYCLE PATROLLING",
        CASE
            WHEN (a.special_scheme_id = 4) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY ANTI-SNATCHING TEAM",
        CASE
            WHEN (a.special_scheme_id = 5) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY PRAHARI",
        CASE
            WHEN (a.special_scheme_id = 6) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY EYES & EARS SCHEME MEMBERS",
    a.ps_id,
    a.district_id,
    a.diary_record_date
   FROM (public.arrest_master a
     LEFT JOIN public.fir_master fm ON (((fm.record_uid)::text = (a.linked_fir_record_uid)::text)))
  WHERE (fm.case_reg_type_id = 2);


ALTER VIEW public.rpt_09_arrested_efir_theft OWNER TO postgres;

--
-- Name: rpt_10_arrested_efir_mv_theft; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_10_arrested_efir_mv_theft AS
 SELECT COALESCE(a.fir_dd_no, fm.fir_number) AS "FIR NO.",
    a.sections AS "U/S",
    a.arrestee_name AS "NAME ",
    a.arrestee_parent_name AS "FATHER/ HUSBAND NAME ",
    a.arrestee_address AS "ADDRESS ",
    a.arrestee_age AS "AGE",
    a.io_name AS "NAME OF IO",
    a.custody_status AS "PC/JC/BAIL",
    a.prev_involvement_count AS "PREV. INVOLVEMENT",
    a.seizure_desc AS "RECOVERY",
    a.is_bc AS "WHETHER ACCUSED IS BC OR NOT",
        CASE
            WHEN (a.special_scheme_id = 2) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "GROUP PATROLLING",
        CASE
            WHEN (a.special_scheme_id = 3) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "CYCLE PATROLLING",
        CASE
            WHEN (a.special_scheme_id = 4) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY ANTI-SNATCHING TEAM",
        CASE
            WHEN (a.special_scheme_id = 5) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY PRAHARI",
        CASE
            WHEN (a.special_scheme_id = 6) THEN 'Yes'::text
            ELSE 'No'::text
        END AS "BY EYES & EARS SCHEME MEMBERS",
    a.ps_id,
    a.district_id,
    a.diary_record_date
   FROM (public.arrest_master a
     LEFT JOIN public.fir_master fm ON (((fm.record_uid)::text = (a.linked_fir_record_uid)::text)))
  WHERE (fm.case_reg_type_id = 3);


ALTER VIEW public.rpt_10_arrested_efir_mv_theft OWNER TO postgres;

--
-- Name: rpt_11_proclaimed_offenders; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_11_proclaimed_offenders AS
 SELECT row_number() OVER (PARTITION BY a.diary_record_date, a.ps_id ORDER BY a.arrestee_name) AS "S.N.",
    ps.ps_name AS "P.S.",
    a.fir_dd_no AS "DD NO./FIR NO.",
    a.sections AS "U/S",
    a.arrestee_name AS "DETAILS OF PO – NAME",
    a.arrestee_parent_name AS "DETAILS OF PO – PARENTAL",
    a.arrestee_address AS "DETAILS OF PO –  ADDRESS",
    a.po_case_reference AS "CASE IN WHICH DECLARED PO",
    a.po_declared_court AS "NAME OF COURT WHICH DECLARED PO",
    a.ps_id,
    a.district_id,
    a.diary_record_date
   FROM (public.arrest_master a
     JOIN public.ref_police_station ps ON ((ps.ps_id = a.ps_id)))
  WHERE (a.is_po = 'Yes'::public.yes_no_type);


ALTER VIEW public.rpt_11_proclaimed_offenders OWNER TO postgres;

--
-- Name: rpt_13_arrested_24hrs_list; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_13_arrested_24hrs_list AS
 SELECT row_number() OVER (PARTITION BY a.diary_record_date, a.ps_id ORDER BY a.date_of_arrest, a.arrestee_name) AS "S. NO.",
    a.arrestee_name AS "NAME / NICK NAME",
    a.arrestee_parent_name AS "FATHER NAME/HUSBAND NAME",
    a.arrestee_address AS "ADDRESS",
    a.arrestee_age AS "AGE",
    a.fir_dd_no AS "FIR/DD NO.",
    a.date_of_arrest,
    a.sections AS "U/S",
    ps.ps_name AS "POLICE STATION",
    a.io_name AS "NAME OF IO",
    a.io_rank AS "RANK OF IO",
    a.io_mobile_no AS "MOBILE NO. OF IO",
    a.custody_status AS "REMARKS (PC REMAND / FORMAL ARREST / BAIL ETC.)",
    a.ps_id,
    a.district_id,
    a.diary_record_date
   FROM (public.arrest_master a
     JOIN public.ref_police_station ps ON ((ps.ps_id = a.ps_id)));


ALTER VIEW public.rpt_13_arrested_24hrs_list OWNER TO postgres;

--
-- Name: rpt_18_missing_persons; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_18_missing_persons AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY reference_entry_date) AS "S.NO.",
    dd_fir_ref_number AS "DD NO.",
    reference_entry_date AS "DD DATE",
    complainant_informant_name AS "NAME OF OPERATOR TO WHOM MPS",
    missing_person_name AS "NAME OF MISSING PERSON",
    last_seen_address AS "ADDRESS OF MISSING PERSON",
    date_missing AS "MISSING DATE",
    age_approx AS "AGE",
    height AS "HEIGHT",
    built AS "BUILT",
    complexion AS "COMPLEXION",
    face AS "FACE",
    hair AS "HAIR",
    beard AS "BEARD",
    mustaches AS "MUSTACHES",
    upper_dress_color AS "UPPER DRESS COLOR",
    lower_dress_color AS "LOWER DRESS COLOR",
    io_name AS "NAME OF I.O.",
    ps_id,
    district_id,
    diary_record_date
   FROM public.missing_master m
  WHERE (category_id = 1);


ALTER VIEW public.rpt_18_missing_persons OWNER TO postgres;

--
-- Name: fact_uidb; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.fact_uidb (
    sk bigint NOT NULL,
    source_record_id character varying(36) NOT NULL,
    source_updated_at timestamp with time zone,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    warehouse_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ps_id character varying(36) NOT NULL,
    district_id character varying(36) NOT NULL,
    sub_div_id character varying(36),
    district_sk integer,
    ps_sk integer,
    officer_sk integer,
    status_sk integer,
    workflow_status character varying(30),
    dd_no character varying(100),
    found_date date,
    found_place character varying(300),
    gender character varying(20),
    approx_age character varying(50),
    approx_age_num integer,
    description text,
    officer_name character varying(200),
    informant_name character varying(200),
    zipnet_no character varying(100),
    identified boolean,
    uidb_status character varying(300),
    record_date date
);


ALTER TABLE rpt.fact_uidb OWNER TO postgres;

--
-- Name: uidb_master; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.uidb_master AS
 SELECT u.source_record_id AS record_uid,
    u.district_sk AS district_id,
    u.ps_sk AS ps_id,
    'Submitted'::character varying AS submission_status,
    (((r.data)::jsonb ->> 'uidb_gazette_number'::text))::character varying AS uidb_gazette_number,
    u.dd_no AS dd_number,
    COALESCE((((r.data)::jsonb ->> 'dd_date'::text))::date, u.found_date) AS dd_date,
    (((r.data)::jsonb ->> 'inquest_sections'::text))::character varying AS inquest_sections,
    (((r.data)::jsonb ->> 'name_of_deceased'::text))::character varying AS name_of_deceased,
    (((r.data)::jsonb ->> 'deceased_parent_name'::text))::character varying AS deceased_parent_name,
    (((r.data)::jsonb ->> 'address_of_deceased'::text))::character varying AS address_of_deceased,
    u.found_place,
    u.found_date AS discovery_date,
    (((r.data)::jsonb ->> 'duty_officer'::text))::character varying AS duty_officer,
    u.officer_name AS io_name,
    (((r.data)::jsonb ->> 'io_mobile'::text))::character varying AS io_mobile_no,
    u.informant_name,
    (((r.data)::jsonb ->> 'informant_mobile'::text))::character varying AS informant_mobile,
        CASE
            WHEN ((u.gender)::text = 'Male'::text) THEN 'Male'::public.gender_type
            WHEN ((u.gender)::text = 'Female'::text) THEN 'Female'::public.gender_type
            WHEN ((u.gender)::text = 'Transgender'::text) THEN 'Transgender'::public.gender_type
            ELSE 'Unknown'::public.gender_type
        END AS gender,
    u.approx_age_num AS estimated_age,
    (((r.data)::jsonb ->> 'height'::text))::character varying AS height,
    (((r.data)::jsonb ->> 'built'::text))::character varying AS built,
    (((r.data)::jsonb ->> 'complexion'::text))::character varying AS complexion,
    (((r.data)::jsonb ->> 'face'::text))::character varying AS face,
    (((r.data)::jsonb ->> 'hair'::text))::character varying AS hair,
    (((r.data)::jsonb ->> 'beard'::text))::character varying AS beard,
    (((r.data)::jsonb ->> 'mustaches'::text))::character varying AS mustaches,
    (((r.data)::jsonb ->> 'upper_dress_color'::text))::character varying AS upper_dress_color,
    (((r.data)::jsonb ->> 'lower_dress_color'::text))::character varying AS lower_dress_color,
    ((r.data)::jsonb ->> 'identification_marks'::text) AS identification_marks,
    u.zipnet_no,
        CASE
            WHEN (u.identified = true) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS body_identified,
    (((r.data)::jsonb ->> 'cause_of_death'::text))::character varying AS cause_of_death,
        CASE
            WHEN (((r.data)::jsonb ->> 'filed_by_acp_sdm'::text) = 'true'::text) THEN 'Yes'::public.yes_no_type
            ELSE 'No'::public.yes_no_type
        END AS filed_by_acp_sdm,
    (((r.data)::jsonb ->> 'date_filed_acp_sdm'::text))::date AS date_filed_acp_sdm,
    ((r.data)::jsonb ->> 'current_status_mortuary_remarks'::text) AS current_status_mortuary_remarks,
    u.record_date AS diary_record_date,
    u.warehouse_loaded_at AS created_at,
    u.warehouse_updated_at AS updated_at
   FROM (rpt.fact_uidb u
     JOIN public.records r ON (((u.source_record_id)::text = (r.id)::text)));


ALTER VIEW public.uidb_master OWNER TO postgres;

--
-- Name: rpt_19_uidb; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_19_uidb AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY discovery_date) AS "S.NO.",
    dd_number AS "DD NO.",
    dd_date AS "DD DATE",
    found_place AS "FOUND PLACE",
    discovery_date AS "FOUND DATE",
    gender AS "SEX",
    estimated_age AS "AGE",
    height AS "HEIGHT",
    built AS "BUILT",
    complexion AS "COMPLEXION",
    face AS "FACE",
    hair AS "HAIR",
    beard AS "BEARD",
    mustaches AS "MUSTACHES",
    upper_dress_color AS "UPPER DRESS COLOR",
    lower_dress_color AS "LOWER DRESS COLOR",
    io_name AS "NAME OF I.O.",
    ps_id,
    district_id,
    diary_record_date
   FROM public.uidb_master u;


ALTER VIEW public.rpt_19_uidb OWNER TO postgres;

--
-- Name: rpt_20_abandoned_persons; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_20_abandoned_persons AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY reference_entry_date) AS "S.NO.",
    dd_fir_ref_number AS "DD NO.",
    reference_entry_date,
    found_recovery_address AS "FOUND PLACE",
    date_recovered AS "FOUND DATE",
    gender AS "SEX",
    age_approx AS "AGE",
    height AS "HEIGHT",
    built AS "BUILT",
    complexion AS "COMPLEXION",
    face AS "FACE",
    hair AS "HAIR",
    beard AS "BEARD",
    mustaches AS "MUSTACHES",
    upper_dress_color AS "UPPER DRESS COLOR",
    lower_dress_color AS "LOWER DRESS COLOR",
    io_name AS "NAME OF I.O.",
    ps_id,
    district_id,
    diary_record_date
   FROM public.missing_master m
  WHERE (category_id = 2);


ALTER VIEW public.rpt_20_abandoned_persons OWNER TO postgres;

--
-- Name: rpt_21_traced_persons; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_21_traced_persons AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY date_recovered) AS "S.NO.",
    dd_fir_ref_number AS "DD NO.",
    reference_entry_date AS "DD DATE",
    complainant_informant_name AS "NAME OF OPERATOR TO WHOM MPS",
    missing_person_name AS "NAME OF TRACED PERSON",
    missing_person_parent_name AS "FATHER/HUSBAND NAME OF TRACED PERSON",
    last_seen_address AS "ADDRESS OF TRACED PERSON",
    io_name AS "NAME OF I.O.",
    ps_id,
    district_id,
    diary_record_date
   FROM public.missing_master m
  WHERE ((current_status)::text = 'Traced'::text);


ALTER VIEW public.rpt_21_traced_persons OWNER TO postgres;

--
-- Name: rpt_25_inquest_registered; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_25_inquest_registered AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY discovery_date) AS "S.N.",
    dd_number AS "DD NO.",
    dd_date AS "DATE",
    inquest_sections AS "U/S",
    name_of_deceased AS "NAME OF DECEASED",
    deceased_parent_name AS "FATHER/HUSBAND NAME OF DECEASED",
    address_of_deceased AS "ADDRESS OF DECEASED",
    gender AS "SEX",
    estimated_age AS "AGE",
    cause_of_death AS "CAUSE OF DEATH",
    found_place AS "PLACE OF OCCURRENCE",
    io_name AS "IO",
    ps_id,
    district_id,
    diary_record_date
   FROM public.uidb_master u;


ALTER VIEW public.rpt_25_inquest_registered OWNER TO postgres;

--
-- Name: rpt_26_inquest_acp_sdm_disposal; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.rpt_26_inquest_acp_sdm_disposal AS
 SELECT row_number() OVER (PARTITION BY diary_record_date, ps_id ORDER BY date_filed_acp_sdm) AS "S.NO.",
    dd_number AS "DD NO.",
    dd_date AS "DATE",
    inquest_sections AS "U/S",
    name_of_deceased AS "NAME OF DECEASED",
    deceased_parent_name AS "FATHER/HUSBAND NAME OF DECEASED",
    address_of_deceased AS "ADDRESS OF DECEASED",
    gender AS "SEX",
    estimated_age AS "AGE",
    cause_of_death AS "CAUSE OF DEATH",
    date_filed_acp_sdm AS "DATE OF FILED BY ACP/SDM",
    ps_id,
    district_id,
    diary_record_date
   FROM public.uidb_master u
  WHERE (filed_by_acp_sdm = 'Yes'::public.yes_no_type);


ALTER VIEW public.rpt_26_inquest_acp_sdm_disposal OWNER TO postgres;

--
-- Name: scheduled_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_reports (
    id character varying(36) NOT NULL,
    template_id character varying(36) NOT NULL,
    cron_expr character varying(50) NOT NULL,
    filter_spec text DEFAULT '{}'::text NOT NULL,
    format character varying(10) DEFAULT 'PDF'::character varying NOT NULL,
    scope_ps_id character varying(36),
    scope_district_id character varying(36),
    recipients text DEFAULT '[]'::text NOT NULL,
    created_by character varying(36),
    is_active boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    last_run_status character varying(30),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scheduled_reports OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying(36) NOT NULL,
    username character varying(50) NOT NULL,
    badge_no character varying(50) NOT NULL,
    name_en character varying(100) NOT NULL,
    name_hi character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    station_id character varying(36),
    district_id character varying(36),
    sub_div_id character varying(36),
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: workflow_transitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_transitions (
    id character varying(36) NOT NULL,
    record_id character varying(36) NOT NULL,
    from_level character varying(20),
    to_level character varying(20),
    from_status character varying(30),
    to_status character varying(30) NOT NULL,
    action character varying(30) NOT NULL,
    performed_by character varying(36) NOT NULL,
    performed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    comment text,
    target_fields text
);


ALTER TABLE public.workflow_transitions OWNER TO postgres;

--
-- Name: workflow_transitions_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_transitions_config (
    id character varying(36) NOT NULL,
    record_type character varying(30) DEFAULT '*'::character varying NOT NULL,
    from_status character varying(30) NOT NULL,
    to_status character varying(30) NOT NULL,
    action character varying(30) NOT NULL,
    allowed_roles text NOT NULL,
    requires_comment boolean DEFAULT false NOT NULL,
    sla_hours integer,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.workflow_transitions_config OWNER TO postgres;

--
-- Name: bridge_fir_arrest_id_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.bridge_fir_arrest_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.bridge_fir_arrest_id_seq OWNER TO postgres;

--
-- Name: bridge_fir_arrest_id_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.bridge_fir_arrest_id_seq OWNED BY rpt.bridge_fir_arrest.id;


--
-- Name: bridge_fir_missing; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.bridge_fir_missing (
    id bigint NOT NULL,
    fir_sk bigint NOT NULL,
    missing_sk bigint NOT NULL,
    link_type character varying(30) DEFAULT 'GD_NO_MATCH'::character varying NOT NULL,
    linked_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.bridge_fir_missing OWNER TO postgres;

--
-- Name: bridge_fir_missing_id_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.bridge_fir_missing_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.bridge_fir_missing_id_seq OWNER TO postgres;

--
-- Name: bridge_fir_missing_id_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.bridge_fir_missing_id_seq OWNED BY rpt.bridge_fir_missing.id;


--
-- Name: dim_act_law_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_act_law_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_act_law_sk_seq OWNER TO postgres;

--
-- Name: dim_act_law_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_act_law_sk_seq OWNED BY rpt.dim_act_law.sk;


--
-- Name: dim_case_status_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_case_status_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_case_status_sk_seq OWNER TO postgres;

--
-- Name: dim_case_status_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_case_status_sk_seq OWNED BY rpt.dim_case_status.sk;


--
-- Name: dim_crime_head_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_crime_head_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_crime_head_sk_seq OWNER TO postgres;

--
-- Name: dim_crime_head_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_crime_head_sk_seq OWNED BY rpt.dim_crime_head.sk;


--
-- Name: dim_district_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_district_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_district_sk_seq OWNER TO postgres;

--
-- Name: dim_district_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_district_sk_seq OWNED BY rpt.dim_district.sk;


--
-- Name: dim_officer; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.dim_officer (
    sk integer NOT NULL,
    name_raw character varying(200) NOT NULL,
    name_normalized character varying(200) NOT NULL,
    is_unmapped boolean DEFAULT false NOT NULL,
    warehouse_loaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE rpt.dim_officer OWNER TO postgres;

--
-- Name: dim_officer_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_officer_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_officer_sk_seq OWNER TO postgres;

--
-- Name: dim_officer_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_officer_sk_seq OWNED BY rpt.dim_officer.sk;


--
-- Name: dim_police_station_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.dim_police_station_sk_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.dim_police_station_sk_seq OWNER TO postgres;

--
-- Name: dim_police_station_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.dim_police_station_sk_seq OWNED BY rpt.dim_police_station.sk;


--
-- Name: fact_arrest_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.fact_arrest_sk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.fact_arrest_sk_seq OWNER TO postgres;

--
-- Name: fact_arrest_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.fact_arrest_sk_seq OWNED BY rpt.fact_arrest.sk;


--
-- Name: fact_fir_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.fact_fir_sk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.fact_fir_sk_seq OWNER TO postgres;

--
-- Name: fact_fir_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.fact_fir_sk_seq OWNED BY rpt.fact_fir.sk;


--
-- Name: fact_missing_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.fact_missing_sk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.fact_missing_sk_seq OWNER TO postgres;

--
-- Name: fact_missing_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.fact_missing_sk_seq OWNED BY rpt.fact_missing.sk;


--
-- Name: fact_pcr_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.fact_pcr_sk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.fact_pcr_sk_seq OWNER TO postgres;

--
-- Name: fact_pcr_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.fact_pcr_sk_seq OWNED BY rpt.fact_pcr.sk;


--
-- Name: fact_uidb_sk_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.fact_uidb_sk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.fact_uidb_sk_seq OWNER TO postgres;

--
-- Name: fact_uidb_sk_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.fact_uidb_sk_seq OWNED BY rpt.fact_uidb.sk;


--
-- Name: sync_log; Type: TABLE; Schema: rpt; Owner: postgres
--

CREATE TABLE rpt.sync_log (
    id integer NOT NULL,
    source_table character varying(30) NOT NULL,
    run_started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    run_completed_at timestamp with time zone,
    watermark_from timestamp with time zone,
    watermark_to timestamp with time zone,
    rows_scanned integer DEFAULT 0 NOT NULL,
    rows_upserted integer DEFAULT 0 NOT NULL,
    rows_failed integer DEFAULT 0 NOT NULL,
    bridges_updated integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'RUNNING'::character varying NOT NULL,
    error_rows text DEFAULT '[]'::text NOT NULL,
    notes text
);


ALTER TABLE rpt.sync_log OWNER TO postgres;

--
-- Name: sync_log_id_seq; Type: SEQUENCE; Schema: rpt; Owner: postgres
--

CREATE SEQUENCE rpt.sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE rpt.sync_log_id_seq OWNER TO postgres;

--
-- Name: sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: rpt; Owner: postgres
--

ALTER SEQUENCE rpt.sync_log_id_seq OWNED BY rpt.sync_log.id;


--
-- Name: excel_acts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_acts ALTER COLUMN id SET DEFAULT nextval('public.excel_acts_id_seq'::regclass);


--
-- Name: excel_arms_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_arms_categories ALTER COLUMN id SET DEFAULT nextval('public.excel_arms_categories_id_seq'::regclass);


--
-- Name: excel_arms_made id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_arms_made ALTER COLUMN id SET DEFAULT nextval('public.excel_arms_made_id_seq'::regclass);


--
-- Name: excel_automobiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_automobiles ALTER COLUMN id SET DEFAULT nextval('public.excel_automobiles_id_seq'::regclass);


--
-- Name: excel_beats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_beats ALTER COLUMN id SET DEFAULT nextval('public.excel_beats_id_seq'::regclass);


--
-- Name: excel_cultural_properties id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_cultural_properties ALTER COLUMN id SET DEFAULT nextval('public.excel_cultural_properties_id_seq'::regclass);


--
-- Name: excel_currency_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_currency_types ALTER COLUMN id SET DEFAULT nextval('public.excel_currency_types_id_seq'::regclass);


--
-- Name: excel_document_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_document_types ALTER COLUMN id SET DEFAULT nextval('public.excel_document_types_id_seq'::regclass);


--
-- Name: excel_drug_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_drug_types ALTER COLUMN id SET DEFAULT nextval('public.excel_drug_types_id_seq'::regclass);


--
-- Name: excel_electric_goods id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_electric_goods ALTER COLUMN id SET DEFAULT nextval('public.excel_electric_goods_id_seq'::regclass);


--
-- Name: excel_explosive_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_explosive_types ALTER COLUMN id SET DEFAULT nextval('public.excel_explosive_types_id_seq'::regclass);


--
-- Name: excel_fire_arms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_fire_arms ALTER COLUMN id SET DEFAULT nextval('public.excel_fire_arms_id_seq'::regclass);


--
-- Name: excel_jewelry_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_jewelry_types ALTER COLUMN id SET DEFAULT nextval('public.excel_jewelry_types_id_seq'::regclass);


--
-- Name: excel_local_heads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_local_heads ALTER COLUMN id SET DEFAULT nextval('public.excel_local_heads_id_seq'::regclass);


--
-- Name: excel_major_heads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_major_heads ALTER COLUMN id SET DEFAULT nextval('public.excel_major_heads_id_seq'::regclass);


--
-- Name: excel_major_minor_mapping id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_major_minor_mapping ALTER COLUMN id SET DEFAULT nextval('public.excel_major_minor_mapping_id_seq'::regclass);


--
-- Name: excel_minor_heads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_minor_heads ALTER COLUMN id SET DEFAULT nextval('public.excel_minor_heads_id_seq'::regclass);


--
-- Name: excel_other_property_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_other_property_categories ALTER COLUMN id SET DEFAULT nextval('public.excel_other_property_categories_id_seq'::regclass);


--
-- Name: excel_other_property_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_other_property_items ALTER COLUMN id SET DEFAULT nextval('public.excel_other_property_items_id_seq'::regclass);


--
-- Name: excel_property_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_property_types ALTER COLUMN id SET DEFAULT nextval('public.excel_property_types_id_seq'::regclass);


--
-- Name: excel_sections id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_sections ALTER COLUMN id SET DEFAULT nextval('public.excel_sections_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: bridge_fir_arrest id; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_arrest ALTER COLUMN id SET DEFAULT nextval('rpt.bridge_fir_arrest_id_seq'::regclass);


--
-- Name: bridge_fir_missing id; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_missing ALTER COLUMN id SET DEFAULT nextval('rpt.bridge_fir_missing_id_seq'::regclass);


--
-- Name: dim_act_law sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_act_law ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_act_law_sk_seq'::regclass);


--
-- Name: dim_case_status sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_case_status ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_case_status_sk_seq'::regclass);


--
-- Name: dim_crime_head sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_crime_head ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_crime_head_sk_seq'::regclass);


--
-- Name: dim_district sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_district ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_district_sk_seq'::regclass);


--
-- Name: dim_officer sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_officer ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_officer_sk_seq'::regclass);


--
-- Name: dim_police_station sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_police_station ALTER COLUMN sk SET DEFAULT nextval('rpt.dim_police_station_sk_seq'::regclass);


--
-- Name: fact_arrest sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest ALTER COLUMN sk SET DEFAULT nextval('rpt.fact_arrest_sk_seq'::regclass);


--
-- Name: fact_fir sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir ALTER COLUMN sk SET DEFAULT nextval('rpt.fact_fir_sk_seq'::regclass);


--
-- Name: fact_missing sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing ALTER COLUMN sk SET DEFAULT nextval('rpt.fact_missing_sk_seq'::regclass);


--
-- Name: fact_pcr sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr ALTER COLUMN sk SET DEFAULT nextval('rpt.fact_pcr_sk_seq'::regclass);


--
-- Name: fact_uidb sk; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb ALTER COLUMN sk SET DEFAULT nextval('rpt.fact_uidb_sk_seq'::regclass);


--
-- Name: sync_log id; Type: DEFAULT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.sync_log ALTER COLUMN id SET DEFAULT nextval('rpt.sync_log_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: compilation_records compilation_records_compilation_id_record_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilation_records
    ADD CONSTRAINT compilation_records_compilation_id_record_id_unique UNIQUE (compilation_id, record_id);


--
-- Name: compilation_records compilation_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilation_records
    ADD CONSTRAINT compilation_records_pkey PRIMARY KEY (id);


--
-- Name: compilations compilations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilations
    ADD CONSTRAINT compilations_pkey PRIMARY KEY (id);


--
-- Name: custom_field_definitions custom_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);


--
-- Name: custom_field_values custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_pkey PRIMARY KEY (id);


--
-- Name: excel_acts excel_acts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_acts
    ADD CONSTRAINT excel_acts_pkey PRIMARY KEY (id);


--
-- Name: excel_arms_categories excel_arms_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_arms_categories
    ADD CONSTRAINT excel_arms_categories_pkey PRIMARY KEY (id);


--
-- Name: excel_arms_made excel_arms_made_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_arms_made
    ADD CONSTRAINT excel_arms_made_pkey PRIMARY KEY (id);


--
-- Name: excel_automobiles excel_automobiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_automobiles
    ADD CONSTRAINT excel_automobiles_pkey PRIMARY KEY (id);


--
-- Name: excel_beats excel_beats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_beats
    ADD CONSTRAINT excel_beats_pkey PRIMARY KEY (id);


--
-- Name: excel_cultural_properties excel_cultural_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_cultural_properties
    ADD CONSTRAINT excel_cultural_properties_pkey PRIMARY KEY (id);


--
-- Name: excel_currency_types excel_currency_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_currency_types
    ADD CONSTRAINT excel_currency_types_pkey PRIMARY KEY (id);


--
-- Name: excel_document_types excel_document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_document_types
    ADD CONSTRAINT excel_document_types_pkey PRIMARY KEY (id);


--
-- Name: excel_drug_types excel_drug_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_drug_types
    ADD CONSTRAINT excel_drug_types_pkey PRIMARY KEY (id);


--
-- Name: excel_electric_goods excel_electric_goods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_electric_goods
    ADD CONSTRAINT excel_electric_goods_pkey PRIMARY KEY (id);


--
-- Name: excel_explosive_types excel_explosive_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_explosive_types
    ADD CONSTRAINT excel_explosive_types_pkey PRIMARY KEY (id);


--
-- Name: excel_fire_arms excel_fire_arms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_fire_arms
    ADD CONSTRAINT excel_fire_arms_pkey PRIMARY KEY (id);


--
-- Name: excel_jewelry_types excel_jewelry_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_jewelry_types
    ADD CONSTRAINT excel_jewelry_types_pkey PRIMARY KEY (id);


--
-- Name: excel_local_heads excel_local_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_local_heads
    ADD CONSTRAINT excel_local_heads_pkey PRIMARY KEY (id);


--
-- Name: excel_major_heads excel_major_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_major_heads
    ADD CONSTRAINT excel_major_heads_pkey PRIMARY KEY (id);


--
-- Name: excel_major_minor_mapping excel_major_minor_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_major_minor_mapping
    ADD CONSTRAINT excel_major_minor_mapping_pkey PRIMARY KEY (id);


--
-- Name: excel_minor_heads excel_minor_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_minor_heads
    ADD CONSTRAINT excel_minor_heads_pkey PRIMARY KEY (id);


--
-- Name: excel_other_property_categories excel_other_property_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_other_property_categories
    ADD CONSTRAINT excel_other_property_categories_pkey PRIMARY KEY (id);


--
-- Name: excel_other_property_items excel_other_property_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_other_property_items
    ADD CONSTRAINT excel_other_property_items_pkey PRIMARY KEY (id);


--
-- Name: excel_property_types excel_property_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_property_types
    ADD CONSTRAINT excel_property_types_pkey PRIMARY KEY (id);


--
-- Name: excel_sections excel_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.excel_sections
    ADD CONSTRAINT excel_sections_pkey PRIMARY KEY (id);


--
-- Name: field_registry field_registry_field_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_registry
    ADD CONSTRAINT field_registry_field_key_unique UNIQUE (field_key);


--
-- Name: field_registry field_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_registry
    ADD CONSTRAINT field_registry_pkey PRIMARY KEY (id);


--
-- Name: filter_presets filter_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filter_presets
    ADD CONSTRAINT filter_presets_pkey PRIMARY KEY (id);


--
-- Name: hierarchy_nodes hierarchy_nodes_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hierarchy_nodes
    ADD CONSTRAINT hierarchy_nodes_code_unique UNIQUE (code);


--
-- Name: hierarchy_nodes hierarchy_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hierarchy_nodes
    ADD CONSTRAINT hierarchy_nodes_pkey PRIMARY KEY (id);


--
-- Name: import_batch_errors import_batch_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batch_errors
    ADD CONSTRAINT import_batch_errors_pkey PRIMARY KEY (id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: legacy_amendments legacy_amendments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_amendments
    ADD CONSTRAINT legacy_amendments_pkey PRIMARY KEY (id);


--
-- Name: legacy_import_batches legacy_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_import_batches
    ADD CONSTRAINT legacy_import_batches_pkey PRIMARY KEY (id);


--
-- Name: level_data_contracts level_data_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_data_contracts
    ADD CONSTRAINT level_data_contracts_pkey PRIMARY KEY (id);


--
-- Name: link_type_registry link_type_registry_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_type_registry
    ADD CONSTRAINT link_type_registry_code_unique UNIQUE (code);


--
-- Name: link_type_registry link_type_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_type_registry
    ADD CONSTRAINT link_type_registry_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: record_links record_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_pkey PRIMARY KEY (id);


--
-- Name: record_links record_links_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_unique UNIQUE (source_record_id, target_record_id, link_type_id);


--
-- Name: record_persons record_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_persons
    ADD CONSTRAINT record_persons_pkey PRIMARY KEY (id);


--
-- Name: record_properties record_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_properties
    ADD CONSTRAINT record_properties_pkey PRIMARY KEY (id);


--
-- Name: record_revisions record_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_pkey PRIMARY KEY (id);


--
-- Name: records records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (id);


--
-- Name: report_builder_audit report_builder_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_builder_audit
    ADD CONSTRAINT report_builder_audit_pkey PRIMARY KEY (id);


--
-- Name: report_builder_saved report_builder_saved_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_builder_saved
    ADD CONSTRAINT report_builder_saved_pkey PRIMARY KEY (id);


--
-- Name: report_jobs report_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_jobs
    ADD CONSTRAINT report_jobs_pkey PRIMARY KEY (id);


--
-- Name: report_templates report_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);


--
-- Name: scheduled_reports scheduled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);


--
-- Name: users users_badge_no_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_badge_no_unique UNIQUE (badge_no);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: workflow_transitions_config workflow_transitions_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_transitions_config
    ADD CONSTRAINT workflow_transitions_config_pkey PRIMARY KEY (id);


--
-- Name: workflow_transitions workflow_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_pkey PRIMARY KEY (id);


--
-- Name: bridge_fir_arrest bridge_fir_arrest_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_arrest
    ADD CONSTRAINT bridge_fir_arrest_pkey PRIMARY KEY (id);


--
-- Name: bridge_fir_missing bridge_fir_missing_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_missing
    ADD CONSTRAINT bridge_fir_missing_pkey PRIMARY KEY (id);


--
-- Name: dim_act_law dim_act_law_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_act_law
    ADD CONSTRAINT dim_act_law_pkey PRIMARY KEY (sk);


--
-- Name: dim_case_status dim_case_status_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_case_status
    ADD CONSTRAINT dim_case_status_pkey PRIMARY KEY (sk);


--
-- Name: dim_crime_head dim_crime_head_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_crime_head
    ADD CONSTRAINT dim_crime_head_pkey PRIMARY KEY (sk);


--
-- Name: dim_district dim_district_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_district
    ADD CONSTRAINT dim_district_pkey PRIMARY KEY (sk);


--
-- Name: dim_officer dim_officer_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_officer
    ADD CONSTRAINT dim_officer_pkey PRIMARY KEY (sk);


--
-- Name: dim_police_station dim_police_station_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_police_station
    ADD CONSTRAINT dim_police_station_pkey PRIMARY KEY (sk);


--
-- Name: fact_arrest fact_arrest_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT fact_arrest_pkey PRIMARY KEY (sk);


--
-- Name: fact_fir fact_fir_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT fact_fir_pkey PRIMARY KEY (sk);


--
-- Name: fact_missing fact_missing_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT fact_missing_pkey PRIMARY KEY (sk);


--
-- Name: fact_pcr fact_pcr_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT fact_pcr_pkey PRIMARY KEY (sk);


--
-- Name: fact_uidb fact_uidb_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT fact_uidb_pkey PRIMARY KEY (sk);


--
-- Name: bridge_fir_arrest rpt_bridge_fir_arrest_fir_sk_arrest_sk_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_arrest
    ADD CONSTRAINT rpt_bridge_fir_arrest_fir_sk_arrest_sk_unique UNIQUE (fir_sk, arrest_sk);


--
-- Name: bridge_fir_missing rpt_bridge_fir_missing_fir_sk_missing_sk_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_missing
    ADD CONSTRAINT rpt_bridge_fir_missing_fir_sk_missing_sk_unique UNIQUE (fir_sk, missing_sk);


--
-- Name: dim_act_law rpt_dim_act_law_value_normalized_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_act_law
    ADD CONSTRAINT rpt_dim_act_law_value_normalized_unique UNIQUE (value_normalized);


--
-- Name: dim_case_status rpt_dim_case_status_record_type_value_normalized_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_case_status
    ADD CONSTRAINT rpt_dim_case_status_record_type_value_normalized_unique UNIQUE (record_type, value_normalized);


--
-- Name: dim_crime_head rpt_dim_crime_head_value_normalized_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_crime_head
    ADD CONSTRAINT rpt_dim_crime_head_value_normalized_unique UNIQUE (value_normalized);


--
-- Name: dim_district rpt_dim_district_source_district_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_district
    ADD CONSTRAINT rpt_dim_district_source_district_id_unique UNIQUE (source_district_id);


--
-- Name: dim_officer rpt_dim_officer_name_normalized_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_officer
    ADD CONSTRAINT rpt_dim_officer_name_normalized_unique UNIQUE (name_normalized);


--
-- Name: dim_police_station rpt_dim_police_station_source_ps_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_police_station
    ADD CONSTRAINT rpt_dim_police_station_source_ps_id_unique UNIQUE (source_ps_id);


--
-- Name: fact_arrest rpt_fact_arrest_source_record_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_source_record_id_unique UNIQUE (source_record_id);


--
-- Name: fact_fir rpt_fact_fir_source_record_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_source_record_id_unique UNIQUE (source_record_id);


--
-- Name: fact_missing rpt_fact_missing_source_record_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT rpt_fact_missing_source_record_id_unique UNIQUE (source_record_id);


--
-- Name: fact_pcr rpt_fact_pcr_source_record_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_source_record_id_unique UNIQUE (source_record_id);


--
-- Name: fact_uidb rpt_fact_uidb_source_record_id_unique; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT rpt_fact_uidb_source_record_id_unique UNIQUE (source_record_id);


--
-- Name: sync_log sync_log_pkey; Type: CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);


--
-- Name: idx_mv_record_stats_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mv_record_stats_pk ON public.mv_record_stats USING btree (ps_id, district_id, record_type, current_status, record_date);


--
-- Name: idx_rba_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rba_created_at ON public.report_builder_audit USING btree (created_at);


--
-- Name: idx_rba_run_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rba_run_type ON public.report_builder_audit USING btree (run_type);


--
-- Name: idx_rba_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rba_user_id ON public.report_builder_audit USING btree (user_id);


--
-- Name: idx_record_links_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_links_source ON public.record_links USING btree (source_record_id);


--
-- Name: idx_record_links_target; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_links_target ON public.record_links USING btree (target_record_id);


--
-- Name: idx_record_links_type_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_links_type_source ON public.record_links USING btree (link_type_id, source_record_id);


--
-- Name: idx_record_persons_data_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_persons_data_gin ON public.record_persons USING gin (data);


--
-- Name: idx_record_persons_first_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_persons_first_name ON public.record_persons USING btree (first_name);


--
-- Name: idx_record_persons_mobile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_persons_mobile ON public.record_persons USING btree (mobile);


--
-- Name: idx_record_persons_record_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_persons_record_id ON public.record_persons USING btree (record_id);


--
-- Name: idx_record_persons_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_persons_type ON public.record_persons USING btree (record_id, person_type);


--
-- Name: idx_record_properties_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_properties_category ON public.record_properties USING btree (major_category);


--
-- Name: idx_record_properties_record_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_record_properties_record_id ON public.record_properties USING btree (record_id);


--
-- Name: idx_records_data_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_data_gin ON public.records USING gin (((data)::jsonb));


--
-- Name: idx_records_district_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_district_id ON public.records USING btree (district_id);


--
-- Name: idx_records_ps_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_ps_id ON public.records USING btree (ps_id);


--
-- Name: idx_records_record_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_record_date ON public.records USING btree (record_date DESC);


--
-- Name: idx_records_record_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_record_type ON public.records USING btree (record_type);


--
-- Name: idx_records_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_status ON public.records USING btree (current_status);


--
-- Name: idx_report_builder_saved_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_builder_saved_created_by ON public.report_builder_saved USING btree (created_by);


--
-- Name: idx_report_builder_saved_is_shared; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_builder_saved_is_shared ON public.report_builder_saved USING btree (is_shared);


--
-- Name: idx_bfa_arrest_sk; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_bfa_arrest_sk ON rpt.bridge_fir_arrest USING btree (arrest_sk);


--
-- Name: idx_bfa_fir_sk; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_bfa_fir_sk ON rpt.bridge_fir_arrest USING btree (fir_sk);


--
-- Name: idx_bfm_fir_sk; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_bfm_fir_sk ON rpt.bridge_fir_missing USING btree (fir_sk);


--
-- Name: idx_bfm_missing_sk; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_bfm_missing_sk ON rpt.bridge_fir_missing USING btree (missing_sk);


--
-- Name: idx_fa_arrest_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fa_arrest_date ON rpt.fact_arrest USING btree (arrest_date);


--
-- Name: idx_fa_district_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fa_district_id ON rpt.fact_arrest USING btree (district_id);


--
-- Name: idx_fa_fir_link; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fa_fir_link ON rpt.fact_arrest USING btree (linked_fir_dd_no);


--
-- Name: idx_fa_ps_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fa_ps_id ON rpt.fact_arrest USING btree (ps_id);


--
-- Name: idx_ff_crime_head; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_crime_head ON rpt.fact_fir USING btree (local_head);


--
-- Name: idx_ff_district_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_district_id ON rpt.fact_fir USING btree (district_id);


--
-- Name: idx_ff_fir_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_fir_date ON rpt.fact_fir USING btree (fir_date);


--
-- Name: idx_ff_ps_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_ps_id ON rpt.fact_fir USING btree (ps_id);


--
-- Name: idx_ff_record_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_record_date ON rpt.fact_fir USING btree (record_date);


--
-- Name: idx_ff_status; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_ff_status ON rpt.fact_fir USING btree (case_status);


--
-- Name: idx_fm_dd_no; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_dd_no ON rpt.fact_missing USING btree (dd_no);


--
-- Name: idx_fm_district_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_district_id ON rpt.fact_missing USING btree (district_id);


--
-- Name: idx_fm_gender; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_gender ON rpt.fact_missing USING btree (gender);


--
-- Name: idx_fm_missing_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_missing_date ON rpt.fact_missing USING btree (missing_date);


--
-- Name: idx_fm_ps_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_ps_id ON rpt.fact_missing USING btree (ps_id);


--
-- Name: idx_fm_status; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fm_status ON rpt.fact_missing USING btree (missing_status);


--
-- Name: idx_fp_district_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fp_district_id ON rpt.fact_pcr USING btree (district_id);


--
-- Name: idx_fp_gd_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fp_gd_date ON rpt.fact_pcr USING btree (gd_date);


--
-- Name: idx_fp_ps_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fp_ps_id ON rpt.fact_pcr USING btree (ps_id);


--
-- Name: idx_fp_status; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fp_status ON rpt.fact_pcr USING btree (call_status);


--
-- Name: idx_fu_district_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fu_district_id ON rpt.fact_uidb USING btree (district_id);


--
-- Name: idx_fu_found_date; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fu_found_date ON rpt.fact_uidb USING btree (found_date);


--
-- Name: idx_fu_gender; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fu_gender ON rpt.fact_uidb USING btree (gender);


--
-- Name: idx_fu_identified; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fu_identified ON rpt.fact_uidb USING btree (identified);


--
-- Name: idx_fu_ps_id; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_fu_ps_id ON rpt.fact_uidb USING btree (ps_id);


--
-- Name: idx_sl_source; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_sl_source ON rpt.sync_log USING btree (source_table);


--
-- Name: idx_sl_started; Type: INDEX; Schema: rpt; Owner: postgres
--

CREATE INDEX idx_sl_started ON rpt.sync_log USING btree (run_started_at);


--
-- Name: audit_logs audit_logs_changed_by_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_changed_by_id_foreign FOREIGN KEY (changed_by_id) REFERENCES public.users(id);


--
-- Name: compilation_records compilation_records_compilation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilation_records
    ADD CONSTRAINT compilation_records_compilation_id_foreign FOREIGN KEY (compilation_id) REFERENCES public.compilations(id) ON DELETE CASCADE;


--
-- Name: compilation_records compilation_records_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilation_records
    ADD CONSTRAINT compilation_records_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: compilations compilations_source_entity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilations
    ADD CONSTRAINT compilations_source_entity_id_foreign FOREIGN KEY (source_entity_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: compilations compilations_submitted_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compilations
    ADD CONSTRAINT compilations_submitted_by_foreign FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: custom_field_definitions custom_field_definitions_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: custom_field_definitions custom_field_definitions_scope_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_scope_id_foreign FOREIGN KEY (scope_id) REFERENCES public.hierarchy_nodes(id) ON DELETE CASCADE;


--
-- Name: custom_field_values custom_field_values_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: custom_field_values custom_field_values_field_definition_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_field_definition_id_foreign FOREIGN KEY (field_definition_id) REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE;


--
-- Name: custom_field_values custom_field_values_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: filter_presets filter_presets_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filter_presets
    ADD CONSTRAINT filter_presets_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: hierarchy_nodes hierarchy_nodes_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hierarchy_nodes
    ADD CONSTRAINT hierarchy_nodes_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.hierarchy_nodes(id) ON DELETE CASCADE;


--
-- Name: import_batch_errors import_batch_errors_batch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batch_errors
    ADD CONSTRAINT import_batch_errors_batch_id_foreign FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE;


--
-- Name: import_batches import_batches_district_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_district_id_foreign FOREIGN KEY (district_id) REFERENCES public.hierarchy_nodes(id) ON DELETE SET NULL;


--
-- Name: import_batches import_batches_ps_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_ps_id_foreign FOREIGN KEY (ps_id) REFERENCES public.hierarchy_nodes(id) ON DELETE SET NULL;


--
-- Name: import_batches import_batches_uploaded_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_uploaded_by_foreign FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: legacy_amendments legacy_amendments_approved_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_amendments
    ADD CONSTRAINT legacy_amendments_approved_by_foreign FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: legacy_amendments legacy_amendments_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_amendments
    ADD CONSTRAINT legacy_amendments_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: legacy_amendments legacy_amendments_requested_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_amendments
    ADD CONSTRAINT legacy_amendments_requested_by_foreign FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: legacy_import_batches legacy_import_batches_imported_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_import_batches
    ADD CONSTRAINT legacy_import_batches_imported_by_foreign FOREIGN KEY (imported_by) REFERENCES public.users(id);


--
-- Name: legacy_import_batches legacy_import_batches_ps_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legacy_import_batches
    ADD CONSTRAINT legacy_import_batches_ps_id_foreign FOREIGN KEY (ps_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: notifications notifications_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: record_links record_links_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: record_links record_links_link_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_link_type_id_foreign FOREIGN KEY (link_type_id) REFERENCES public.link_type_registry(id) ON DELETE RESTRICT;


--
-- Name: record_links record_links_source_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_source_record_id_foreign FOREIGN KEY (source_record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: record_links record_links_target_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_target_record_id_foreign FOREIGN KEY (target_record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: record_persons record_persons_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_persons
    ADD CONSTRAINT record_persons_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: record_properties record_properties_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_properties
    ADD CONSTRAINT record_properties_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: record_revisions record_revisions_changed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_changed_by_foreign FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: record_revisions record_revisions_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: records records_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: records records_district_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_district_id_foreign FOREIGN KEY (district_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: records records_imported_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_imported_by_foreign FOREIGN KEY (imported_by) REFERENCES public.users(id);


--
-- Name: records records_ps_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_ps_id_foreign FOREIGN KEY (ps_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: records records_sub_div_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_sub_div_id_foreign FOREIGN KEY (sub_div_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: records records_updated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: report_builder_audit report_builder_audit_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_builder_audit
    ADD CONSTRAINT report_builder_audit_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: report_builder_saved report_builder_saved_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_builder_saved
    ADD CONSTRAINT report_builder_saved_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: report_jobs report_jobs_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_jobs
    ADD CONSTRAINT report_jobs_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: report_templates report_templates_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scheduled_reports scheduled_reports_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scheduled_reports scheduled_reports_scope_district_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_scope_district_id_foreign FOREIGN KEY (scope_district_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: scheduled_reports scheduled_reports_scope_ps_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_scope_ps_id_foreign FOREIGN KEY (scope_ps_id) REFERENCES public.hierarchy_nodes(id);


--
-- Name: scheduled_reports scheduled_reports_template_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_template_id_foreign FOREIGN KEY (template_id) REFERENCES public.report_templates(id) ON DELETE CASCADE;


--
-- Name: users users_district_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_district_id_foreign FOREIGN KEY (district_id) REFERENCES public.hierarchy_nodes(id) ON DELETE SET NULL;


--
-- Name: users users_station_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_station_id_foreign FOREIGN KEY (station_id) REFERENCES public.hierarchy_nodes(id) ON DELETE SET NULL;


--
-- Name: users users_sub_div_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_sub_div_id_foreign FOREIGN KEY (sub_div_id) REFERENCES public.hierarchy_nodes(id) ON DELETE SET NULL;


--
-- Name: workflow_transitions workflow_transitions_performed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_performed_by_foreign FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: workflow_transitions workflow_transitions_record_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_record_id_foreign FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: bridge_fir_arrest rpt_bridge_fir_arrest_arrest_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_arrest
    ADD CONSTRAINT rpt_bridge_fir_arrest_arrest_sk_foreign FOREIGN KEY (arrest_sk) REFERENCES rpt.fact_arrest(sk) ON DELETE CASCADE;


--
-- Name: bridge_fir_arrest rpt_bridge_fir_arrest_fir_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_arrest
    ADD CONSTRAINT rpt_bridge_fir_arrest_fir_sk_foreign FOREIGN KEY (fir_sk) REFERENCES rpt.fact_fir(sk) ON DELETE CASCADE;


--
-- Name: bridge_fir_missing rpt_bridge_fir_missing_fir_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_missing
    ADD CONSTRAINT rpt_bridge_fir_missing_fir_sk_foreign FOREIGN KEY (fir_sk) REFERENCES rpt.fact_fir(sk) ON DELETE CASCADE;


--
-- Name: bridge_fir_missing rpt_bridge_fir_missing_missing_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.bridge_fir_missing
    ADD CONSTRAINT rpt_bridge_fir_missing_missing_sk_foreign FOREIGN KEY (missing_sk) REFERENCES rpt.fact_missing(sk) ON DELETE CASCADE;


--
-- Name: dim_police_station rpt_dim_police_station_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.dim_police_station
    ADD CONSTRAINT rpt_dim_police_station_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_arrest rpt_fact_arrest_act_law_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_act_law_sk_foreign FOREIGN KEY (act_law_sk) REFERENCES rpt.dim_act_law(sk);


--
-- Name: fact_arrest rpt_fact_arrest_crime_head_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_crime_head_sk_foreign FOREIGN KEY (crime_head_sk) REFERENCES rpt.dim_crime_head(sk);


--
-- Name: fact_arrest rpt_fact_arrest_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_arrest rpt_fact_arrest_officer_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_officer_sk_foreign FOREIGN KEY (officer_sk) REFERENCES rpt.dim_officer(sk);


--
-- Name: fact_arrest rpt_fact_arrest_ps_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_ps_sk_foreign FOREIGN KEY (ps_sk) REFERENCES rpt.dim_police_station(sk);


--
-- Name: fact_arrest rpt_fact_arrest_status_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_arrest
    ADD CONSTRAINT rpt_fact_arrest_status_sk_foreign FOREIGN KEY (status_sk) REFERENCES rpt.dim_case_status(sk);


--
-- Name: fact_fir rpt_fact_fir_act_law_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_act_law_sk_foreign FOREIGN KEY (act_law_sk) REFERENCES rpt.dim_act_law(sk);


--
-- Name: fact_fir rpt_fact_fir_crime_head_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_crime_head_sk_foreign FOREIGN KEY (crime_head_sk) REFERENCES rpt.dim_crime_head(sk);


--
-- Name: fact_fir rpt_fact_fir_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_fir rpt_fact_fir_officer_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_officer_sk_foreign FOREIGN KEY (officer_sk) REFERENCES rpt.dim_officer(sk);


--
-- Name: fact_fir rpt_fact_fir_ps_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_ps_sk_foreign FOREIGN KEY (ps_sk) REFERENCES rpt.dim_police_station(sk);


--
-- Name: fact_fir rpt_fact_fir_status_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_fir
    ADD CONSTRAINT rpt_fact_fir_status_sk_foreign FOREIGN KEY (status_sk) REFERENCES rpt.dim_case_status(sk);


--
-- Name: fact_missing rpt_fact_missing_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT rpt_fact_missing_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_missing rpt_fact_missing_officer_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT rpt_fact_missing_officer_sk_foreign FOREIGN KEY (officer_sk) REFERENCES rpt.dim_officer(sk);


--
-- Name: fact_missing rpt_fact_missing_ps_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT rpt_fact_missing_ps_sk_foreign FOREIGN KEY (ps_sk) REFERENCES rpt.dim_police_station(sk);


--
-- Name: fact_missing rpt_fact_missing_status_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_missing
    ADD CONSTRAINT rpt_fact_missing_status_sk_foreign FOREIGN KEY (status_sk) REFERENCES rpt.dim_case_status(sk);


--
-- Name: fact_pcr rpt_fact_pcr_crime_head_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_crime_head_sk_foreign FOREIGN KEY (crime_head_sk) REFERENCES rpt.dim_crime_head(sk);


--
-- Name: fact_pcr rpt_fact_pcr_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_pcr rpt_fact_pcr_officer_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_officer_sk_foreign FOREIGN KEY (officer_sk) REFERENCES rpt.dim_officer(sk);


--
-- Name: fact_pcr rpt_fact_pcr_ps_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_ps_sk_foreign FOREIGN KEY (ps_sk) REFERENCES rpt.dim_police_station(sk);


--
-- Name: fact_pcr rpt_fact_pcr_status_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_pcr
    ADD CONSTRAINT rpt_fact_pcr_status_sk_foreign FOREIGN KEY (status_sk) REFERENCES rpt.dim_case_status(sk);


--
-- Name: fact_uidb rpt_fact_uidb_district_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT rpt_fact_uidb_district_sk_foreign FOREIGN KEY (district_sk) REFERENCES rpt.dim_district(sk);


--
-- Name: fact_uidb rpt_fact_uidb_officer_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT rpt_fact_uidb_officer_sk_foreign FOREIGN KEY (officer_sk) REFERENCES rpt.dim_officer(sk);


--
-- Name: fact_uidb rpt_fact_uidb_ps_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT rpt_fact_uidb_ps_sk_foreign FOREIGN KEY (ps_sk) REFERENCES rpt.dim_police_station(sk);


--
-- Name: fact_uidb rpt_fact_uidb_status_sk_foreign; Type: FK CONSTRAINT; Schema: rpt; Owner: postgres
--

ALTER TABLE ONLY rpt.fact_uidb
    ADD CONSTRAINT rpt_fact_uidb_status_sk_foreign FOREIGN KEY (status_sk) REFERENCES rpt.dim_case_status(sk);


--
-- PostgreSQL database dump complete
--

\unrestrict 57THCLjTtbVQkPhK0GRZBylOfVdLtewewdAK7q7zRUUEJEpbsHKSJ9qofB1lhey

