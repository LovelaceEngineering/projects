---
kind: course

title: Kubernetes per Ingegneri — Dal Container al Cluster

description: |
  Percorso intensivo di 9 incontri da 4 ore per team di ingegneria con background Linux/infra e Docker.
  Dai Linux namespaces e cgroups fino a GitOps, RBAC e architetture production-ready su Kubernetes.
  Ogni sessione alterna teoria, demo live e laboratori hands-on sulla piattaforma iximiuz Labs,
  con assignment di self-study tra un incontro e l'altro. Dalla seconda metà del corso, i lab
  si svolgono su cluster Kubernetes reali in ambienti Proxmox.

categories:
- kubernetes
- containers
- linux

tagz:
- Italian
- professional
- intensive

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png
---

## Il Percorso

Un programma blended-learning progettato per team di ingegneri cloud con solida esperienza Linux e Docker,
che vogliono padroneggiare Kubernetes fino al livello production-ready.

**9 sessioni live** da 4 ore ciascuna, con assignment di self-study tra un incontro e l'altro su iximiuz Labs.

### Formato di ogni sessione

| Slot | Durata | Attività |
|------|--------|----------|
| 09:00–09:10 | 10 min | Recap self-study + domande aperte |
| 09:10–10:00 | 50 min | Teoria |
| 10:00–10:10 | 10 min | Pausa |
| 10:10–10:30 | 20 min | Demo live istruttore |
| 10:30–12:00 | 90 min | Laboratorio hands-on guidato (3 esercizi) |
| 12:00–12:30 | 30 min | Capstone challenge (autonomo/coppie) |
| 12:30–12:50 | 20 min | Review collettivo capstone |
| 12:50–13:00 | 10 min | Preview prossimo incontro + self-study assignment |

### Struttura del Corso

| # | Titolo | Modulo | Ambiente |
|---|--------|--------|----------|
| 1 | Sotto il Cofano: Internals di Docker | A — Fondamenta | Docker + Ubuntu 24.04 (iximiuz) |
| 2 | Immagini Come Professionisti | A — Fondamenta | Docker + nerdctl/containerd (iximiuz) |
| 3 | L'Architettura di Kubernetes: Da Zero a Pod | B — Kubernetes Core | Kubernetes multi-node kubeadm (iximiuz) |
| 4 | Workload, Configurazione e Storage | B — Kubernetes Core | Kubernetes multi-node kubeadm (iximiuz) |
| 5 | Networking: Services, DNS e Ingress | B — Kubernetes Core | Kubernetes K3s con Traefik (iximiuz) |
| 6 | Scheduling, RBAC e Sicurezza | C — Cluster Reale | iximiuz (prime 2h) → Proxmox VMs (ultime 2h) |
| 7 | Osservabilità, Troubleshooting e Gestione del Cluster | C — Cluster Reale | Proxmox (Prometheus + Grafana) |
| 8 | GitOps, Helm e Architetture Cloud Provider | C — Cluster Reale | Proxmox (ArgoCD + Gitea) |
| 9 | Kustomize: Overlay Templateless | C — Cluster Reale | Kubernetes multi-node (iximiuz) |
