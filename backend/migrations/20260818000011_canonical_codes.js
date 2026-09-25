// Migration 20260818000011: Complete Canonical Codes Mapping for ref.local_heads
// Source: Menu_Tables.xlsx & STAT_1 Proforma mapping rules

export async function up(knex) {
  await knex.raw(`
    -- Unlocks: STAT_1 / STAT_2 (Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'DACOITY' WHERE local_head_cd = 1 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Murder)
    UPDATE ref.local_heads SET canonical_code = 'MURDER' WHERE local_head_cd = 2 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Att. to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ATT_TO_MURDER' WHERE local_head_cd = 3 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Robbery)
    UPDATE ref.local_heads SET canonical_code = 'ROBBERY' WHERE local_head_cd = 4 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Riot)
    UPDATE ref.local_heads SET canonical_code = 'RIOT' WHERE local_head_cd = 5 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Kid. For Ransom)
    UPDATE ref.local_heads SET canonical_code = 'KID_FOR_RANSOM' WHERE local_head_cd = 6 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Rape)
    UPDATE ref.local_heads SET canonical_code = 'RAPE' WHERE local_head_cd = 7 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Extortion)
    UPDATE ref.local_heads SET canonical_code = 'EXTORTION' WHERE local_head_cd = 8 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Snatching)
    UPDATE ref.local_heads SET canonical_code = 'SNATCHING' WHERE local_head_cd = 9 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Simple Hurt)
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_HURT' WHERE local_head_cd = 10 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Grievous Hurt)
    UPDATE ref.local_heads SET canonical_code = 'GRIEVOUS_HURT' WHERE local_head_cd = 11 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 12 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Violent Burglary)
    UPDATE ref.local_heads SET canonical_code = 'VIOLENT_BURGLARY' WHERE local_head_cd = 13 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Kidnapping)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_KIDNAPPING' WHERE local_head_cd = 14 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Abduction)
    UPDATE ref.local_heads SET canonical_code = 'ABDUCTION' WHERE local_head_cd = 15 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.V. Theft)
    UPDATE ref.local_heads SET canonical_code = 'MV_THEFT' WHERE local_head_cd = 16 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Servant Theft)
    UPDATE ref.local_heads SET canonical_code = 'SERVANT_THEFT' WHERE local_head_cd = 17 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (House Theft)
    UPDATE ref.local_heads SET canonical_code = 'HOUSE_THEFT' WHERE local_head_cd = 18 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Other Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 19 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Theft in Shop)
    UPDATE ref.local_heads SET canonical_code = 'CULPABLE_HOMICIDE' WHERE local_head_cd = 20 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Pick Pocketing)
    UPDATE ref.local_heads SET canonical_code = 'ATT_CULPABLE_HOMICIDE' WHERE local_head_cd = 21 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Mobile Phone Theft)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_TRESPASS' WHERE local_head_cd = 22 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cycle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CBT' WHERE local_head_cd = 23 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.V. Accessiories Theft)
    UPDATE ref.local_heads SET canonical_code = 'CHEATING' WHERE local_head_cd = 24 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Electricity Theft)
    UPDATE ref.local_heads SET canonical_code = 'FORGERY' WHERE local_head_cd = 25 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Stereo Theft)
    UPDATE ref.local_heads SET canonical_code = 'COUNTERFEITING' WHERE local_head_cd = 26 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cattle Theft)
    UPDATE ref.local_heads SET canonical_code = 'MISCHIEF' WHERE local_head_cd = 27 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Electronic Articles Theft)
    UPDATE ref.local_heads SET canonical_code = 'ARSON' WHERE local_head_cd = 28 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Simple Accident)
    UPDATE ref.local_heads SET canonical_code = 'THREATENING' WHERE local_head_cd = 29 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Fatal Accident)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_DEATH' WHERE local_head_cd = 30 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.O. Women)
    UPDATE ref.local_heads SET canonical_code = 'ELECTION_OFFENCES' WHERE local_head_cd = 31 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Flesh Trade)
    UPDATE ref.local_heads SET canonical_code = 'PREP_OF_DACOITY' WHERE local_head_cd = 32 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Culpable Homicide not Amounting to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ACID_ATTACK' WHERE local_head_cd = 33 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Att. to Culpable Homicide not Amounting to Murder)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 34 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Tresspass)
    UPDATE ref.local_heads SET canonical_code = 'PICK_POCKETING' WHERE local_head_cd = 35 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Preparation to Commit Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'MOBILE_THEFT' WHERE local_head_cd = 36 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Criminal Breach of Trust)
    UPDATE ref.local_heads SET canonical_code = 'CYCLE_THEFT' WHERE local_head_cd = 37 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cheating)
    UPDATE ref.local_heads SET canonical_code = 'SHOP_THEFT' WHERE local_head_cd = 38 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Forgery)
    UPDATE ref.local_heads SET canonical_code = 'CATTLE_THEFT' WHERE local_head_cd = 39 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Counterfeiting)
    UPDATE ref.local_heads SET canonical_code = 'MV_ACCESSORY_THEFT' WHERE local_head_cd = 40 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Arson)
    UPDATE ref.local_heads SET canonical_code = 'ASSAULT_ON_WOMEN_MODESTY' WHERE local_head_cd = 41 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Abetment of Suicide)
    UPDATE ref.local_heads SET canonical_code = 'INSULT_MODESTY_WOMEN' WHERE local_head_cd = 42 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cruelty by Husband)
    UPDATE ref.local_heads SET canonical_code = 'ACCIDENTS' WHERE local_head_cd = 43 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Dowry Death)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_IPC' WHERE local_head_cd = 44 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Eve Teasing)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 54 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Election Offences)
    UPDATE ref.local_heads SET canonical_code = 'ELECTION_OFFENCES' WHERE local_head_cd = 60 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Mischief)
    UPDATE ref.local_heads SET canonical_code = 'MISCHIEF' WHERE local_head_cd = 66 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Arms Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_MANJHA' WHERE local_head_cd = 101 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Delhi Excise Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_SERVANT_VERIFICATION' WHERE local_head_cd = 102 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Gambling Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_TENANT_VERIFICATION' WHERE local_head_cd = 103 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Immoral Traffic(Prev.) Act, 1956 (SIT Act Renamed))
    UPDATE ref.local_heads SET canonical_code = 'SEC223_CYBER_CAFE' WHERE local_head_cd = 104 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Narcotics Drugs & Psychotropic Substances Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_ACID_SALE' WHERE local_head_cd = 105 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Central Motor Vehicles Rules,1989)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 129 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Delhi Motor Vehicles Rules,1993)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 134 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Motor Vehicle Act,1988)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 147 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Luggage Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 208 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Day Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 209 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Night Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 210 AND canonical_code IS NULL;
  `);
}

export async function down(knex) {
  // no-op — canonical codes are additive; reversing would break diary renderers
}
