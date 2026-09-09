# Provenance — impeccable

- Source : https://github.com/pbakaus/impeccable — dossier DISTRIBUÉ `.claude/skills/impeccable/`
  (build Claude Code publié dans le dépôt ; `skill/SKILL.src.md` est la source, non copiée)
- Commit épinglé : `4bee58d89e4b3d3b4a1c44cfd2445dce03cf09e6` (2026-09-05), skill `version: 4.2.0`,
  moteur amont 0.1.1 (non vendu, voir ci-dessous)
- Licence : Apache-2.0 — copie dans `LICENSE.upstream.md` (extension `.md` pour la porte des formats) ; notices tierces dans `NOTICE.upstream.md`
- Agents compagnons copiés dans `.claude/agents/impeccable-*.md` (verbatim)
- Installé le 2026-09-05 pour la refonte UI, au niveau projet. Installation par COPIE
  (option « Copy from Repository » du README), pas par `npx impeccable install`.

## Ce qui n'est PAS installé — volontairement

- Aucun hook : `.claude/settings.json` du dépôt amont (PostToolUse/Stop lançant le
  détecteur) n'est PAS copié. Activer un hook exige une autorisation spécifique.
- Aucun launcher, aucun binaire : le dossier amont `scripts/` (launcher
  `impeccable` / `impeccable.cmd` qui télécharge un moteur natif dans
  `~/.impeccable/bin/`, `live-browser*.js`, `command-metadata.json`, index de
  polices) n'est PAS vendu dans ce dépôt. Retiré le 2026-09-06 : un launcher qui
  télécharge et exécute un exécutable contredit `.claude/rules/security.md`
  (supply-chain), et deux portes du dépôt le refusaient — formats non décidés
  (`tools/check_financial_boundary.py`) et motifs de jeton dans
  `live-browser.js` (`tools/check_secrets.py`, faux positifs sur un jeton de
  serveur local, vérifiés). Les commandes `critique`, `audit`, `layout`,
  `adapt`, `clarify`, `harden`, `polish` sont appliquées en LISANT
  `reference/*.md` ; `context`, `pin`, `live` et `doctor`, qui exigent le moteur,
  ne sont pas disponibles ici.
- Aucun `PRODUCT.md` / `DESIGN.md` racine : la vérité produit et design de Vertex vit
  dans `docs/00-foundation/CONSTITUTION.md` et `docs/05-design/`.
