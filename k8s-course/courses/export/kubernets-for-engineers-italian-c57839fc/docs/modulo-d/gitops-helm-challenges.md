# Challenge — Incontro 8: GitOps e Helm

Queste challenge accompagnano l'**Incontro 8** (GitOps, Helm e Architetture Cloud Provider).
Mettono alla prova la capacità di creare chart Helm e gestire GitOps in produzione.

---

## 1. Helm Chart Author: Da Manifest a Chart Parametrizzato

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Converti un set di manifest Kubernetes raw in un **Helm chart completo**.
Parametrizza `image.tag`, `replicaCount`, `resources`, e variabili d'ambiente
usando `values.yaml` e template Go. Il chart deve passare `helm lint`
e installare correttamente su un cluster.

**Cosa imparerai:**
- La struttura di un Helm chart (Chart.yaml, values.yaml, templates/)
- Template Go: `{{ .Values.* }}`, `{{ include }}`, `_helpers.tpl`
- Come usare `helm template` per debug e `helm lint` per validazione

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u8-helm-chart-author-f9fe7e27)

---

## 2. GitOps Drift: ArgoCD Self-Heal

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Configura un'Application ArgoCD da un repo Git, poi **simula un drift manuale**
(es. `kubectl scale` o `kubectl edit`) su una risorsa gestita. Osserva come
ArgoCD rileva il drift e corregge automaticamente lo stato entro 3 minuti.

**Cosa imparerai:**
- Come ArgoCD confronta lo stato desiderato (Git) con lo stato attuale (cluster)
- La differenza tra `selfHeal: true` e `selfHeal: false` nelle sync policy
- Come leggere gli eventi di sync e i diff nell'UI di ArgoCD

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u8-gitops-drift-9dcd39df)
