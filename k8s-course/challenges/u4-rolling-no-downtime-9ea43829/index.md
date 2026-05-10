---
kind: challenge

title: "Rolling Update Senza Downtime"

description: |
  Esegui un rolling update di un Deployment con zero downtime mentre un client curl
  gira in background. Configura maxSurge, maxUnavailable e readinessProbe corretti.

categories:
- kubernetes

tags:
- deployment
- rolling-update
- readiness-probe
- zero-downtime

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_deployment:
    init: true
    run: |
      kubectl create deployment webapp --image=nginx:1.24-alpine --replicas=3 2>/dev/null || true
      kubectl set resources deployment webapp \
        --requests=cpu=100m,memory=64Mi \
        --limits=cpu=200m,memory=128Mi 2>/dev/null || true
      kubectl patch deployment webapp --type=json -p='[
        {"op":"add","path":"/spec/strategy","value":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}},
        {"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/","port":80},"initialDelaySeconds":5,"periodSeconds":3}}
      ]' 2>/dev/null || true
      kubectl expose deployment webapp --port=80 --type=ClusterIP --name=webapp-svc 2>/dev/null || true

  verify_update_complete:
    run: |
      # Check deployment uses nginx:1.25 or newer
      IMAGE=$(kubectl get deployment webapp \
        -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
      echo "$IMAGE" | grep -qE "nginx:1\.(2[5-9]|[3-9][0-9])" || exit 1
      # Check all replicas are ready
      READY=$(kubectl get deployment webapp -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
      [ "$READY" -ge 3 ] || exit 1

  verify_no_errors_in_log:
    run: |
      # Check curl log exists and has no "000" (connection refused) responses
      [ -f /tmp/curl-monitor.log ] || exit 1
      ERRORS=$(grep -c " 000 " /tmp/curl-monitor.log 2>/dev/null || echo 0)
      [ "$ERRORS" -eq 0 ] || exit 1
---

_Aggiorna un Deployment senza fermare il servizio — verifica con un curl loop in background._

---

## Scenario

Il Deployment `webapp` con nginx:1.24 è in esecuzione. Devi aggiornarlo a nginx:1.25
senza interrompere il servizio. Un curl loop monitorerà le risposte durante l'update.

---

## Preparazione — Avvia il Monitor

Prima di fare l'update, avvia un monitor in background:

```bash
# Trova la ClusterIP del servizio
SVC_IP=$(kubectl get svc webapp-svc -o jsonpath='{.spec.clusterIP}')

# Avvia curl loop in background (salva status in file)
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://$SVC_IP/ 2>/dev/null || echo "000")
  echo "$(date +%T) $STATUS" >> /tmp/curl-monitor.log
  sleep 0.5
done &
CURL_PID=$!
echo "Monitor avviato (PID: $CURL_PID)"
```

---

## Task 1 — Esegui il Rolling Update

```bash
# Aggiorna l'immagine
kubectl set image deployment/webapp web=nginx:1.25-alpine

# Monitora il rollout
kubectl rollout status deployment/webapp

# Guarda i Pod che si aggiornano
watch kubectl get pods -l app=webapp
```

::simple-task
---
:tasks: tasks
:name: verify_update_complete
---
#active
In attesa che il Deployment `webapp` usi nginx:1.25+ con tutte le repliche Ready...

#completed
Rolling update completato con tutte le repliche aggiornate!
::

---

## Task 2 — Verifica Zero Downtime

Ferma il monitor e verifica che non ci siano stati errori:

```bash
# Ferma il curl loop
kill $CURL_PID 2>/dev/null

# Analizza il log
echo "Totale richieste:"
wc -l /tmp/curl-monitor.log

echo "Risposte per status code:"
awk '{print $2}' /tmp/curl-monitor.log | sort | uniq -c

echo "Errori (000 = connection refused):"
grep " 000 " /tmp/curl-monitor.log | wc -l
```

::simple-task
---
:tasks: tasks
:name: verify_no_errors_in_log
---
#active
In attesa che `/tmp/curl-monitor.log` non contenga errori di connessione (000)...

#completed
Zero downtime verificato! Nessuna richiesta fallita durante l'update.
::

::hint-box
---
:summary: Perché maxUnavailable=0 è critico per zero downtime
---

- `maxUnavailable: 0` → Kubernetes NON rimuove Pod vecchi finché quelli nuovi non sono Ready
- `maxSurge: 1` → Può creare un Pod extra durante il rollout
- Senza `readinessProbe`, Kubernetes assume che il Pod sia pronto appena il container parte,
  ma l'app potrebbe non essere ancora inizializzata → possibili 502/503 durante il rollout
::

---

## Bonus — Rollback in caso di Problemi

```bash
# Simula un bad deploy
kubectl set image deployment/webapp web=nginx:doesnotexist-lol

# Guarda il rollout bloccarsi
kubectl rollout status deployment/webapp

# Rollback all'immagine precedente
kubectl rollout undo deployment/webapp

# Verifica la revision history
kubectl rollout history deployment/webapp
```
