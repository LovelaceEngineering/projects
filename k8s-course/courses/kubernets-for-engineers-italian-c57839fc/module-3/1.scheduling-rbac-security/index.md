---
kind: lesson

title: Scheduling, RBAC e Sicurezza

description: |
  RBAC con Role, ClusterRole, RoleBinding e ServiceAccount (principio del minimo privilegio).
  TopologySpreadConstraints, Taints/Tolerations. Pod Security Standards e SecurityContext.

name: scheduling-rbac-security
slug: incontro-6

createdAt: 2026-02-23
updatedAt: 2026-02-23

playground:
  name: k8s-omni
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Progettare un sistema RBAC con Role, ClusterRole, RoleBinding e ServiceAccount
- Distribuire workload in più zone con TopologySpreadConstraints
- Fare hardening di un Pod usando SecurityContext (runAsNonRoot, readOnlyRootFilesystem, capabilities)
- Applicare il principio del minimo privilegio a un ServiceAccount compromesso (su Proxmox)

## Teoria (50 min)

### RBAC — Role-Based Access Control

Kubernetes RBAC si basa su 4 oggetti:

| Oggetto | Scope | Funzione |
|---------|-------|----------|
| **Role** | Namespace | Definisce permessi su risorse nel namespace |
| **ClusterRole** | Cluster | Permessi cluster-wide (nodi, PV, namespace) |
| **RoleBinding** | Namespace | Associa Role/ClusterRole a Subject nel namespace |
| **ClusterRoleBinding** | Cluster | Associa ClusterRole a Subject a livello cluster |

```yaml
# Role: lettura dei Pod in namespace "team-a"
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-a
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
# Binding del Role a un ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: team-a
  name: read-pods
subjects:
- kind: ServiceAccount
  name: monitoring-sa
  namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**Principio del minimo privilegio:** ogni ServiceAccount deve avere solo i verbi e le risorse
strettamente necessarie. `cluster-admin` è quasi sempre sbagliato.

### Scheduling Avanzato

```yaml
# TopologySpreadConstraints: distribuisce 6 repliche in 3 zone (2 per zona)
topologySpreadConstraints:
- maxSkew: 1
  topologyKey: topology.kubernetes.io/zone
  whenUnsatisfiable: DoNotSchedule
  labelSelector:
    matchLabels:
      app: myapp

# Taints e Tolerations: nodi riservati
# Sul nodo: kubectl taint node node1 dedicated=gpu:NoSchedule
tolerations:
- key: dedicated
  operator: Equal
  value: gpu
  effect: NoSchedule
```

### Pod Security Standards e SecurityContext

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 65534
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]  # Solo se necessario
  seccompProfile:
    type: RuntimeDefault
```

## Hands-on Guidato (90 min — prime 2h su iximiuz Labs)

### Esercizio 1 — RBAC per Team Separati

```bash
# Team A: accesso completo al namespace team-a
kubectl create namespace team-a
kubectl create serviceaccount team-a-sa -n team-a

# Team B: sola lettura
kubectl create namespace team-b
kubectl create serviceaccount team-b-sa -n team-b

# Monitoring: ClusterRole per leggere Pod da tutti i namespace
kubectl create clusterrole monitoring-reader \
  --verb=get,list,watch \
  --resource=pods,nodes,endpoints

# Verifica
kubectl auth can-i create pods --as=system:serviceaccount:team-a:team-a-sa -n team-a
kubectl auth can-i create pods --as=system:serviceaccount:team-b:team-b-sa -n team-b
```

### Esercizio 2 — 6 Repliche in 3 Zone

```bash
# Simula label di zona sui nodi
kubectl label node node1 topology.kubernetes.io/zone=zone-a
kubectl label node node2 topology.kubernetes.io/zone=zone-b
kubectl label node node3 topology.kubernetes.io/zone=zone-c

# Applica il Deployment con TopologySpreadConstraints
kubectl apply -f multizone-deployment.yaml

# Verifica la distribuzione
kubectl get pods -o wide | awk '{print $7}' | sort | uniq -c
```

### Esercizio 3 — Hardening di un Pod Insicuro

Dato un Pod che gira come root senza restrizioni, aggiungere:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```

```bash
# Verifica
kubectl apply -f hardened-pod.yaml
kubectl exec -it hardened-pod -- id  # UID=1000, non 0
kubectl exec -it hardened-pod -- touch /tmp/test  # FAIL se readOnlyRootFilesystem
```

## Capstone Challenge — su Proxmox (ultime 2h)

> **"L'Attacco RBAC"**
>
> Un token di ServiceAccount è stato compromesso. Il ServiceAccount ha permessi eccessivi
> (accesso a tutti i Secret del cluster). Il tuo compito:
>
> 1. Analizzare il token compromesso e identificare i permessi attuali
> 2. Ridurre i permessi al minimo necessario per il funzionamento dell'app
> 3. Ruotare il token (creare un nuovo ServiceAccount, aggiornare il Deployment)
> 4. Verificare che l'app funzioni ancora e che i permessi in eccesso siano rimossi
>
> *Svolgere su cluster Proxmox reale. Portare le credenziali SSH.*

## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges della piattaforma: taints & tolerations, pod affinity, e Kube Mysteries.

Prepara anche l'accesso SSH al cluster Proxmox (credenziali distribuite dall'istruttore).
