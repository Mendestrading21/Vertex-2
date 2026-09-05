# Provenance — kpi-dashboard-design

- Source : https://github.com/wshobson/agents — `plugins/business-analytics/skills/kpi-dashboard-design/`
- Commit épinglé : `a30778f8c4e6b0a87567941b7cca4f534bf642b6` (2026-09-01)
- Licence : MIT (dépôt wshobson/agents) — copie dans `LICENSE.upstream`
- Fichiers copiés : `SKILL.md`, `references/details.md` (verbatim, sans modification)
- Installé le 2026-09-05 pour la refonte UI (`docs/ui-refonte-vertex.md`), au niveau projet uniquement.
  Le reste du catalogue wshobson/agents n'est PAS installé.

## Adaptation Vertex

Ce skill est une MÉTHODE de hiérarchisation (synthèse → indicateurs clés → analyses →
détails, 5–7 indicateurs de tête, contexte et méthode visibles). Ses exemples de
métriques SaaS/commerciales (MRR, churn, LTV/CAC, cohortes) ne s'appliquent pas à
Vertex et ne doivent jamais être importés. Les autorités du dépôt priment :
`docs/05-design/DASHBOARD_COMPOSITION.md`, `WIDGET_LIBRARY.md`, `.claude/rules/*`.
