---
kind: unit

title: "Incontro 5 — Networking: Services, DNS e Ingress"

name: networking-teoria

tutorials:
  container-networking-from-scratch: {}
---

> **Playground per questo incontro:** usa il playground K3s su iximiuz Labs
> (include Traefik come Ingress Controller):
> **https://labs.iximiuz.com/playgrounds/k3s**
> — o il playground Kubernetes standard per NetworkPolicy con Cilium/Calico:
> **https://labs.iximiuz.com/playgrounds/k8s-omni**

---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare come kube-proxy implementa i Service con iptables/ipvs (ClusterIP come VIP virtuale)
- Distinguere ClusterIP, NodePort, LoadBalancer, ExternalName e HeadlessService
- Usare il DNS interno con FQDN completo e abbreviato, capire `ndots` e le sue implicazioni
- Configurare un Ingress con TLS, multi-host e path-based routing su Traefik/nginx
- Scrivere NetworkPolicy per isolare workload (default-deny, allowlist)

---

## Teoria (50 min)

### Come Funziona il Networking di un Pod

Prima di capire i Service, bisogna capire come due Pod comunicano.

```
Pod A (10.244.1.5)                Pod B (10.244.2.8)
     │                                   │
   eth0 (veth)                        eth0 (veth)
     │                                   │
  veth-A ←──────────────────────── veth-B
     │              bridge               │
     └──────────── docker0 ─────────────┘
                       │
               iptables masquerade (NAT)
                       │
             host network interface (eth0)
```

Ogni Pod ha:
- Il proprio network namespace con interfaccia `eth0`
- Un indirizzo IP unico nell'IP range del cluster (CIDR del Pod network, es. `10.244.0.0/16`)
- Connettività diretta con qualsiasi altro Pod (anche su altri nodi) **senza NAT tra Pod** — il pacchetto mantiene l'IP sorgente del Pod mittente; il NAT avviene solo all'uscita dal nodo verso reti esterne

Il CNI plugin (Flannel, Calico, Cilium...) configura questo networking al momento della creazione del Pod.

```bash
# Vedi il CIDR del Pod network
kubectl cluster-info dump | grep -i "cluster-cidr"
kubectl get nodes -o jsonpath='{.items[*].spec.podCIDR}'

# Vedi l'IP del Pod
kubectl get pod myapp -o jsonpath='{.status.podIP}'

# Dentro il Pod, vedi l'interfaccia di rete
kubectl exec myapp -- ip addr show eth0
kubectl exec myapp -- ip route
```

---

### Service: Tipi e Funzionamento

Un Pod ha un IP temporaneo (cambia ad ogni restart). Un **Service** fornisce un IP stabile
e un DNS name per raggiungere un gruppo di Pod selezionati da `spec.selector`.

#### ClusterIP — Il Tipo Base

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
  namespace: production
spec:
  type: ClusterIP          # Default (anche omettendo type:)
  selector:
    app: myapp             # Seleziona Pod con questa label
    tier: backend
  ports:
  - name: http
    port: 80               # Porta del Service (ClusterIP:80)
    targetPort: 8080       # Porta del container
    protocol: TCP
  - name: metrics
    port: 9090
    targetPort: metrics    # Può riferirsi al nome della porta nel container
```

**Cosa succede sotto il cofano:**

1. kube-apiserver crea il Service con `ClusterIP: 10.96.100.50`
2. **Endpoints controller** (parte di `kube-controller-manager`) crea/aggiorna l'oggetto `Endpoints` con gli IP dei Pod che matchano il selector — kube-proxy NON crea Endpoints, li *legge* soltanto
3. kube-proxy su ogni nodo osserva Service + Endpoints e crea regole iptables:

```bash
# Vedi il ClusterIP del Service
kubectl get service myapp
# → myapp   ClusterIP   10.96.100.50   <none>   80/TCP

# Vedi gli Endpoints (IP dei Pod che matchano il selector)
kubectl get endpoints myapp
# → myapp   10.244.1.5:8080,10.244.2.8:8080,10.244.3.2:8080

# Vedi le regole iptables (sul nodo)
iptables -t nat -L KUBE-SERVICES -n | grep "10.96.100.50"
iptables -t nat -L KUBE-SVC-<hash> -n
# → probabilistic DNAT verso i Pod
```

#### Session Affinity

Per default, i Service distribuiscono il traffico in modo casuale tra i Pod. Con `sessionAffinity: ClientIP`, tutte le richieste dallo stesso IP client vengono instradate allo stesso Pod:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 1800    # 30 minuti di affinità
  ports:
  - port: 80
    targetPort: 8080
```

> **Caveat:** la session affinity funziona a livello L4 (IP). Se il traffico passa attraverso un load balancer L7, tutti i client potrebbero avere lo stesso IP sorgente (quello del LB) — rendendo l'affinità inefficace. In quel caso, usa il session affinity del load balancer o un cookie applicativo.

#### NodePort — Esposizione Esterna Semplice

```yaml
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
  - port: 80           # ClusterIP port
    targetPort: 8080   # Pod port
    nodePort: 30080    # Porta su ogni nodo (range: 30000-32767)
```

```bash
# Raggiungibile da fuori cluster
curl http://<any-node-ip>:30080/

# kube-proxy crea la regola: ogni connessione a <node-ip>:30080
# viene inoltrata a uno dei Pod del Service
```

#### LoadBalancer — Integrazione Cloud

```yaml
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 8080
```

```bash
# Il cloud provider (AWS, GCP, Azure) crea automaticamente un Load Balancer esterno
kubectl get service myapp
# → EXTERNAL-IP: 54.123.45.67 (IP pubblico del load balancer)
```

#### ExternalName — DNS Alias

```yaml
# Crea un DNS alias verso un servizio esterno
# Utile per referenziare DB esterni con lo stesso pattern interno
apiVersion: v1
kind: Service
metadata:
  name: external-db
  namespace: production
spec:
  type: ExternalName
  externalName: db.example.com  # CNAME DNS → db.example.com
```

#### Headless Service — Niente VIP, Solo DNS

```yaml
spec:
  clusterIP: None    # Nessun ClusterIP → nessuna regola iptables
  selector:
    app: postgres
```

Con un Headless Service, il DNS restituisce direttamente gli IP dei Pod (non un VIP):
```bash
nslookup postgres.production.svc.cluster.local
# → 10.244.1.5  (postgres-0)
#   10.244.2.8  (postgres-1)
# → Usato da StatefulSet per DNS stabile per Pod individuali
```

---

### CoreDNS: Il DNS Interno di Kubernetes

Ogni Pod ha `/etc/resolv.conf` configurato automaticamente da kubelet:

```
nameserver 10.96.0.10    # IP del Service kube-dns (CoreDNS)
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

**FQDN completo** (funziona sempre, da qualsiasi namespace):
```
<service>.<namespace>.svc.cluster.local
myapp.production.svc.cluster.local
```

**Abbreviazioni** (expand tramite search domains):
```bash
# Stesso namespace
curl http://myapp           # → myapp.default.svc.cluster.local

# Cross-namespace
curl http://myapp.production  # → myapp.production.svc.cluster.local

# Con porta
curl http://myapp.production:8080
```

**`ndots: 5` e le sue implicazioni:**

```
ndots: 5 = se il nome ha MENO DI 5 punti, prova prima i search domains

Query "api.example.com" → 2 punti (< 5) → cerca prima:
  api.example.com.default.svc.cluster.local  → NXDOMAIN
  api.example.com.svc.cluster.local          → NXDOMAIN
  api.example.com.cluster.local              → NXDOMAIN
  api.example.com.                           → risposta!

→ 3-4 query DNS extra per ogni lookup esterno!
```

**Ottimizzazione per applicazioni che fanno molti lookup esterni:**

```yaml
spec:
  dnsConfig:
    options:
    - name: ndots
      value: "2"    # Riduce query ridondanti per domini con 2+ punti
```

```bash
# Debug DNS dall'interno di un Pod
kubectl run dnstest --image=busybox:1.36 --rm -it -- sh

# Nel Pod:
cat /etc/resolv.conf
nslookup myapp.production.svc.cluster.local
nslookup kubernetes.default.svc.cluster.local
nslookup google.com
# Misura il tempo di lookup
time nslookup google.com
```

---

### Ingress: Routing HTTP/HTTPS

> **Prerequisito:** le risorse Ingress non funzionano da sole. Richiedono un **Ingress Controller** installato nel cluster (Traefik, nginx-ingress, Envoy/Contour, Istio...). Kubernetes non installa nessun Ingress Controller di default — su K3s è incluso Traefik; su EKS/GKE/AKS bisogna installarlo manualmente. Senza controller, le risorse Ingress vengono create ma non hanno effetto.

Un **Ingress resource** è solo configurazione. Un **Ingress Controller** legge quella configurazione e configura il reverse proxy.

```yaml
# Ingress con TLS e multi-host
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: production
  annotations:
    # Annotazioni specifiche per il controller usato
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # Con cert-manager per TLS automatico (Let's Encrypt)
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx    # Seleziona quale IngressController gestisce questo Ingress.
                             # Se nessun controller corrisponde a questa IngressClass, l'Ingress viene ignorato.
                             # Usa `kubectl get ingressclass` per vedere le classi disponibili nel cluster.
  tls:
  - hosts:
    - myapp.example.com
    - api.example.com
    secretName: myapp-tls    # Secret con il certificato TLS
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-frontend
            port:
              number: 80
  - host: api.example.com
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend:
          service:
            name: myapp-api
            port:
              number: 8080
      - path: /v2
        pathType: Prefix
        backend:
          service:
            name: myapp-api-v2
            port:
              number: 8080
```

**Path types:**
- `Exact`: corrisponde esattamente a `/path` (non `/path/`, non `/path/sub`)
- `Prefix`: corrisponde a `/path` e qualsiasi subpath (`/path/`, `/path/sub/resource`)
- `ImplementationSpecific`: dipende dall'Ingress Controller (usa Prefix se non sicuro)

```bash
# Genera certificato self-signed per test
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=myapp.example.com/O=Test"

kubectl create secret tls myapp-tls --key tls.key --cert tls.crt

# Testa l'Ingress (con /etc/hosts o --resolve)
curl -k --resolve myapp.example.com:443:<ingress-ip> https://myapp.example.com/
curl -k --resolve api.example.com:443:<ingress-ip> https://api.example.com/v1/health
```

---

### Gateway API: Il Successore di Ingress

La **Gateway API** è il successore ufficiale di Ingress, GA da Kubernetes 1.26+. Risolve i limiti di Ingress con un modello role-based più flessibile:

```
Ingress (vecchio modello):
  Un singolo oggetto per tutto → annotazioni specifiche per controller

Gateway API (nuovo modello):
  GatewayClass → infrastruttura (gestita da platform team)
  Gateway      → listener (porte, TLS, hostname)
  HTTPRoute    → routing (gestito dal team applicativo)
```

**Vantaggi rispetto a Ingress:**
- **Separazione dei ruoli**: platform team configura Gateway, app team configura Route
- **Protocolli multipli**: HTTP, HTTPS, TCP, UDP, gRPC (Ingress supporta solo HTTP/HTTPS)
- **Header matching**: routing basato su header, query parameters, method
- **Traffic splitting**: canary deployment nativi con weight-based routing

```yaml
# HTTPRoute — equivalente di un Ingress rule
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-route
  namespace: production
spec:
  parentRefs:
  - name: main-gateway       # Riferimento al Gateway
    namespace: infra
  hostnames:
  - "myapp.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api/v2
    backendRefs:
    - name: myapp-v2
      port: 8080
      weight: 90              # 90% del traffico
    - name: myapp-v3
      port: 8080
      weight: 10              # 10% canary
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: myapp-frontend
      port: 80
```

```bash
# Verifica se Gateway API è disponibile nel cluster
kubectl get gatewayclass
kubectl get gateways -A
kubectl get httproutes -A
```

> **Quando scegliere Gateway API vs Ingress:** per nuovi progetti, preferisci Gateway API se il tuo Ingress Controller lo supporta (Cilium, Envoy/Contour, Istio, nginx-gateway-fabric). Per cluster esistenti con Ingress funzionante, la migrazione non è urgente — Ingress non è deprecato.

---

### NetworkPolicy: Sicurezza di Rete

Di default, Kubernetes è **default-allow**: ogni Pod può comunicare con qualsiasi altro Pod.
Una `NetworkPolicy` impone regole di isolamento basate su selector.

**IMPORTANTE:** NetworkPolicy richiede un CNI plugin che la supporti (Calico, Cilium, Weave).
Flannel da solo NON supporta NetworkPolicy.

#### Default Deny (baseline di sicurezza)

```yaml
# Blocca tutto il traffico in ingresso nel namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}    # Seleziona TUTTI i Pod nel namespace
  policyTypes:
  - Ingress
  # Nessuna regola ingress → tutto bloccato
```

> **⚠️ Attenzione — Egress e DNS:**
> Se includi `Egress` in `policyTypes` senza regole egress esplicite, blocchi **tutto** il traffico in uscita — inclusa la risoluzione DNS sulla porta 53. I Pod smettono di risolvere i nomi DNS del cluster.
> Quando usi una NetworkPolicy di tipo Egress, aggiungi **sempre** una regola esplicita per DNS:
> ```yaml
> egress:
> - to:
>   - namespaceSelector:
>       matchLabels:
>         kubernetes.io/metadata.name: kube-system
>   ports:
>   - protocol: UDP
>     port: 53
>   - protocol: TCP
>     port: 53
> ```

#### Allowlist per il Database

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-access
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: postgres          # Applica a: Pod postgres
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # Permetti solo dall'API server
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 5432
  # Permetti dal monitoring
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
      podSelector:
        matchLabels:
          app: prometheus
    ports:
    - port: 9187    # postgres_exporter
  egress:
  # DNS resolution (kube-dns)
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

#### NetworkPolicy per il Monitoring (Prometheus)

```yaml
# Permette a Prometheus (in namespace monitoring) di scrapare tutti i namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: production
spec:
  podSelector: {}    # Tutti i Pod
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - port: 9090    # metrics port
    - port: 8080    # app metrics
```

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Service Discovery Cross-Namespace

```bash
# Setup: due namespace con servizi
kubectl create namespace frontend
kubectl create namespace backend

# Service nel backend
kubectl run backend-app -n backend --image=nginx:alpine --port=80 \
  --labels=app=backend-app
kubectl expose pod backend-app -n backend --name=backend-svc \
  --port=80 --target-port=80

# Testa la discovery dal frontend
kubectl run -n frontend dns-test --image=busybox:1.36 --rm -it -- sh

# Nel Pod (namespace: frontend):
# 1. Lookup abbreviato (cross-namespace)
nslookup backend-svc.backend
# → backend-svc.backend.svc.cluster.local → 10.96.x.x

# 2. FQDN completo
nslookup backend-svc.backend.svc.cluster.local

# 3. Test connettività
wget -qO- http://backend-svc.backend/

# 4. Vedi il resolv.conf
cat /etc/resolv.conf
```

### Esercizio 2 — Ingress TLS con Traefik (su K3s)

```bash
# K3s include Traefik come Ingress Controller preinstallato
kubectl get pods -n kube-system | grep traefik

# Vedi la IngressClass disponibile
kubectl get ingressclass

# Crea app di test
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
spec:
  replicas: 2
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
      - name: whoami
        image: traefik/whoami:v1.10
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: whoami
spec:
  selector:
    app: whoami
  ports:
  - port: 80
EOF

# Crea certificato self-signed
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/tls.key -out /tmp/tls.crt \
  -subj "/CN=whoami.local"

kubectl create secret tls whoami-tls \
  --key /tmp/tls.key --cert /tmp/tls.crt

# Crea Ingress con TLS
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: whoami-ingress
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
  - hosts:
    - whoami.local
    secretName: whoami-tls
  rules:
  - host: whoami.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: whoami
            port:
              number: 80
EOF

# Ottieni IP del Traefik
TRAEFIK_IP=$(kubectl get service -n kube-system traefik \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Testa (con --resolve per simulare DNS)
curl -k --resolve whoami.local:443:$TRAEFIK_IP \
  https://whoami.local/
```

### Esercizio 3 — NetworkPolicy: Isolamento Database

```bash
kubectl create namespace isolationtest

# Deploy di 3 componenti
kubectl run frontend -n isolationtest --image=nginx:alpine --labels=tier=frontend
kubectl run api -n isolationtest --image=nginx:alpine --labels=tier=api
kubectl run db -n isolationtest --image=nginx:alpine --labels=tier=db
kubectl expose pod db -n isolationtest --name=db-svc --port=80

# Verifica connettività PRIMA delle policy (tutto funziona)
kubectl exec -n isolationtest frontend -- wget -qO- --timeout=3 http://db-svc
kubectl exec -n isolationtest api -- wget -qO- --timeout=3 http://db-svc

# Applica NetworkPolicy: solo api può raggiungere db
kubectl apply -n isolationtest -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-isolation
spec:
  podSelector:
    matchLabels:
      tier: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: api
    ports:
    - port: 80
EOF

# Verifica connettività DOPO la policy
kubectl exec -n isolationtest api -- wget -qO- --timeout=3 http://db-svc
# → SUCCESSO (api → db permesso)

kubectl exec -n isolationtest frontend -- wget -qO- --timeout=3 http://db-svc
# → TIMEOUT (frontend → db bloccato)
```

### Esercizio 4 — Debuggare iptables (kube-proxy)

```bash
# Sul nodo (richiede accesso SSH o privileged Pod):
# Vedi le chain create da kube-proxy
iptables -t nat -L KUBE-SERVICES -n --line-numbers

# Trova le regole per un Service specifico
SVC_IP=$(kubectl get service myapp -o jsonpath='{.spec.clusterIP}')
iptables -t nat -S | grep $SVC_IP

# Vedi il load balancing probabilistico
iptables -t nat -L KUBE-SVC-<hash> -n -v
# → Ogni Pod ha una probabilità 1/N, implementata con --probability

# Con ipvs (se abilitato):
ipvsadm -Ln
```

---

## Capstone Challenge (30 min)

> **"Il Microservizio Disperso"**
>
> Un'architettura 3-tier (frontend → api → database) non funziona.
> Ci sono **3 errori** da trovare e correggere usando solo strumenti diagnostici:
>
> 1. **Selector mismatch**: il Service `api-svc` non trova i suoi Pod
>    (controlla `kubectl get endpoints api-svc`)
>
> 2. **DNS errato**: il frontend usa `http://api:8080` ma il Service si chiama `api-service`
>    (controlla i log del frontend con `kubectl logs`)
>
> 3. **NetworkPolicy troppo restrittiva**: la policy blocca il traffico del monitoring
>    (il Prometheus scraper in namespace `monitoring` non riesce a raggiungere le metriche)
>
> **Strumenti diagnostici:**
> ```bash
> kubectl get endpoints
> kubectl describe service
> kubectl exec <pod> -- nslookup <service>
> kubectl exec <pod> -- wget -qO- --timeout=3 http://api-service:8080
> kubectl describe networkpolicy
> ```
>
> **Criteri di successo:**
> - Il frontend mostra dati dal database
> - Le metriche Prometheus vengono scrapeate (`kubectl get servicemonitor`)

---

## Self-Study Assignment

Completa il seguente tutorial su iximiuz Labs (40-50 minuti):

::card
---
:content: tutorials.container-networking-from-scratch
---
::

Completa anche lo **Skill Path "Master Container Networking"** su iximiuz Labs:
- https://labs.iximiuz.com/skill-paths/master-container-networking

**Letture consigliate:**
- [Services — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/service/)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
- [Ingress — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [NetworkPolicy — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [kube-proxy modes: iptables vs ipvs](https://kubernetes.io/docs/concepts/services-networking/service/#proxy-mode-ipvs)

---

## Risorse Aggiuntive

### Guide Complete sul Networking Kubernetes
- [The Kubernetes Networking Guide — tkng.io](https://www.tkng.io/) — la guida più completa e visuale sul networking K8s: Pod networking, Service, DNS, NetworkPolicy, CNI plugin a confronto
- [Kubernetes Networking — Tigera/Calico](https://www.tigera.io/learn/guides/kubernetes-networking/) — guide tecniche approfondite: Pod-to-Pod, Service routing, NetworkPolicy enforcement
- [Learnk8s — How Kubernetes Networking Works](https://learnk8s.io/kubernetes-network-packets) — viaggio di un pacchetto attraverso il cluster K8s con diagrammi dettagliati
- [Ivan Velichko — Container Networking Series (iximiuz.com)](https://iximiuz.com/en/series/container-networking/) — serie completa: veth pair, bridge, namespace, iptables, CNI, dal kernel alle astrazioni K8s

### DNS e Service Discovery
- [DNS for Services and Pods — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) — documentazione ufficiale: records A, AAAA, SRV, FQDN format, ndots, dnsPolicy
- [The ndots Problem — mrkaran.dev](https://mrkaran.dev/posts/ndots-kubernetes/) — analisi approfondita del problema ndots:5 con packet captures e soluzioni pratiche
- [CoreDNS Documentation](https://coredns.io/manual/toc/) — configurazione Corefile, plugin (forward, cache, rewrite), metrics, debugging

### NetworkPolicy
- [Network Policies — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/network-policies/) — guida ufficiale con esempi per tutti i casi d'uso: default deny, namespace isolation
- [Network Policy Editor — editor.networkpolicy.io](https://editor.networkpolicy.io/) — editor visuale interattivo per creare NetworkPolicy YAML, by Cilium team
- [Kubernetes Network Policy Recipes — ahmetb](https://github.com/ahmetb/kubernetes-network-policy-recipes) — raccolta di ricette YAML per i pattern più comuni: deny-all, allow-namespace, DB isolation
- [Network Policy Validator](https://networkpolicy.io/) — valida e testa le NetworkPolicy prima del deploy

### Ingress e Gateway API
- [Ingress — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/ingress/) — guida ufficiale: pathType, TLS, fanout, name-based virtual hosting
- [Gateway API — kubernetes.io](https://gateway-api.sigs.k8s.io/) — il successore di Ingress: HTTPRoute, GRPCRoute, TCPRoute, multi-tenancy nativa
- [cert-manager Documentation](https://cert-manager.io/docs/) — gestione automatica certificati TLS: Let's Encrypt ACME, self-signed, PKCS12, rotation

### CNI Plugin e Service Mesh
- [Cilium Documentation](https://docs.cilium.io/) — CNI basato su eBPF: networking, sicurezza Layer 7, osservabilità senza iptables
- [Cilium Hubble](https://github.com/cilium/hubble) — network observability per Kubernetes: UI, CLI, service map, packet drops
- [Calico Documentation](https://docs.tigera.io/calico/latest/about/) — CNI con NetworkPolicy avanzate, BGP routing, eBPF dataplane opzionale
- [Flannel](https://github.com/flannel-io/flannel) — CNI semplice e leggero, ottimo per ambienti di sviluppo e cluster piccoli
- [Istio Documentation](https://istio.io/latest/docs/) — service mesh: mTLS automatico tra servizi, traffic management, observability con Envoy sidecar

### Approfondimenti Tecnici su kube-proxy e iptables
- [Cracking the Kubernetes Node Proxy — arthurchiao.art](https://arthurchiao.art/blog/cracking-kubernetes-node-proxy/) — analisi dettagliata delle catene iptables generate da kube-proxy per ogni tipo di Service
- [IPVS vs iptables for Kubernetes — Tigera](https://www.tigera.io/blog/comparing-kube-proxy-modes-iptables-or-ipvs/) — confronto delle performance tra le due modalità kube-proxy su larga scala
- [O'Reilly — Networking and Kubernetes](https://www.oreilly.com/library/view/networking-and-kubernetes/9781492081944/) — libro completo (James Strong & Vallery Lancey): CNI, service mesh, security, multi-cluster
