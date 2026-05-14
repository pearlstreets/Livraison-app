# Design — Inscription livreur Pearl Delivery + Stripe Connect
**Date :** 2026-05-01  
**Statut :** Approuvé

---

## Contexte

L'inscription livreur actuelle permet deux statuts (Pro / Particulier) avec 4 documents basiques (CNI recto/verso + IBAN + KBIS) et aucune intégration Stripe pour les paiements. Ce design refond entièrement le flux pour :
- Accepter 3 statuts légaux avec règles par pays
- Collecter les bons documents selon chaque statut
- Intégrer Stripe Connect Express pour les virements automatiques
- Activer les comptes automatiquement via webhook Stripe

---

## Statuts légaux

### 1. Particulier (travailleur occasionnel)

Autorisé uniquement dans les pays où le travail occasionnel sans immatriculation est légal.

| Zone | Pays acceptés | Plafond revenus |
|---|---|---|
| France + DOM/TOM | FR, GP, MQ, RE, GF | 3 000€/an |
| UE/EEE | BE, DE, IT, ES, PT, NL, CH, LU, AT, IE, SE, DK, NO, FI, PL, GB, AU (Autriche) | 5 000€/an |
| GB | GB | 5 000€/an |
| Hors UE | Tous autres | ❌ Bloqué — redirection vers AE ou Société |

Documents requis :
- CNI recto (photo)
- CNI verso (photo)
- Permis de conduire OU attestation sans véhicule motorisé (pour vélo)

Paiement :
- Stripe Connect Express `business_type='individual'` (pas de SIRET requis par Stripe)
- Stripe collecte lui-même : IBAN, date de naissance, adresse, selfie, CNI — comme AE
- Virements automatiques via Stripe Connect
- Alerte push/email à 80% du plafond annuel
- Si plafond atteint : commandes bloquées + message "Passe en auto-entrepreneur"
- `earnings_ytd` remis à zéro automatiquement le 1er janvier (tâche planifiée Django)

### 2. Auto-entrepreneur / Micro-entrepreneur

Uniquement pour les immatriculés en France (SIRET INSEE 14 chiffres).
Inclut les ressortissants étrangers ayant créé leur auto-entreprise en France.

Documents requis :
- CNI recto + verso
- Permis de conduire (ou attestation vélo)
- Numéro SIRET (validé : 14 chiffres)
- Attestation URSSAF ou avis de situation INSEE (document scan)
- Assurance RC Pro (document scan)

Paiement :
- Stripe Connect Express, country = `FR`
- Stripe collecte lui-même : IBAN, date de naissance, adresse, selfie, vérification CNI
- Virements automatiques via Stripe Connect (hebdomadaire par défaut)

### 3. Société (EURL, SARL, SAS, SASU, équivalents EU)

#### 3a. Pays supportés par Stripe Connect Express

| Zone | Pays | Format bancaire | Devise |
|---|---|---|---|
| France + DOM/TOM | FR, GP→FR, MQ→FR, RE→FR, GF→FR | IBAN FR | EUR |
| Zone Euro | BE, DE, IT, ES, PT, NL, LU, AT, IE, FI | IBAN local | EUR |
| Europe hors euro | CH, NO, SE, DK, PL, GB | IBAN / Sort code (GB) | CHF, NOK, SEK, DKK, PLN, GBP |
| Amérique Nord | US, CA, MX | Routing+Account / Transit / CLABE | USD, CAD, MXN |
| Amérique Sud | BR | Dados bancários | BRL |
| Océanie | AU | BSB + Account | AUD |
| Asie-Pacifique | JP, IN | Branch+Account / IFSC | JPY, INR |
| Moyen-Orient | AE | IBAN AE | AED |

Documents requis :
- CNI gérant recto + verso
- Permis de conduire (ou attestation vélo)
- KBIS < 3 mois (ou équivalent : Handelsregister DE, Companies House GB, etc.)
- Numéro SIRET / numéro d'immatriculation
- Assurance RC Pro

Paiement : Stripe Connect Express avec `country` = pays de la société.

#### 3b. Pays hors Stripe Connect Express

Pays : MA, DZ, TN, SN, CI, CM, CD, NG, KE, ZA, SA, LB, EG, TR, RU, HT.

Documents requis : idem 3a + collecte bancaire manuelle :
- IBAN ou numéro de compte
- BIC/SWIFT
- Nom du titulaire (société)
- Pays de la banque

Paiement : virement SEPA ou SWIFT international initié manuellement par Pearl.
Validation obligatoire par un admin avant activation du compte.

---

## Flux d'inscription — 4 étapes

```
Étape 1 — Identifiants
  · Email (validé format)
  · Mot de passe (fort : 8 car., maj, min, chiffre)
  · Confirmation mot de passe

Étape 2 — Profil
  · Prénom / Nom
  · Pays de résidence / siège social
  · Téléphone + indicatif pays
  · Vérification OTP SMS (Firebase, existant)
  · → Si Particulier + pays hors UE : erreur bloquante, redirection AE ou Société

Étape 3 — Statut + Documents
  · Choix du statut (3 cartes : Particulier / Auto-entrepreneur / Société)
  · Documents dynamiques selon statut (voir ci-dessus)
  · Champ SIRET pour AE + Société FR (validation 14 chiffres)
  · Champ numéro immatriculation pour Société étrangère
  · IBAN + BIC pour Particulier + Société hors Stripe (Groupe B)

Étape 4 — Paiement Stripe
  · Tous statuts Groupe A : Stripe Connect Express WebBrowser onboarding
    · Particulier  → business_type='individual' (KYC léger, pas de SIRET Stripe)
    · Auto-entr.   → business_type='individual' (Stripe peut demander SIRET)
    · Société      → business_type='company'
    · Retour app via deep link pearldelivery://stripe-return
  · Groupe B (SEPA manuel) : confirmation des infos bancaires saisies étape 3
```

Après étape 4 : écran "En attente d'activation" (existant, `pendingValidation`).

---

## Activation du compte

| Type | Déclencheur | Activation |
|---|---|---|
| Particulier | Admin valide manuellement dans WebsiteAdmin | `account_active = true` + push + email |
| Auto-entrepreneur | Webhook Stripe `account.updated` → `charges_enabled: true` | Automatique |
| Société Stripe | Webhook Stripe `account.updated` → `charges_enabled: true` | Automatique |
| Société SEPA | Admin valide manuellement dans WebsiteAdmin | `account_active = true` + push + email |

---

## Modifications backend — DeliveryApp

### Nouveaux champs `DeliveryDriverProfile`

```python
legal_status       = CharField(choices=['particulier','auto_entrepreneur','societe'])
payout_method      = CharField(choices=['stripe_connect','stripe_identity_sepa','sepa_manual'])
stripe_account_id  = CharField(max_length=64, blank=True)   # déjà prévu
payouts_enabled    = BooleanField(default=False)
charges_enabled    = BooleanField(default=False)
stripe_onboarding_url = CharField(max_length=512, blank=True)  # URL onboarding (expire 24h)
earnings_cap       = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
earnings_ytd       = DecimalField(max_digits=10, decimal_places=2, default=0)
iban               = CharField(max_length=34, blank=True)
bic                = CharField(max_length=11, blank=True)
iban_holder_name   = CharField(max_length=255, blank=True)
# Docs supplémentaires
driver_license_url = URLField(max_length=1024, blank=True)
rc_pro_url         = URLField(max_length=1024, blank=True)
urssaf_doc_url     = URLField(max_length=1024, blank=True)
# siret, legal_name, legal_address, kbis_doc_url déjà dans le modèle
```

### Nouveaux endpoints

| Méthode | URL | Description |
|---|---|---|
| POST | `/api/v1/delivery/stripe/connect/` | Crée compte Stripe Connect + retourne URL onboarding |
| POST | `/api/v1/delivery/stripe/webhook/` | Webhook Stripe (signature vérifiée) → active compte |
| POST | `/api/v1/delivery/stripe/identity/session/` | Réservé — non utilisé (Particulier passe par Connect Express) |

### Création compte Stripe Connect Express

```python
account = stripe.Account.create(
    type='express',
    country=driver_country,           # 'FR', 'US', 'GB', 'JP', etc.
    email=driver_email,
    capabilities={'transfers': {'requested': True}},
    business_type='individual',       # 'company' pour Société ; 'individual' pour Particulier + AE
    business_profile={'mcc': '4215'}, # livraison de colis
    metadata={
        'driver_id': str(driver_profile.id),
        'legal_status': driver_profile.legal_status,
    },
)
account_link = stripe.AccountLink.create(
    account=account.id,
    refresh_url='https://pearldelivery://stripe-refresh',
    return_url='https://pearldelivery://stripe-return',
    type='account_onboarding',
)
```

### Webhook Stripe — activation automatique

```python
# POST /api/v1/delivery/stripe/webhook/
# Événements écoutés : account.updated
if event.type == 'account.updated':
    account = event.data.object
    if account.charges_enabled and account.payouts_enabled:
        driver = DeliveryDriverProfile.objects.get(
            stripe_account_id=account.id
        )
        driver.account_active = True
        driver.payouts_enabled = True
        driver.charges_enabled = True
        driver.save()
        # Envoyer push notification + email
```

---

## Modifications app mobile — LoginScreen.js

### Étape "choose" : 3 cartes
```
[🚲 Particulier]        → pays validé (UE/FR uniquement)
[🏪 Auto-entrepreneur]  → SIRET français obligatoire
[🏢 Société]            → KBIS + numéro immatriculation
```

### Documents dynamiques étape 3

```javascript
const DOCS_BY_STATUS = {
  particulier: [
    { key: 'id_front',   label: 'CNI recto',          required: true },
    { key: 'id_back',    label: 'CNI verso',           required: true },
    { key: 'license',    label: 'Permis de conduire',  required: false, note: 'ou attestation vélo' },
  ],
  auto_entrepreneur: [
    { key: 'id_front',   label: 'CNI recto',           required: true },
    { key: 'id_back',    label: 'CNI verso',            required: true },
    { key: 'license',    label: 'Permis de conduire',   required: false },
    { key: 'siret',      label: 'Numéro SIRET',         required: true, type: 'text' },
    { key: 'urssaf',     label: 'Attestation URSSAF',   required: true },
    { key: 'rc_pro',     label: 'Assurance RC Pro',     required: true },
  ],
  societe: [
    { key: 'id_front',   label: 'CNI gérant recto',    required: true },
    { key: 'id_back',    label: 'CNI gérant verso',     required: true },
    { key: 'license',    label: 'Permis de conduire',   required: false },
    { key: 'kbis',       label: 'KBIS < 3 mois',        required: true },
    { key: 'siret',      label: 'SIRET / Immatriculation', required: true, type: 'text' },
    { key: 'rc_pro',     label: 'Assurance RC Pro',     required: true },
    // + IBAN + BIC si pays Groupe B (hors Stripe)
  ],
};
```

### Étape 4 — Stripe

```javascript
// Groupe A : Stripe Connect Express
const { url } = await api.post('/api/v1/delivery/stripe/connect/');
await WebBrowser.openBrowserAsync(url);
// Deep link retour → pearldelivery://stripe-return → setPendingValidation(true)

// Particulier : Stripe Identity
const { session_url } = await api.post('/api/v1/delivery/stripe/identity/session/');
await WebBrowser.openBrowserAsync(session_url);
```

---

## Modifications WebsiteAdmin

- Vue "Livreurs en attente" : liste avec statut légal + statut Stripe + documents
- Bouton "Activer manuellement" (pour Particuliers + Sociétés SEPA)
- Aperçu des documents uploadés (URL S3 sécurisées)
- Badge couleur : `pending` (orange) / `stripe_processing` (bleu) / `active` (vert) / `rejected` (rouge)

---

## Alerte plafond Particulier

- Champ `earnings_ytd` mis à jour à chaque virement
- Signal Django post_save : si `earnings_ytd >= earnings_cap * 0.8` → push + email "Tu approches ton plafond annuel"
- Si `earnings_ytd >= earnings_cap` → commandes bloquées côté app + message "Passe en auto-entrepreneur pour continuer"

---

## Sécurité

- Webhook Stripe : vérification signature `stripe.Webhook.construct_event(payload, sig, secret)`
- Documents S3 : pre-signed URLs (existant, `driver_doc_presign.py`)
- SIRET : validation format 14 chiffres côté app + backend
- `earnings_cap` et `legal_status` non modifiables par le driver lui-même (admin only)

---

## Dépendances techniques

- `stripe` Python SDK (déjà dans le projet ?)
- `expo-web-browser` (app mobile — pour l'onboarding Stripe)
- `expo-linking` (deep links retour — déjà configuré)
- Variables d'env : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`
