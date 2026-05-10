# Kubernetes per Ingegneri — Dal Container al Cluster

Percorso intensivo in italiano di **9 incontri da 4 ore** (8 core + 1 Kustomize) per team di ingegneri con background Linux e Docker, dai Linux namespaces fino a GitOps production-ready. Autorato su [iximiuz Labs](https://labs.iximiuz.com/) — i lab sono reali, le prime sessioni girano su playground iximiuz, le ultime su cluster Kubernetes su Proxmox.

**Formato di ogni sessione:** recap (10′) → teoria (50′) → demo (20′) → lab guidato 3 esercizi (90′) → capstone (30′) → review (20′) → preview & self-study (10′).

## Struttura del corso

Il contenuto vive in `courses/kubernets-for-engineers-italian-c57839fc/` ed è organizzato in 5 moduli.

### Modulo A — Fondamenta dei Container (`module-1`)

I mattoni Linux che Docker usa internamente, più tutto il ciclo di vita delle immagini.

| # | Lezione | Temi |
|---|---------|------|
| 1 | Primi passi con Docker | installazione, primo container, comandi base |
| 2 | Creare e containerizzare un'app | Dockerfile da zero su Node/Go/Python/Java |
| 3 | Lavorare con le immagini | layer, build from scratch, lifecycle |
| 4 | Volumi e dati persistenti | volumi vs bind mount con Docker e Podman |
| 5 | Networking dei container | none / host / bridge, comunicazione inter-container |
| 6 | Registry dei container | registry locale, push/pull/tag, crane |
| 7 | Podman: alternativa a Docker | daemonless, podman-compose, pod |
| 8 | Container privilegiati & capabilities | drop/add, minimo privilegio |
| 9 | Immagini come professionisti *(Incontro 2)* | multi-stage, distroless, OCI, `ctr`/`nerdctl`/`crictl` |
| 10 | Sotto il cofano *(Incontro 1)* | namespaces, cgroup v2, OverlayFS, veth pair |

### Modulo B — Kubernetes Core (`module-2`)

Dal primo `kubectl` fino a workload, storage, DNS e NetworkPolicy su cluster multi-node.

| # | Lezione | Temi |
|---|---------|------|
| 1 | Preparare l'ambiente | minikube / kind / kubeadm, kubeconfig, contesti |
| 2 | Esplorare il cluster | nodes, API resources, labels, selectors, namespaces |
| 3 | Deploy di un'app e Services | primo Deployment, ClusterIP/NodePort/LoadBalancer |
| 4 | Architettura Kubernetes *(Incontro 3)* | control plane, worker node, ciclo di vita Pod, debugging |
| 5 | Workload, config e storage *(Incontro 4)* | Deployment/ReplicaSet, StatefulSet + PVC, ConfigMap/Secret, DaemonSet, Job |
| 6 | Networking *(Incontro 5)* | kube-proxy + iptables, CoreDNS/ndots, Ingress TLS, NetworkPolicy |

### Modulo C — Cluster Reale e Production-Ready (`module-3`)

Sicurezza, osservabilità e GitOps su Proxmox. Culmina con il capstone finale.

| # | Lezione | Temi |
|---|---------|------|
| 1 | Scheduling, RBAC e sicurezza *(Incontro 6)* | Role/ClusterRole, TopologySpread, Taints, SecurityContext, PSS |
| 2 | Osservabilità e troubleshooting *(Incontro 7)* | metrics-server, kube-prometheus-stack, RED/USE, triage a strati, upgrade kubeadm |
| 3 | GitOps, Helm e cloud provider *(Incontro 8)* | Helm chart, ArgoCD + Gitea, HPA, capstone production-ready |
| 4 | Kustomize — overlay templateless *(Incontro 9)* | base + overlay, strategic/JSON patch, `configMapGenerator`, integrazione ArgoCD e Helm |
| 5 | Stack di osservabilità avanzato | Thanos, Mimir, Loki, Grafana, OpenTelemetry, LGTM stack |
| 6 | Backup e disaster recovery | Velero, CSI snapshot, backup schedulati, restore, migrazione cross-cluster |

### Modulo D — Approfondimento (`module-4`)

Otto set di challenge (due per incontro) per consolidare le competenze tra una sessione e l'altra. Ogni lezione in questo modulo è solo il wrapper: i contenuti dettagliati vivono in `challenges/uN-*` alla radice del repo.

### Modulo E — Multi-tenancy e Cluster-as-a-Service (`module-5`)

Estensione avanzata oltre il corso base. Introduce il pattern *hosted control planes* con **Kamaji**: i control plane dei cluster tenant girano come Pod su un cluster di management (k3s), i worker node si uniscono con `kubeadm join`.

| # | Lezione | Temi |
|---|---------|------|
| 1 | Kamaji — Hosted Control Planes | `TenantControlPlane` CRD, datastore, PKI, kubeadm join, confronto con vCluster / CAPI |

## Playground

I lab girano su playground iximiuz referenziati nel frontmatter di ogni lezione:

- `docker` — tutto il modulo A e `module-2/1.preparare-ambiente`
- `k8s-omni` — tutte le altre lezioni di modulo B e tutto il modulo C
- `kubernetes` / `k3s` — alcune challenge di modulo D (storico; preferire `k8s-omni` dove possibile)

Le spec custom dei playground stanno in `playgrounds/` (es. `vanilla/kubernetes-italian.yaml`).

## Pubblicare il corso

```sh
labctl content push -f course kubernets-for-engineers-italian-c57839fc
```

> **Nota:** il nome della directory contiene un refuso storico (`kubernets` senza la seconda `e`). Non rinominare: è l'ID del corso su iximiuz Labs.

## Altri contenuti nel repo

- `challenges/` — challenge standalone (`uN-*`) referenziate dal modulo D.
- `trainings/kubernetes-course-2026-376aa76b/` — sorgente flat originale con 8 unit files, migrata nel corso attivo. **Reference only — non modificare in parallelo.**
- `roadmaps/` — placeholder vuoto.

## Dove andare dopo

Il corso si chiude con una roadmap per i partecipanti: CKA, GitOps avanzato (Flux, ApplicationSets), Service Mesh (Istio/Linkerd), Cluster API, eBPF/Cilium, vCluster.
