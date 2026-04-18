# Backend changes required on Pearl Streets Marketplace

Driver app repo: `pearlstreets/Livraison-app`
Backend repo: `Shubhras/Marketplace-082024-001` (`Backend/Marketplace/DeliveryApp/`)

The driver app is fully wired to the existing endpoints. The three items below are **backend-side gaps** the driver app cannot fix on its own.

---

## 1. Expose `client_phone` on `/available/` and accept payload

**Why:** the driver app has a "Call client" button wired to `Linking.openURL('tel:...')`. Today the serializer in `AvailableDeliveriesView.get()` does not return the customer phone, so the button always falls back to the `"Fonction à venir"` alert.

**Fix:** in `Backend/Marketplace/DeliveryApp/views.py` inside `AvailableDeliveriesView.get()`:

```python
data.append({
    'order_id': order.id,
    'customer_name': order.customerName,
    'customer_phone': order.customerPhone,   # ADD THIS
    'order_price': str(order.orderPrice),
    'order_status': order.orderStatus,
    'order_date': order.orderDate,
    'delivery_method': order.delivery_method,
    'pickup_address': order.pickup_address,
    'dropoff_address': order.dropoff_address,
    'delivery_notes': order.delivery_notes,
})
```

Also expose it on the full assignment so the driver still has the number after accepting. In `DeliveryApp/serializers.py` `DeliveryAssignmentSerializer.Meta.fields`, add:

```python
customer_phone = serializers.CharField(source='order.customerPhone', read_only=True)

class Meta:
    fields = [..., 'customer_phone', ...]
```

**Driver app is already reading `raw.customer_phone` / `raw.client_phone`** ([`screens/OrdersScreen.js`](../screens/OrdersScreen.js) `normalizeRemoteOrder`). No app change needed once the backend exposes it.

---

## 2. Add push token registration endpoint (or integrate OneSignal)

**Why:** the driver app now initialises OneSignal (`services/pushService.js`) and calls `OneSignal.login(driverId)` on sign-in. This associates the device's OneSignal player with the driver's `external_user_id`. The backend should target pushes via `include_external_user_ids: [driverId]`.

**Option A (recommended) — target by external_user_id:**
Update the marketplace's push-dispatch code to send OneSignal notifications keyed on `external_user_id`. No new endpoint needed; the app already associates the id.

**Option B — explicit endpoint for the Expo fallback:**
If you want to support Expo push tokens as well (useful during EAS Preview builds), add:

```python
# DeliveryApp/urls.py
path('push-token/', views.RegisterPushTokenView.as_view(), name='delivery-push-token'),
```

```python
# DeliveryApp/views.py
class RegisterPushTokenView(APIView):
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsAuthenticated, IsDeliveryDriver]

    def post(self, request):
        token = request.data.get('token')
        platform = request.data.get('platform', 'unknown')
        driver = get_driver_profile(request.user)
        DriverPushToken.objects.update_or_create(
            driver=driver, token=token,
            defaults={'platform': platform},
        )
        return Response({"status": "success"})
```

**Driver app is already calling** `deliveryService.registerPushToken(token, platform)` as a silent fallback when OneSignal isn't enabled ([`App.js`](../App.js)). Currently silently 404s; becomes functional once the endpoint exists.

---

## 3. Notification payload `data.type = 'new_order'`

**Why:** when OneSignal delivers a notification, the app's click listener routes the driver to the Orders tab only if the payload carries `additionalData.type === 'new_order'` or `'delivery_assignment'`. See [`App.js`](../App.js) `useEffect` with `pushService.addClickListener`.

**Fix:** wherever the marketplace fires the "new order" OneSignal notification to drivers, include in the payload:

```python
{
    "include_external_user_ids": [str(driver.id)],
    "contents": {"en": "Nouvelle commande disponible"},
    "data": {"type": "new_order", "order_id": order.id},
}
```

Without the `type` key, the notification still arrives but the app won't auto-focus the Orders tab — the driver has to tap the tab manually.

---

## 4. (Optional) Extend `/register/` to accept driver documents

The Pro signup flow in the app uploads four documents: CI front/back, IBAN, Kbis (see [`screens/LoginScreen.js`](../screens/LoginScreen.js) step 3). `DeliveryDriverRegisterView` currently does not accept file fields. Until the backend accepts multipart registration with documents, Pro signup stays local-only in the app.

---

## 5. (Optional) Driver ↔ customer chat endpoint

The app currently keeps the driver's quick-messages to the customer in local AsyncStorage, auto-purged on delivery completion (like Uber Eats driver). If you want real bi-directional chat, add:

```python
# DeliveryApp/urls.py
path('assignments/<int:assignment_id>/client-message/', views.ClientMessageView.as_view()),
```

Then the app's `pushClientMessage()` in [`screens/DeliveryFlowScreen.js`](../screens/DeliveryFlowScreen.js) can send via this endpoint instead of just writing to local state.
