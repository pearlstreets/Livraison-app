# Driver Registration V2 — Stripe Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Refondre l'inscription livreur avec 3 statuts légaux (Particulier/AE/Société), documents complets par statut, et Stripe Connect Express pour les virements automatiques.

**Architecture:** Backend Django ajoute champs légaux + endpoints Stripe Connect ; app mobile refond LoginScreen en 4 étapes avec documents dynamiques et WebBrowser Stripe ; WebsiteAdmin ajoute vue de validation manuelle.

**Tech Stack:** Django 4.2 + DRF + stripe==11.6.0 (déjà installé) / React Native Expo + expo-web-browser (déjà installé) / S3 presign (existant)

**Spec:** `docs/superpowers/specs/2026-05-01-driver-registration-stripe-design.md`

---

## PHASE 1 — BACKEND

### Task 1 : Nouveaux champs DeliveryDriverProfile

**Files:**
- Modify: `Backend/Marketplace/DeliveryApp/models.py`
- Create: `Backend/Marketplace/DeliveryApp/migrations/0004_driver_registration_v2.py`

- [ ] **Step 1 : Ajouter les constantes et champs au modèle**

Dans `Backend/Marketplace/DeliveryApp/models.py`, après la définition de `VAT_REGIME_CHOICES` (ligne ~49) et avant `professional_user`, ajouter les constantes et champs :

```python
    LEGAL_STATUS_CHOICES = [
        ('particulier', 'Particulier'),
        ('auto_entrepreneur', 'Auto-entrepreneur'),
        ('societe', 'Société'),
    ]
    PAYOUT_METHOD_CHOICES = [
        ('stripe_connect', 'Stripe Connect Express'),
        ('sepa_manual', 'SEPA Manuel'),
    ]
```

Puis après le champ `kbis_doc_url` (ligne ~83), ajouter :

```python
    # V2 registration fields
    legal_status = models.CharField(
        max_length=20, choices=LEGAL_STATUS_CHOICES, default='particulier', blank=True,
    )
    payout_method = models.CharField(
        max_length=20, choices=PAYOUT_METHOD_CHOICES, default='stripe_connect', blank=True,
    )
    stripe_account_id = models.CharField(max_length=64, blank=True, default='')
    payouts_enabled = models.BooleanField(default=False)
    charges_enabled = models.BooleanField(default=False)
    stripe_onboarding_url = models.CharField(max_length=512, blank=True, default='')
    earnings_cap = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Plafond annuel en € pour les particuliers. Null = pas de limite.',
    )
    earnings_ytd = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Revenus année en cours (reset 1er janvier).',
    )
    iban = models.CharField(max_length=34, blank=True, default='')
    bic = models.CharField(max_length=11, blank=True, default='')
    iban_holder_name = models.CharField(max_length=255, blank=True, default='')
    driver_license_url = models.URLField(max_length=1024, blank=True, default='')
    rc_pro_url = models.URLField(max_length=1024, blank=True, default='')
    urssaf_doc_url = models.URLField(max_length=1024, blank=True, default='')
```

- [ ] **Step 2 : Créer la migration**

```bash
cd "Backend/Marketplace"
python manage.py makemigrations DeliveryApp --name driver_registration_v2
```

Vérifier que le fichier `0004_driver_registration_v2.py` est généré avec tous les champs.

- [ ] **Step 3 : Appliquer la migration**

```bash
python manage.py migrate DeliveryApp
```

Expected : `Applying DeliveryApp.0004_driver_registration_v2... OK`

- [ ] **Step 4 : Commit**

```bash
cd "Backend/Marketplace"
git add DeliveryApp/models.py DeliveryApp/migrations/0004_driver_registration_v2.py
git commit -m "feat(delivery): add legal_status, stripe_connect and payout fields to DeliveryDriverProfile"
```

---

### Task 2 : Constantes pays Stripe + validation légale

**Files:**
- Create: `Backend/Marketplace/DeliveryApp/registration_constants.py`

- [ ] **Step 1 : Créer le fichier de constantes**

Créer `Backend/Marketplace/DeliveryApp/registration_constants.py` :

```python
"""
Constantes pour la validation des pays et statuts légaux à l'inscription.
"""

# Pays supportés par Stripe Connect Express (depuis la liste des pays de l'app).
# Les DOM/TOM français sont mappés vers 'FR' lors de la création du compte Stripe.
STRIPE_CONNECT_COUNTRIES = frozenset({
    'FR', 'BE', 'DE', 'IT', 'ES', 'PT', 'NL', 'CH', 'LU', 'AT', 'IE',
    'SE', 'DK', 'NO', 'FI', 'PL', 'GB', 'US', 'CA', 'MX', 'BR', 'AU',
    'JP', 'IN', 'AE',
    # DOM/TOM → mappés vers FR pour Stripe
    'GP', 'MQ', 'RE', 'GF',
})

# DOM/TOM : code pays → code Stripe à utiliser
DOM_TOM_TO_STRIPE = {
    'GP': 'FR', 'MQ': 'FR', 'RE': 'FR', 'GF': 'FR',
}

# Pays où le statut "particulier" (travailleur occasionnel) est légalement autorisé
# sans immatriculation pour travailler via une plateforme de livraison.
PARTICULIER_ALLOWED_COUNTRIES = frozenset({
    'FR', 'GP', 'MQ', 'RE', 'GF',           # France + DOM/TOM
    'BE', 'DE', 'IT', 'ES', 'PT', 'NL',     # Zone Euro
    'CH', 'LU', 'AT', 'IE', 'SE', 'DK',     # Europe élargie
    'NO', 'FI', 'PL', 'GB',
})

# Plafond de revenus annuels (€) par pays pour les particuliers.
# Au-delà : alerte + blocage → doit passer en auto-entrepreneur.
PARTICULIER_EARNINGS_CAP = {
    'FR': 3000, 'GP': 3000, 'MQ': 3000, 'RE': 3000, 'GF': 3000,
    'BE': 5000, 'DE': 5000, 'IT': 5000, 'ES': 5000, 'PT': 5000,
    'NL': 5000, 'CH': 5000, 'LU': 5000, 'AT': 5000, 'IE': 5000,
    'SE': 5000, 'DK': 5000, 'NO': 5000, 'FI': 5000, 'PL': 5000,
    'GB': 5000,
}


def get_stripe_country(country_code: str) -> str:
    """Retourne le code pays Stripe (gère DOM/TOM → FR)."""
    return DOM_TOM_TO_STRIPE.get(country_code, country_code)


def get_payout_method(country_code: str) -> str:
    """'stripe_connect' si le pays est supporté, 'sepa_manual' sinon."""
    return 'stripe_connect' if country_code in STRIPE_CONNECT_COUNTRIES else 'sepa_manual'


def get_earnings_cap(legal_status: str, country_code: str):
    """Retourne le plafond annuel pour un particulier, None pour AE/société."""
    if legal_status != 'particulier':
        return None
    return PARTICULIER_EARNINGS_CAP.get(country_code)
```

- [ ] **Step 2 : Commit**

```bash
git add DeliveryApp/registration_constants.py
git commit -m "feat(delivery): add country/Stripe registration constants"
```

---

### Task 3 : Mettre à jour le serializer d'inscription

**Files:**
- Modify: `Backend/Marketplace/DeliveryApp/serializers.py`

- [ ] **Step 1 : Ajouter les nouveaux champs à `DeliveryDriverRegistrationSerializer`**

Dans `serializers.py`, remplacer la classe `DeliveryDriverRegistrationSerializer` (lignes 81–173) par :

```python
class DeliveryDriverRegistrationSerializer(serializers.Serializer):
    # ── Identifiants ────────────────────────────────────────────────────────
    userName = serializers.CharField(max_length=100, min_length=2)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    phone = serializers.CharField(max_length=15, min_length=7)
    phoneCode = serializers.CharField(max_length=5, required=False, default='')
    vehicle_type = serializers.ChoiceField(
        choices=DeliveryDriverProfile.VEHICLE_CHOICES, default='scooter'
    )
    firebase_uid = serializers.CharField(max_length=128, required=False, allow_blank=True)

    # ── Statut légal ────────────────────────────────────────────────────────
    legal_status = serializers.ChoiceField(
        choices=['particulier', 'auto_entrepreneur', 'societe'], default='particulier'
    )
    country = serializers.CharField(max_length=2, required=False, default='FR')
    siret = serializers.CharField(max_length=14, required=False, allow_blank=True, default='')
    legal_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    # ── Documents S3 (URLs pré-signées) ────────────────────────────────────
    id_card_front_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    id_card_back_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    driver_license_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    rc_pro_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    urssaf_doc_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    kbis_doc_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')
    iban_doc_url = serializers.URLField(max_length=1024, required=False, allow_blank=True, default='')

    # ── Paiement (Groupe B SEPA manuel) ────────────────────────────────────
    iban = serializers.CharField(max_length=34, required=False, allow_blank=True, default='')
    bic = serializers.CharField(max_length=11, required=False, allow_blank=True, default='')
    iban_holder_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    # ── Validators ──────────────────────────────────────────────────────────

    def validate_userName(self, value):
        value = value.strip()
        if not re.match(r'^[\w\s\-\.]+$', value):
            raise serializers.ValidationError(
                "Username may only contain letters, numbers, spaces, hyphens, dots, and underscores."
            )
        return sanitize_text(value, max_length=100)

    def validate_email(self, value):
        value = value.strip().lower()
        if ProfessionalUser.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not re.match(r'^\+?[0-9]{7,15}$', value):
            raise serializers.ValidationError(
                "Phone number must be 7-15 digits, optionally prefixed with +."
            )
        if ProfessionalUser.objects.filter(phone=value).exists():
            raise serializers.ValidationError("A user with this phone number already exists.")
        return value

    def validate_phoneCode(self, value):
        value = value.strip()
        if value and not re.match(r'^\+?[0-9]{1,4}$', value):
            raise serializers.ValidationError("Invalid phone code format.")
        return value

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters.")
        return value

    def validate_siret(self, value):
        value = value.strip().replace(' ', '')
        if value and not re.match(r'^\d{14}$', value):
            raise serializers.ValidationError("SIRET must be exactly 14 digits.")
        return value

    def validate(self, data):
        from .registration_constants import PARTICULIER_ALLOWED_COUNTRIES
        legal_status = data.get('legal_status', 'particulier')
        country = data.get('country', 'FR').upper()
        data['country'] = country

        # Particulier : pays autorisés seulement
        if legal_status == 'particulier' and country not in PARTICULIER_ALLOWED_COUNTRIES:
            raise serializers.ValidationError(
                {"legal_status": "Le statut Particulier n'est pas disponible pour ce pays. "
                                 "Veuillez choisir Auto-entrepreneur ou Société."}
            )

        # Auto-entrepreneur : SIRET obligatoire
        if legal_status == 'auto_entrepreneur' and not data.get('siret', '').strip():
            raise serializers.ValidationError(
                {"siret": "Le numéro SIRET est obligatoire pour les auto-entrepreneurs."}
            )

        # Société : SIRET ou numéro d'immatriculation obligatoire
        if legal_status == 'societe' and not data.get('siret', '').strip():
            raise serializers.ValidationError(
                {"siret": "Le numéro d'immatriculation est obligatoire pour les sociétés."}
            )
        return data

    def create(self, validated_data):
        from .registration_constants import get_payout_method, get_earnings_cap, get_stripe_country

        vehicle_type = validated_data.pop('vehicle_type', 'scooter')
        legal_status = validated_data.pop('legal_status', 'particulier')
        country = validated_data.pop('country', 'FR')
        siret = validated_data.pop('siret', '')
        legal_name = validated_data.pop('legal_name', '')
        firebase_uid = validated_data.pop('firebase_uid', '') or None

        doc_fields = (
            'id_card_front_url', 'id_card_back_url', 'driver_license_url',
            'rc_pro_url', 'urssaf_doc_url', 'kbis_doc_url', 'iban_doc_url',
        )
        doc_urls = {f: validated_data.pop(f, '') for f in doc_fields}

        bank_fields = ('iban', 'bic', 'iban_holder_name')
        bank_data = {f: validated_data.pop(f, '') for f in bank_fields}

        role, _ = Role.objects.get_or_create(name='deliverydriver')
        professional_user = ProfessionalUser.objects.create(
            userName=validated_data['userName'],
            email=validated_data['email'],
            password=make_password(validated_data['password']),
            phone=validated_data['phone'],
            phoneCode=validated_data.get('phoneCode', ''),
            role=role,
            term_condition=True,
            firebase_uid=firebase_uid,
            last_otp_provider='firebase' if firebase_uid else None,
        )

        payout_method = get_payout_method(country)
        earnings_cap = get_earnings_cap(legal_status, country)

        driver_profile = DeliveryDriverProfile.objects.create(
            professional_user=professional_user,
            vehicle_type=vehicle_type,
            legal_status=legal_status,
            country=country,
            payout_method=payout_method,
            earnings_cap=earnings_cap,
            siret=siret,
            legal_name=legal_name,
            **{k: v for k, v in doc_urls.items() if v},
            **{k: v for k, v in bank_data.items() if v},
        )
        return driver_profile
```

- [ ] **Step 2 : Commit**

```bash
git add DeliveryApp/serializers.py
git commit -m "feat(delivery): update registration serializer with legal_status, docs, SIRET, bank fields"
```

---

### Task 4 : Mettre à jour la vue d'inscription

**Files:**
- Modify: `Backend/Marketplace/DeliveryApp/views.py` (fonction `DeliveryDriverRegisterView.post`)

- [ ] **Step 1 : Mettre à jour `allowed_fields` et la réponse**

Remplacer le bloc `allowed_fields` dans `DeliveryDriverRegisterView.post` (lignes ~187–195) :

```python
        allowed_fields = {
            'userName', 'email', 'password', 'phone', 'phoneCode', 'vehicle_type',
            'firebase_uid',
            # V2 legal status
            'legal_status', 'country', 'siret', 'legal_name',
            # V2 documents
            'id_card_front_url', 'id_card_back_url', 'driver_license_url',
            'rc_pro_url', 'urssaf_doc_url', 'kbis_doc_url', 'iban_doc_url',
            # V2 bank (SEPA manuel Groupe B)
            'iban', 'bic', 'iban_holder_name',
        }
```

- [ ] **Step 2 : Commit**

```bash
git add DeliveryApp/views.py
git commit -m "feat(delivery): update register view allowed_fields for V2"
```

---

### Task 5 : Mettre à jour DeliveryDriverProfileSerializer

**Files:**
- Modify: `Backend/Marketplace/DeliveryApp/serializers.py`

- [ ] **Step 1 : Exposer les nouveaux champs dans le serializer de profil**

Dans `DeliveryDriverProfileSerializer`, remplacer `fields` par :

```python
        fields = [
            'id', 'email', 'userName', 'phone', 'phoneCode',
            'vehicle_type', 'is_online', 'current_lat', 'current_lng',
            'last_location_update', 'rating', 'total_deliveries',
            'total_earnings', 'warnings_count', 'account_active', 'is_verified',
            # V2 fields
            'legal_status', 'payout_method', 'country',
            'stripe_account_id', 'payouts_enabled', 'charges_enabled',
            'earnings_cap', 'earnings_ytd',
            'iban', 'bic', 'iban_holder_name',
            'siret', 'legal_name',
            'id_card_front_url', 'id_card_back_url', 'driver_license_url',
            'rc_pro_url', 'urssaf_doc_url', 'kbis_doc_url', 'iban_doc_url',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'rating', 'total_deliveries', 'total_earnings',
            'warnings_count', 'account_active', 'created_at', 'updated_at',
            'last_location_update', 'stripe_account_id', 'payouts_enabled',
            'charges_enabled', 'earnings_ytd', 'payout_method', 'earnings_cap',
        ]
```

- [ ] **Step 2 : Commit**

```bash
git add DeliveryApp/serializers.py
git commit -m "feat(delivery): expose V2 fields in DeliveryDriverProfileSerializer"
```

---

### Task 6 : Endpoints Stripe Connect + Webhook

**Files:**
- Create: `Backend/Marketplace/DeliveryApp/stripe_connect.py`
- Modify: `Backend/Marketplace/DeliveryApp/urls.py`

- [ ] **Step 1 : Créer `stripe_connect.py`**

```python
"""
Stripe Connect Express — création de compte et webhook d'activation.

Endpoints :
  POST /api/v1/delivery/stripe/connect/  → crée compte + retourne URL onboarding
  POST /api/v1/delivery/stripe/webhook/  → active le compte sur charges_enabled
"""
import logging

import stripe
from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from Marketplace.authentication import CustomJWTAuthentication
from .models import DeliveryDriverProfile
from .registration_constants import get_stripe_country
from .views import get_driver_profile

logger = logging.getLogger('delivery_security')

DEEP_LINK_RETURN = 'pearldelivery://stripe-return'
DEEP_LINK_REFRESH = 'pearldelivery://stripe-refresh'


def _get_stripe():
    key = getattr(settings, 'STRIPE_SECRET_KEY', '')
    if not key:
        raise RuntimeError('STRIPE_SECRET_KEY not configured')
    stripe.api_key = key
    return stripe


class StripeConnectCreateView(APIView):
    """POST — Crée un compte Stripe Connect Express et retourne l'URL d'onboarding."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile = get_driver_profile(request.user)
        if not profile:
            return Response({'message': 'Driver profile not found.'}, status=404)

        if profile.payout_method == 'sepa_manual':
            return Response(
                {'message': 'Stripe Connect non disponible pour ce pays.', 'payout_method': 'sepa_manual'},
                status=200,
            )

        # Compte déjà créé → retourner un nouveau lien (expire en 24h)
        s = _get_stripe()
        if profile.stripe_account_id:
            try:
                link = s.AccountLink.create(
                    account=profile.stripe_account_id,
                    refresh_url=DEEP_LINK_REFRESH,
                    return_url=DEEP_LINK_RETURN,
                    type='account_onboarding',
                )
                return Response({'url': link.url, 'stripe_account_id': profile.stripe_account_id})
            except stripe.error.StripeError as e:
                logger.exception('Stripe AccountLink failed: %s', e)
                return Response({'message': 'Stripe error.'}, status=502)

        stripe_country = get_stripe_country(profile.country or 'FR')
        business_type = 'company' if profile.legal_status == 'societe' else 'individual'

        try:
            account = s.Account.create(
                type='express',
                country=stripe_country,
                email=request.user.email,
                capabilities={'transfers': {'requested': True}},
                business_type=business_type,
                business_profile={'mcc': '4215'},  # livraison de colis
                metadata={
                    'driver_id': str(profile.id),
                    'legal_status': profile.legal_status,
                    'platform': 'pearl_delivery',
                },
            )
            profile.stripe_account_id = account.id
            profile.save(update_fields=['stripe_account_id'])

            link = s.AccountLink.create(
                account=account.id,
                refresh_url=DEEP_LINK_REFRESH,
                return_url=DEEP_LINK_RETURN,
                type='account_onboarding',
            )
            return Response({'url': link.url, 'stripe_account_id': account.id}, status=201)

        except stripe.error.StripeError as e:
            logger.exception('Stripe Account.create failed: %s', e)
            return Response({'message': 'Stripe error. Please retry.'}, status=502)


class StripeConnectWebhookView(APIView):
    """POST — Webhook Stripe : active le compte livreur quand charges_enabled=true."""
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
        webhook_secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET_CONNECT', '')

        if not webhook_secret:
            logger.error('STRIPE_WEBHOOK_SECRET_CONNECT not configured')
            return Response(status=400)

        s = _get_stripe()
        try:
            event = s.Webhook.construct_event(payload, sig_header, webhook_secret)
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.warning('Stripe webhook signature failed: %s', e)
            return Response(status=400)

        if event.type == 'account.updated':
            account = event.data.object
            if not account.charges_enabled:
                return Response(status=200)

            try:
                profile = DeliveryDriverProfile.objects.select_related('professional_user').get(
                    stripe_account_id=account.id
                )
            except DeliveryDriverProfile.DoesNotExist:
                logger.warning('Webhook: no driver found for stripe_account_id=%s', account.id)
                return Response(status=200)

            updated = False
            if not profile.account_active:
                profile.account_active = True
                updated = True
            if not profile.payouts_enabled and account.payouts_enabled:
                profile.payouts_enabled = True
                updated = True
            if not profile.charges_enabled:
                profile.charges_enabled = True
                updated = True

            if updated:
                profile.save(update_fields=['account_active', 'payouts_enabled', 'charges_enabled'])
                _notify_driver_activated(profile)
                logger.info('Driver %s activated via Stripe webhook', profile.id)

        return Response(status=200)


def _notify_driver_activated(profile):
    """Envoie push + email au livreur quand son compte est activé."""
    try:
        from .push import send_push_to_driver
        send_push_to_driver(
            profile,
            title='Compte activé !',
            body='Votre compte Pearl Delivery est maintenant actif. Bonne livraison !',
        )
    except Exception:
        pass

    try:
        from django.core.mail import send_mail
        send_mail(
            subject='Votre compte Pearl Delivery est activé',
            message=(
                f'Bonjour {profile.professional_user.userName},\n\n'
                'Votre compte livreur Pearl Delivery a été validé par Stripe.\n'
                'Vous pouvez maintenant accepter des livraisons.\n\n'
                'L\'équipe Pearl Streets'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[profile.professional_user.email],
            fail_silently=True,
        )
    except Exception:
        pass
```

- [ ] **Step 2 : Ajouter les routes dans `urls.py`**

Dans `DeliveryApp/urls.py`, ajouter après les imports existants :

```python
from .stripe_connect import StripeConnectCreateView, StripeConnectWebhookView
```

Et ajouter dans `urlpatterns` :

```python
    # Stripe Connect
    path('stripe/connect/', StripeConnectCreateView.as_view(), name='delivery-stripe-connect'),
    path('stripe/webhook/', StripeConnectWebhookView.as_view(), name='delivery-stripe-webhook'),
```

- [ ] **Step 3 : Commit**

```bash
git add DeliveryApp/stripe_connect.py DeliveryApp/urls.py
git commit -m "feat(delivery): add Stripe Connect Express account creation and webhook activation"
```

---

### Task 7 : Commande de reset earnings_ytd annuel

**Files:**
- Create: `Backend/Marketplace/DeliveryApp/management/commands/reset_driver_earnings_ytd.py`

- [ ] **Step 1 : Créer la commande**

```python
"""
Management command : reset earnings_ytd à 0 pour tous les particuliers.
À planifier via cron le 1er janvier à 00h01 :
  0 1 1 1 * python manage.py reset_driver_earnings_ytd
"""
from django.core.management.base import BaseCommand
from DeliveryApp.models import DeliveryDriverProfile


class Command(BaseCommand):
    help = 'Remet earnings_ytd à 0 pour tous les livreurs particuliers (reset annuel).'

    def handle(self, *args, **options):
        count = DeliveryDriverProfile.objects.filter(
            legal_status='particulier',
        ).update(earnings_ytd=0)
        self.stdout.write(self.style.SUCCESS(f'Reset earnings_ytd pour {count} livreurs particuliers.'))
```

- [ ] **Step 2 : Commit**

```bash
git add DeliveryApp/management/commands/reset_driver_earnings_ytd.py
git commit -m "feat(delivery): add annual earnings_ytd reset management command"
```

---

### Task 8 : Endpoint admin — liste livreurs en attente + activation manuelle

**Files:**
- Modify: `Backend/Marketplace/DeliveryApp/admin_urls.py`
- Modify: `Backend/Marketplace/DeliveryApp/views.py` (ajouter 2 vues admin)

- [ ] **Step 1 : Ajouter vues admin dans `views.py`**

À la fin de `views.py`, ajouter :

```python
class AdminPendingDriversView(APIView):
    """GET — Liste des livreurs en attente de validation manuelle."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsAdministrator]

    def get(self, request):
        profiles = DeliveryDriverProfile.objects.filter(
            account_active=False,
        ).select_related('professional_user').order_by('-created_at')

        data = []
        for p in profiles:
            data.append({
                'id': p.id,
                'email': p.professional_user.email,
                'userName': p.professional_user.userName,
                'legal_status': p.legal_status,
                'payout_method': p.payout_method,
                'country': p.country,
                'siret': p.siret,
                'stripe_account_id': p.stripe_account_id,
                'charges_enabled': p.charges_enabled,
                'created_at': p.created_at.isoformat(),
                'docs': {
                    'id_card_front_url': p.id_card_front_url,
                    'id_card_back_url': p.id_card_back_url,
                    'driver_license_url': p.driver_license_url,
                    'rc_pro_url': p.rc_pro_url,
                    'urssaf_doc_url': p.urssaf_doc_url,
                    'kbis_doc_url': p.kbis_doc_url,
                },
            })
        return Response({'drivers': data, 'count': len(data)})


class AdminActivateDriverView(APIView):
    """POST — Active ou rejette manuellement un compte livreur."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsAdministrator]

    def post(self, request, driver_id):
        action = request.data.get('action')  # 'activate' | 'reject'
        if action not in ('activate', 'reject'):
            return Response({'message': "action doit être 'activate' ou 'reject'."}, status=400)

        try:
            profile = DeliveryDriverProfile.objects.select_related('professional_user').get(id=driver_id)
        except DeliveryDriverProfile.DoesNotExist:
            return Response({'message': 'Driver not found.'}, status=404)

        if action == 'activate':
            profile.account_active = True
            profile.save(update_fields=['account_active'])
            from .stripe_connect import _notify_driver_activated
            _notify_driver_activated(profile)
            return Response({'message': 'Driver activated.'})

        # reject
        profile.account_active = False
        profile.save(update_fields=['account_active'])
        try:
            from django.core.mail import send_mail
            send_mail(
                subject='Votre demande Pearl Delivery',
                message=(
                    f'Bonjour {profile.professional_user.userName},\n\n'
                    'Après examen de votre dossier, nous ne pouvons pas valider '
                    'votre inscription pour le moment.\n'
                    'Contactez support@pearlstreets.com pour plus d\'informations.\n\n'
                    'L\'équipe Pearl Streets'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[profile.professional_user.email],
                fail_silently=True,
            )
        except Exception:
            pass
        return Response({'message': 'Driver rejected.'})
```

- [ ] **Step 2 : Ajouter les routes dans `admin_urls.py`**

```python
from .views import AdminPendingDriversView, AdminActivateDriverView

# Ajouter dans urlpatterns :
path('drivers/pending/', AdminPendingDriversView.as_view(), name='admin-drivers-pending'),
path('drivers/<int:driver_id>/activate/', AdminActivateDriverView.as_view(), name='admin-driver-activate'),
```

- [ ] **Step 3 : Commit**

```bash
git add DeliveryApp/views.py DeliveryApp/admin_urls.py
git commit -m "feat(delivery): add admin endpoints for pending drivers list and manual activation"
```

---

## PHASE 2 — APP MOBILE

### Task 9 : Refonte LoginScreen — 3 statuts + pays + documents dynamiques

**Files:**
- Modify: `screens/LoginScreen.js` (rm + Write complet)

> Note: Ce fichier fait 848 lignes. Conformément à CLAUDE.md (hook preserve-features-guard), utiliser `rm` puis `Write` pour un rewrite complet.

- [ ] **Step 1 : Créer `screens/registrationConfig.js` (config documents par statut)**

```javascript
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

// Pays où "Particulier" est autorisé
export const PARTICULIER_ALLOWED = new Set([
  'FR','GP','MQ','RE','GF',
  'BE','DE','IT','ES','PT','NL','CH','LU','AT','IE',
  'SE','DK','NO','FI','PL','GB',
]);

// Pays supportés par Stripe Connect Express
export const STRIPE_CONNECT_COUNTRIES = new Set([
  'FR','GP','MQ','RE','GF',
  'BE','DE','IT','ES','PT','NL','CH','LU','AT','IE',
  'SE','DK','NO','FI','PL','GB',
  'US','CA','MX','BR','AU','JP','IN','AE',
]);

export const DOCS_BY_STATUS = {
  particulier: [
    { key: 'id_card_front_url', slot: 'id_front', labelKey: 'docIdFront', required: true, icon: 'card-outline' },
    { key: 'id_card_back_url',  slot: 'id_back',  labelKey: 'docIdBack',  required: true, icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, note: 'docDriverLicenseNote', icon: 'car-outline' },
  ],
  auto_entrepreneur: [
    { key: 'id_card_front_url',  slot: 'id_front',       labelKey: 'docIdFront',       required: true,  icon: 'card-outline' },
    { key: 'id_card_back_url',   slot: 'id_back',        labelKey: 'docIdBack',        required: true,  icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, icon: 'car-outline' },
    { key: 'urssaf_doc_url',     slot: 'urssaf',         labelKey: 'docUrssaf',        required: true,  icon: 'document-text-outline' },
    { key: 'rc_pro_url',         slot: 'rc_pro',         labelKey: 'docRcPro',         required: true,  icon: 'shield-checkmark-outline' },
  ],
  societe: [
    { key: 'id_card_front_url',  slot: 'id_front',       labelKey: 'docIdFront',       required: true,  icon: 'card-outline' },
    { key: 'id_card_back_url',   slot: 'id_back',        labelKey: 'docIdBack',        required: true,  icon: 'card-outline' },
    { key: 'driver_license_url', slot: 'driver_license', labelKey: 'docDriverLicense', required: false, icon: 'car-outline' },
    { key: 'kbis_doc_url',       slot: 'kbis',           labelKey: 'docKbis',          required: true,  icon: 'business-outline' },
    { key: 'rc_pro_url',         slot: 'rc_pro',         labelKey: 'docRcPro',         required: true,  icon: 'shield-checkmark-outline' },
  ],
};
```

- [ ] **Step 2 : Commit**

```bash
git add screens/registrationConfig.js
git commit -m "feat(delivery-app): add registration config (statuses, countries, docs by status)"
```

- [ ] **Step 3 : Sauvegarder + remplacer LoginScreen.js**

```bash
cp screens/LoginScreen.js /tmp/LoginScreen.js.bak
rm screens/LoginScreen.js
```

Puis écrire le nouveau fichier `screens/LoginScreen.js` :

```javascript
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList,
  SafeAreaView, ActivityIndicator, InputAccessoryView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isValidEmail, sanitizeInput, isStrongPassword } from '../utils/validation';
import * as ImagePicker from 'expo-image-picker';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import useOtpSender from '../services/otpauth/useOtpSender';
import { getFirebaseApp } from '../services/otpauth/firebase';
import api from '../services/api';
import {
  LEGAL_STATUSES, DOCS_BY_STATUS, PARTICULIER_ALLOWED, STRIPE_CONNECT_COUNTRIES,
} from './registrationConfig';

const BRAND = '#00C29B';
const MAX_LOGIN_FAILS = 3;
const LOGIN_COOLDOWN_MS = 30000;

const COUNTRIES = [
  { code: 'FR', flag: '🇫🇷', name: 'France', phoneCode: '+33' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgique', phoneCode: '+32' },
  { code: 'GB', flag: '🇬🇧', name: 'Royaume-Uni', phoneCode: '+44' },
  { code: 'DE', flag: '🇩🇪', name: 'Allemagne', phoneCode: '+49' },
  { code: 'IT', flag: '🇮🇹', name: 'Italie', phoneCode: '+39' },
  { code: 'ES', flag: '🇪🇸', name: 'Espagne', phoneCode: '+34' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal', phoneCode: '+351' },
  { code: 'NL', flag: '🇳🇱', name: 'Pays-Bas', phoneCode: '+31' },
  { code: 'CH', flag: '🇨🇭', name: 'Suisse', phoneCode: '+41' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg', phoneCode: '+352' },
  { code: 'AT', flag: '🇦🇹', name: 'Autriche', phoneCode: '+43' },
  { code: 'IE', flag: '🇮🇪', name: 'Irlande', phoneCode: '+353' },
  { code: 'SE', flag: '🇸🇪', name: 'Suède', phoneCode: '+46' },
  { code: 'DK', flag: '🇩🇰', name: 'Danemark', phoneCode: '+45' },
  { code: 'NO', flag: '🇳🇴', name: 'Norvège', phoneCode: '+47' },
  { code: 'FI', flag: '🇫🇮', name: 'Finlande', phoneCode: '+358' },
  { code: 'PL', flag: '🇵🇱', name: 'Pologne', phoneCode: '+48' },
  { code: 'MA', flag: '🇲🇦', name: 'Maroc', phoneCode: '+212' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisie', phoneCode: '+216' },
  { code: 'DZ', flag: '🇩🇿', name: 'Algérie', phoneCode: '+213' },
  { code: 'SN', flag: '🇸🇳', name: 'Sénégal', phoneCode: '+221' },
  { code: 'CI', flag: '🇨🇮', name: "Côte d'Ivoire", phoneCode: '+225' },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroun', phoneCode: '+237' },
  { code: 'CD', flag: '🇨🇩', name: 'RD Congo', phoneCode: '+243' },
  { code: 'EG', flag: '🇪🇬', name: 'Égypte', phoneCode: '+20' },
  { code: 'LB', flag: '🇱🇧', name: 'Liban', phoneCode: '+961' },
  { code: 'AE', flag: '🇦🇪', name: 'Émirats arabes unis', phoneCode: '+971' },
  { code: 'SA', flag: '🇸🇦', name: 'Arabie saoudite', phoneCode: '+966' },
  { code: 'TR', flag: '🇹🇷', name: 'Turquie', phoneCode: '+90' },
  { code: 'US', flag: '🇺🇸', name: 'États-Unis', phoneCode: '+1' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada', phoneCode: '+1' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexique', phoneCode: '+52' },
  { code: 'BR', flag: '🇧🇷', name: 'Brésil', phoneCode: '+55' },
  { code: 'AU', flag: '🇦🇺', name: 'Australie', phoneCode: '+61' },
  { code: 'JP', flag: '🇯🇵', name: 'Japon', phoneCode: '+81' },
  { code: 'IN', flag: '🇮🇳', name: 'Inde', phoneCode: '+91' },
  { code: 'RU', flag: '🇷🇺', name: 'Russie', phoneCode: '+7' },
  { code: 'ZA', flag: '🇿🇦', name: 'Afrique du Sud', phoneCode: '+27' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria', phoneCode: '+234' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya', phoneCode: '+254' },
  { code: 'GP', flag: '🇬🇵', name: 'Guadeloupe', phoneCode: '+590' },
  { code: 'MQ', flag: '🇲🇶', name: 'Martinique', phoneCode: '+596' },
  { code: 'RE', flag: '🇷🇪', name: 'La Réunion', phoneCode: '+262' },
  { code: 'GF', flag: '🇬🇫', name: 'Guyane française', phoneCode: '+594' },
  { code: 'HT', flag: '🇭🇹', name: 'Haïti', phoneCode: '+509' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadDocToS3(uri, slot) {
  const filename = uri.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const contentType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const stat = await fetch(uri);
  const blob = await stat.blob();
  const size = blob.size;

  const { data: presign } = await api.post('/api/v1/delivery/register/doc-presign/', {
    filename, content_type: contentType, size, slot,
  });
  if (!presign?.data?.url) throw new Error('Presign failed');

  const form = new FormData();
  Object.entries(presign.data.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', { uri, name: filename, type: contentType });
  await fetch(presign.data.url, { method: 'POST', body: form });
  return presign.data.public_url;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const { login, register, loginWithOtp } = useAuth();

  // mode: 'login' | 'forgot' | 'phoneOtp' | 'signup'
  const [mode, setMode] = useState('login');
  // step 1=identifiants 2=profil 3=docs 4=stripe
  const [step, setStep] = useState(1);
  const [legalStatus, setLegalStatus] = useState(null);
  const [pendingValidation, setPendingValidation] = useState(false);
  const [stripeUrl, setStripeUrl] = useState(null);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState('');

  // Profile fields
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [country, setCountry] = useState('FR');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('FR');

  // Legal fields
  const [siret, setSiret] = useState('');
  const [legalName, setLegalName] = useState('');

  // Bank fields (SEPA manuel)
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [ibanHolder, setIbanHolder] = useState('');

  // Documents
  const [docs, setDocs] = useState({});
  const setDoc = useCallback((key, uri) => setDocs(prev => ({ ...prev, [key]: uri })), []);

  // OTP login
  const [otpPhone, setOtpPhone] = useState('');
  const [otpPhoneCountry, setOtpPhoneCountry] = useState('FR');
  const [otpCode, setOtpCode] = useState('');
  const [otpStage, setOtpStage] = useState('enter-phone');

  // Signup OTP
  const [signupOtpStage, setSignupOtpStage] = useState(null);
  const [signupOtpCode, setSignupOtpCode] = useState('');
  const [signupFirebaseUid, setSignupFirebaseUid] = useState('');
  const [signupPhoneE164, setSignupPhoneE164] = useState('');

  // Modals
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [phonePickerVisible, setPhonePickerVisible] = useState(false);
  const [otpPhonePickerVisible, setOtpPhonePickerVisible] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginFailsRef = useRef(0);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const cooldownTimerRef = useRef(null);

  const recaptchaVerifier = useRef(null);
  const [firebaseOptions, setFirebaseOptions] = useState(null);
  useEffect(() => {
    (async () => {
      try { const app = await getFirebaseApp(); if (app?.options) setFirebaseOptions(app.options); } catch (_) {}
    })();
  }, []);

  const { sendOtp, verifyOtp, reset: otpReset, loading: otpLoading, error: otpError, shouldFallback: otpShouldFallback } =
    useOtpSender({ platform: 'app-delivery', recaptchaVerifier });

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const selectedPhoneCountry = COUNTRIES.find(c => c.code === phoneCountry) || COUNTRIES[0];
  const selectedOtpPhoneCountry = COUNTRIES.find(c => c.code === otpPhoneCountry) || COUNTRIES[0];

  const isStripeConnect = STRIPE_CONNECT_COUNTRIES.has(country);
  const currentDocs = legalStatus ? DOCS_BY_STATUS[legalStatus] : [];
  const requiredDocs = currentDocs.filter(d => d.required);

  // ── Login ──────────────────────────────────────────────────────────────────

  const handleLogin = () => {
    setError('');
    if (loginDisabled) { setError(t('loginCooldown') || 'Trop de tentatives. Attendez 30s.'); return; }
    if (!email.trim()) { setError(t('errorNoEmail') || 'Email requis'); return; }
    if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
    if (!password.trim()) { setError(t('errorNoPassword') || 'Mot de passe requis'); return; }
    const result = login(email.trim(), password);
    if (!result) {
      loginFailsRef.current += 1;
      if (loginFailsRef.current >= MAX_LOGIN_FAILS) {
        setLoginDisabled(true);
        setError(t('loginCooldown') || 'Trop de tentatives. Attendez 30s.');
        cooldownTimerRef.current = setTimeout(() => { setLoginDisabled(false); loginFailsRef.current = 0; }, LOGIN_COOLDOWN_MS);
      } else {
        setError(t('loginErrorCredentials') || 'Email ou mot de passe incorrect');
      }
    }
  };

  // ── OTP login ──────────────────────────────────────────────────────────────

  const handleOtpSend = async () => {
    setError('');
    if (!otpPhone.trim()) { setError(t('errorNoPhone') || 'Téléphone requis'); return; }
    const full = `${selectedOtpPhoneCountry.phoneCode}${otpPhone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    const ok = await sendOtp({ phone: full, channel: 'sms', defaultRegion: otpPhoneCountry });
    if (ok) { setOtpStage('enter-code'); return; }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code.');
  };

  const handleOtpVerify = async () => {
    setError('');
    const result = await verifyOtp({ code: otpCode });
    if (!result) { setError(otpError || t('otpVerifyFailed') || 'Code invalide.'); return; }
    if (!result.userFound) {
      setError(t('driverNotFound') || 'Aucun compte trouvé. Inscrivez-vous.');
      setMode('signup'); setStep(1); setOtpStage('enter-phone'); setOtpCode(''); return;
    }
    const ok = await loginWithOtp(result);
    if (!ok) setError(t('otpLoginFailed') || 'Connexion impossible.');
  };

  // ── Signup steps ───────────────────────────────────────────────────────────

  const handleBack = () => {
    setError('');
    if (mode === 'login') return;
    if (mode === 'phoneOtp') { if (otpStage === 'enter-code') { otpReset(); setOtpCode(''); setOtpStage('enter-phone'); } else { setMode('login'); } return; }
    if (mode === 'forgot') { setMode('login'); return; }
    if (signupOtpStage === 'verify') { otpReset(); setSignupOtpCode(''); setSignupOtpStage(null); return; }
    if (step > 1) { setStep(s => s - 1); return; }
    setMode('login');
  };

  const validateStep1 = () => {
    if (!email.trim() || !password.trim() || !confirmPwd.trim()) { setError(t('errorEmpty') || 'Remplissez tous les champs'); return false; }
    if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return false; }
    if (!isStrongPassword(password)) { setError(t('errorPasswordWeak') || 'Mot de passe trop faible (8 car., maj, min, chiffre)'); return false; }
    if (password !== confirmPwd) { setError(t('errorPasswordMismatch') || 'Mots de passe différents'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!nom.trim() || !prenom.trim() || !phone.trim()) { setError(t('errorEmpty') || 'Remplissez tous les champs'); return false; }
    if (!legalStatus) { setError(t('errorNoStatus') || 'Choisissez votre statut'); return false; }
    if (legalStatus === 'particulier' && !PARTICULIER_ALLOWED.has(country)) {
      setError(t('particulierNotAllowed') || 'Le statut Particulier n\'est pas disponible pour ce pays. Choisissez Auto-entrepreneur ou Société.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    // SIRET obligatoire pour AE et Société
    if ((legalStatus === 'auto_entrepreneur' || legalStatus === 'societe') && siret.trim().replace(/\s/g,'').length !== 14) {
      setError(t('errorSiret') || 'SIRET invalide (14 chiffres)'); return false;
    }
    // Documents requis
    const missing = requiredDocs.filter(d => !docs[d.key]);
    if (missing.length > 0) { setError(t('errorDocsRequired') || 'Documents obligatoires manquants'); return false; }
    // IBAN obligatoire pour SEPA manuel
    if (!isStripeConnect && !iban.trim()) { setError(t('errorIbanRequired') || 'IBAN obligatoire'); return false; }
    return true;
  };

  const handleStep1Next = () => { setError(''); if (validateStep1()) setStep(2); };
  const handleStep2Next = () => {
    setError('');
    if (!validateStep2()) return;
    // Lancer OTP SMS avant de passer à l'étape 3
    handleSignupOtpSend();
  };
  const handleStep3Next = () => { setError(''); if (validateStep3()) setStep(4); };

  // ── Signup OTP ─────────────────────────────────────────────────────────────

  const handleSignupOtpSend = async () => {
    const full = `${selectedPhoneCountry.phoneCode}${phone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    setLoading(true);
    const ok = await sendOtp({ phone: full, channel: 'sms', defaultRegion: phoneCountry });
    setLoading(false);
    if (ok) { setSignupOtpStage('verify'); setSignupOtpCode(''); return; }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code.');
  };

  const handleSignupOtpVerify = async () => {
    setError('');
    setLoading(true);
    const result = await verifyOtp({ code: signupOtpCode });
    setLoading(false);
    if (!result) { setError(otpError || t('otpVerifyFailed') || 'Code invalide.'); return; }
    setSignupFirebaseUid(result.firebaseUid || '');
    setSignupPhoneE164(result.phoneE164 || '');
    setSignupOtpStage(null);
    setSignupOtpCode('');
    otpReset();
    setStep(3);
  };

  // ── Stripe onboarding (étape 4) ────────────────────────────────────────────

  const handleStripeOnboarding = async () => {
    setError('');
    setLoading(true);
    try {
      // D'abord, finaliser l'inscription (upload docs + register)
      await finalizeRegistration();
      // Puis ouvrir Stripe si Connect
      if (isStripeConnect) {
        const { data } = await api.post('/api/v1/delivery/stripe/connect/');
        if (data?.url) {
          await WebBrowser.openBrowserAsync(data.url);
        }
      }
      setPendingValidation(true);
    } catch (e) {
      setError(e?.response?.data?.message || t('errorGeneric') || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const finalizeRegistration = async () => {
    // Upload des documents vers S3
    const uploadedDocs = {};
    for (const doc of currentDocs) {
      if (docs[doc.key]) {
        uploadedDocs[doc.key] = await uploadDocToS3(docs[doc.key], doc.slot);
      }
    }

    await register({
      email: email.trim(), password,
      userName: `${prenom.trim()} ${nom.trim()}`,
      nom: nom.trim(), prenom: prenom.trim(),
      phone: signupPhoneE164 || `${selectedPhoneCountry.phoneCode}${phone.trim().replace(/^0+/, '')}`,
      phoneCode: selectedPhoneCountry.phoneCode,
      country,
      legal_status: legalStatus,
      siret: siret.trim().replace(/\s/g, ''),
      legal_name: legalName.trim(),
      iban: iban.trim(), bic: bic.trim(), iban_holder_name: ibanHolder.trim(),
      firebase_uid: signupFirebaseUid || undefined,
      ...uploadedDocs,
    });
  };

  // ── Pick document (photo ou PDF) ───────────────────────────────────────────

  const pickDocument = async (docKey) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setDoc(docKey, result.assets[0].uri);
    }
  };

  // ── Pending validation screen ──────────────────────────────────────────────

  if (pendingValidation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Ionicons name="time-outline" size={40} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 12 }}>
              {t('pendingTitle') || 'En attente de validation'}
            </Text>
            <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {isStripeConnect
                ? (t('pendingMsgStripe') || 'Stripe vérifie votre identité. Vous recevrez une notification dès que votre compte est actif.')
                : (t('pendingMsg') || 'Votre dossier est en cours de vérification. Vous recevrez un email une fois approuvé.')}
            </Text>
            {[
              { icon: 'mail-outline', text: t('pendingEmail') || 'Email de confirmation envoyé' },
              { icon: 'shield-checkmark-outline', text: t('pendingReview') || 'Vérification sous 24-48h ouvrées' },
              { icon: 'notifications-outline', text: t('pendingNotif') || 'Notification à l\'activation' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name={item.icon} size={20} color={BRAND} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 14, color: '#374151', flex: 1 }}>{item.text}</Text>
              </View>
            ))}
            <Pressable
              onPress={() => { setPendingValidation(false); setMode('login'); setStep(1); setLegalStatus(null); setDocs({}); setError(''); }}
              style={{ height: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('pendingBackLogin') || 'Retour à la connexion'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'forgot') return <ForgotPasswordScreen onBack={() => { setMode('login'); setError(''); }} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        {firebaseOptions && (
          <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebaseOptions} attemptInvisibleVerification />
        )}

        {mode !== 'login' && (
          <TouchableOpacity onPress={handleBack} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Ionicons name="arrow-back" size={26} color="#111" />
          </TouchableOpacity>
        )}

        {(mode === 'login' || (mode === 'signup' && step === 1)) && (
          <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 8 }}>
            <Ionicons name="bicycle" size={50} color={BRAND} style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111' }}>Pearl Delivery</Text>
          </View>
        )}

        {/* Progress bar signup */}
        {mode === 'signup' && (
          <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 8 }}>
            {[1, 2, 3, 4].map(s => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= step ? BRAND : '#E5E7EB', marginHorizontal: 2 }} />
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20 }} keyboardShouldPersistTaps="handled">

          {error ? (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={{ color: '#EF4444', fontSize: 13, marginLeft: 8, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <TouchableOpacity onPress={() => { setMode('forgot'); setError(''); }} style={{ alignSelf: 'flex-end', paddingTop: 6 }}>
                <Text style={{ color: BRAND, fontSize: 13, fontWeight: '600' }}>{t('forgotPasswordLink')}</Text>
              </TouchableOpacity>
              <Pressable style={[s.btn, loginDisabled && { opacity: 0.5 }]} onPress={handleLogin} disabled={loginDisabled}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('loginButton') || 'Se connecter'}</Text>}
              </Pressable>
              <TouchableOpacity onPress={() => { setMode('phoneOtp'); setOtpStage('enter-phone'); setError(''); otpReset(); }} style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: BRAND, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>{t('loginWithPhone') || 'Se connecter avec un téléphone'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setMode('signup'); setStep(1); setError(''); }} style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ color: '#6B7280', fontSize: 15 }}>{t('noAccount') || 'Pas de compte ?'} <Text style={{ color: BRAND, fontWeight: '800' }}>{t('signUp') || "S'inscrire"}</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── PHONE OTP LOGIN ── */}
          {mode === 'phoneOtp' && otpStage === 'enter-phone' && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' }}>{t('phoneOtpTitle') || 'Connexion par téléphone'}</Text>
              <Text style={s.label}>{t('phoneLabel') || 'Téléphone'}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <TouchableOpacity onPress={() => setOtpPhonePickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', marginRight: 8, flex: 0 }]}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedOtpPhoneCountry.flag}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{selectedOtpPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={otpPhone} onChangeText={setOtpPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
              </View>
              <Pressable style={[s.btn, (!otpPhone.trim() || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpSend} disabled={!otpPhone.trim() || otpLoading}>
                {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('sendCode') || 'Envoyer le code'}</Text>}
              </Pressable>
            </>
          )}
          {mode === 'phoneOtp' && otpStage === 'enter-code' && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' }}>{t('otpVerifyTitle') || 'Code reçu par SMS'}</Text>
              <TextInput style={[s.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]} value={otpCode} onChangeText={setOtpCode} placeholder="123456" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={6} />
              <Pressable style={[s.btn, (otpCode.length < 4 || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpVerify} disabled={otpCode.length < 4 || otpLoading}>
                {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 1 : Identifiants ── */}
          {mode === 'signup' && step === 1 && (
            <>
              <Text style={s.stepTitle}>{t('stepEmail') || 'Identifiants'}</Text>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <Text style={s.label}>{t('confirmPassword') || 'Confirmer'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showConfirmPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowConfirmPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showConfirmPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <Pressable style={s.btn} onPress={handleStep1Next}><Text style={s.btnTxt}>{t('next') || 'Suivant'}</Text></Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 2 : Profil + Statut ── */}
          {mode === 'signup' && step === 2 && signupOtpStage !== 'verify' && (
            <>
              <Text style={s.stepTitle}>{t('stepInfo') || 'Votre profil'}</Text>
              <Text style={s.label}>{t('driverLastName') || 'Nom'}</Text>
              <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Dupont" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('driverFirstName') || 'Prénom'}</Text>
              <TextInput style={s.input} value={prenom} onChangeText={setPrenom} placeholder="Jean" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('countryLabel') || 'Pays'}</Text>
              <TouchableOpacity onPress={() => setCountryPickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center' }]}>
                <Text style={{ fontSize: 20, marginRight: 10 }}>{selectedCountry.flag}</Text>
                <Text style={{ flex: 1, fontSize: 15, color: '#111', fontWeight: '600' }}>{selectedCountry.name}</Text>
                <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={s.label}>{t('phoneLabel') || 'Téléphone'}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <TouchableOpacity onPress={() => setPhonePickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', marginRight: 8, flex: 0 }]}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedPhoneCountry.flag}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{selectedPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={phone} onChangeText={setPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
              </View>
              <Text style={s.label}>{t('statusLabel') || 'Votre statut'}</Text>
              {LEGAL_STATUSES.map(ls => {
                const disabled = ls.key === 'particulier' && !PARTICULIER_ALLOWED.has(country);
                const selected = legalStatus === ls.key;
                return (
                  <TouchableOpacity key={ls.key} onPress={() => !disabled && setLegalStatus(ls.key)} style={{
                    borderWidth: 2, borderColor: selected ? BRAND : disabled ? '#E5E7EB' : '#D1D5DB',
                    borderRadius: 14, padding: 16, marginBottom: 10,
                    backgroundColor: selected ? '#F0FDF4' : disabled ? '#F9FAFB' : '#fff',
                    flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.4 : 1,
                  }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: selected ? BRAND : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Ionicons name={ls.icon} size={22} color={selected ? '#fff' : '#6B7280'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: disabled ? '#9CA3AF' : '#111' }}>{t(ls.labelKey) || ls.labelKey}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{t(ls.descKey) || ''}</Text>
                      {disabled && <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>{t('particulierNotAvailable') || 'Non disponible dans ce pays'}</Text>}
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={BRAND} />}
                  </TouchableOpacity>
                );
              })}
              <Pressable style={[s.btn, (loading || otpLoading) && { opacity: 0.5 }]} onPress={handleStep2Next} disabled={loading || otpLoading}>
                {(loading || otpLoading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyAndContinue') || 'Vérifier le numéro'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 2 : OTP SMS ── */}
          {mode === 'signup' && step === 2 && signupOtpStage === 'verify' && (
            <>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="shield-checkmark" size={40} color={BRAND} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginTop: 12, textAlign: 'center' }}>{t('signupVerifyTitle') || 'Vérifier votre numéro'}</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 }}>{t('otpSentTo') || 'Code envoyé au'} <Text style={{ fontWeight: '700', color: '#111' }}>{selectedPhoneCountry.phoneCode} {phone.trim()}</Text></Text>
              </View>
              <TextInput style={[s.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]} value={signupOtpCode} onChangeText={setSignupOtpCode} placeholder="123456" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={6} />
              <Pressable style={[s.btn, (signupOtpCode.length < 4 || otpLoading || loading) && { opacity: 0.5 }]} onPress={handleSignupOtpVerify} disabled={signupOtpCode.length < 4 || otpLoading || loading}>
                {(otpLoading || loading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 3 : Documents ── */}
          {mode === 'signup' && step === 3 && (
            <>
              <Text style={s.stepTitle}>{t('stepDocs') || 'Documents'}</Text>

              {/* SIRET pour AE + Société */}
              {(legalStatus === 'auto_entrepreneur' || legalStatus === 'societe') && (
                <>
                  <Text style={s.label}>{legalStatus === 'societe' ? (t('siretSociete') || 'N° SIRET / Immatriculation') : (t('siretAE') || 'Numéro SIRET (14 chiffres)')}</Text>
                  <TextInput style={s.input} value={siret} onChangeText={setSiret} placeholder="12345678900012" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={14} />
                  {legalStatus === 'societe' && (
                    <>
                      <Text style={s.label}>{t('legalName') || 'Nom légal de la société'}</Text>
                      <TextInput style={s.input} value={legalName} onChangeText={setLegalName} placeholder="Ma Société SAS" placeholderTextColor="#aaa" />
                    </>
                  )}
                </>
              )}

              {/* Documents */}
              {currentDocs.map(doc => (
                <TouchableOpacity key={doc.key} onPress={() => pickDocument(doc.key)} style={{
                  flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1,
                  borderColor: docs[doc.key] ? BRAND : '#E5E7EB', borderRadius: 12, marginBottom: 10,
                  backgroundColor: docs[doc.key] ? '#F0FDF4' : '#fff',
                }}>
                  <Ionicons name={docs[doc.key] ? 'checkmark-circle' : doc.icon} size={22} color={docs[doc.key] ? BRAND : '#9CA3AF'} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{t(doc.labelKey) || doc.labelKey}{doc.required ? ' *' : ''}</Text>
                    {doc.note && !docs[doc.key] && <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t(doc.note) || doc.note}</Text>}
                    <Text style={{ fontSize: 11, color: docs[doc.key] ? BRAND : '#9CA3AF', marginTop: 2 }}>{docs[doc.key] ? (t('docUploaded') || 'Document ajouté') : (t('docTapUpload') || 'Appuyer pour ajouter')}</Text>
                  </View>
                  {docs[doc.key] && (
                    <TouchableOpacity onPress={() => setDoc(doc.key, null)} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}

              {/* IBAN / BIC pour SEPA manuel */}
              {!isStripeConnect && (
                <>
                  <Text style={[s.label, { marginTop: 8 }]}>{t('ibanLabel') || 'IBAN'} *</Text>
                  <TextInput style={s.input} value={iban} onChangeText={setIban} placeholder="FR76 3000 6000 0112 3456 7890 189" placeholderTextColor="#aaa" autoCapitalize="characters" />
                  <Text style={s.label}>BIC/SWIFT *</Text>
                  <TextInput style={s.input} value={bic} onChangeText={setBic} placeholder="BNPAFRPP" placeholderTextColor="#aaa" autoCapitalize="characters" />
                  <Text style={s.label}>{t('ibanHolder') || 'Titulaire du compte'} *</Text>
                  <TextInput style={s.input} value={ibanHolder} onChangeText={setIbanHolder} placeholder="Jean Dupont" placeholderTextColor="#aaa" />
                </>
              )}

              <Pressable style={s.btn} onPress={handleStep3Next}><Text style={s.btnTxt}>{t('next') || 'Suivant'}</Text></Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 4 : Stripe ── */}
          {mode === 'signup' && step === 4 && (
            <>
              <Text style={s.stepTitle}>{t('stepStripe') || 'Paiement & Vérification'}</Text>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="card" size={40} color="#6366F1" />
                </View>
                {isStripeConnect ? (
                  <>
                    <Text style={{ fontSize: 16, color: '#374151', textAlign: 'center', lineHeight: 24 }}>
                      {t('stripeConnectDesc') || 'Stripe va vérifier votre identité et configurer vos virements automatiques. Cela prend 2-3 minutes.'}
                    </Text>
                    <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, width: '100%', marginTop: 16 }}>
                      {[
                        t('stripeStep1') || '📋 Vos informations personnelles',
                        t('stripeStep2') || '🪪 Vérification de votre identité',
                        t('stripeStep3') || '🏦 Vos coordonnées bancaires',
                      ].map((item, i) => (
                        <Text key={i} style={{ fontSize: 14, color: '#374151', marginBottom: i < 2 ? 8 : 0 }}>{item}</Text>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={{ fontSize: 16, color: '#374151', textAlign: 'center', lineHeight: 24 }}>
                    {t('sepaManualDesc') || 'Votre dossier sera examiné manuellement. Les virements seront effectués par virement bancaire international.'}
                  </Text>
                )}
              </View>
              <Pressable style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleStripeOnboarding} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={s.btnTxt}>{isStripeConnect ? (t('startStripeOnboarding') || 'Continuer vers Stripe') : (t('submitApplication') || 'Envoyer ma demande')}</Text>
                )}
              </Pressable>
            </>
          )}

        </ScrollView>

        {mode === 'login' && (
          <TouchableOpacity onPress={() => setLangPickerVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 24, marginBottom: 12, paddingVertical: 12 }}>
            <Ionicons name="globe-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>{LANGUAGES.find(l => l.code === lang)?.flag || '🌐'} {LANGUAGES.find(l => l.code === lang)?.native || 'Language'}</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'ios' && <InputAccessoryView nativeID="noSuggest"><View /></InputAccessoryView>}

        {/* Country Picker */}
        <Modal visible={countryPickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('countryLabel') || 'Pays'}</Text>
                <TouchableOpacity onPress={() => setCountryPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setCountry(c.code); setPhoneCountry(c.code); setCountryPickerVisible(false); if (legalStatus === 'particulier' && !PARTICULIER_ALLOWED.has(c.code)) setLegalStatus(null); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: country === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: country === c.code ? '700' : '500', color: country === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  {country === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Phone Picker */}
        <Modal visible={phonePickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('phoneCodeLabel') || 'Indicatif'}</Text>
                <TouchableOpacity onPress={() => setPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_p'} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setPhoneCountry(c.code); setPhonePickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: phoneCountry === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: phoneCountry === c.code ? '700' : '500', color: phoneCountry === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>{c.phoneCode}</Text>
                  {phoneCountry === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* OTP Phone Picker */}
        <Modal visible={otpPhonePickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('phoneCodeLabel') || 'Indicatif'}</Text>
                <TouchableOpacity onPress={() => setOtpPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_otp'} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setOtpPhoneCountry(c.code); setOtpPhonePickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: otpPhoneCountry === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: otpPhoneCountry === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>{c.phoneCode}</Text>
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Language Picker */}
        <Modal visible={langPickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('languageLabel') || 'Langue'}</Text>
                <TouchableOpacity onPress={() => setLangPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={LANGUAGES} keyExtractor={l => l.code} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: l }) => (
                <TouchableOpacity onPress={() => { setLang(l.code); setLangPickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: lang === l.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{l.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: lang === l.code ? '700' : '500', color: lang === l.code ? BRAND : '#111' }}>{l.native}</Text>
                  {lang === l.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label: { fontWeight: '700', fontSize: 14, color: '#333', marginBottom: 6, marginTop: 16 },
  stepTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 16 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4,
  },
  pwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyeBtn: { position: 'absolute', right: 12, padding: 4 },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
```

- [ ] **Step 4 : Commit**

```bash
cd /Users/remsko/Livraison_pearl
git add screens/LoginScreen.js
git commit -m "feat(delivery-app): refonte inscription 4 étapes — statuts légaux, docs dynamiques, Stripe Connect"
```

---

### Task 10 : Mettre à jour authService.register

**Files:**
- Modify: `services/authService.js`

- [ ] **Step 1 : Mettre à jour le payload de `register`**

La méthode `register` existante envoie les données à `/api/v1/delivery/register/`. Le payload est déjà passé depuis LoginScreen, aucune modification nécessaire dans authService — les nouveaux champs (`legal_status`, `siret`, `iban`, etc.) passent directement via `sanitizedPayload`. Vérifier que `allowed_fields` côté backend est bien à jour (fait en Task 4).

Ajouter dans `authService.js` la méthode pour créer le compte Stripe Connect :

```javascript
  async createStripeConnect() {
    resetSessionTimer();
    const { data } = await api.post('/api/v1/delivery/stripe/connect/');
    return data;
  },
```

- [ ] **Step 2 : Commit**

```bash
git add services/authService.js
git commit -m "feat(delivery-app): add createStripeConnect method to authService"
```

---

### Task 11 : Ajouter les clés i18n manquantes

**Files:**
- Modify: `contexts/translations.js`

- [ ] **Step 1 : Ajouter les nouvelles clés**

Dans `translations.js`, ajouter dans l'objet `translations` (section `fr` et `en` au minimum) :

```javascript
// fr
statusParticulier: 'Particulier',
statusParticulierDesc: 'Travail occasionnel (activité accessoire)',
statusAutoEntrepreneur: 'Auto-entrepreneur',
statusAutoEntrepreneurDesc: 'Micro-entreprise immatriculée en France (SIRET)',
statusSociete: 'Société',
statusSocieteDesc: 'EURL, SARL, SAS ou équivalent étranger',
statusLabel: 'Votre statut légal',
particulierNotAvailable: 'Non disponible pour ce pays',
particulierNotAllowed: 'Le statut Particulier n\'est pas disponible pour ce pays',
errorNoStatus: 'Choisissez votre statut légal',
errorSiret: 'SIRET invalide (14 chiffres requis)',
errorIbanRequired: 'IBAN obligatoire pour ce pays',
docDriverLicense: 'Permis de conduire',
docDriverLicenseNote: 'ou attestation sans véhicule motorisé (vélo)',
docUrssaf: 'Attestation URSSAF / Avis de situation INSEE',
docRcPro: 'Assurance RC Pro',
docKbis: 'Extrait KBIS (- de 3 mois)',
siretAE: 'Numéro SIRET (14 chiffres)',
siretSociete: 'N° SIRET / Immatriculation',
legalName: 'Nom légal de la société',
ibanLabel: 'IBAN',
ibanHolder: 'Titulaire du compte',
stepStripe: 'Paiement & Vérification',
stripeConnectDesc: 'Stripe va vérifier votre identité et configurer vos virements. Cela prend 2-3 minutes.',
stripeStep1: '📋 Vos informations personnelles',
stripeStep2: '🪪 Vérification de votre identité',
stripeStep3: '🏦 Vos coordonnées bancaires',
sepaManualDesc: 'Votre dossier sera examiné manuellement. Virements par virement bancaire international.',
startStripeOnboarding: 'Continuer vers Stripe',
pendingMsgStripe: 'Stripe vérifie votre identité. Vous recevrez une notification dès que votre compte est actif.',
```

Répliquer en `en`, `de`, `es`, `it`, `pt`, `nl`, `ar`, `zh`, `ja`, `ru`, `sv`, `th` (traductions des libellés principaux).

- [ ] **Step 2 : Commit**

```bash
git add contexts/translations.js
git commit -m "feat(delivery-app): add i18n keys for V2 registration flow"
```

---

## PHASE 3 — WEBSITEADMIN

### Task 12 : Page livreurs en attente dans WebsiteAdmin

**Files:**
- Create: `WebsiteAdmin/src/pages/PendingDriversPage.jsx`
- Modify: `WebsiteAdmin/src/App.jsx` (ajouter route)
- Modify: `WebsiteAdmin/src/components/Sidebar.jsx` (ajouter lien)

- [ ] **Step 1 : Créer `PendingDriversPage.jsx`**

Créer `WebsiteAdmin/src/pages/PendingDriversPage.jsx` :

```jsx
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from '../services/api';

const STATUS_LABEL = {
  particulier: 'Particulier',
  auto_entrepreneur: 'Auto-entrepreneur',
  societe: 'Société',
};

const PAYOUT_LABEL = {
  stripe_connect: 'Stripe Connect',
  sepa_manual: 'SEPA Manuel',
};

export default function PendingDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/v1/admin/delivery/drivers/pending/');
      setDrivers(data.drivers || []);
    } catch (e) {
      setMsg('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const handleAction = async (driverId, action) => {
    setActionLoading(true);
    try {
      const { data } = await axios.post(`/api/v1/admin/delivery/drivers/${driverId}/activate/`, { action });
      setMsg(data.message);
      setSelected(null);
      fetchDrivers();
    } catch (e) {
      setMsg('Erreur lors de l\'action');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 32 }}>Chargement...</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Livreurs en attente</h1>
      <p style={{ color: '#6B7280', marginBottom: 24 }}>{drivers.length} dossier{drivers.length !== 1 ? 's' : ''} en attente</p>

      {msg && (
        <div style={{ background: '#F0FDF4', border: '1px solid #00C29B', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#065F46' }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {drivers.map(driver => (
          <div key={driver.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setSelected(selected?.id === driver.id ? null : driver)}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{driver.userName}</span>
                  <span style={{ background: '#F0FDF4', color: '#00C29B', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                    {STATUS_LABEL[driver.legal_status] || driver.legal_status}
                  </span>
                  <span style={{ background: driver.payout_method === 'stripe_connect' ? '#EEF2FF' : '#FEF3C7', color: driver.payout_method === 'stripe_connect' ? '#6366F1' : '#92400E', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                    {PAYOUT_LABEL[driver.payout_method] || driver.payout_method}
                  </span>
                  {driver.charges_enabled && (
                    <span style={{ background: '#F0FDF4', color: '#065F46', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>✓ Stripe OK</span>
                  )}
                </div>
                <div style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
                  {driver.email} · {driver.country} · SIRET: {driver.siret || '—'} · {new Date(driver.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={e => { e.stopPropagation(); handleAction(driver.id, 'activate'); }}
                  disabled={actionLoading}
                  style={{ background: '#00C29B', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  Activer
                </button>
                <button onClick={e => { e.stopPropagation(); handleAction(driver.id, 'reject'); }}
                  disabled={actionLoading}
                  style={{ background: '#fff', color: '#EF4444', border: '1px solid #EF4444', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  Rejeter
                </button>
              </div>
            </div>

            {/* Documents expandés */}
            {selected?.id === driver.id && (
              <div style={{ borderTop: '1px solid #F3F4F6', padding: 20, background: '#FAFAFA' }}>
                <p style={{ fontWeight: 700, marginBottom: 12, color: '#374151' }}>Documents</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {[
                    { key: 'id_card_front_url', label: 'CNI recto' },
                    { key: 'id_card_back_url', label: 'CNI verso' },
                    { key: 'driver_license_url', label: 'Permis de conduire' },
                    { key: 'rc_pro_url', label: 'Assurance RC Pro' },
                    { key: 'urssaf_doc_url', label: 'Attestation URSSAF' },
                    { key: 'kbis_doc_url', label: 'KBIS' },
                  ].map(doc => (
                    <div key={doc.key} style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', padding: 12 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 8 }}>{doc.label}</p>
                      {driver.docs[doc.key] ? (
                        <a href={driver.docs[doc.key]} target="_blank" rel="noreferrer"
                          style={{ color: '#00C29B', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          Voir le document →
                        </a>
                      ) : (
                        <span style={{ color: '#9CA3AF', fontSize: 13 }}>Non fourni</span>
                      )}
                    </div>
                  ))}
                </div>
                {driver.stripe_account_id && (
                  <div style={{ marginTop: 12, padding: 12, background: '#EEF2FF', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: '#6366F1', fontWeight: 600 }}>
                      Stripe ID: {driver.stripe_account_id} · charges_enabled: {String(driver.charges_enabled)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {drivers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
            <p>Aucun livreur en attente de validation</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter la route dans App.jsx de WebsiteAdmin**

Chercher le fichier de routing dans WebsiteAdmin :

```bash
grep -r "Route\|routes" "WebsiteAdmin/src/App.jsx" | head -5
# ou
grep -rn "import.*Page" "WebsiteAdmin/src/App.jsx" | head -10
```

Ajouter l'import et la route selon le pattern existant :

```jsx
import PendingDriversPage from './pages/PendingDriversPage';
// Dans le routeur :
<Route path="/drivers/pending" element={<PendingDriversPage />} />
```

- [ ] **Step 3 : Ajouter le lien dans la sidebar**

Chercher le composant Sidebar :

```bash
grep -rn "sidebar\|Sidebar\|nav" "WebsiteAdmin/src" --include="*.jsx" -l | head -5
```

Ajouter l'entrée de menu selon le pattern existant (chercher la section "Livraisons" ou "Livreurs").

- [ ] **Step 4 : Commit**

```bash
git add WebsiteAdmin/src/pages/PendingDriversPage.jsx WebsiteAdmin/src/App.jsx WebsiteAdmin/src/components/
git commit -m "feat(admin): add pending drivers validation page with document viewer and approve/reject"
```

---

## VÉRIFICATION FINALE

- [ ] **Backend — test inscription complète**

```bash
cd "Backend/Marketplace"
python manage.py shell -c "
from DeliveryApp.models import DeliveryDriverProfile
from DeliveryApp.registration_constants import get_payout_method, get_earnings_cap
print('particulier FR:', get_earnings_cap('particulier', 'FR'))      # 3000
print('particulier MA:', get_earnings_cap('particulier', 'MA'))      # None
print('payout FR:', get_payout_method('FR'))                          # stripe_connect
print('payout MA:', get_payout_method('MA'))                          # sepa_manual
print('payout US:', get_payout_method('US'))                          # stripe_connect
print('champs model:', [f.name for f in DeliveryDriverProfile._meta.fields if 'stripe' in f.name or 'legal' in f.name])
"
```

- [ ] **Backend — test webhook Stripe (mode dev)**

```bash
# Installer stripe CLI si pas disponible
stripe listen --forward-to localhost:8000/api/v1/delivery/stripe/webhook/
stripe trigger account.updated
```

- [ ] **App — test navigation inscription**

Lancer l'app en dev (`npm start`) et vérifier :
1. Connexion email/mdp → fonctionne
2. "S'inscrire" → étape 1 (email/mdp)
3. Étape 2 → 3 statuts affichés, "Particulier" grisé si pays non-EU
4. Étape 3 → documents différents selon statut, SIRET affiché si AE/Société
5. Étape 4 → WebBrowser Stripe s'ouvre (si Stripe configuré)
6. Retour app → écran "En attente"

- [ ] **Commit final**

```bash
git add -p  # vérifier qu'il n'y a pas de fichier inattendu
git commit -m "feat: driver registration V2 complete — 3 legal statuses, Stripe Connect, dynamic docs"
```

---

## Variables d'environnement à configurer

Côté backend (`.env`) — déjà présents dans settings, juste vérifier les valeurs :
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET_CONNECT=whsec_...   # secret spécifique webhook Connect
STRIPE_CONNECT_ENABLED=True
STRIPE_CONNECT_DEFAULT_COUNTRY=FR
```

Côté app (`.env` ou `app.json extra`) :
```
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```
