// Migration: Add missing canonical codes to ref.local_heads using exact local_head_cd matches
// Source: Menu_Tables.xlsx local head sheet & context-bundle/10-HEAD-MAPPING-REVIEW.md

export async function up(knex) {
  await knex.raw(`
    -- Unlocks: STAT_1 row 1 (Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'DACOITY' WHERE local_head_cd = 1 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 2 (Murder)
    UPDATE ref.local_heads SET canonical_code = 'MURDER' WHERE local_head_cd = 2 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 3 (Att. to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ATT_TO_MURDER' WHERE local_head_cd = 3 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 4 (Robbery)
    UPDATE ref.local_heads SET canonical_code = 'ROBBERY' WHERE local_head_cd = 4 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 5 (Riots)
    UPDATE ref.local_heads SET canonical_code = 'RIOT' WHERE local_head_cd = 5 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 6 (Kid. for Ransom)
    UPDATE ref.local_heads SET canonical_code = 'KID_FOR_RANSOM' WHERE local_head_cd = 6 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 7 (Rape)
    UPDATE ref.local_heads SET canonical_code = 'RAPE' WHERE local_head_cd = 7 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 8 (Extortion)
    UPDATE ref.local_heads SET canonical_code = 'EXTORTION' WHERE local_head_cd = 8 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 9 (Snatching)
    UPDATE ref.local_heads SET canonical_code = 'SNATCHING' WHERE local_head_cd = 9 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 10 (Fatal Accident)
    UPDATE ref.local_heads SET canonical_code = 'FATAL_ACCIDENT' WHERE local_head_cd = 10 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 11 (Simple Accident)
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_ACCIDENT' WHERE local_head_cd = 11 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 12 (Burglary Day)
    UPDATE ref.local_heads SET canonical_code = 'DAY_BURGLARY' WHERE local_head_cd = 12 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 13 (Burglary Night)
    UPDATE ref.local_heads SET canonical_code = 'NIGHT_BURGLARY' WHERE local_head_cd = 13 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 14 (Att. Burglary)
    UPDATE ref.local_heads SET canonical_code = 'ATT_BURGLARY' WHERE local_head_cd = 14 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 15 (Att. House Theft)
    UPDATE ref.local_heads SET canonical_code = 'ATT_HOUSE_THEFT' WHERE local_head_cd = 15 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 16 (M.V. Theft)
    UPDATE ref.local_heads SET canonical_code = 'MV_THEFT' WHERE local_head_cd = 16 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 17 (Servant Theft)
    UPDATE ref.local_heads SET canonical_code = 'SERVANT_THEFT' WHERE local_head_cd = 17 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 18 (House Theft)
    UPDATE ref.local_heads SET canonical_code = 'HOUSE_THEFT' WHERE local_head_cd = 18 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 19 (Other Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 19 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 20 (Pick Pocketing)
    UPDATE ref.local_heads SET canonical_code = 'PICK_POCKETING' WHERE local_head_cd = 20 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 21 (Cycle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CYCLE_THEFT' WHERE local_head_cd = 21 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 22 (Cattle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CATTLE_THEFT' WHERE local_head_cd = 22 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 23 (Telegraph Wire Theft)
    UPDATE ref.local_heads SET canonical_code = 'TELEGRAPH_WIRE_THEFT' WHERE local_head_cd = 23 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 24 (Cable Theft)
    UPDATE ref.local_heads SET canonical_code = 'CABLE_THEFT' WHERE local_head_cd = 24 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 25 (Electric Fitting Theft)
    UPDATE ref.local_heads SET canonical_code = 'ELECTRIC_FITTING_THEFT' WHERE local_head_cd = 25 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 26 (Property Theft Govt)
    UPDATE ref.local_heads SET canonical_code = 'PROP_THEFT_GOVT' WHERE local_head_cd = 26 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 27 (Theft Running Train)
    UPDATE ref.local_heads SET canonical_code = 'THEFT_RUNNING_TRAIN' WHERE local_head_cd = 27 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 28 (Theft Railway Premises)
    UPDATE ref.local_heads SET canonical_code = 'THEFT_RAILWAY_PREMISES' WHERE local_head_cd = 28 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 29 (Kidnapping)
    UPDATE ref.local_heads SET canonical_code = 'KIDNAPPING' WHERE local_head_cd = 29 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 30 (Abduction)
    UPDATE ref.local_heads SET canonical_code = 'ABDUCTION' WHERE local_head_cd = 30 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 31 (Hurt)
    UPDATE ref.local_heads SET canonical_code = 'HURT' WHERE local_head_cd = 31 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 32 (Assault Public Servant)
    UPDATE ref.local_heads SET canonical_code = 'ASSAULT_PUBLIC_SERVANT' WHERE local_head_cd = 32 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 33 (Wrongful Restraint)
    UPDATE ref.local_heads SET canonical_code = 'WRONGFUL_RESTRAINT' WHERE local_head_cd = 33 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 34 (Wrongful Confinement)
    UPDATE ref.local_heads SET canonical_code = 'WRONGFUL_CONFINEMENT' WHERE local_head_cd = 34 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 35 (Criminal Trespass)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_TRESPASS' WHERE local_head_cd = 35 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 36 (Stalking Outraging Modesty)
    UPDATE ref.local_heads SET canonical_code = 'STALK_OUTRAGING_MODESTY' WHERE local_head_cd = 36 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 37 (M.O. Women)
    UPDATE ref.local_heads SET canonical_code = 'MO_WOMEN' WHERE local_head_cd = 37 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 38 (Cheating)
    UPDATE ref.local_heads SET canonical_code = 'CHEATING' WHERE local_head_cd = 38 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 39 (Forgery)
    UPDATE ref.local_heads SET canonical_code = 'FORGERY' WHERE local_head_cd = 39 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 40 (Counterfeiting)
    UPDATE ref.local_heads SET canonical_code = 'COUNTERFEITING' WHERE local_head_cd = 40 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 41 (Criminal Breach of Trust)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_BREACH_OF_TRUST' WHERE local_head_cd = 41 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 42 (Misappropriation)
    UPDATE ref.local_heads SET canonical_code = 'MISAPPROPRIATION' WHERE local_head_cd = 42 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 43 (Cruelty by Husband)
    UPDATE ref.local_heads SET canonical_code = 'CRUELTY_BY_HUSBAND' WHERE local_head_cd = 43 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 44 (Dowry Death)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_DEATH' WHERE local_head_cd = 44 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 45 (Dowry Prohibition)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_PROHIBITION' WHERE local_head_cd = 45 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 46 (Indecent Representation)
    UPDATE ref.local_heads SET canonical_code = 'INDECENCT_REPRESENTATION' WHERE local_head_cd = 46 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 47 (Prostitution ITPA)
    UPDATE ref.local_heads SET canonical_code = 'PROSTITUTION_ITPA' WHERE local_head_cd = 47 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 48 (Arms Act)
    UPDATE ref.local_heads SET canonical_code = 'ARMS_ACT' WHERE local_head_cd = 48 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 49 (Explosive Act)
    UPDATE ref.local_heads SET canonical_code = 'EXPLOSIVE_ACT' WHERE local_head_cd = 49 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 50 (Explosive Substances Act)
    UPDATE ref.local_heads SET canonical_code = 'EXPLOSIVE_SUBSTANCES_ACT' WHERE local_head_cd = 50 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 51 (NDPS Act)
    UPDATE ref.local_heads SET canonical_code = 'NDPS_ACT' WHERE local_head_cd = 51 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 52 (Excise Act)
    UPDATE ref.local_heads SET canonical_code = 'EXCISE_ACT' WHERE local_head_cd = 52 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 53 (Gambling Act)
    UPDATE ref.local_heads SET canonical_code = 'GAMBLING_ACT' WHERE local_head_cd = 53 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 54 (Eve Teasing)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 54 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 55 (POCSO Act)
    UPDATE ref.local_heads SET canonical_code = 'POCSO' WHERE local_head_cd = 55 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 56 (Cyber Crime)
    UPDATE ref.local_heads SET canonical_code = 'CYBER_CRIME' WHERE local_head_cd = 56 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 57 (Organised Crime)
    UPDATE ref.local_heads SET canonical_code = 'ORGANISED_CRIME' WHERE local_head_cd = 57 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 58 (Terrorist Act)
    UPDATE ref.local_heads SET canonical_code = 'TERRORIST_ACT' WHERE local_head_cd = 58 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 59 (Drugging Poisoning)
    UPDATE ref.local_heads SET canonical_code = 'DRUGGING_POISONING' WHERE local_head_cd = 59 AND canonical_code IS NULL;

    -- Unlocks: E-FIR Burglary Day
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY_DAY' WHERE local_head_cd = 209 AND canonical_code IS NULL;

    -- Unlocks: E-FIR Burglary Night
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY_NIGHT' WHERE local_head_cd = 210 AND canonical_code IS NULL;
  `);
}

export async function down(knex) {
  // no-op — canonical codes are additive; reversing would break diary renderers
}
