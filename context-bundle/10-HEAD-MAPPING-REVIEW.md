# Local Crime Heads Canonical Mapping Review

Source: `Menu_Tables.xlsx` (`local head` sheet) vs PHQ Proforma Specifications.

| local_head_cd | local_head (Menu_Tables text) | Category | Proposed canonical_code | Confidence |
|---|---|---|---|---|
| 1 | Dacoity | HEINOUS | `DACOITY` | HIGH |
| 2 | Murder | HEINOUS | `MURDER` | HIGH |
| 3 | Att. to Murder | HEINOUS | `ATT_TO_MURDER` | HIGH |
| 4 | Robbery | HEINOUS | `ROBBERY` | HIGH |
| 5 | Riots | HEINOUS | `RIOT` | HIGH |
| 6 | Kid. for Ransom | HEINOUS | `KID_FOR_RANSOM` | HIGH |
| 7 | Rape | HEINOUS | `RAPE` | HIGH |
| 8 | Extortion | NON_HEINOUS | `EXTORTION` | HIGH |
| 9 | Snatching | NON_HEINOUS | `SNATCHING` | HIGH |
| 10 | Fatal Accident | NON_HEINOUS | `FATAL_ACCIDENT` | HIGH |
| 11 | Simple Accident | NON_HEINOUS | `SIMPLE_ACCIDENT` | HIGH |
| 12 | Burglary (Day) | NON_HEINOUS | `DAY_BURGLARY` | HIGH |
| 13 | Burglary (Night) | NON_HEINOUS | `NIGHT_BURGLARY` | HIGH |
| 14 | Att. Burglary | NON_HEINOUS | `ATT_BURGLARY` | HIGH |
| 15 | Att. House Theft | NON_HEINOUS | `ATT_HOUSE_THEFT` | HIGH |
| 16 | M.V. Theft | NON_HEINOUS | `MV_THEFT` | HIGH |
| 17 | Servant Theft | NON_HEINOUS | `SERVANT_THEFT` | HIGH |
| 18 | House Theft | NON_HEINOUS | `HOUSE_THEFT` | HIGH |
| 19 | Other Theft | NON_HEINOUS | `OTHER_THEFT` | HIGH |
| 20 | Pick Pocketing | NON_HEINOUS | `PICK_POCKETING` | HIGH |
| 21 | Cycle Theft | NON_HEINOUS | `CYCLE_THEFT` | HIGH |
| 22 | Cattle Theft | NON_HEINOUS | `CATTLE_THEFT` | HIGH |
| 23 | Telegraph Wire Theft | NON_HEINOUS | `TELEGRAPH_WIRE_THEFT` | HIGH |
| 24 | Cable Theft | NON_HEINOUS | `CABLE_THEFT` | HIGH |
| 25 | Electric Fitting Theft | NON_HEINOUS | `ELECTRIC_FITTING_THEFT` | HIGH |
| 26 | Property Theft Govt | NON_HEINOUS | `PROP_THEFT_GOVT` | HIGH |
| 27 | Theft Running Train | NON_HEINOUS | `THEFT_RUNNING_TRAIN` | HIGH |
| 28 | Theft Railway Premises | NON_HEINOUS | `THEFT_RAILWAY_PREMISES` | HIGH |
| 29 | Kidnapping | NON_HEINOUS | `KIDNAPPING` | HIGH |
| 30 | Abduction | NON_HEINOUS | `ABDUCTION` | HIGH |
| 31 | Hurt | NON_HEINOUS | `HURT` | HIGH |
| 32 | Assault Public Servant | NON_HEINOUS | `ASSAULT_PUBLIC_SERVANT` | HIGH |
| 33 | Wrongful Restraint | NON_HEINOUS | `WRONGFUL_RESTRAINT` | HIGH |
| 34 | Wrongful Confinement | NON_HEINOUS | `WRONGFUL_CONFINEMENT` | HIGH |
| 35 | Criminal Trespass | NON_HEINOUS | `CRIMINAL_TRESPASS` | HIGH |
| 36 | Stalking Outraging Modesty | NON_HEINOUS | `STALK_OUTRAGING_MODESTY` | HIGH |
| 37 | M.O. Women | NON_HEINOUS | `MO_WOMEN` | HIGH |
| 38 | Cheating | NON_HEINOUS | `CHEATING` | HIGH |
| 39 | Forgery | NON_HEINOUS | `FORGERY` | HIGH |
| 40 | Counterfeiting | NON_HEINOUS | `COUNTERFEITING` | HIGH |
| 41 | Criminal Breach of Trust | NON_HEINOUS | `CRIMINAL_BREACH_OF_TRUST` | HIGH |
| 42 | Misappropriation | NON_HEINOUS | `MISAPPROPRIATION` | HIGH |
| 43 | Cruelty by Husband/Relatives | NON_HEINOUS | `CRUELTY_BY_HUSBAND` | HIGH |
| 44 | Dowry Death | NON_HEINOUS | `DOWRY_DEATH` | HIGH |
| 45 | Dowry Prohibition | NON_HEINOUS | `DOWRY_PROHIBITION` | HIGH |
| 46 | Indecent Representation of Women | NON_HEINOUS | `INDECENCT_REPRESENTATION` | HIGH |
| 47 | Prostitution ITPA | LSL | `PROSTITUTION_ITPA` | HIGH |
| 48 | Arms Act | LSL | `ARMS_ACT` | HIGH |
| 49 | Explosive Act | LSL | `EXPLOSIVE_ACT` | HIGH |
| 50 | Explosive Substances Act | LSL | `EXPLOSIVE_SUBSTANCES_ACT` | HIGH |
| 51 | NDPS Act | LSL | `NDPS_ACT` | HIGH |
| 52 | Excise Act | LSL | `EXCISE_ACT` | HIGH |
| 53 | Gambling Act | LSL | `GAMBLING_ACT` | HIGH |
| 54 | Eve Teasing | NON_HEINOUS | `EVE_TEASING` | HIGH |
| 55 | POCSO Act | LSL | `POCSO` | HIGH |
| 56 | Cyber Crime | OTHER | `CYBER_CRIME` | HIGH |
| 57 | Organised Crime | OTHER | `ORGANISED_CRIME` | HIGH |
| 58 | Terrorist Act | OTHER | `TERRORIST_ACT` | HIGH |
| 59 | Drugging / Poisoning | NON_HEINOUS | `DRUGGING_POISONING` | HIGH |
| 209 | Burglary Day (E-FIR) | NON_HEINOUS | `BURGLARY_DAY` | HIGH |
| 210 | Burglary Night (E-FIR) | NON_HEINOUS | `BURGLARY_NIGHT` | HIGH |

---
*Note: Additional legacy or specialized heads in `ref.local_heads` default to snake_cased upper string representation.*
