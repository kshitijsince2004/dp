/**
 * PHAROS Natural-Language Search — Seizure Item Taxonomy & Synonym Dictionary
 * =============================================================================
 * Provides structured categories and regional/colloquial synonym mappings
 * for non-firearms, firearms, vehicles, phones, cash, narcotics, and jewellery.
 */

export const SEIZURE_TAXONOMY = [
  {
    code: 'KNIFE',
    category: 'Sharp Weapon',
    label_en: 'Knife / Blade / Dagger',
    label_hi: 'चाकू / छुरी / ब्लेड',
    synonyms: ['knife', 'chaku', 'churi', 'blade', 'dagger', 'gupti', 'rampuri', 'cutter', 'penknife', 'cleaver']
  },
  {
    code: 'SWORD',
    category: 'Sharp Weapon',
    label_en: 'Sword / Saber / Kirpan',
    label_hi: 'तलवार / कृपाण',
    synonyms: ['sword', 'talwar', 'kirpan', 'saber', 'barcha', 'lance', 'spear']
  },
  {
    code: 'FIREARM',
    category: 'Firearm',
    label_en: 'Firearm / Gun / Pistol / Katta',
    label_hi: 'अग्न्यास्त्र / पिस्तौल / कट्टा',
    synonyms: ['firearm', 'gun', 'pistol', 'revolver', 'katta', 'tamancha', 'rifle', 'deshi katta', 'bandook', 'carbine', 'shotgun', 'cartridge']
  },
  {
    code: 'BLUNT_OBJECT',
    category: 'Blunt Weapon',
    label_en: 'Iron Rod / Lathi / Stick / Baton',
    label_hi: 'लोहे की छड़ / लाठी / डंडा',
    synonyms: ['lathi', 'iron rod', 'rod', 'sariya', 'baton', 'danda', 'stick', 'hammer', 'hathoda', 'pipe', 'club']
  },
  {
    code: 'VEHICLE',
    category: 'Automobile',
    label_en: 'Vehicle / Car / Motorcycle / Scooter',
    label_hi: 'वाहन / कार / मोटरसाइकिल',
    synonyms: ['vehicle', 'car', 'motorcycle', 'bike', 'scooter', 'auto', 'gadi', 'truck', 'van', 'tractor', 'activa', 'jupiter', 'creta', 'swift']
  },
  {
    code: 'MOBILE_PHONE',
    category: 'Electronics',
    label_en: 'Mobile Phone / Smartphone',
    label_hi: 'मोबाइल फोन / स्मार्टफोन',
    synonyms: ['mobile', 'phone', 'cellphone', 'smartphone', 'iphone', 'samsung', 'realme', 'vivo', 'oppo', 'redmi', 'handset']
  },
  {
    code: 'JEWELLERY',
    category: 'Precious Metal',
    label_en: 'Jewellery / Gold / Silver / Ornaments',
    label_hi: 'आभूषण / सोना / चांदी',
    synonyms: ['jewellery', 'jewelry', 'gold', 'silver', 'chain', 'ring', 'necklace', 'jhumka', 'kangan', 'bangles', 'ornaments', 'mangalsutra']
  },
  {
    code: 'CURRENCY',
    category: 'Cash',
    label_en: 'Cash / Currency Notes',
    label_hi: 'नकद / मुद्रा',
    synonyms: ['cash', 'currency', 'money', 'rupees', 'notes', 'nakad', 'amount']
  },
  {
    code: 'NARCOTICS',
    category: 'Drugs',
    label_en: 'Narcotics / Drugs / Contraband',
    label_hi: 'मादक पदार्थ / ड्रग्स',
    synonyms: ['narcotics', 'drugs', 'ganja', 'charas', 'heroin', 'smack', 'opium', 'afeem', 'pills', 'mdma', 'cocaine', 'contraband']
  }
];

/**
 * Match a raw search string against the Seizure Item Taxonomy.
 * Returns the matching taxonomy object or null.
 */
export function matchSeizureTaxonomy(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const item of SEIZURE_TAXONOMY) {
    for (const syn of item.synonyms) {
      const regex = new RegExp(`\\b${syn}\\b`, 'i');
      if (regex.test(lower)) {
        return { ...item, matched_term: syn };
      }
    }
  }
  return null;
}
