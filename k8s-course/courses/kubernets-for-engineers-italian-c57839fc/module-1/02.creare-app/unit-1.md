---
kind: unit

title: Creare e Containerizzare un'Applicazione

name: creare-app-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Containerizzare un'applicazione in diversi linguaggi (Node.js, Go, Python, Java)
- Scrivere un Dockerfile base e uno ottimizzato con multi-stage build
- Costruire e testare l'immagine risultante

---

## Node.js

### 1. Crea l'applicazione

Crea una directory per il progetto e i file necessari:

```bash
mkdir temp-node
cd temp-node
```

**app.js:**
```javascript
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
```

**package.json:**
```json
{
  "name": "temp-node",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

### 2. Scrivi il Dockerfile

L'installazione delle dipendenze (`npm install`) avviene **dentro il container** durante la build — non serve avere `npm` installato sull'host:

```dockerfile
FROM node:16

# Imposta la directory di lavoro nel container
WORKDIR /usr/src/app

# Copia package.json (le dipendenze vengono installate nel container)
COPY package.json ./

# Installa le dipendenze
RUN npm install

# Copia il resto dei file dell'applicazione
COPY . .

# Esponi la porta 3000
EXPOSE 3000

# Avvia l'applicazione
CMD ["node", "app.js"]
```

### 3. Build e run

```bash
# Costruisci l'immagine
docker build -t my-simple-node-app .

# Verifica che l'immagine sia stata creata
docker image list

# Esegui il container
docker run -p 3000:3000 my-simple-node-app
```

Apri il browser su `http://localhost:3000` per verificare.

Controlla i container in esecuzione:

```bash
docker container list
```

---

## Go

### 1. Crea l'applicazione

```go
// hello.go
package main

import "fmt"

func main() {
    fmt.Println("hello world")
}
```

### 2. Opzione A — Compila localmente e usa `scratch`

```bash
GOOS=linux GOARCH=amd64 go build -o hello
```

```dockerfile
FROM scratch
COPY hello /
ENTRYPOINT ["/hello"]
```

```bash
docker build -t hello:scratch .
docker run hello:scratch
```

### 3. Opzione B — Multi-stage build (nessuna dipendenza locale)

```dockerfile
FROM golang:1.22 AS builder
COPY hello.go .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o hello .

FROM scratch
COPY --from=builder /go/hello /hello
ENTRYPOINT ["/hello"]
```

```bash
docker build -t hello:multibuild .
docker run hello:multibuild
```

> **Nota:** Il multi-stage build è l'approccio consigliato perché non richiede di avere Go installato sulla macchina host. Il binario viene compilato dentro il container di build e copiato in un'immagine `scratch` minimale.

---

## Python

### 1. Crea l'applicazione

Questa applicazione Flask ascolta sulla porta 5000 e restituisce un messaggio "Hello, Docker!".

**app.py:**
```python
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello, Docker!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**requirements.txt:**
```
Werkzeug==2.2.2
Flask==2.0.2
```

### 2. Scrivi il Dockerfile

```dockerfile
# Usa un'immagine Python ufficiale come base
FROM python:3.9-slim

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file nella directory di lavoro del container
COPY . /app

# Installa le dipendenze
RUN pip install -r requirements.txt

# Esponi la porta 5000
EXPOSE 5000

# Avvia app.py al lancio del container
CMD ["python", "app.py"]
```

### 3. Build e run

```bash
docker build -t my-python-app .
docker run -p 5000:5000 my-python-app
```

---

## Java (Spring Boot)

### 1. Crea l'applicazione

Puoi generare un'applicazione Spring Boot usando [Spring Initializr](https://start.spring.io/):

- **Project:** Maven
- **Language:** Java
- **Spring Boot:** 2.7.x o successivo
- **Dependencies:** Spring Web

Aggiungi il seguente codice al file `Application.java`:

```java
package com.example.myapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class MyAppApplication {

    public static void main(String[] args) {
        SpringApplication.run(MyAppApplication.class, args);
    }

    @RestController
    class HelloController {
        @GetMapping("/")
        public String hello() {
            return "Hello, Docker!";
        }
    }
}
```

Compila il progetto per generare il JAR:

```bash
mvn clean package
```

Il file JAR verrà creato in `target/myapp-0.0.1-SNAPSHOT.jar`.

### 2. Scrivi il Dockerfile

```dockerfile
# Usa un runtime Java ufficiale come immagine base
FROM openjdk:11-jre-slim

# Copia il jar nel container
COPY target/myapp.jar /app/myapp.jar

# Esponi la porta 8080
EXPOSE 8080

# Esegui il jar all'avvio del container
CMD ["java", "-jar", "/app/myapp.jar"]
```

### 3. Build e run

```bash
docker build -t my-java-app .
docker run -p 8080:8080 my-java-app
```

---

## `.dockerignore` — Ottimizzare il Build Context

Quando esegui `docker build`, Docker invia l'intera directory (il **build context**) al daemon. Senza un `.dockerignore`, file inutili (dipendenze locali, file Git, segreti) vengono inclusi nel context — rallentando la build e rischiando di copiare dati sensibili nell'immagine.

**Esempio per Node.js:**
```
node_modules
npm-debug.log
.git
.env
Dockerfile
docker-compose*.yml
.dockerignore
README.md
```

**Esempio per Python:**
```
__pycache__
*.pyc
.venv
venv
.git
.env
*.egg-info
dist
build
```

**Implicazioni di sicurezza:** senza `.dockerignore`, un `COPY . .` nel Dockerfile potrebbe copiare file `.env`, chiavi SSH, o credenziali nell'immagine — visibili a chiunque faccia `docker history` o esporti i layer.

> **Regola:** crea sempre un `.dockerignore` nella root del progetto, prima di scrivere il Dockerfile.

---

## `HEALTHCHECK` — Monitorare la Salute del Container

L'istruzione `HEALTHCHECK` permette a Docker di verificare periodicamente se l'applicazione nel container funziona correttamente:

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000

# Controlla ogni 30s se l'app risponde
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "app.js"]
```

| Parametro | Default | Significato |
|-----------|---------|-------------|
| `--interval` | 30s | Frequenza del check |
| `--timeout` | 30s | Timeout per il singolo check |
| `--start-period` | 0s | Tempo di grazia all'avvio (check falliti non contano) |
| `--retries` | 3 | Tentativi falliti prima di dichiarare `unhealthy` |

Dopo il HEALTHCHECK, `docker ps` mostra una colonna `STATUS` con lo stato di salute:

```bash
docker ps
# CONTAINER ID   IMAGE     STATUS                   NAMES
# a1b2c3d4e5f6   myapp     Up 2m (healthy)          web
```

> **Nota:** In Kubernetes, il concetto equivalente è implementato con le **Probes** (livenessProbe, readinessProbe, startupProbe) — molto più potenti e flessibili del HEALTHCHECK Docker.

---

## Checklist Best Practice per Dockerfile

Prima di fare push di un'immagine, verifica questa checklist:

- [ ] **Tag specifico** per l'immagine base — `FROM node:18-slim`, mai `FROM node:latest`
- [ ] **`.dockerignore`** presente — escludi `node_modules`, `.git`, `.env`, file di build
- [ ] **Dipendenze prima, codice dopo** — `COPY package.json → RUN npm install → COPY . .` per sfruttare la cache dei layer
- [ ] **Utente non-root** — aggiungi `RUN adduser -D appuser && USER appuser` prima del CMD
- [ ] **`HEALTHCHECK`** configurato — o readiness probe se deployato su Kubernetes
- [ ] **Multi-stage build** per linguaggi compilati (Go, Java, Rust) — riduci dimensione finale
- [ ] **Nessun segreto nel Dockerfile** — no `ENV API_KEY=...`, usa build args o mount secrets
- [ ] **`.dockerignore` include `.env`** — mai copiare credenziali nell'immagine

```dockerfile
# Esempio di Dockerfile che segue tutte le best practice
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-slim
WORKDIR /app
RUN adduser --disabled-password --no-create-home appuser
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "app.js"]
```
