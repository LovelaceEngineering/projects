---
kind: program
---

# Programma del Corso

Questo corso intensivo porta un team di ingegneri cloud da una solida conoscenza di Docker fino
alla gestione autonoma di cluster Kubernetes production-ready. Il percorso è costruito attorno
a un principio fondamentale: **capire cosa succede sotto il cofano**, non solo come usare gli strumenti.

---

## Prerequisiti

- Esperienza con Linux (systemd, processi, filesystem, networking di base)
- Familiarità con Docker (build, run, compose)
- Accesso SSH a macchine remote
- Nessuna esperienza Kubernetes richiesta

---

## Struttura del Percorso

### Modulo A — Fondamenta (Incontri 1–2): Il Container in Profondità

Prima di toccare Kubernetes, il corso parte dagli stessi mattoni che Docker usa internamente.
Capire Linux namespaces, cgroups e OverlayFS permette di diagnosticare problemi che altrimenti
sembrano magia nera. Il secondo incontro trasforma questi concetti in competenze pratiche
di build di immagini container ottimizzate e sicure.

**Incontro 1 — Sotto il Cofano: Internals di Docker**

*Playground: Docker + Ubuntu 24.04 su iximiuz Labs*

Teoria: Linux namespaces (7 tipi, clone/unshare syscall), cgroups v2 (memory.max, OOM killer),
OverlayFS (lowerdir/upperdir/merged, copy-on-write).

Hands-on:
- Creare un container "a mano" con `unshare` + `pivot_root`
- Ispezionare cgroup di un container con memory limit → OOM
- Esplorare la struttura dei layer OverlayFS
- Configurare un network namespace con veth pair

**Capstone:** Diagnosticare un container che crasha per OOM — leggere `memory.events`,
trovare la causa, proporre il fix.

---

**Incontro 2 — Immagini Come Professionisti**

*Playground: Docker + nerdctl/containerd su iximiuz Labs*

Teoria: Dockerfile avanzato (layer caching, multi-stage, distroless/scratch), OCI Image Spec
e registry, containerd vs Docker daemon, Container Runtime Interface (CRI).

Hands-on:
- Multi-stage Dockerfile: da 1GB a meno di 20MB, utente non-root
- Registry privato locale (docker registry:2) + push/pull + containerd mirror
- `ctr` vs `nerdctl` vs `crictl` — stessa operazione con tre strumenti

**Capstone:** Rifattorizzare un Dockerfile naif Java/Go con 4 problemi critici (peso,
root user, build artifacts esposti, secrets hardcodati).

---

### Modulo B — Kubernetes Core (Incontri 3–5): Dal Pod al Cluster

Il cuore del corso: architettura del control plane, workload management e networking.
Ogni incontro aggiunge un layer di complessità, costruendo su quello precedente.

**Incontro 3 — L'Architettura di Kubernetes: Da Zero a Pod**

*Playground: Kubernetes multi-node kubeadm su iximiuz Labs*

Teoria: Control plane (apiserver, etcd, scheduler, controller-manager), worker node
(kubelet, kube-proxy, CNI), ciclo di vita completo di un Pod.

Hands-on:
- Primo Pod YAML: namespace, labels, sidecar container, resource requests/limits
- `kubectl` debugging toolkit: CrashLoopBackOff, Pending, ImagePullBackOff
- Interazione diretta con l'API server via `curl` e analisi delle REST call con `kubectl -v=8`

**Capstone:** "Il Quartetto dei Pod Rotti" — 4 Pod con errori diversi, tutti da diagnosticare
e correggere in 30 minuti.

---

**Incontro 4 — Workload, Configurazione e Storage**

*Playground: Kubernetes multi-node kubeadm su iximiuz Labs*

Teoria: Gerarchia Deployment→ReplicaSet→Pod, rolling update/rollback, DaemonSet/StatefulSet/Job,
ConfigMap+Secret (montaggio volume vs env vars), PV/PVC/StorageClass (access modes, reclaim policy).

Hands-on:
- Rolling update con monitoraggio 0-downtime (curl loop in background)
- ConfigMap come file + Secret come volume + env vars da ConfigMap
- StatefulSet PostgreSQL con PVC — i dati persistono dopo `kubectl delete pod`

**Capstone:** "Il Database che Dimentica" — convertire un Deployment PostgreSQL in StatefulSet,
aggiungere PVC, secrets, initContainer, verificare la persistenza.

---

**Incontro 5 — Networking: Services, DNS e Ingress**

*Playground: Kubernetes K3s con Traefik su iximiuz Labs*

Teoria: kube-proxy + iptables/ipvs (ClusterIP è una VIP virtuale), DNS interno (CoreDNS, FQDN,
ndots:5), Ingress Resource vs Ingress Controller, NetworkPolicy (default-allow → allowlist).

Hands-on:
- Service discovery cross-namespace: FQDN completo vs abbreviato
- Ingress multi-host + TLS self-signed (Secret TLS)
- NetworkPolicy: isolamento database — solo il tier `api` può accedere

**Capstone:** "Il Microservizio Disperso" — architettura 3-tier con errori multipli
(selector mismatch, DNS errato, NetworkPolicy troppo restrittiva).

---

### Modulo C — Cluster Reale (Incontri 6–8): Production-Ready

Dalla seconda metà del corso si lavora su cluster Kubernetes reali su Proxmox.
Gli argomenti diventano più complessi: sicurezza, osservabilità, GitOps.

**Incontro 6 — Scheduling, RBAC e Sicurezza**

*Playground: iximiuz Labs (prime 2h) → Proxmox VMs reali (ultime 2h)*

Teoria: RBAC (Role/ClusterRole, RoleBinding, ServiceAccount, principio del minimo privilegio),
scheduling avanzato (NodeSelector, Affinity, Taints/Tolerations, TopologySpreadConstraints,
PriorityClass), Pod Security Standards (restricted/baseline/privileged), SecurityContext.

Hands-on:
- RBAC per team separati: Team A full namespace, Team B read-only, monitoring ClusterRole
- 6 repliche distribuite in 3 zone con TopologySpreadConstraints
- Hardening di un Pod insicuro: runAsNonRoot, readOnlyRootFilesystem, drop capabilities, seccompProfile

**Capstone (su Proxmox):** "L'Attacco RBAC" — token ServiceAccount compromesso,
ridurre i permessi senza rompere l'applicazione.

---

**Incontro 7 — Osservabilità, Troubleshooting e Gestione del Cluster**

*Ambiente: Proxmox VMs con Prometheus + Grafana pre-installato*

Teoria: I 3 pilastri (logs/metrics/traces), metodi RED e USE, health check di CoreDNS/metrics-server/etcd,
troubleshooting sistematico (cluster→node→pod→container→app), upgrade lifecycle con kubeadm.

Hands-on:
- Helm install di kube-prometheus-stack + ServiceMonitor + alert rule custom
- Troubleshooting a strati: PVC unbound → CrashLoop → Service selector typo
- Cluster upgrade control plane 1.30→1.31 + drain/upgrade di un worker node

**Capstone:** "Il Cluster Silenzioso" — nodo NotReady + metrics-server KO + backup etcd
obbligatorio prima di toccare qualsiasi cosa.

---

**Incontro 8 — GitOps, Helm e Architetture Cloud Provider**

*Ambiente: Proxmox VMs con ArgoCD + Gitea pre-installati*

Teoria: Helm (chart structure, templating, lifecycle, OCI registry), GitOps pull model vs push model CI/CD,
ArgoCD (Application, AppProject, self-heal, Image Updater), multi-tenancy (namespace isolation, vCluster),
Cluster API.

Hands-on:
- Helm chart da manifest esistenti: parametrizzare image.tag, replicaCount, resources, env
- GitOps pipeline: Gitea repo → ArgoCD Application → simulare drift e osservare self-heal
- HPA: autoscale deployment con generatore di carico, osservare scale-up e scale-down

**Capstone Finale:** "Il Servizio Pronto per la Produzione" — ogni partecipante porta la propria
app a production-ready (Helm, ArgoCD, RBAC, NetworkPolicy, PVC, Prometheus, HPA, no root, no hardcoded secrets)
e presenta le scelte architetturali al team.

---

## Self-Study tra gli Incontri

Tra ogni sessione live, i partecipanti completano assignment specifici su iximiuz Labs:
tutorial interattivi, challenge hands-on, e skill path tematici. Il materiale di self-study
è progettato per richiedere 60–90 minuti e consolida i concetti teorici dell'incontro precedente,
preparando il terreno per quello successivo.

---

## Ambienti di Lab

| Incontri | Ambiente | Note |
|----------|----------|------|
| 1–5 | iximiuz Labs (playground cloud) | Nessun setup locale richiesto |
| 6 | iximiuz Labs + Proxmox VMs | Transizione a cluster reale |
| 7–8 | Proxmox VMs (cluster del cliente) | Prometheus, Grafana, ArgoCD, Gitea pre-installati |
