# Mindmap

Een eenvoudige mindmaptool voor in de klas, bedoeld voor het smartboard.

- Twee weergaven: **Rondom** (hoofdonderwerp in het midden) en **Links naar rechts**
- **Presentatiemodus**: geen knoppen in beeld, takken stap voor stap onthullen door te tikken
- Touchbediening: tik om te selecteren, sleep om te schuiven, knijp om te zoomen
- Automatisch opslaan in de browser, meerdere mindmaps, export als PNG of JSON, back-up en import
- Geen build nodig: gewone HTML, CSS en JavaScript

## Gebruiken

Open de pagina via GitHub Pages, of start lokaal een server in deze map:

```
python -m http.server 5173
```

en ga naar http://localhost:5173.

## Sneltoetsen (bewerkmodus)

| Toets | Actie |
| --- | --- |
| Tab | Kindknoop toevoegen |
| Enter | Zusje toevoegen |
| Delete | Knoop verwijderen |
| F2 | Tekst aanpassen |
| Ctrl+Z / Ctrl+Y | Ongedaan maken / opnieuw |
| Esc | Selectie opheffen, of presentatiemodus stoppen |

## Opslag

Mindmaps staan in `localStorage` van de browser op dat apparaat. Gebruik "Back-up van alles" om ze mee te nemen naar een ander apparaat. De opslag zit in `js/store.js` en kan later worden vervangen door Supabase.
