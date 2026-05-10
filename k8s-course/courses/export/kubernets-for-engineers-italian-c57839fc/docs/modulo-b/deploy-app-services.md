
# Deploy di un'Applicazione e Services

Come deployare la prima applicazione su Kubernetes, ispezionarne lo stato,
esporla con i Service e accedervi con port-forward.


## Primo Deploy

```bash
# Creare un Deployment imperativo
kubectl create deployment nginx --image=nginx
kubectl get deployments
kubectl describe deployment nginx

# Ispezionare il YAML generato
kubectl get deployment nginx -o yaml
```

### Da Imperativo a Dichiarativo

Il pattern consigliato: genera il YAML, salvalo, e usa `kubectl apply`:

```bash
# Esporta il deployment a file
kubectl get deployment nginx -o yaml > nginx.yaml

# Elimina e ricrea da file
kubectl delete deployment nginx
kubectl apply -f nginx.yaml

# Verifica
kubectl get pods
```

### Ispezionare le Risorse

```bash
# Diversi formati di output
kubectl get deployment nginx -o json
kubectl get deployment nginx -o wide
kubectl get deployment nginx -o jsonpath='{.spec.replicas}'

# Describe: eventi, condizioni, dettagli
kubectl describe deployment nginx
kubectl describe pod nginx-<hash>
```


## Esporre l'Applicazione con i Service

Un **Service** fornisce un endpoint stabile (IP + DNS) per raggiungere un gruppo di Pod.
Senza un Service, i Pod sono raggiungibili solo tramite il loro IP temporaneo.

### Tipi di Service

| Tipo | Accessibilità | Caso d'uso |
|------|--------------|------------|
| **ClusterIP** | Solo interno al cluster | Comunicazione tra microservizi |
| **NodePort** | Esterno via `<NodeIP>:<30000-32767>` | Test, sviluppo, accesso diretto |
| **LoadBalancer** | Esterno via cloud LB | Produzione su cloud (AWS/GCP/Azure) |
| **ExternalName** | DNS CNAME verso esterno | Alias per servizi esterni |

### ClusterIP (default)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-clusterip-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80           # porta del Service
    targetPort: 8080   # porta del container
  type: ClusterIP
```

Il Service è raggiungibile solo dall'interno del cluster:
```bash
# Da un altro Pod nel cluster
curl http://my-clusterip-service
curl http://my-clusterip-service.default.svc.cluster.local
```

### NodePort

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-nodeport-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
    nodePort: 30007    # porta su ogni nodo (30000-32767)
  type: NodePort
```

```bash
# Raggiungibile dall'esterno
curl http://<any-node-ip>:30007/
```

### LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-loadbalancer-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
```

```bash
# Il cloud provider provisiona un LB con IP pubblico
kubectl get service my-loadbalancer-service
# → EXTERNAL-IP: 54.123.45.67
```

### ExternalName

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.example.com   # CNAME DNS
```

Permette ai Pod interni di usare `external-db` come se fosse un servizio nel cluster,
ma il DNS risolve verso `db.example.com`.


## Esporre Rapidamente con kubectl

```bash
# Esporre un Deployment come ClusterIP
kubectl expose deployment nginx --port=80 --target-port=80

# Esporre come NodePort
kubectl expose deployment nginx --port=80 --target-port=80 --type=NodePort

# Verificare il Service creato
kubectl get services
kubectl describe service nginx
kubectl get endpoints nginx
```


## Endpoints: Come i Service Trovano i Pod

Quando crei un Service, Kubernetes crea automaticamente un oggetto **Endpoints** che contiene la lista degli IP dei Pod che matchano il `selector` del Service. Se gli Endpoints sono vuoti, il Service non instrada traffico.

```bash
# Vedi gli Endpoints (IP dei Pod backend)
kubectl get endpoints nginx
# → nginx   10.244.1.5:80,10.244.2.8:80

# Endpoints vuoti = problema! Il selector non matcha nessun Pod
kubectl get endpoints myapp-svc
# → myapp-svc   <none>  ← nessun Pod trovato!
```

**Primo passo diagnostico quando un Service non funziona:**

```bash
# 1. Controlla gli Endpoints
kubectl get endpoints <service-name>

# 2. Se vuoti, confronta selector del Service con label dei Pod
kubectl describe service <service-name> | grep Selector
kubectl get pods --show-labels

# 3. Causa comune: il selector del Service non corrisponde alle label dei Pod
# Service: selector: app=myapp
# Pod:     labels:   app=my-app  ← trattino in più!
```


## Scalare un Deployment

```bash
# Scala manualmente a 5 repliche
kubectl scale deployment nginx --replicas=5

# Verifica
kubectl get pods -l app=nginx
# → 5 Pod in Running

# Gli Endpoints si aggiornano automaticamente
kubectl get endpoints nginx
# → 5 IP:port elencati
```

> **Nota:** lo scaling manuale è utile per test e emergenze. In produzione si usa l'**HPA** (Horizontal Pod Autoscaler) per scalare automaticamente in base al carico.


## Pod di Debug Rapidi

Per testare la connettività di rete o il DNS dall'interno del cluster, usa un Pod temporaneo:

```bash
# Pod interattivo con busybox (rimosso automaticamente all'uscita)
kubectl run debug --rm -it --image=busybox -- sh

# Pod con strumenti di rete avanzati (curl, dig, nslookup, tcpdump)
kubectl run netdebug --rm -it --image=nicolaka/netshoot -- bash

# Esempi di debug dall'interno del Pod:
# → curl http://nginx.default.svc.cluster.local
# → nslookup kubernetes.default
# → ping 10.244.1.5
```

> **Tip:** `nicolaka/netshoot` include quasi tutti gli strumenti di rete (curl, wget, dig, nslookup, tcpdump, iperf, mtr) — ideale per il troubleshooting.


## Port-Forward: Accesso Diretto senza Service

`kubectl port-forward` crea un tunnel dalla macchina locale a un Pod o Service
nel cluster — utile per debug e sviluppo:

```bash
# Forward da localhost:8080 alla porta 80 del Pod
kubectl port-forward pod/nginx-<hash> 8080:80

# Forward da localhost:8080 alla porta 80 del Service
kubectl port-forward svc/nginx 8080:80

# Accedi nel browser o con curl
curl http://localhost:8080
```

> **Nota:** port-forward è per sviluppo/debug. In produzione si usano
> Service di tipo LoadBalancer o Ingress.


## Best Practice

1. **Usa label coerenti** — definisci uno schema (`app`, `tier`, `version`, `environment`)
   e applicalo a tutti gli oggetti
2. **Preferisci il formato dichiarativo** — `kubectl apply -f` invece di comandi imperativi
3. **Usa ClusterIP di default** — esponi con NodePort/LB solo quando necessario
4. **DNS per service discovery** — usa i nomi DNS dei Service, non gli IP
5. **Port-forward per debug** — non esporre servizi interni solo per testare


## Risorse

- [Exposing Applications — kubernetes.io](https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/)
- [Services — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/service/)
- [kubectl port-forward — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
