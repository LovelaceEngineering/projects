
# Preparare l'Ambiente Kubernetes

Prima di esplorare l'architettura e i workload, serve un cluster funzionante.
Questa sezione copre i tre metodi principali per avviare Kubernetes localmente
e la gestione del kubeconfig per lavorare con più cluster.


## Opzioni di Deploy Locale

| Strumento | Tipo | Uso ideale |
|-----------|------|------------|
| **minikube** | VM o container (Docker, QEMU, HyperKit) | Sviluppo locale, test rapidi, addon integrati |
| **kind** | Kubernetes-in-Docker (nodi come container) | CI/CD, test multi-nodo leggeri, nessun hypervisor |
| **kubeadm** | Installazione nativa su host/VM | Ambienti production-like, bare-metal, Proxmox |


## minikube

[minikube](https://minikube.sigs.k8s.io/docs/start/) avvia un cluster Kubernetes completo
in una VM o in un container Docker.

```bash
# Installazione (Linux amd64)
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube && rm minikube-linux-amd64

# Cluster single-node (default)
minikube start

# Cluster multi-nodo con versione specifica
minikube start --kubernetes-version=v1.30.0 --nodes 3

# Addon utili
minikube addons enable metrics-server
minikube addons enable dashboard
minikube dashboard   # apre il browser
```

```bash
# Verificare il cluster
kubectl cluster-info
kubectl get nodes -o wide

# SSH nel nodo minikube
minikube ssh
```


## kind (Kubernetes in Docker)

[kind](https://kind.sigs.k8s.io/) crea cluster Kubernetes dove ogni "nodo" è un container Docker.
Perfetto per CI/CD e test veloci senza hypervisor.

```bash
# Installazione
go install sigs.k8s.io/kind@latest
# oppure:
brew install kind

# Cluster single-node
kind create cluster

# Cluster multi-nodo con config
cat <<'EOF' > kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF
kind create cluster --config kind-config.yaml
```

### kind Avanzato: Cilium e MetalLB

Per un cluster kind con CNI Cilium e supporto LoadBalancer (MetalLB):

```bash
# Usa lo script kind_cilium.sh
curl -O https://gist.githubusercontent.com/ams0/4f1063be9e8d5c34fc85a1b4857aed71/raw/kind_cilium.sh
chmod +x kind_cilium.sh

# Deploy con Cilium e MetalLB
./kind_cilium.sh -n kind -t true -c true

# Verifica
kubectl get po -n kube-system -l app.kubernetes.io/name=cilium-agent
kubectl get po -n metallb-system
```


## kubeadm

[kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/) è lo strumento
ufficiale per installare Kubernetes su macchine Linux reali (VM o bare-metal).

```bash
# Prerequisiti (Ubuntu/Debian)
apt-get update && apt-get install -y apt-transport-https curl
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
  gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
  https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" > /etc/apt/sources.list.d/kubernetes.list
apt-get update
apt-get install -y kubelet kubeadm kubectl

# Inizializzazione del control plane
kubeadm init --pod-network-cidr=10.244.0.0/16

# Setup del kubeconfig per l'utente corrente
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config

# Join dei worker node (il comando viene stampato da kubeadm init)
kubeadm join <control-plane-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```


## Kubernetes Gestito in Cloud (EKS, GKE, AKS)

Oltre alle installazioni locali, i cloud provider offrono Kubernetes **gestito** (managed): il control plane è mantenuto dal provider, tu gestisci solo i worker node e i workload.

| Provider | Servizio | Comando rapido per creare un cluster |
|----------|----------|--------------------------------------|
| **AWS** | EKS | `eksctl create cluster --name mycluster --region eu-west-1 --nodes 3` |
| **Google Cloud** | GKE | `gcloud container clusters create mycluster --zone europe-west1-b --num-nodes 3` |
| **Azure** | AKS | `az aks create -g mygroup -n mycluster --node-count 3 --generate-ssh-keys` |

### Managed vs Locale: Confronto

| Aspetto | Locale (minikube/kind/kubeadm) | Cloud Managed (EKS/GKE/AKS) |
|---------|-------------------------------|------------------------------|
| **Control plane** | Gestito da te | Gestito dal provider (HA automatica) |
| **Costo** | Gratuito | Pay-per-use (control plane + nodi) |
| **Upgrade** | Manuale con kubeadm | Guidato/automatico dal provider |
| **Networking** | CNI a scelta | CNI integrato (VPC-native) |
| **Storage** | Locale o NFS | EBS/PD/Azure Disk (CSI integrato) |
| **Caso d'uso** | Sviluppo, test, formazione | Staging, produzione |

Anche **k3s** merita una menzione: è una distribuzione Kubernetes leggera (~70MB) ideale per edge computing, IoT e ambienti con risorse limitate. Include Traefik come Ingress Controller e un database SQLite al posto di etcd.

> **Nota importante:** tutti i concetti di questo corso (Pod, Deployment, Service, RBAC, etc.) sono **identici** indipendentemente da dove gira Kubernetes. Un manifest YAML funziona allo stesso modo su minikube, EKS o un cluster bare-metal.


## Kubeconfig e Contesti

`kubectl` usa un file di configurazione (kubeconfig) per sapere **a quale cluster** connettersi,
**con quali credenziali** e **in quale namespace**. Per default è `~/.kube/config`.

### Struttura del Kubeconfig

Un context è la combinazione di:

- **cluster** — indirizzo del server + certificato CA
- **user** — credenziali (certificato client, token, o username/password)
- **namespace** (opzionale) — namespace di default per i comandi

```bash
# Visualizza la config
kubectl config view

# Context attivo
kubectl config current-context

# Lista tutti i context disponibili
kubectl config get-contexts
```

```yaml
# Esempio di output kubectl config view
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: DATA+OMITTED
    server: https://127.0.0.1:6443
  name: kind-kind
contexts:
- context:
    cluster: kind-kind
    user: kind-kind
  name: kind-kind
current-context: kind-kind
```

### Gestire Più Cluster

```bash
# Passare a un altro contesto
kubectl config use-context production-cluster

# Creare un contesto per un namespace specifico
kubectl config set-context dev-context \
  --cluster=kind-kind \
  --user=kind-kind \
  --namespace=dev

# Passare al nuovo contesto
kubectl config use-context dev-context
```

### kubectx e kubens

Per chi gestisce molti cluster, [kubectx](https://github.com/ahmetb/kubectx) semplifica
il cambio di contesto e namespace:

```bash
# Installa
brew install kubectx

# Cambia contesto rapidamente
kubectx production

# Cambia namespace
kubens monitoring
```


## Risorse

- [minikube — Getting Started](https://minikube.sigs.k8s.io/docs/start/)
- [kind — Quick Start](https://kind.sigs.k8s.io/docs/user/quick-start/)
- [kubeadm — Creating a cluster](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/)
- [Configuring Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
- [kubectx + kubens](https://github.com/ahmetb/kubectx)
