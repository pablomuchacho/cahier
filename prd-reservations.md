# PRD – Refonte de la plateforme de réservation Dalcroze

## Contexte

Moderniser la réservation de salles (Mobilys Web · https://mweb.dalcroze.ch/backend/reservations) pour ordinateur, iPad et smartphone : parcours simple, peu de clics, interface responsive.

## Vision

Expérience type Google Calendar / Calendly / Microsoft Bookings : consulter, réerver, modifier, annuler en moins de 30 secondes.

## Utilisateurs

- Étudiant (smartphone)
- Enseignant (ordinateur, iPad)
- Administration (desktop)

## MVP

- Authentification Mobilys (`/react/user/connexion`)
- Dashboard (prochaines / récentes / notifications / actions rapides)
- Calendrier responsive (jour / semaine / mois / agenda mobile)
- Création en 4 étapes : date → salle → créneau → confirmation
- Gestion : voir / modifier / annuler
- Recherche salle · activité · date
- Conflits via `checkDates` + suggestions
- Notifications interface (+ email côté Mobilys)

## Backend

API Mobilys Web 2.56, institution **IJD**, hôte `https://mweb.dalcroze.ch`.

Proxy local : `python3 proxy/mobilys_proxy.py` → `/api/mobilys/*`.

## Design system

- Primaire `#0F4C5C` · Secondaire `#E36414` · Succès / erreur / warning
- Typo Newsreader + Manrope · spacing 4/8
- Composants : button, panel, modal/sheet, pills, calendar cells
