# Cahier

Applis personnelle pour les devoirs de musique, semaine par semaine.

- Enregistre un devoir à la voix dès l’ouverture
- Trie par cours (impro, solfège, rythmique, etc.)
- Valide, mets en « à revoir », ou reporte à la semaine suivante

Les données restent sur cet appareil (IndexedDB). Rien n’est envoyé en ligne.

## Lancer l’app

Le micro ne fonctionne pas en ouvrant le fichier directement. Il faut un petit serveur local :

```bash
python3 -m http.server 5173
```

Puis ouvre [http://localhost:5173](http://localhost:5173).

Sur iPhone, tu peux ensuite partager la page vers **Sur l’écran d’accueil** pour l’avoir comme une appli.
