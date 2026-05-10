---
kind: lesson

title: Networking — Services, DNS e Ingress

description: |
  kube-proxy e il modello ClusterIP (VIP virtuale con iptables). CoreDNS e FQDN.
  Ingress con TLS e multi-host. NetworkPolicy per isolare i workload.

name: networking
slug: incontro-5

createdAt: 2026-02-23
updatedAt: 2026-02-23

playground:
  name: k8s-omni
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare come kube-proxy implementa i Service con iptables/ipvs (ClusterIP come VIP virtuale)
- Usare il DNS interno di Kubernetes con FQDN completo e abbreviato cross-namespace
- Configurare un Ingress con TLS e multi-host su un Ingress Controller reale
- Scrivere NetworkPolicy per isolare un database (allowlist invece di default-allow)

## Teoria (50 min)

### kube-proxy e il Modello ClusterIP

Un Service `ClusterIP` non è un processo che ascolta su una porta: è una **regola iptables**.
kube-proxy mantiene le regole sincronizzate con gli Endpoints del Service.

```bash
# Vedi le regole iptables create per un Service
iptables -t nat -L KUBE-SERVICES -n --line-numbers
iptables -t nat -L KUBE-SVC-<hash> -n

# Oppure con ipvs
ipvsadm -Ln
```

Quando un Pod fa richiesta a `ClusterIP:port`, il kernel intercetta la connessione e fa
DNAT verso uno dei Pod del Service (load balancing round-robin o random).

### DNS Interno — CoreDNS

Ogni Pod ha `/etc/resolv.conf` con:
```
nameserver 10.96.0.10  # ClusterIP del Service kube-dns
search default.svc.cluster.local svc.cluster.local cluster.local
ndots: 5
```

L'opzione `ndots: 5` significa: se il nome ha meno di 5 punti, prova prima con i domain suffix.
Questo causa lookup multipli per nomi come `api.production` (slow first lookup).

**FQDN completo:** `myservice.mynamespace.svc.cluster.local`
**Abbreviato (stesso namespace):** `myservice`
**Abbreviato (cross-namespace):** `myservice.mynamespace`

### Ingress e Ingress Controller

Un `Ingress` resource è solo configurazione. Serve un **Ingress Controller** che la legga
e configuri il reverse proxy (Traefik, nginx, Envoy...).

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  annotations:
    traefik.ingress.kubernetes.io/router.tls: "true"
spec:
  tls:
  - hosts: ["myapp.example.com"]
    secretName: myapp-tls
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp
            port:
              number: 80
```

### NetworkPolicy

Di default, tutti i Pod in un cluster possono comunicare tra loro (default-allow).
Una NetworkPolicy seleziona Pod con `podSelector` e definisce `ingress`/`egress` rules.

```yaml
# Isola il database: solo i Pod con label app=api possono connettersi
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-isolation
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 5432
```

## Hands-on Guidato (90 min)

### Esercizio 1 — Service Discovery Cross-Namespace

```bash
# Crea due namespace con un Service ciascuno
kubectl create namespace frontend
kubectl create namespace backend

# Da un Pod nel namespace frontend, risolvi il Service del backend
kubectl run -it --rm debug --image=busybox --namespace=frontend -- sh

# Da dentro il Pod:
nslookup myservice.backend                            # cross-namespace abbreviato
nslookup myservice.backend.svc.cluster.local         # FQDN completo
curl http://myservice.backend:8080/health
```

### Esercizio 2 — Ingress Multi-Host con TLS

```bash
# Genera certificato self-signed
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt -subj "/CN=myapp.local"

# Crea il Secret TLS
kubectl create secret tls myapp-tls --key tls.key --cert tls.crt

# Applica l'Ingress con due virtual host
kubectl apply -f ingress-multihost.yaml

# Testa
curl -k --resolve myapp.local:443:<ingress-ip> https://myapp.local/
curl -k --resolve api.local:443:<ingress-ip> https://api.local/v1/health
```

### Esercizio 3 — NetworkPolicy: Isolamento Database

```bash
# Applica la policy di isolamento
kubectl apply -f networkpolicy-postgres.yaml

# Verifica: l'api può connettersi
kubectl exec -it api-pod -- pg_isready -h postgres -p 5432  # OK

# Verifica: il frontend non può connettersi
kubectl exec -it frontend-pod -- pg_isready -h postgres -p 5432  # FAIL (timeout)
```

## Capstone Challenge (30 min)

> **"Il Microservizio Disperso"**
>
> Un'architettura 3-tier (frontend → api → database) non funziona.
> Ci sono 3 errori da trovare e correggere:
> 1. **Selector mismatch**: il Service `api` non trova i suoi Pod (label sbagliata)
> 2. **DNS errato**: il frontend usa `http://api:8080` ma il Service si chiama `api-service`
> 3. **NetworkPolicy troppo restrittiva**: la policy blocca anche il traffico legittimo
>    del monitoring (Prometheus scraper)
>
> Target: tutti e 3 i tier comunicano correttamente e le metriche arrivano a Prometheus.

## Self-Study Assignment

Completa questi materiali su iximiuz Labs prima del prossimo incontro (60–90 min totali):

Completa lo **Skill Path "Master Container Networking"** disponibile su iximiuz Labs
(6 challenge + 1 tutorial — cerca "master container networking" nella sezione Skill Paths della piattaforma).
