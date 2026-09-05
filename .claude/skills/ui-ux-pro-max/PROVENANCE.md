# Provenance — ui-ux-pro-max

- Source : https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — `.claude/skills/ui-ux-pro-max/`
- Commit épinglé : `f3ac195224eac1eb0dfe1a3059c2a6add78ffbe3` (2026-09-03)
- Licence : MIT — copie dans `LICENSE.upstream`
- Fichiers copiés : `SKILL.md`, `references/`, `scripts/` (hors `scripts/tests/`), `data/` (verbatim)
- Scripts examinés avant usage : Python 3 pur, lecture de CSV locaux, aucun accès réseau,
  aucun sous-processus. Installé le 2026-09-05 pour la refonte UI, au niveau projet.

## Utilisation dans ce dépôt

Le SKILL.md référence `${CLAUDE_PLUGIN_ROOT}` ; ici la variable n'est pas définie et le
chemin réel est, depuis la racine du dépôt :

    python .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain <domaine>

Stack détectée : React 19 + Vite + TypeScript (Biome, Vitest, Playwright), CSS natif
avec tokens `--vx-*`. Aucun Tailwind, aucun shadcn. Ne jamais utiliser `--persist` :
la référence de design de Vertex est `docs/05-design/`, pas `design-system/`.
Les palettes/polices proposées par l'outil ne remplacent pas le thème Titanium Ledger.
