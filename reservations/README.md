# Réservations Dalcroze

Interface moderne (mobile-first) branchée sur **Mobilys Web** de l’Institut Jaques-Dalcroze.

- API : `https://mweb.dalcroze.ch` (institution `IJD`)
- App : `/reservations/`
- Proxy session (cookies HttpOnly) : `proxy/mobilys_proxy.py`

## Démarrage local

```bash
python3 proxy/mobilys_proxy.py
```

Ouvre [http://127.0.0.1:5174/reservations/](http://127.0.0.1:5174/reservations/)

Connecte-toi avec ton compte Mobilys Dalcroze.

## Parcours

1. Connexion
2. Accueil (prochaines réservations + actions rapides)
3. Calendrier (agenda / jour / semaine / mois)
4. Réserver (date → salle → créneau → confirmation)
5. Mes réservations (voir / annuler)

## Endpoints utilisés

| Action | Endpoint |
| --- | --- |
| Session | `POST /react/user/session` |
| Login | `POST /react/user/connexion` (`vLogin`, `vMdp`) |
| Salles | `POST /react/frontendController/getReservations` |
| Sites | `GET /react/frontendController/enum/places` |
| Occupation | `POST /react/frontendController/getOccupation` |
| Conflits | `POST /react/frontendController/checkDates` |
| Panier | `POST /react/frontendController/addToCart` |
| Commande | `POST /react/frontendController/createOrder` |
| Liste | `POST /react/orders/liste` |
| Annulation | `POST /react/orders/cancelOrdersSelection` |
