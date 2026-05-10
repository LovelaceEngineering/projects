---
kind: challenge

title: "Helm Chart Author: Da Manifest a Chart Parametrizzato"

description: |
  Converti un set di manifest Kubernetes in un Helm chart completo.
  Parametrizza image.tag, replicaCount, resources, e variabili d'ambiente.
  Il chart deve passare helm lint e installare correttamente.

categories:
- kubernetes

tags:
- helm
- chart
- templating
- packaging

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_raw_manifests:
    init: true
    run: |
      mkdir -p /opt/helm-lab/raw-manifests
      printf 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: webapp\n  namespace: default\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: webapp\n  template:\n    metadata:\n      labels:\n        app: webapp\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.25\n        ports:\n        - containerPort: 80\n        resources:\n          requests:\n            cpu: 100m\n            memory: 128Mi\n          limits:\n            cpu: 200m\n            memory: 256Mi\n        env:\n        - name: APP_ENV\n          value: production\n        - name: LOG_LEVEL\n          value: info\n' > /opt/helm-lab/raw-manifests/deployment.yaml
      printf 'apiVersion: v1\nkind: Service\nmetadata:\n  name: webapp-svc\n  namespace: default\nspec:\n  selector:\n    app: webapp\n  ports:\n  - port: 80\n    targetPort: 80\n  type: ClusterIP\n' > /opt/helm-lab/raw-manifests/service.yaml
      echo "Raw manifests ready in /opt/helm-lab/raw-manifests/"

  verify_chart_structure:
    run: |
      # Check chart directory exists with required files
      [ -f /opt/helm-lab/webapp-chart/Chart.yaml ] || exit 1
      [ -f /opt/helm-lab/webapp-chart/values.yaml ] || exit 1
      [ -d /opt/helm-lab/webapp-chart/templates ] || exit 1
      [ -f /opt/helm-lab/webapp-chart/templates/deployment.yaml ] || exit 1

  verify_helm_lint:
    run: |
      helm lint /opt/helm-lab/webapp-chart 2>&1 | grep -q "0 chart(s) failed" || exit 1

  verify_helm_install:
    run: |
      helm upgrade --install webapp-release /opt/helm-lab/webapp-chart \
        --namespace default --wait --timeout=60s 2>/dev/null || exit 1
      # Check with custom values
      helm upgrade --install webapp-custom /opt/helm-lab/webapp-chart \
        --set replicaCount=3 \
        --set image.tag=1.26-alpine \
        --namespace default --wait --timeout=60s 2>/dev/null || exit 1
      REPLICAS=$(kubectl get deployment webapp-custom -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)
      [ "$REPLICAS" -eq 3 ] || exit 1
---

_Converti manifest raw in un Helm chart professionale con values parametrizzabili._

---

## Scenario

Il team ha manifest Kubernetes per l'app `webapp` in `/opt/helm-lab/raw-manifests/`.
Il tuo compito è convertirli in un Helm chart completo che permetta di customizzare
`replicaCount`, `image.tag`, `resources`, e variabili d'ambiente tramite `values.yaml`.

---

## Task 1 — Struttura del Chart

Crea la struttura di base del chart:

```bash
mkdir -p /opt/helm-lab/webapp-chart/templates

# Chart.yaml
cat > /opt/helm-lab/webapp-chart/Chart.yaml << 'EOF'
apiVersion: v2
name: webapp
description: Web application Helm chart
type: application
version: 0.1.0
appVersion: "1.25"
EOF

# values.yaml con i default
cat > /opt/helm-lab/webapp-chart/values.yaml << 'EOF'
replicaCount: 2

image:
  repository: nginx
  tag: "1.25"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 200m
    memory: 256Mi

env:
  APP_ENV: production
  LOG_LEVEL: info
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_chart_structure
---
#active
In attesa della struttura del chart in `/opt/helm-lab/webapp-chart/`...

#completed
Struttura del chart corretta!
::

---

## Task 2 — Templates con Go Templating

Crea i template parametrizzati:

```bash
cat > /opt/helm-lab/webapp-chart/templates/deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
      - name: web
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: 80
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        env:
        {{- range $key, $val := .Values.env }}
        - name: {{ $key }}
          value: {{ $val | quote }}
        {{- end }}
EOF

cat > /opt/helm-lab/webapp-chart/templates/service.yaml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-svc
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
  - port: {{ .Values.service.port }}
    targetPort: 80
  type: {{ .Values.service.type }}
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_helm_lint
---
#active
In attesa che `helm lint` passi senza errori...

#completed
`helm lint` passa! Il chart è valido.
::

::simple-task
---
:tasks: tasks
:name: verify_helm_install
---
#active
In attesa che il chart si installi correttamente con `--set replicaCount=3`...

#completed
Il chart si installa e rispetta i valori customizzati.
::

::hint-box
---
:summary: Go Template Tricks per Helm
---

```yaml
# Indent YAML correttamente
resources:
  {{- toYaml .Values.resources | nindent 2 }}

# Condizionale
{{- if .Values.ingress.enabled }}
# ... ingress yaml
{{- end }}

# Loop su map
{{- range $key, $value := .Values.env }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}

# Default value
replicas: {{ .Values.replicaCount | default 1 }}
```
::
