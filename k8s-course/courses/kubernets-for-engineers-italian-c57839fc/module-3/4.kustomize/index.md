---
kind: lesson

title: Kustomize — Overlay e Composizione Templateless

description: |
  Kustomize come alternativa (e complemento) a Helm: base, overlay, patch strategici,
  generator di ConfigMap/Secret, composizione di risorse. Integrazione con kubectl
  (`kubectl apply -k`) e con ArgoCD. Trade-off Helm vs Kustomize e pattern "Helm + Kustomize".

name: kustomize
slug: incontro-9

createdAt: 2026-04-19
updatedAt: 2026-04-19

playground:
  name: k8s-omni
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare cosa risolve Kustomize e dove si colloca rispetto a Helm
- Strutturare un progetto in base + overlay per ambienti multipli (dev/staging/prod)
- Applicare strategic merge patch, JSON 6902 patch e replacement
- Generare ConfigMap e Secret con `configMapGenerator` e hash automatico per rollout trigger
- Integrare Kustomize con ArgoCD (sorgente nativa `kustomize:`) e con Helm (`helmCharts:`)
