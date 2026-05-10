
# Esplorare il Cluster

Primi comandi per orientarsi in un cluster Kubernetes: nodi, risorse API,
labels, selectors, namespaces e logs.


## kubectl: Comandi Fondamentali

```bash
# Alias consigliato
alias k=kubectl

# Stato del cluster
k cluster-info
k get nodes
k get nodes -o wide

# Componenti del sistema
k get pods -n kube-system
k get componentstatuses     # deprecated ma ancora informativo
k get events --sort-by=.lastTimestamp

# Scoprire le risorse API disponibili
k api-resources              # tutte le risorse con abbreviazioni
k api-versions               # tutte le versioni API
k explain pods               # documentazione inline di un tipo
k explain pods.spec.containers.resources
```


## Labels e Selectors

Le label sono coppie chiave-valore attaccate a qualsiasi oggetto Kubernetes.
I selector usano le label per filtrare e selezionare oggetti — sono la base
di come Service, Deployment e ReplicaSet trovano i loro Pod.

### Aggiungere e Visualizzare Labels

```bash
# Aggiungere labels a un Pod esistente
kubectl label pod myapp app=nginx environment=dev

# Visualizzare le labels
kubectl get pods --show-labels

# Aggiungere label a un nodo (utile per nodeSelector e DaemonSet)
kubectl label node worker-1 nodeType=edge
```

### Label nei Manifest

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi-container-example
  labels:
    app: nginx
    environment: prod
    tier: frontend
spec:
  containers:
  - name: nginx
    image: nginx:stable-alpine
    ports:
    - containerPort: 80
```

### Filtrare con Selectors

```bash
# Equality-based selector
kubectl get pods --selector environment=prod
kubectl get pods -l app=nginx

# Set-based selector
kubectl get pods -l 'app in (nginx, redis)'
kubectl get pods -l 'app in (nginx), environment notin (prod)'

# Combinare più condizioni (AND logico)
kubectl get pods -l app=nginx,tier=frontend
```

Le label sono usate ovunque in Kubernetes:

- **Service** → `spec.selector` per trovare i Pod backend
- **Deployment** → `spec.selector.matchLabels` per gestire i ReplicaSet
- **NetworkPolicy** → `spec.podSelector` per applicare le policy
- **PDB** → `spec.selector.matchLabels` per proteggere i Pod


## Annotations

Le **annotations** sono simili alle label (coppie chiave-valore), ma con scopi diversi:

| Caratteristica | Labels | Annotations |
|---------------|--------|-------------|
| **Scopo** | Selezione e filtering | Metadati descrittivi |
| **Usati dai selector** | Sì | No |
| **Dimensione** | Limitata (~63 char per valore) | Fino a 256KB |
| **Casi d'uso** | `app=nginx`, `tier=frontend` | Note, URL, config controller |

Annotations comuni nell'ecosistema:

```bash
# Annotazioni di Prometheus (scraping automatico)
kubectl annotate pod myapp prometheus.io/scrape="true" prometheus.io/port="8080"

# Annotazione di change-cause (appare in rollout history)
kubectl annotate deployment myapp kubernetes.io/change-cause="upgrade to v1.5"

# Visualizzare le annotations
kubectl get pod myapp -o jsonpath='{.metadata.annotations}'

# Rimuovere un'annotation
kubectl annotate pod myapp prometheus.io/scrape-
```

> **Regola pratica:** se hai bisogno di filtrare o selezionare oggetti → usa **label**. Se devi allegare informazioni descrittive o configurare tool esterni → usa **annotation**.


## Namespaces

I namespace sono partizioni logiche del cluster. Separano risorse per team,
ambiente o applicazione.

```bash
# Namespace di default nel cluster
kubectl get namespaces
# → default, kube-system, kube-public, kube-node-lease

# Creare un namespace
kubectl create namespace dev
kubectl create namespace staging

# Vedere risorse in un namespace specifico
kubectl get pods -n kube-system
kubectl get all -n dev

# Vedere risorse in TUTTI i namespace
kubectl get pods --all-namespaces
kubectl get pods -A    # abbreviazione
```

### Cambiare Namespace di Default

```bash
# Tramite contesto (persistente)
kubectl config set-context --current --namespace=dev

# Verificare
kubectl config view --minify -o jsonpath='{..namespace}'
```

### Namespace e DNS

I namespace influenzano il DNS interno:

```
# Stesso namespace → nome corto
curl http://myapp

# Cross-namespace → nome.namespace
curl http://myapp.production

# FQDN completo
curl http://myapp.production.svc.cluster.local
```


## Logs e Debugging Base

```bash
# Logs del container principale
kubectl logs nginx-pod
kubectl logs nginx-pod -f           # follow (come tail -f)
kubectl logs nginx-pod --previous   # logs del container precedente (crash)

# Logs di un container specifico (multi-container pod)
kubectl logs nginx-pod -c sidecar

# Logs degli ultimi 30 minuti
kubectl logs nginx-pod --since=30m

# Entrare in un container (exec)
kubectl exec -it nginx-pod -- /bin/bash
kubectl exec -it nginx-pod -c sidecar -- sh

# Comandi one-shot senza shell interattiva
kubectl exec nginx-pod -- cat /etc/nginx/nginx.conf
kubectl exec nginx-pod -- env | grep DATABASE
```

### Formati di Output

```bash
# Output in diversi formati
kubectl get deployment nginx -o yaml    # YAML completo
kubectl get deployment nginx -o json    # JSON completo
kubectl get deployment nginx -o wide    # tabella con più colonne

# jsonpath per estrarre campi specifici
kubectl get pod myapp -o jsonpath='{.status.podIP}'
kubectl get nodes -o jsonpath='{.items[*].metadata.name}'

# custom-columns per tabelle personalizzate
kubectl get pods -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.phase,\
IP:.status.podIP,\
NODE:.spec.nodeName


## `kubectl top` e Watch Mode

### Monitorare le Risorse con `kubectl top`

`kubectl top` mostra il consumo **attuale** di CPU e memoria (richiede `metrics-server` installato nel cluster):

```bash
# Consumo risorse dei nodi
kubectl top nodes

# Consumo risorse dei Pod
kubectl top pods
kubectl top pods -n kube-system

# Ordinati per consumo di memoria
kubectl top pods --sort-by=memory

# Consumo dei container di un singolo Pod
kubectl top pod myapp --containers
```

> **Nota:** Se `kubectl top` restituisce errore, installa metrics-server:
> ```bash
> kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
> ```

### Watch Mode: `-w`

Il flag `-w` (watch) tiene aperta la connessione e mostra gli aggiornamenti in tempo reale:

```bash
# Osserva lo stato dei Pod in tempo reale
kubectl get pods -w

# Osserva i nodi
kubectl get nodes -w

# Osserva gli eventi
kubectl get events -w --sort-by=.lastTimestamp
```


## `kubectl diff` — Anteprima delle Modifiche

Prima di applicare una modifica in produzione, usa `kubectl diff` per vedere esattamente cosa cambierà:

```bash
# Confronta il manifest locale con lo stato attuale nel cluster
kubectl diff -f deployment.yaml

# Esempio di output:
# -  replicas: 3
# +  replicas: 5
# -  image: myapp:v1
# +  image: myapp:v2
```

> **Best practice per la produzione:** esegui sempre `kubectl diff` prima di `kubectl apply` su cluster condivisi. È l'equivalente di un `git diff` prima di un commit.


## Risorse

- [kubectl Cheat Sheet — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Labels and Selectors — kubernetes.io](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
- [Namespaces — kubernetes.io](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)
- [kubectl logs — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
