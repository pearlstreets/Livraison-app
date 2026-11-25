// Compte de virement Stripe du livreur (26/10/2026), partagé par
// l'inscription et l'écran « Recevoir mes virements ». Le jeton de compte est
// fabriqué dans l'app avec la clé publique (exigence Stripe pour une
// plateforme française), le serveur crée ensuite le compte.

// Contrat Stripe dans la langue de l'app (pages vérifiées le 27/10/2026).
// Anglais, arabe, russe : pas de page traduite, version anglaise.
const CHEMIN_STRIPE = {
  fr: 'fr', de: 'de', es: 'es', it: 'it', nl: 'nl', pt: 'pt-pt',
  ja: 'jp', sv: 'se', zh: 'cn', th: 'th',
};
export function contratStripe(lang) {
  const chemin = CHEMIN_STRIPE[lang];
  return chemin
    ? `https://stripe.com/${chemin}/legal/connect-account`
    : 'https://stripe.com/legal/connect-account';
}

// Politique de confidentialité des livreurs, sur le site.
export const CONFIDENTIALITE_LIVREUR = 'https://pearlstreets.com/confidentialite-livreur';

export function corpsJeton(f, pays) {
  const [jour, mois, annee] = f.dob.split('/').map((x) => parseInt(x, 10));
  const champs = {
    'account[business_type]': 'individual',
    'account[individual][first_name]': f.firstName.trim(),
    'account[individual][last_name]': f.lastName.trim(),
    'account[individual][dob][day]': String(jour),
    'account[individual][dob][month]': String(mois),
    'account[individual][dob][year]': String(annee),
    'account[individual][address][line1]': f.line1.trim(),
    'account[individual][address][postal_code]': f.postalCode.trim(),
    'account[individual][address][city]': f.city.trim(),
    'account[individual][address][country]': pays,
    'account[tos_shown_and_accepted]': 'true',
  };
  if (f.email) champs['account[individual][email]'] = f.email;
  return Object.entries(champs).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// Jeton de compte Stripe : { id } ou { erreur } (message de Stripe s'il en donne un).
// Délai de 15 s : réseau coupé ou trop lent = erreur réseau (isNetworkError).
export async function creerJetonCompte(cle, f, pays) {
  return posterJeton(cle, corpsJeton(f, pays));
}

function encoder(champs) {
  return Object.entries(champs).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// Société (25/11/2026) : jeton de compte entreprise. f = champs de la page
// d'inscription (raison sociale, SIRET, adresse, téléphone E.164).
export function corpsJetonSociete(f, pays) {
  const champs = {
    'account[business_type]': 'company',
    'account[company][name]': f.companyName.trim(),
    'account[company][tax_id]': f.siret.replace(/\s/g, ''),
    'account[company][address][line1]': f.line1.trim(),
    'account[company][address][postal_code]': f.postalCode.trim(),
    'account[company][address][city]': f.city.trim(),
    'account[company][address][country]': pays,
    'account[company][owners_provided]': 'true',
    'account[company][directors_provided]': 'true',
    'account[company][executives_provided]': 'true',
    'account[tos_shown_and_accepted]': 'true',
  };
  if (f.phone) champs['account[company][phone]'] = f.phone;
  return encoder(champs);
}

export async function creerJetonSociete(cle, f, pays) {
  return posterJeton(cle, corpsJetonSociete(f, pays));
}

// Personne de la société : représentant légal ou associé de 25 % ou plus.
// p = { firstName, lastName, dob, email, phone?, line1, postalCode, city,
// representant?, titre?, proprietaire? }. Jamais de percent_ownership.
export function corpsJetonPersonne(p, pays) {
  const [jour, mois, annee] = p.dob.split('/').map((x) => parseInt(x, 10));
  const champs = {
    'person[first_name]': p.firstName.trim(),
    'person[last_name]': p.lastName.trim(),
    'person[email]': p.email.trim(),
    'person[dob][day]': String(jour),
    'person[dob][month]': String(mois),
    'person[dob][year]': String(annee),
    'person[address][line1]': p.line1.trim(),
    'person[address][postal_code]': p.postalCode.trim(),
    'person[address][city]': p.city.trim(),
    'person[address][country]': pays,
  };
  if (p.phone) champs['person[phone]'] = p.phone;
  if (p.representant) {
    champs['person[relationship][representative]'] = 'true';
    champs['person[relationship][executive]'] = 'true';
    if (p.titre) champs['person[relationship][title]'] = p.titre.trim();
  }
  if (p.proprietaire) champs['person[relationship][owner]'] = 'true';
  return encoder(champs);
}

export async function creerJetonPersonne(cle, p, pays) {
  return posterJeton(cle, corpsJetonPersonne(p, pays));
}

async function posterJeton(cle, corps) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const minuteur = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
  let rep;
  let jeton;
  try {
    rep = await fetch('https://api.stripe.com/v1/tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps,
      signal: ctrl?.signal,
    });
    jeton = await rep.json();
  } catch {
    const err = new Error('stripe_reseau');
    err.isNetworkError = true;
    throw err;
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
  if (!rep.ok || !jeton?.id) return { erreur: jeton?.error?.message || '' };
  return { id: jeton.id };
}

export function dateValide(dob) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
  if (!m) return false;
  const [j, mo, a] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  const d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 18 && age < 100;
}

// JJ/MM/AAAA -> AAAA-MM-JJ (format attendu par le serveur).
export function dateIso(dob) {
  const [j, m, a] = dob.trim().split('/');
  return `${a}-${m}-${j}`;
}

// Saisie de la date : les barres s'ajoutent seules (JJ/MM/AAAA).
export function formaterDate(txt) {
  const c = txt.replace(/\D/g, '').slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}
