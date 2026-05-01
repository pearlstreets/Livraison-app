// Configuration des documents requis par statut légal
export const LEGAL_STATUSES = [
  {
    key: 'particulier',
    icon: 'person',
    labelKey: 'statusParticulier',
    descKey: 'statusParticulierDesc',
  },
  {
    key: 'auto_entrepreneur',
    icon: 'storefront',
    labelKey: 'statusAutoEntrepreneur',
    descKey: 'statusAutoEntrepreneurDesc',
  },
  {
    key: 'societe',
    icon: 'business',
    labelKey: 'statusSociete',
    descKey: 'statusSocieteDesc',
  },
];

// Pays où "Particulier" est autorisé (travailleur occasionnel légal)
export const PARTICULIER_ALLOWED = new Set([
  'FR', 'GP', 'MQ', 'RE', 'GF',
  'BE', 'DE', 'IT', 'ES', 'PT', 'NL', 'CH', 'LU', 'AT', 'IE',
  'SE', 'DK', 'NO', 'FI', 'PL', 'GB',
]);

// Pays supportés par Stripe Connect Express
export const STRIPE_CONNECT_COUNTRIES = new Set([
  'FR', 'GP', 'MQ', 'RE', 'GF',
  'BE', 'DE', 'IT', 'ES', 'PT', 'NL', 'CH', 'LU', 'AT', 'IE',
  'SE', 'DK', 'NO', 'FI', 'PL', 'GB',
  'US', 'CA', 'MX', 'BR', 'AU', 'JP', 'IN', 'AE',
]);

export const DOCS_BY_STATUS = {
  particulier: [
    { key: 'id_card_front_url', slot: 'id_front',       labelKey: 'docIdFront',       required: true,  icon: 'card-outline' },
    { key: 'id_card_back_url',  slot: 'id_back',         labelKey: 'docIdBack',        required: true,  icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, note: 'docDriverLicenseNote', icon: 'car-outline' },
  ],
  auto_entrepreneur: [
    { key: 'id_card_front_url',  slot: 'id_front',       labelKey: 'docIdFront',       required: true,  icon: 'card-outline' },
    { key: 'id_card_back_url',   slot: 'id_back',         labelKey: 'docIdBack',        required: true,  icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, icon: 'car-outline' },
    { key: 'urssaf_doc_url',     slot: 'urssaf',          labelKey: 'docUrssaf',        required: true,  icon: 'document-text-outline' },
    { key: 'rc_pro_url',         slot: 'rc_pro',          labelKey: 'docRcPro',         required: true,  icon: 'shield-checkmark-outline' },
  ],
  societe: [
    { key: 'id_card_front_url',  slot: 'id_front',       labelKey: 'docIdFront',       required: true,  icon: 'card-outline' },
    { key: 'id_card_back_url',   slot: 'id_back',         labelKey: 'docIdBack',        required: true,  icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, icon: 'car-outline' },
    { key: 'kbis_doc_url',       slot: 'kbis',            labelKey: 'docKbis',          required: true,  icon: 'business-outline' },
    { key: 'rc_pro_url',         slot: 'rc_pro',          labelKey: 'docRcPro',         required: true,  icon: 'shield-checkmark-outline' },
  ],
};
