// Compte de virement Stripe du livreur (26/10/2026), partagé par
// l'inscription et l'écran « Recevoir mes virements ». Le jeton de compte est
// fabriqué dans l'app avec la clé publique (exigence Stripe pour une
// plateforme française), le serveur crée ensuite le compte.

export const CONTRAT_STRIPE = 'https://stripe.com/fr/legal/connect-account';

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
export async function creerJetonCompte(cle, f, pays) {
  const rep = await fetch('https://api.stripe.com/v1/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpsJeton(f, pays),
  });
  const jeton = await rep.json();
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
