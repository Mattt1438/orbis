# Orbis — instructions pour les agents

Orbis est un jeu de stratégie spatiale en français, distribué comme PWA (app web installable, jouable hors ligne) via GitHub Pages.
Site : https://mattt1438.github.io/orbis/ — repo **public**, un seul propriétaire (Mattt1438).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure, CSS, balises PWA, CSP. Aucun script inline. |
| `game.js` | Tout le jeu (simulation, IA, rendu canvas, son Web Audio, UI). Enregistre `sw.js` à la fin. |
| `sw.js` | Service worker : précache des fichiers, cache des Google Fonts, hors ligne. |
| `manifest.webmanifest` | Nom, couleurs, icônes de l'app installée. |
| `icon.svg` | Source de l'icône. Les PNG en sont dérivés. |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Icônes générées (voir plus bas). |
| `.nojekyll` | Empêche GitHub Pages de passer le site dans Jekyll. |

Pas de build, pas de dépendances, pas de `package.json`. Garder ça comme ça.

## Règle n°1 : bump du cache à chaque déploiement

Dès qu'un fichier servi change, incrémenter `VERSION` dans `sw.js` (`orbis-v1` → `orbis-v2`…).
Sinon les cells où le jeu est installé gardent l'ancienne version indéfiniment.
Si un fichier est ajouté ou renommé, l'ajouter aussi à `FILES` dans `sw.js`.

## Déploiement (gratuit, et doit le rester)

- Push sur `main` → GitHub Pages publie tout seul en ~1 min (source : branche `main`, dossier racine).
- Aucun workflow GitHub Actions, aucun service payant, aucun hébergeur tiers. Ne pas en ajouter.
- Vérifier après push : `gh api repos/Mattt1438/orbis/pages/builds/latest --jq .status` doit donner `built`.

## Tester avant de pousser

```bash
python3 -m http.server 8765 -d .
```

Ouvrir http://localhost:8765 et vérifier :
1. La console n'a aucune erreur, en particulier aucune violation CSP.
2. « Commencer » lance une partie.
3. Le service worker est actif et le cache contient le nouveau `VERSION`.
4. Serveur arrêté, la page se recharge quand même (hors ligne).

`window.__orbis` expose `{ G, update, startLevel, startDemo, makeParams, aiThink, render }` pour tester depuis la console.

## Sécurité (le repo est public)

- **CSP** (dans `index.html`) : seuls `'self'` et Google Fonts sont autorisés. Pas de script inline, pas de CDN.
  Ajouter une origine externe = mettre à jour la CSP **et** `sw.js`, et le justifier dans le commit.
- Aucun secret, jeton, clé ou donnée personnelle dans le repo. Tout ce qui est poussé est public pour toujours.
- Commits signés avec l'adresse noreply : `32132430+Mattt1438@users.noreply.github.com`.
  Sur un clone neuf, la configurer avant de committer : `git config user.email 32132430+Mattt1438@users.noreply.github.com`.
  Ne jamais committer avec un courriel personnel.
- Ne pas ajouter de collaborateurs, de deploy keys, de webhooks ni de workflows.
- Un ruleset bloque le force-push et la suppression de `main`. Ne pas le contourner.
- Les interactions publiques (issues, PR, commentaires) sont limitées aux collaborateurs, et cette limite expire après 6 mois. Pour la renouveler :
  `gh api -X PUT repos/Mattt1438/orbis/interaction-limits -f limit=collaborators_only -f expiry=six_months`

## Conventions du jeu

- Interface en français. On tutoie le joueur, avec un ton bref et direct.
- La sauvegarde est dans `localStorage`, clé `orbis.v1` (`level`, `best`, `pct`, `muted`, `speed`, `seen`).
  Ne pas casser ce format : un joueur perdrait sa progression. S'il doit changer, migrer les anciennes données au chargement.
- Les cartes de didacticiel sont marquées vues via `save.seen['v2' + clé]`. Changer le préfixe les réaffiche à tout le monde.
- Les niveaux sont déterministes (seed dérivé du numéro de niveau). Modifier `makeParams` ou `genLevel` change toutes les cartes.

## Régénérer les icônes (macOS)

```bash
for s in 512 192 180; do qlmanage -t -s $s -o /tmp icon.svg && mv /tmp/icon.svg.png icon-$s.png; done
mv icon-180.png apple-touch-icon.png
```

L'icône est pleine page (sans transparence) pour rester valide en mode `maskable`. Garder le motif dans le cercle central (80 %).
