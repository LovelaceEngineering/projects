
> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/kubernetes**


## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Progettare un sistema RBAC con Role, ClusterRole, RoleBinding e ServiceAccount
- Applicare il principio del minimo privilegio e verificarlo con `kubectl auth can-i`
- Distribuire workload in più zone con TopologySpreadConstraints
- Configurare Taints e Tolerations per nodi dedicati
- Fare hardening di un Pod usando SecurityContext (runAsNonRoot, readOnlyRootFilesystem, capabilities)
- Applicare Pod Security Standards a un namespace


## Teoria (50 min)

### RBAC — Role-Based Access Control

Kubernetes RBAC risponde alla domanda: **"chi può fare cosa su quali risorse?"**

#### I 4 Oggetti RBAC

| Oggetto | Scope | Funzione |
|---------|-------|----------|
| **Role** | Namespace | Definisce permessi su risorse in un namespace |
| **ClusterRole** | Cluster | Permessi cluster-wide (nodi, PV, namespace, CRD) |
| **RoleBinding** | Namespace | Associa Role **o** ClusterRole a Subject nel namespace |
| **ClusterRoleBinding** | Cluster | Associa ClusterRole a Subject a livello cluster |

**Subjects** (chi ha i permessi):
- `User` — utente umano (da certificato o OIDC token)
- `Group` — gruppo di utenti
- `ServiceAccount` — identità per i Pod

#### Role e ClusterRole

```yaml
# Role: permessi limitati a un namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-a
  name: pod-reader
rules:
- apiGroups: [""]            # "" = core API group (Pod, Service, ConfigMap...)
  resources: ["pods", "pods/log", "pods/exec"]
  # NOTA: "pods/log" e "pods/exec" sono sub-resource — richiedono permesso esplicito
  # separato dal permesso su "pods". Avere "get" su "pods" NON dà automaticamente
  # accesso a "pods/log" o "pods/exec". Devono essere dichiarati esplicitamente.
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list"]
# ClusterRole: per risorse cluster-wide o da riusare in più namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-reader
rules:
- apiGroups: [""]
  resources: ["pods", "nodes", "endpoints", "services"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["pods", "nodes"]
  verbs: ["get", "list"]
```

**Verbs disponibili:**

| Verb | Operazione HTTP | Equivalente kubectl |
|------|-----------------|---------------------|
| `get` | GET /resource/:name | `kubectl get pod myapp` |
| `list` | GET /resource | `kubectl get pods` |
| `watch` | GET /resource?watch=true | `kubectl get pods -w` |
| `create` | POST /resource | `kubectl create` / `apply` |
| `update` | PUT /resource/:name | `kubectl apply` (modifica) |
| `patch` | PATCH /resource/:name | `kubectl patch` |
| `delete` | DELETE /resource/:name | `kubectl delete` |
| `deletecollection` | DELETE /resource | `kubectl delete pods --all` |
| `escalate` | speciale | Creare Role con permessi superiori ai propri |
| `bind` | speciale | Creare RoleBinding per un Role |

#### RoleBinding e ClusterRoleBinding

```yaml
# RoleBinding: assegna un Role (o ClusterRole) in un namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: team-a
  name: read-pods-binding
subjects:
# Associa a un ServiceAccount
- kind: ServiceAccount
  name: monitoring-sa
  namespace: monitoring
# Associa a un utente (da certificato/OIDC)
- kind: User
  name: alice@example.com
  apiGroup: rbac.authorization.k8s.io
# Associa a un gruppo
- kind: Group
  name: system:masters
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role           # o ClusterRole
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

#### ServiceAccount per i Pod

Ogni Pod ha un ServiceAccount associato (default se non specificato).
Il token viene automontato in `/var/run/secrets/kubernetes.io/serviceaccount/`.

```yaml
# Crea un ServiceAccount dedicato
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: production
automountServiceAccountToken: false   # Non montare il token se non serve
# Deployment che usa il ServiceAccount
spec:
  serviceAccountName: myapp-sa
  automountServiceAccountToken: true  # Sovrascrive il default del SA
```

```bash
# Dentro un Pod, usa il token per chiamare l'apiserver
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

curl -s --cacert $CACERT \
  -H "Authorization: Bearer $TOKEN" \
  https://kubernetes.default.svc.cluster.local/api/v1/namespaces/default/pods
```

#### `kubectl drain` e dati emptyDir

> **⚠️ ATTENZIONE:** Il flag `--delete-emptydir-data` durante un `kubectl drain` **distrugge permanentemente** i dati presenti nei volume di tipo `emptyDir` dei Pod sul nodo. I dati in `emptyDir` non sono persistenti per definizione, ma applicazioni che usano `emptyDir` come cache temporanea o coda locale perderanno quei dati irrecuperabilmente.
> Prima di fare drain, verifica quali Pod sul nodo usano `emptyDir` e se la perdita dei dati è accettabile:
> ```bash
> kubectl get pods -o yaml | grep -A 5 emptyDir
> ```

#### Verifica RBAC con `kubectl auth can-i`

```bash
# Verifica le proprie autorizzazioni
kubectl auth can-i create pods
kubectl auth can-i delete secrets -n production

# Impersona un ServiceAccount (richiede --as)
kubectl auth can-i create pods \
  --as=system:serviceaccount:team-a:team-a-sa \
  -n team-a
# → yes

kubectl auth can-i create pods \
  --as=system:serviceaccount:team-b:team-b-sa \
  -n team-a
# → no

# Vedi TUTTO ciò che può fare un ServiceAccount
kubectl auth can-i --list \
  --as=system:serviceaccount:production:myapp-sa \
  -n production
```

**Principio del minimo privilegio:** ogni ServiceAccount deve avere solo i verbi
e le risorse strettamente necessarie per il funzionamento dell'applicazione.
`cluster-admin` è quasi sempre sbagliato — e pericoloso.


### Scheduling Avanzato

#### TopologySpreadConstraints

Distribuisce Pod uniformemente su zone, nodi, o qualsiasi topology key.

```yaml
spec:
  topologySpreadConstraints:
  # Constraint 1: max 1 Pod di differenza tra zone
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone   # Label del nodo
    whenUnsatisfiable: DoNotSchedule           # o ScheduleAnyway
    labelSelector:
      matchLabels:
        app: myapp
  # Constraint 2: max 2 Pod di differenza tra nodi
  - maxSkew: 2
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: myapp
```

```bash
# Simula zone sui nodi del playground
kubectl label node node1 topology.kubernetes.io/zone=zone-a
kubectl label node node2 topology.kubernetes.io/zone=zone-b
kubectl label node node3 topology.kubernetes.io/zone=zone-c

# Crea Deployment con TopologySpreadConstraints
kubectl apply -f deployment-multizone.yaml

# Verifica la distribuzione
kubectl get pods -o wide
kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName | \
  sort -k2 | uniq -f1 -c
```

**`whenUnsatisfiable` values:**
- `DoNotSchedule` — il Pod rimane `Pending` finché il constraint non può essere soddisfatto
- `ScheduleAnyway` — schedula comunque ma minimizza lo skew (best-effort)

#### Taints e Tolerations

I **Taints** su un nodo **respingono** i Pod che non hanno la toleration corrispondente.

```bash
# Aggiungi taint su un nodo (3 effetti possibili)
kubectl taint node node1 dedicated=gpu:NoSchedule    # Non schedula nuovi Pod
kubectl taint node node1 dedicated=gpu:NoExecute     # Evict i Pod esistenti senza toleration
kubectl taint node node1 dedicated=gpu:PreferNoSchedule  # Preferibilmente non schedulare

# Rimuovi un taint
kubectl taint node node1 dedicated=gpu:NoSchedule-
```

```yaml
# Pod che può girare su nodi GPU (toleration corrispondente)
spec:
  tolerations:
  - key: dedicated
    operator: Equal
    value: gpu
    effect: NoSchedule
  # Toleration wildcard: tollera qualsiasi taint con questa key
  - key: dedicated
    operator: Exists
    effect: NoSchedule
  # Toleration per nodo non-ready (evict dopo 60s invece del default 300s)
  - key: node.kubernetes.io/not-ready
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 60
```

#### Node Affinity

```yaml
spec:
  affinity:
    nodeAffinity:
      # HARD: se non soddisfatto, Pod rimane Pending
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: kubernetes.io/arch
            operator: In
            values: ["amd64"]
          - key: node-type
            operator: In
            values: ["compute", "high-memory"]

      # SOFT: preferisce certi nodi ma accetta altri
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        preference:
          matchExpressions:
          - key: topology.kubernetes.io/zone
            operator: In
            values: ["zone-a"]
```


### Pod Security Standards e SecurityContext

#### Linux Capabilities

I container Docker ereditano un sottoinsieme di capabilities Linux:

```bash
# Vedi le capabilities di un container
kubectl exec myapp -- cat /proc/1/status | grep Cap
# CapPrm: 00000000a80425fb (bitmap delle capabilities permesse)

# Decodifica (su Linux)
capsh --decode=00000000a80425fb
```

Docker include di default: `CHOWN`, `DAC_OVERRIDE`, `FSETID`, `FOWNER`, `MKNOD`, `NET_RAW`,
`SETGID`, `SETUID`, `SETFCAP`, `SETPCAP`, `NET_BIND_SERVICE`, `SYS_CHROOT`, `KILL`, `AUDIT_WRITE`.

**Best practice:** drop ALL, aggiungi solo quello che serve:

```yaml
spec:
  containers:
  - name: app
    securityContext:
      # Non permettere escalation a root
      allowPrivilegeEscalation: false
      # Richiede che l'immagine abbia USER non-root
      runAsNonRoot: true
      runAsUser: 65534       # UID nobody
      runAsGroup: 65534
      # Filesystem root in sola lettura
      readOnlyRootFilesystem: true
      # Capabilities
      capabilities:
        drop: ["ALL"]        # Rimuovi tutto
        add: ["NET_BIND_SERVICE"]  # Solo se il processo deve bindare porte < 1024
      # Profilo seccomp: filtra le syscall permesse
      seccompProfile:
        type: RuntimeDefault   # Profilo predefinito del container runtime
```

```yaml
# SecurityContext a livello Pod (applicato a tutti i container)
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000            # Proprietario del volume montato
    fsGroupChangePolicy: OnRootMismatch  # Cambia owner solo se necessario
    seccompProfile:
      type: RuntimeDefault
    sysctls:                 # Parametri kernel (richiedono privilegio)
    - name: net.core.somaxconn
      value: "1024"
```

#### Volume Writable con readOnlyRootFilesystem

```yaml
# Con readOnlyRootFilesystem: true, devi montare emptyDir per file temporanei
spec:
  containers:
  - name: app
    securityContext:
      readOnlyRootFilesystem: true
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: cache
      mountPath: /app/cache
    - name: logs
      mountPath: /var/log/app
  volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir: {}
  - name: logs
    emptyDir: {}
```

#### Pod Security Standards (PSS)

PSS sostituisce PodSecurityPolicy (rimossa in K8s 1.25) con tre livelli predefiniti:

| Livello | Cosa blocca |
|---------|------------|
| **Privileged** | Nessuna restrizione (per componenti di sistema) |
| **Baseline** | Vieta: privileged container, hostNetwork, hostPID, hostPath, porte < 1024... |
| **Restricted** | Aggiunge: runAsNonRoot, readOnlyRootFilesystem, drop ALL capabilities, seccomp |

```bash
# Abilita PSS su un namespace (audit = log solo, enforce = blocca)
kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted

# Testa se un Pod passerebbe la validazione
kubectl apply --dry-run=server -f pod.yaml -n production
```


### CRD e Operators: Estendere l'API Kubernetes

Le **Custom Resource Definitions (CRD)** permettono di aggiungere nuovi tipi di risorse all'API Kubernetes — senza modificare il codice del cluster.

Hai già incontrato diverse CRD in questo corso:
- `ServiceMonitor` (Prometheus Operator) — per configurare il monitoring
- `Application` (ArgoCD) — per il GitOps
- `PrometheusRule` — per gli alert custom

```bash
# Lista tutte le CRD installate nel cluster
kubectl get crd

# Filtra CRD di un operator specifico
kubectl get crd | grep monitoring.coreos.com
# → servicemonitors.monitoring.coreos.com
# → prometheusrules.monitoring.coreos.com
# → podmonitors.monitoring.coreos.com

# Ispeziona una CRD
kubectl describe crd servicemonitors.monitoring.coreos.com

# Usa le risorse custom come qualsiasi risorsa nativa
kubectl get servicemonitors -A
kubectl get prometheusrules -n monitoring
```

Un **Operator** è un controller che gestisce il ciclo di vita di un'applicazione complessa usando CRD. L'operator osserva le risorse custom e reagisce (reconciliation loop):

| Operator | CRD principali | Cosa automatizza |
|----------|---------------|------------------|
| **Prometheus Operator** | ServiceMonitor, PrometheusRule | Scraping, alerting, retention |
| **cert-manager** | Certificate, ClusterIssuer | Emissione e rinnovo certificati TLS |
| **Strimzi** | Kafka, KafkaTopic | Cluster Kafka, topic, utenti |
| **CloudNativePG** | Cluster (PostgreSQL) | HA, backup, failover PostgreSQL |

> **Risorse:** esplora gli operator disponibili su [OperatorHub.io](https://operatorhub.io/) — catalogo curato dalla community CNCF.


### Admission Webhooks: Validazione e Mutazione

Gli **Admission Webhooks** sono il meccanismo con cui Kubernetes intercetta e modifica le richieste API *dopo* l'autenticazione e l'autorizzazione RBAC, ma *prima* della persistenza su etcd.

```
Richiesta API → Autenticazione → Autorizzazione (RBAC) → Admission Webhooks → etcd
                                                          │
                                                          ├─ Mutating → modifica il manifest
                                                          └─ Validating → accetta o rifiuta
```

| Tipo | Cosa fa | Esempio |
|------|---------|---------|
| **Mutating** | Modifica il manifest in volo | Iniettare sidecar, aggiungere label di default |
| **Validating** | Accetta o rifiuta il manifest | Bloccare immagini non firmate, imporre naming convention |

**Pod Security Standards (PSS)** che hai appena studiato è implementato come admission controller built-in. I policy engine esterni usano webhook:

| Policy Engine | Tipo | Linguaggio Policy |
|--------------|------|-------------------|
| **OPA Gatekeeper** | Validating webhook | Rego (linguaggio dichiarativo) |
| **Kyverno** | Validating + Mutating | YAML nativo (no nuovo linguaggio) |

```bash
# Vedi i webhook configurati nel cluster
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# Esempio: Kyverno installa webhook per le sue policy
kubectl get validatingwebhookconfigurations | grep kyverno
```

> **Quando usare i webhook:** PSS copre i casi base (non-root, no privileged). Per policy aziendali personalizzate (es. "tutte le immagini devono provenire dal registry interno", "ogni Deployment deve avere un PDB"), usa Kyverno o Gatekeeper.


### NetworkPolicy e Sicurezza di Rete

Il controllo dell'accesso tramite RBAC e SecurityContext protegge l'accesso all'API Kubernetes e le syscall dei container, ma non protegge la comunicazione di rete tra i Pod. Per prevenire il **movimento laterale** (un Pod compromesso che attacca altri servizi), bisogna usare le **NetworkPolicy**.

Di default Kubernetes è **default-allow**: ogni Pod può comunicare con qualsiasi altro Pod nel cluster, indipendentemente dal namespace. In un'architettura multi-tenant o con dati sensibili, questo è un rischio significativo.

> **Cross-reference:** Le NetworkPolicy sono trattate in dettaglio nell'**Incontro 5 (Networking)**. Per la security posture completa di un namespace di produzione, combina:
> - RBAC (chi può interagire con l'API)
> - SecurityContext (cosa può fare il container a livello kernel)
> - NetworkPolicy (quale traffico di rete è permesso)
>
> Una policy di base per un namespace di produzione:
> ```yaml
> # default-deny tutto il traffico in ingresso e uscita
> apiVersion: networking.k8s.io/v1
> kind: NetworkPolicy
> metadata:
>   name: default-deny-all
>   namespace: production
> spec:
>   podSelector: {}
>   policyTypes:
>   - Ingress
>   - Egress
>   # Nessuna regola → tutto bloccato (aggiungi allowlist selettive per ogni servizio)
> ```


## Hands-on Guidato (90 min — su iximiuz Labs)

### Esercizio 1 — RBAC per Team Separati

```bash
# Setup: tre namespace, tre team
kubectl create namespace team-a
kubectl create namespace team-b
kubectl create namespace monitoring

# ServiceAccount per ogni team
kubectl create serviceaccount team-a-sa -n team-a
kubectl create serviceaccount team-b-sa -n team-b
kubectl create serviceaccount monitoring-sa -n monitoring

# Team A: accesso completo nel proprio namespace
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-a
  name: full-access
rules:
- apiGroups: ["", "apps", "batch"]
  resources: ["*"]
  verbs: ["*"]
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: team-a
  name: team-a-full-access
subjects:
- kind: ServiceAccount
  name: team-a-sa
  namespace: team-a
roleRef:
  kind: Role
  name: full-access
  apiGroup: rbac.authorization.k8s.io
EOF

# Team B: sola lettura
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-b
  name: read-only
rules:
- apiGroups: ["", "apps"]
  resources: ["pods", "deployments", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: team-b
  name: team-b-read-only
subjects:
- kind: ServiceAccount
  name: team-b-sa
  namespace: team-b
roleRef:
  kind: Role
  name: read-only
  apiGroup: rbac.authorization.k8s.io
EOF

# Monitoring: ClusterRole per leggere da tutti i namespace
kubectl create clusterrole monitoring-reader \
  --verb=get,list,watch \
  --resource=pods,nodes,endpoints,services
kubectl create clusterrolebinding monitoring-reader \
  --clusterrole=monitoring-reader \
  --serviceaccount=monitoring:monitoring-sa

# Verifica
kubectl auth can-i create pods \
  --as=system:serviceaccount:team-a:team-a-sa -n team-a
# → yes

kubectl auth can-i create pods \
  --as=system:serviceaccount:team-b:team-b-sa -n team-b
# → no

kubectl auth can-i list pods \
  --as=system:serviceaccount:monitoring:monitoring-sa -n team-a
# → yes
```

### Esercizio 2 — TopologySpreadConstraints: 6 Repliche in 3 Zone

```bash
# Label dei nodi con zona
kubectl label node node1 topology.kubernetes.io/zone=zone-a
kubectl label node node2 topology.kubernetes.io/zone=zone-b
kubectl label node node3 topology.kubernetes.io/zone=zone-c

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: multizone-app
spec:
  replicas: 6
  selector:
    matchLabels:
      app: multizone-app
  template:
    metadata:
      labels:
        app: multizone-app
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: multizone-app
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            memory: "16Mi"
            cpu: "10m"
EOF

# Verifica la distribuzione (2 Pod per zona)
kubectl get pods -o wide
kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName \
  | awk '{print $2}' | sort | uniq -c
```

### Esercizio 3 — Hardening di un Pod Insicuro

```bash
# Pod insicuro (root, filesystem scrivibile, capabilities)
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: insecure-pod
spec:
  containers:
  - name: app
    image: nginx:alpine
EOF

kubectl exec insecure-pod -- id
# uid=0(root) gid=0(root) → pericoloso!

kubectl exec insecure-pod -- touch /root/evil-file
# → Funziona! Root può scrivere ovunque

# Pod hardened
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: hardened-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: nginx:unprivileged   # Versione di nginx che supporta non-root
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: nginx-cache
      mountPath: /var/cache/nginx
    - name: nginx-run
      mountPath: /var/run
    resources:
      requests:
        memory: "32Mi"
        cpu: "50m"
  volumes:
  - name: tmp
    emptyDir: {}
  - name: nginx-cache
    emptyDir: {}
  - name: nginx-run
    emptyDir: {}
EOF

kubectl exec hardened-pod -- id
# uid=1000 gid=3000 → non root

kubectl exec hardened-pod -- touch /tmp/test
# → FAIL! readOnlyRootFilesystem: solo /tmp (emptyDir) è scrivibile

kubectl exec hardened-pod -- touch /root/evil-file
# → Permission denied!
```


## Capstone Challenge — su Proxmox (ultime 2h)

> **"L'Attacco RBAC"**
>
> Un token di ServiceAccount è stato compromesso.
> Il ServiceAccount `compromised-sa` ha permessi eccessivi: accesso a tutti i Secret del cluster.
>
> Il tuo compito:
>
> **1. Analisi:** identifica i permessi attuali del SA compromesso
> ```bash
> kubectl auth can-i --list \
>   --as=system:serviceaccount:production:compromised-sa -n production
> ```
>
> **2. Minimo privilegio:** analizza cosa l'applicazione usa realmente
> ```bash
> # Guarda i log dell'app per capire quali API chiama
> kubectl logs deploy/myapp -n production | grep -E "GET|POST|PATCH" | sort | uniq -c
> ```
>
> **3. Riduzione permessi:** crea un nuovo Role con solo le azioni necessarie
> ```bash
> # Crea nuovo ServiceAccount con permessi minimi
> kubectl create serviceaccount minimal-sa -n production
> # Crea Role con solo get/list/watch su pods (niente secrets!)
> ```
>
> **4. Rotazione token:** aggiorna il Deployment per usare il nuovo SA
> ```bash
> kubectl patch deployment myapp -n production \
>   -p '{"spec":{"template":{"spec":{"serviceAccountName":"minimal-sa"}}}}'
> ```
>
> **5. Verifica:** l'app funziona ancora e non può più accedere ai Secret
> ```bash
> kubectl auth can-i get secrets \
>   --as=system:serviceaccount:production:minimal-sa -n production
> # → no  ✓
> ```
>
> *Svolgere su cluster Proxmox reale. Portare le credenziali SSH.*


## Self-Study Assignment

Completa il seguente tutorial su iximiuz Labs:

::card
:content: tutorials.docker-security-introduction-a859718d
::

**Challenge consigliate su iximiuz Labs** (cerca nella sezione Challenges):
- Taints & Tolerations
- Pod Affinity/Anti-Affinity
- "Kube Mysteries" series

**Letture consigliate:**
- [RBAC Authorization — kubernetes.io](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Pod Security Standards — kubernetes.io](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [SecurityContext — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Scheduling Framework — kubernetes.io](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/)


## Risorse Aggiuntive

### Documentazione Ufficiale Kubernetes
- [RBAC Authorization — kubernetes.io](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) — guida completa: Role, ClusterRole, RoleBinding, soggetti, aggregazione
- [Pod Security Standards — kubernetes.io](https://kubernetes.io/docs/concepts/security/pod-security-standards/) — Privileged, Baseline, Restricted: cosa consente ogni livello con tabella comparativa
- [Security Context — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/) — tutti i campi securityContext per Pod e container con esempi pratici
- [Node Affinity — kubernetes.io](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/) — nodeSelector, affinity, anti-affinity, topology spread constraints
- [Taints and Tolerations — kubernetes.io](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) — effetti NoSchedule, NoExecute, PreferNoSchedule con esempi
- [Resource Management — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests, limits, LimitRange, ResourceQuota per namespace

### Guide e Benchmark di Sicurezza
- [NSA/CISA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF) — guida governativa alla sicurezza K8s: threat model, container hardening, network policies, audit logging
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes) — standard di sicurezza per la configurazione del cluster (free download dopo registrazione)
- [CNCF Cloud Native Security Whitepaper](https://github.com/cncf/tag-security/blob/main/security-whitepaper/CNCF_cloud-native-security-whitepaper-Nov2020.pdf) — framework di sicurezza per ambienti cloud-native: supply chain, runtime, accesso
- [AWS EKS Security Best Practices](https://aws.github.io/aws-eks-best-practices/security/docs/) — guida completa di sicurezza EKS, ampiamente applicabile a qualsiasi cluster K8s

### Policy Engine e Compliance
- [OPA Gatekeeper — Open Policy Agent](https://open-policy-agent.github.io/gatekeeper/) — policy engine: scrivi policy in Rego, enforcement via admission webhook, violation reports
- [Kyverno](https://kyverno.io/) — policy engine nativo K8s: YAML-based, validate/mutate/generate, Kyverno CLI per CI
- [kube-bench — Aqua Security](https://github.com/aquasecurity/kube-bench) — verifica il cluster contro CIS Benchmark: identifica misconfigurazioni in minuti
- [Kubescape — ARMO](https://kubescape.io/) — scansione del cluster contro NSA, MITRE ATT&CK framework for Kubernetes, CIS

### Runtime Security
- [Falco — CNCF](https://falco.org/) — runtime security: rileva syscall anomale e comportamenti sospetti nei container in produzione
- [Trivy — Aqua Security](https://trivy.dev/) — scanner all-in-one: vulnerabilità immagini, misconfigurazioni K8s YAML, secrets, SBOM
- [Starboard — Aqua Security](https://github.com/aquasecurity/starboard) — integra risultati di sicurezza (Trivy, Polaris, Conftest) come CRD native in Kubernetes

### Blog e Articoli Tecnici
- [Ahmet Alp Balkan — Kubernetes RBAC tips and tricks](https://ahmet.im/blog/kubernetes-rbac-tips/) — consigli pratici per un RBAC sicuro, minimale e manutenibile
- [Ivan Velichko — Kubernetes Pod Security Context (iximiuz.com)](https://iximiuz.com/en/posts/kubernetes-pod-security-context/) — securityContext esplorato dal punto di vista del kernel Linux: capabilities, seccomp, namespaces
- [NCC Group — Understanding Kubernetes RBAC](https://www.nccgroup.com/us/research-blog/understanding-kubernetes-rbac/) — analisi delle vulnerabilità RBAC più comuni: privilege escalation, token theft, bind escalation
- [Learnk8s — Scheduling in Kubernetes](https://learnk8s.io/kubernetes-scheduler) — come funziona lo scheduler: filter plugins, score plugins, binding

### Strumenti di Audit e Visualizzazione RBAC
- [rbac-tool](https://github.com/alcideio/rbac-tool) — analizza e visualizza le policy RBAC del cluster: chi può fare cosa, policy graph
- [kubectl-who-can](https://github.com/aquasecurity/kubectl-who-can) — mostra chi può eseguire una specifica azione su una risorsa K8s
- [rakkess](https://github.com/corneliusweig/rakkess) — matrice di accesso: mostra tutti i verbi che un utente può eseguire su ogni risorsa
