# Rôle des deux dépôts

- `Mendestrading21/Vertex-` est donneur, lecture seule.
- `Mendestrading21/Vertex-2` (renommé le 2026-09-05, ex `Vertex-1.0-Beta-`, ancienne URL redirigée) est la seule cible d'écriture.
- Avant tout Edit/Write/Bash mutant, vérifier le remote `origin` de la cible.
- Le nom de branche identique ne remplace jamais la vérification du remote.
- Aucun remote, submodule, package local ou import runtime ne relie Beta au
  donneur.
- Une incohérence de rôle arrête le lot et devient incident P0.

