# Provenance — impeccable

- Source : https://github.com/pbakaus/impeccable — dossier DISTRIBUÉ `.claude/skills/impeccable/`
  (build Claude Code publié dans le dépôt ; `skill/SKILL.src.md` est la source, non copiée)
- Commit épinglé : `4bee58d89e4b3d3b4a1c44cfd2445dce03cf09e6` (2026-09-05), skill `version: 4.2.0`,
  moteur `scripts/VERSION` = 0.1.1
- Licence : Apache-2.0 — copie dans `LICENSE.upstream` ; notices tierces dans `NOTICE.upstream.md`
- Agents compagnons copiés dans `.claude/agents/impeccable-*.md` (verbatim)
- Installé le 2026-09-05 pour la refonte UI, au niveau projet. Installation par COPIE
  (option « Copy from Repository » du README), pas par `npx impeccable install`.

## Ce qui n'est PAS installé — volontairement

- Aucun hook : `.claude/settings.json` du dépôt amont (PostToolUse/Stop lançant le
  détecteur) n'est PAS copié. Activer un hook exige une autorisation spécifique.
- Aucun binaire : `scripts/impeccable` (launcher) télécharge un moteur natif dans
  `~/.impeccable/bin/` au premier lancement. Il n'a pas été exécuté. Les commandes
  `critique`, `audit`, `layout`, `adapt`, `clarify`, `harden`, `polish` sont appliquées
  en LISANT `reference/*.md` ; ce n'est pas une invocation native du moteur.
- Aucun `PRODUCT.md` / `DESIGN.md` racine : la vérité produit et design de Vertex vit
  dans `docs/00-foundation/CONSTITUTION.md` et `docs/05-design/`.
