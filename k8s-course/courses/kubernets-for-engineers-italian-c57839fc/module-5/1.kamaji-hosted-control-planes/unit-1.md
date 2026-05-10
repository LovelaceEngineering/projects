---
kind: unit
title: "Kamaji — Hosted Control Planes per Kubernetes"
name: kamaji
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare il pattern *hosted control plane* e quando sceglierlo invece di kubeadm o managed Kubernetes
- Installare Kamaji su un cluster k3s con i suoi prerequisiti (cert-manager, datastore)
- Creare un `TenantControlPlane` e ispezionare i Pod che compongono il control plane
- Far entrare due worker node nel control plane tenant con `kubeadm join`

## Teoria (50 min)

### Il pattern "Hosted Control Plane"

Un cluster Kubernetes "classico" (es. creato con `kubeadm`) esegue il control plane — apiserver,
controller-manager, scheduler, etcd — come **processi/statici Pod sui nodi control plane**.
Ogni cluster porta con sé il costo fisso di almeno 3 VM control plane per l'alta disponibilità.

Nel pattern *hosted control plane* (HCP) questa relazione viene ribaltata:

```
                ┌───────────────────────────────────────────┐
                │  Management Cluster (k3s / kubeadm / …)   │
                │                                           │
                │  ┌────────────┐   ┌────────────┐          │
                │  │ kamaji-ctrl│   │  tenant-a  │          │
                │  │  manager   │   │  apiserver │          │
                │  └────────────┘   │  controller│          │
                │                   │  scheduler │          │
                │                   └────────────┘          │
                │                   ┌────────────┐          │
                │                   │  tenant-b  │          │
                │                   │  apiserver │          │
                │                   └────────────┘          │
                └───────────┬───────────────────────────────┘
                            │ LoadBalancer / NodePort
                  ┌─────────┴─────────┐
                  │                   │
           ┌──────▼─────┐     ┌───────▼─────┐
           │ tenant-a    │     │ tenant-b    │
           │ worker-01   │     │ worker-01   │
           │ worker-02   │     │ worker-02   │
           └─────────────┘     └─────────────┘
```

Il control plane di ogni cluster **tenant** gira come un insieme di Pod nel *management cluster*.
I worker node del tenant sono VM normali che si collegano al control plane come qualsiasi
altro worker kubeadm.

Vantaggi:

- **Densità**: N control plane condividono le stesse VM di management (→ costo ammortizzato)
- **Lifecycle management**: upgrade, backup, restart → sono solo operazioni Kubernetes sul management cluster
- **Time-to-cluster**: creare un nuovo cluster = creare una CR; ~30 secondi vs minuti/ore di kubeadm

### Kamaji in una frase

> Kamaji è un operatore Kubernetes che, dato un CR `TenantControlPlane`, lancia nel cluster di
> management i Pod di apiserver/controller-manager/scheduler, provisiona un datastore, genera
> PKI + kubeconfig, espone l'apiserver via Service e ti restituisce un kubeconfig usabile.

Sito: <https://kamaji.clastix.io/>

### I componenti

| Componente | Ruolo |
|-----------|-------|
| **kamaji controller manager** | Reconcilia i CR `TenantControlPlane`, crea Pod/Service/Secret |
| **DataStore CRD** | Punta a un backend (etcd, MySQL, PostgreSQL, kine/NATS) condiviso o per-tenant |
| **TenantControlPlane CRD** | Specifica versione k8s, replicas del CP, datastore, service type |
| **cert-manager** | Dipendenza: firma tutti i certificati PKI del tenant |
| **Service di esposizione** | `NodePort`, `LoadBalancer` o `ClusterIP` — è l'endpoint API del tenant |

Un `TenantControlPlane` minimale:

```yaml
apiVersion: kamaji.clastix.io/v1alpha1
kind: TenantControlPlane
metadata:
  name: tenant-demo
  namespace: tenants
spec:
  dataStore: default
  controlPlane:
    deployment:
      replicas: 2
      additionalMetadata:
        labels:
          tenant: demo
    service:
      serviceType: LoadBalancer
  kubernetes:
    version: v1.31.0
    kubelet:
      cgroupfs: systemd
    admissionControllers:
      - ResourceQuota
      - LimitRanger
  networkProfile:
    port: 6443
  addons:
    coreDNS: {}
    kubeProxy: {}
```

> **Nota:** se usi `serviceType: NodePort`, il campo `networkProfile.port` deve essere nel range **30000-32767**. Con `LoadBalancer` (default sul playground grazie a klipper-lb di k3s) puoi usare la porta standard `6443` — ed è così che i worker node si aspettano di trovare l'apiserver con `kubeadm join`.

### Kamaji vs le alternative

| Strumento | Control plane | Isolamento | Quando usarlo |
|-----------|--------------|------------|---------------|
| **kubeadm** | VM dedicate | Fisico | Cluster pochi, long-lived, massimo controllo |
| **Kamaji** | Pod sul mgmt | Namespace + PKI separata | Tanti cluster, lifecycle veloce, stesso team di platform |
| **vCluster** | Pod sul mgmt (syncer) | Namespace (soft) | Dev/test, sandbox per team, no workload isolation hard |
| **Cluster API** | Varia per provider | Varia | Provisioning multi-cloud dichiarativo, cluster "full fat" |
| **EKS/GKE/AKS** | Gestito dal cloud | Per-cluster VPC | Non vuoi operare tu il control plane |

## Hands-on Guidato (90 min)

Il playground `k8s-omni` fornisce 3 macchine:

- **`mgmt-cp`** — k3s single-node + Helm; qui installeremo Kamaji
- **`tenant-worker-01`**, **`tenant-worker-02`** — worker vuoti che uniremo al tenant

Lo script di init installa già k3s, Helm, cert-manager e Kamaji. Gli esercizi partono dal
cluster di management già pronto.

### Esercizio 1 — Esplorare il cluster di management

Dalla shell di `mgmt-cp`:

```bash
kubectl get nodes
kubectl get pods -n kamaji-system
kubectl get pods -n cert-manager
kubectl get crd | grep kamaji
```

Dovresti vedere:

- 1 nodo `mgmt-cp` in `Ready`
- Pod `kamaji-*` nel namespace `kamaji-system`
- Pod `cert-manager-*` nel namespace `cert-manager`
- CRD `tenantcontrolplanes.kamaji.clastix.io` e `datastores.kamaji.clastix.io`

Ispeziona il DataStore di default:

```bash
kubectl get datastore default -o yaml
```

### Esercizio 2 — Creare un TenantControlPlane

```bash
kubectl create namespace tenants

cat <<'EOF' | kubectl apply -f -
apiVersion: kamaji.clastix.io/v1alpha1
kind: TenantControlPlane
metadata:
  name: tenant-demo
  namespace: tenants
spec:
  dataStore: default
  controlPlane:
    deployment:
      replicas: 2
    service:
      serviceType: LoadBalancer
  kubernetes:
    version: v1.31.0
    kubelet:
      cgroupfs: systemd
  networkProfile:
    port: 6443
  addons:
    coreDNS: {}
    kubeProxy: {}
EOF

# Osserva lo stato in reconcile
kubectl get tcp -n tenants -w
```

Quando il campo `STATUS` passa a `Ready`, ispeziona cosa è stato creato:

```bash
kubectl get pods -n tenants                       # i Pod del CP del tenant
kubectl get svc  -n tenants                       # il Service NodePort
kubectl get secret -n tenants | grep tenant-demo  # certificati e kubeconfig
```

Estrai il kubeconfig del tenant:

```bash
kubectl get secret tenant-demo-admin-kubeconfig -n tenants \
  -o jsonpath='{.data.admin\.conf}' | base64 -d > /root/tenant-demo.kubeconfig

export KUBECONFIG=/root/tenant-demo.kubeconfig
kubectl cluster-info
kubectl get nodes   # vuoto — non ci sono ancora worker
```

### Esercizio 3 — Unire i worker al tenant

Kamaji non gestisce i worker: li tratta come nodi esterni che si registrano via kubeadm.

Genera il join command sul cluster tenant (continuando ad usare `KUBECONFIG=/root/tenant-demo.kubeconfig`):

```bash
# Installa kubeadm sulla mgmt-cp se non già presente — oppure usa il token manualmente
JOIN_TOKEN=$(kubeadm token create --kubeconfig=/root/tenant-demo.kubeconfig --print-join-command)
echo "$JOIN_TOKEN"
```

Copia il comando e lancialo via `ssh` sulle due VM worker:

```bash
ssh tenant-worker-01 "$JOIN_TOKEN"
ssh tenant-worker-02 "$JOIN_TOKEN"
```

Dopo ~30 secondi, sul tenant:

```bash
export KUBECONFIG=/root/tenant-demo.kubeconfig
kubectl get nodes
# NAME               STATUS   ROLES    AGE   VERSION
# tenant-worker-01   Ready    <none>   30s   v1.31.0
# tenant-worker-02   Ready    <none>   25s   v1.31.0
```

### Esercizio 4 — Deploy + isolamento

Deploy di un'app nel cluster tenant:

```bash
kubectl --kubeconfig=/root/tenant-demo.kubeconfig \
  create deployment web --image=nginx:alpine --replicas=3

kubectl --kubeconfig=/root/tenant-demo.kubeconfig get pods -o wide
```

Verifica che i Pod girino **sui worker del tenant**, non sul management:

```bash
# Nel cluster di management i Pod del tenant non devono comparire:
unset KUBECONFIG
kubectl get pods --all-namespaces | grep web
# → nessun risultato
```

Questo dimostra l'isolamento workload: mgmt e tenant hanno API server, etcd, PKI e
scheduler completamente separati. L'unica superficie condivisa sono i Pod del CP del
tenant nel namespace `tenants`.

## Capstone Challenge (30 min)

> **"Due tenant, due versioni"**
>
> Il tuo team platform deve dare a due team interni un cluster Kubernetes dedicato.
> Il team A vuole `v1.31.0`, il team B vuole `v1.30.4` (legacy).
>
> 1. Crea `TenantControlPlane/team-a` e `TenantControlPlane/team-b` nel namespace `tenants`
>    con le versioni richieste.
> 2. Estrai i due kubeconfig e verifica con `kubectl version` che puntino a versioni diverse.
> 3. Unisci `tenant-worker-01` a team-a e `tenant-worker-02` a team-b.
> 4. Deploy di un Pod `nginx:alpine` in entrambi i tenant. Verifica che non siano visibili
>    nel cluster di management né l'uno dall'altro.
> 5. **Bonus**: cancella il Pod `tenant-demo-*-apiserver-*` nel namespace `tenants` del
>    management cluster. Che succede al tenant? Quanto dura l'interruzione?

## Self-Study Assignment

- Leggere la [documentazione Kamaji](https://kamaji.clastix.io/guides/) sulle guide "Getting Started" e "Datastore".
- Esplorare la pagina [Concepts](https://kamaji.clastix.io/concepts/) — in particolare le sezioni *TenantControlPlane* e *DataStore*.
- Confrontare Kamaji con [vCluster](https://www.vcluster.com/) leggendo i rispettivi "When to use": annotare 3 differenze pratiche e in quale scenario sceglieresti l'uno o l'altro.

## Dove andare da qui

- **Cluster API con Kamaji**: [Kamaji provider for CAPI](https://github.com/clastix/cluster-api-control-plane-provider-kamaji) — orchestrare l'intera lifecycle (CP + workers) in modo dichiarativo.
- **Datastore per-tenant**: separare etcd fisico per team ad alta sensibilità.
- **GitOps dei tenant**: gestire i CR `TenantControlPlane` con ArgoCD per un self-service catalog di cluster.
