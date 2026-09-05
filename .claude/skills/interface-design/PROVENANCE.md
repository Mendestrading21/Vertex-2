# Provenance — interface-design

- Source : https://github.com/Dammyjay93/interface-design — `.claude/skills/interface-design/`
- Commit épinglé : `2f9be3206855bcb2d1d0af262c8bae25cba6658d` (2026-06-20)
- Licence : MIT — copie dans `LICENSE.upstream`
- Fichiers copiés : `SKILL.md`, `agents/openai.yaml` (verbatim)
- Installé le 2026-09-05 pour la refonte UI (`docs/ui-refonte-vertex.md`), au niveau projet uniquement.

## Adaptation Vertex

Le skill propose d'écrire `.interface-design/system.md`. Vertex possède déjà une
référence de design unique (`docs/05-design/`, capture canonique du skill
`vertex-titanium-ledger`) : aucun `system.md` concurrent n'est créé. Les commandes
`/interface-design:design-review` et `design-deslop` ne sont pas installées (non
distribuées dans ce dossier) ; leur équivalent est appliqué en lecture du SKILL.md.
