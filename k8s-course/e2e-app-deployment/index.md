---
kind: tutorial

title: "End-to-End Application Deployment: From Code to GitOps on Kubernetes"

description: |
  A comprehensive hands-on guide covering the complete journey of deploying a Spring Boot application to Kubernetes — from writing a Dockerfile, through CI/CD pipelines with GitLab, to fully automated GitOps deployments with ArgoCD.

categories:
- kubernetes
- ci-cd

tagz:
- gitops
- argocd
- gitlab-ci
- docker
- spring-boot

createdAt: 2026-05-05
updatedAt: 2026-05-05

cover: __static__/cover.png

playground:
  name: k3s
---

# End-to-End Application Deployment: From Code to GitOps on Kubernetes

In the real world, deploying an application isn't just about writing YAML and running `kubectl apply`. It's a pipeline — code gets containerized, tested, pushed to a registry, deployed to a cluster, and (if you're doing it right) managed declaratively through Git.

This tutorial walks you through the **entire journey**, from a Spring Boot application sitting in a Git repository to a fully automated GitOps deployment powered by ArgoCD. By the end, you'll have hands-on experience with every link in the chain.

**What you'll build:**

- A multi-stage Docker image for a Spring Boot app
- A GitLab CI pipeline that builds, tests, and pushes container images
- Kubernetes manifests for deploying the application
- An ArgoCD-powered GitOps workflow that keeps your cluster in sync with Git
- A Helm chart with environment-specific values and a promotion pipeline (dev → prod)
- Observability with Prometheus and Grafana for monitoring your application

**Prerequisites:**

- Basic familiarity with Docker and Kubernetes concepts
- A GitLab account (free tier works fine)
- Access to the playground terminal on the right →

Let's get started.

---

## Step 1: Containerizing a Spring Boot Application

Every Kubernetes deployment starts with a container image. In this step, we'll write a production-grade Dockerfile for a Spring Boot application using **multi-stage builds** — the standard approach for Java applications.

### The Application

We'll be working with a Spring Boot application hosted at:

```
https://gitlab.com/ams0/e2e-springboot-kubernetes-gitops
```

This is a straightforward REST API built with Spring Boot 3 and Java 21. It uses Maven for dependency management and exposes a health endpoint via Spring Actuator.

Let's start by cloning it in the playground:

```bash
git clone https://gitlab.com/ams0/e2e-springboot-kubernetes-gitops.git
cd e2e-springboot-kubernetes-gitops
```

### Writing the Dockerfile

A common mistake with Java containers is shipping the entire JDK and build tools in production. A multi-stage build solves this — you compile in one stage and copy only the artifact to a minimal runtime image.

```dockerfile title="Dockerfile"
# Stage 1: Build with Maven
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /app

# Copy dependency descriptors first for better layer caching
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Runtime with slim JRE
FROM eclipse-temurin:21-jre-alpine

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy the built JAR from builder stage
COPY --from=builder /app/target/*.jar app.jar

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Breaking it Down

Let's look at what each section does and _why_.

**Stage 1 — The Builder:**

| Line | Purpose |
|------|---------|
| `FROM maven:3.9-eclipse-temurin-21 AS builder` | Full Maven + JDK 21 image (~800MB). We need this to compile, but it won't ship to production. |
| `COPY pom.xml` → `mvn dependency:go-offline` | Docker layer caching trick. Dependencies change rarely; source code changes often. By copying `pom.xml` first and downloading dependencies in a separate layer, rebuilds after code changes skip the slow dependency download. |
| `mvn package -DskipTests -B` | Build the JAR. We skip tests here because they run in a separate CI stage (Step 2). The `-B` flag runs Maven in batch (non-interactive) mode. |

**Stage 2 — The Runtime:**

| Line | Purpose |
|------|---------|
| `FROM eclipse-temurin:21-jre-alpine` | Minimal Alpine-based image with just the JRE (~180MB vs ~800MB for the full JDK). |
| `addgroup`/`adduser` + `USER appuser` | **Never run containers as root.** This creates a dedicated non-root user. If the container is compromised, the attacker has limited privileges. |
| `COPY --from=builder` | The magic of multi-stage builds — copy only the compiled JAR from the builder stage. Build tools, source code, and intermediate files are left behind. |
| `HEALTHCHECK` | Built-in health monitoring. Kubernetes has its own probes (we'll add those later), but a Docker-level health check is useful for standalone testing. |

::remark-box{type="warning"}
**Image size matters.** The builder stage is ~800MB. The final runtime image is ~200MB. In a CI pipeline pushing hundreds of images, that difference adds up fast — in storage costs, pull times, and attack surface.
::

### The .dockerignore File

Before building, create a `.dockerignore` to keep unnecessary files out of the build context:

```text title=".dockerignore"
.git
.gitignore
*.md
target/
.idea/
*.iml
docker-compose*.yml
k8s/
.gitlab-ci.yml
```

::hint-box
A good `.dockerignore` speeds up builds significantly. Without it, Docker sends your entire `.git` directory (potentially hundreds of MB) to the build daemon — even though no Dockerfile instruction uses it.
::

### Building and Testing Locally

In the playground terminal, build the image:

```bash
docker build -t springboot-app:local .
```

This will take a few minutes the first time (Maven needs to download dependencies). Subsequent builds will be much faster thanks to layer caching.

Once built, run it:

```bash
docker run -d --name test-app -p 8080:8080 springboot-app:local
```

Wait about 15 seconds for the JVM to start, then test:

```bash
# Check the health endpoint
curl http://localhost:8080/actuator/health

# You should see: {"status":"UP"}
```

Clean up when done:

```bash
docker stop test-app && docker rm test-app
```

::details-box{title="Why Alpine? What about distroless?"}
We use Alpine for its small size and wide adoption. Google's **distroless** images are even smaller (no shell, no package manager) and arguably more secure, but they're harder to debug — you can't `exec` into them. For a tutorial environment, Alpine strikes the right balance.

In a hardened production setup, consider:
```dockerfile
FROM gcr.io/distroless/java21-debian12
COPY --from=builder /app/target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```
No shell. No users to create. Nothing to exploit. But also nothing to debug with.
::

---

## Step 2: CI Pipeline with GitLab CI

You've got a Dockerfile that works locally. Now let's automate the build-test-push cycle with GitLab CI. Every push to `main` will build a fresh container image and push it to GitLab's built-in Container Registry.

### GitLab CI Fundamentals

GitLab CI is configured via a `.gitlab-ci.yml` file at the root of your repository. When you push code, GitLab's runners pick up the pipeline definition and execute it. No external CI system needed — it's built into GitLab.

Key concepts:
- **Stages** run sequentially (build → test → containerize)
- **Jobs** within a stage run in parallel
- **Artifacts** pass files between stages
- **Services** provide sidecar containers (like Docker-in-Docker)

### The Pipeline

```yaml title=".gitlab-ci.yml"
stages:
  - build
  - test
  - containerize

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
  IMAGE_LATEST: $CI_REGISTRY_IMAGE:latest

cache:
  paths:
    - .m2/repository/

build:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn compile -B
  artifacts:
    paths:
      - target/
    expire_in: 1 hour

test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test -B
  artifacts:
    reports:
      junit: target/surefire-reports/TEST-*.xml

containerize:
  stage: containerize
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
    - docker push $IMAGE_TAG
    - docker push $IMAGE_LATEST
  only:
    - main
```

### Pipeline Walkthrough

**Variables:**

GitLab CI injects several predefined variables. The ones we use:

| Variable | Value | Purpose |
|----------|-------|---------|
| `$CI_REGISTRY` | `registry.gitlab.com` | GitLab's Container Registry hostname |
| `$CI_REGISTRY_IMAGE` | `registry.gitlab.com/ams0/e2e-springboot-kubernetes-gitops` | Full image path for this project |
| `$CI_REGISTRY_USER` | Auto-set | Temporary credentials for registry auth |
| `$CI_REGISTRY_PASSWORD` | Auto-set | Temporary token (scoped to the pipeline) |
| `$CI_COMMIT_SHORT_SHA` | e.g., `a1b2c3d4` | Short commit hash for image tagging |

We define two custom variables for convenience:
- `IMAGE_TAG` — the image tagged with the commit SHA (immutable, traceable)
- `IMAGE_LATEST` — the `latest` tag (convenient, but mutable — use with caution)

**Stage: build**

```yaml
build:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn compile -B
  artifacts:
    paths:
      - target/
    expire_in: 1 hour
```

Compiles the Java code. The `target/` directory is saved as an artifact so the test stage doesn't need to recompile.

**Stage: test**

```yaml
test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test -B
  artifacts:
    reports:
      junit: target/surefire-reports/TEST-*.xml
```

Runs the test suite. The `junit` report format lets GitLab parse test results and display them in the merge request UI — you get a nice summary of passed/failed tests without digging into logs.

**Stage: containerize**

```yaml
containerize:
  stage: containerize
  image: docker:24
  services:
    - docker:24-dind
```

This is where it gets interesting. We need Docker to build our image, but GitLab runners don't have Docker installed by default. The solution is **Docker-in-Docker (DinD)** — a sidecar container that runs the Docker daemon. The `docker:24` image provides the CLI, and `docker:24-dind` provides the daemon.

::remark-box{type="info"}
**Why two image tags?** We push both `$CI_COMMIT_SHORT_SHA` and `latest`. The SHA tag gives you an immutable, auditable reference — you can always trace exactly which commit produced an image. The `latest` tag is a convenience for development. In production GitOps, you'll typically reference the SHA tag.
::

::details-box{title="Alternative: Kaniko (no Docker daemon required)"}
Docker-in-Docker requires privileged mode, which is a security concern in shared runners. **Kaniko** is a tool by Google that builds container images without a Docker daemon:

```yaml
containerize:
  stage: containerize
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context $CI_PROJECT_DIR
      --dockerfile $CI_PROJECT_DIR/Dockerfile
      --destination $IMAGE_TAG
      --destination $IMAGE_LATEST
```

No DinD, no privilege escalation. Worth considering for production pipelines.
::

### Maven Dependency Caching

Notice the cache configuration:

```yaml
variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"

cache:
  paths:
    - .m2/repository/
```

Maven downloads dependencies to `~/.m2/repository` by default. By redirecting it to the project directory and caching it, subsequent pipeline runs skip the download phase. This can cut minutes off your build time.

### Testing the Pipeline

In the playground, you can simulate what each stage does:

```bash
cd e2e-springboot-kubernetes-gitops

# Simulate the build stage
docker run --rm -v $(pwd):/app -w /app maven:3.9-eclipse-temurin-21 mvn compile -B

# Simulate the test stage
docker run --rm -v $(pwd):/app -w /app maven:3.9-eclipse-temurin-21 mvn test -B
```

::hint-box
In a real GitLab setup, you'd push this `.gitlab-ci.yml` to your repo, and the pipeline runs automatically. The playground doesn't have GitLab runners, but you can verify each step manually.
::

---

## Step 3: Direct Kubernetes Deployment (The Old Way)

Before we get to the good stuff (GitOps), let's deploy the application the traditional way — with `kubectl apply`. This is important because understanding the pain points of manual deployment is what makes GitOps click.

### Kubernetes Manifests

We need two resources: a **Deployment** (to run the pods) and a **Service** (to expose them).

#### The Deployment

```yaml title="k8s/deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: springboot-app
  labels:
    app: springboot-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: springboot-app
  template:
    metadata:
      labels:
        app: springboot-app
    spec:
      containers:
        - name: springboot-app
          image: registry.gitlab.com/ams0/e2e-springboot-kubernetes-gitops:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
```

Let's examine the key sections:

**Resource Requests and Limits:**

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

- **Requests** = what the scheduler guarantees. The pod won't be scheduled on a node that can't provide at least 256Mi RAM and 0.25 CPU cores.
- **Limits** = the ceiling. If the container exceeds 512Mi RAM, it gets OOMKilled. If it exceeds 500m CPU, it gets throttled.

::remark-box{type="warning"}
**Always set resource requests and limits.** Without them, a single misbehaving pod can starve the entire node. It's one of the most common production issues in Kubernetes.
::

**Health Probes:**

```yaml
readinessProbe:
  httpGet:
    path: /actuator/health
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
```

Spring Boot Actuator's `/actuator/health` endpoint is purpose-built for this. Two probes serve different purposes:

- **Readiness probe** — Is the app ready to receive traffic? Failing this removes the pod from Service endpoints (no traffic routed to it).
- **Liveness probe** — Is the app alive? Failing this triggers a pod restart. The `initialDelaySeconds: 30` gives the JVM time to start before Kubernetes starts checking.

#### The Service

```yaml title="k8s/service.yaml"
apiVersion: v1
kind: Service
metadata:
  name: springboot-app
  labels:
    app: springboot-app
spec:
  type: NodePort
  selector:
    app: springboot-app
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
      protocol: TCP
```

The Service selects pods with `app: springboot-app` and exposes them on port 30080 of every node. In the playground (k3s), you can access the app at `http://localhost:30080`.

### Deploying with kubectl

Let's deploy to the k3s cluster in the playground:

```bash
# Create the manifests directory
mkdir -p k8s

# Apply the manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Watch the rollout
kubectl rollout status deployment/springboot-app

# Check the pods
kubectl get pods -l app=springboot-app

# Test the service
curl http://localhost:30080/actuator/health
```

It works! But let's talk about what's wrong with this approach.

### The Problems with kubectl apply

This workflow has several fundamental issues:

**1. No drift detection.** Someone could `kubectl edit` the deployment directly, changing the image tag or replica count. The YAML files in Git now don't match what's running. You have no idea until something breaks.

**2. No audit trail.** Who deployed what, when? `kubectl apply` doesn't leave a meaningful paper trail. In a regulated environment, this is a compliance nightmare.

**3. Manual process.** Every deployment requires someone to run `kubectl apply`. That someone needs cluster access, which means credentials floating around on developer laptops.

**4. No rollback mechanism.** Sure, you can `kubectl rollout undo`, but that rolls back to the previous _in-cluster_ state — not necessarily to a known-good state defined in Git.

**5. Doesn't scale.** One cluster, one app — manageable. Ten clusters, fifty apps — chaos. You need a system, not a human with a terminal.

::remark-box{type="info"}
These aren't theoretical problems. They're the daily reality of teams doing "kubectl-driven deployment." GitOps was invented specifically to solve them.
::

---

## Step 4: Deploying ArgoCD

Time to fix everything from Step 3. **ArgoCD** is a declarative GitOps continuous delivery tool for Kubernetes. It watches a Git repository and continuously reconciles the cluster state with what's defined in Git.

The core principle: **Git is the single source of truth.** If it's not in Git, it shouldn't be in the cluster.

### Installing ArgoCD

In the playground terminal, install ArgoCD into its own namespace:

```bash
# Create the namespace
kubectl create namespace argocd

# Install ArgoCD (stable release)
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

This installs several components:
- **argocd-server** — The API server and web UI
- **argocd-repo-server** — Clones and processes Git repositories
- **argocd-application-controller** — The reconciliation engine that syncs cluster state with Git
- **argocd-dex-server** — SSO integration (optional)
- **argocd-redis** — Caching layer

Wait for all pods to be ready:

```bash
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s
```

Verify the installation:

```bash
kubectl get pods -n argocd
```

You should see something like:

```
NAME                                                READY   STATUS    RESTARTS   AGE
argocd-application-controller-0                     1/1     Running   0          2m
argocd-dex-server-xxxxxxxxxx-xxxxx                  1/1     Running   0          2m
argocd-redis-xxxxxxxxxx-xxxxx                       1/1     Running   0          2m
argocd-repo-server-xxxxxxxxxx-xxxxx                 1/1     Running   0          2m
argocd-server-xxxxxxxxxx-xxxxx                      1/1     Running   0          2m
```

### Getting the Admin Password

ArgoCD generates a random admin password on installation:

```bash
# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
echo  # Add a newline for readability
```

::remark-box{type="warning"}
**Change or delete this password after first login.** The initial secret is stored in plaintext (base64 is not encryption). In production, integrate ArgoCD with your SSO provider (OIDC, SAML, GitHub OAuth, etc.).
::

### Accessing the ArgoCD UI

In the playground, expose the ArgoCD server via port-forward:

```bash
# Port-forward the ArgoCD server (run in background)
kubectl port-forward svc/argocd-server -n argocd 8443:443 &
```

You can now access the UI at `https://localhost:8443` (accept the self-signed certificate warning).

Log in with:
- **Username:** `admin`
- **Password:** (the one you retrieved above)

### Installing the ArgoCD CLI

For command-line interactions, install the ArgoCD CLI:

```bash
# Download the latest ArgoCD CLI
curl -sSL -o /usr/local/bin/argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64

chmod +x /usr/local/bin/argocd

# Log in via CLI
argocd login localhost:8443 --insecure --username admin \
  --password $(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)
```

### How ArgoCD Works

Before we create an Application, let's understand the reconciliation loop:

```
┌──────────────┐     poll      ┌──────────────┐
│   Git Repo   │ ◄──────────── │  ArgoCD Repo │
│  (desired    │               │   Server     │
│   state)     │               └──────┬───────┘
└──────────────┘                      │
                                      │ compare
                                      ▼
                               ┌──────────────┐
                               │  Application │
                               │  Controller  │
                               └──────┬───────┘
                                      │
                              sync if  │ different
                                      ▼
                               ┌──────────────┐
                               │  Kubernetes  │
                               │   Cluster    │
                               │  (actual     │
                               │   state)     │
                               └──────────────┘
```

1. The **repo server** periodically polls your Git repository
2. The **application controller** compares the desired state (Git) with the actual state (cluster)
3. If they differ, the app is marked **OutOfSync**
4. Depending on your sync policy, ArgoCD either alerts you or automatically reconciles

This loop runs every ~3 minutes by default (configurable).

::details-box{title="ArgoCD vs Flux: How do they compare?"}
Both are CNCF projects implementing GitOps for Kubernetes. Key differences:

| Feature | ArgoCD | Flux |
|---------|--------|------|
| UI | Rich web UI built-in | No UI (third-party options) |
| Architecture | Centralized, cluster-level | Distributed, can run per-namespace |
| App definition | CRD-based (Application) | CRD-based (Kustomization, HelmRelease) |
| Multi-cluster | Native support | Via Cluster API or remote contexts |
| Learning curve | Easier to start | More Kubernetes-native |

Neither is objectively "better." ArgoCD's UI makes it more approachable for teams new to GitOps. Flux's pull-based architecture is arguably more secure. For this tutorial, we use ArgoCD because the visual feedback loop makes the concepts clearer.
::

---

## Step 5: GitOps Deployment with ArgoCD

This is where everything comes together. We'll create an ArgoCD **Application** that points to our Git repository, and from now on, every change pushed to Git automatically deploys to the cluster.

### The ArgoCD Application Manifest

An ArgoCD Application is a Kubernetes custom resource that defines:
- **Where** to find the desired state (Git repo + path)
- **Where** to deploy it (cluster + namespace)
- **How** to sync (manual vs automatic, prune, self-heal)

```yaml title="k8s/argocd-app.yaml"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: springboot-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.com/ams0/e2e-springboot-kubernetes-gitops.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### Manifest Breakdown

**Source — Where the manifests live:**

```yaml
source:
  repoURL: https://gitlab.com/ams0/e2e-springboot-kubernetes-gitops.git
  targetRevision: main
  path: k8s
```

- `repoURL` — The Git repository to watch. Since this is a public repo, no credentials are needed.
- `targetRevision` — The branch (or tag, or commit SHA) to track.
- `path` — The directory within the repo containing Kubernetes manifests. ArgoCD will process all YAML/JSON files in this directory.

**Destination — Where to deploy:**

```yaml
destination:
  server: https://kubernetes.default.svc
  namespace: default
```

`https://kubernetes.default.svc` is the in-cluster API server — ArgoCD deploys to the same cluster it runs in. For multi-cluster setups, you'd register external clusters with `argocd cluster add`.

**Sync Policy — The automation rules:**

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

This is where the magic happens:

| Setting | What it does |
|---------|-------------|
| `automated` | ArgoCD syncs automatically when it detects drift. Without this, you'd need to click "Sync" manually. |
| `prune: true` | If a resource is removed from Git, ArgoCD deletes it from the cluster. Without this, orphaned resources accumulate. |
| `selfHeal: true` | If someone manually changes a resource in the cluster (via `kubectl edit`, for example), ArgoCD reverts the change to match Git. This is the drift-detection superpower. |

::remark-box{type="warning"}
**`selfHeal: true` is opinionated.** It means _no one_ can make ad-hoc changes to the cluster — ArgoCD will revert them within minutes. This is usually what you want in production, but it can be surprising during development. Consider disabling it for dev/staging environments.
::

### Deploying the Application

First, if you deployed the app manually in Step 3, clean it up:

```bash
# Remove the manually deployed resources
kubectl delete deployment springboot-app 2>/dev/null
kubectl delete service springboot-app 2>/dev/null
```

Now apply the ArgoCD Application manifest:

```bash
kubectl apply -f k8s/argocd-app.yaml
```

ArgoCD will immediately detect the new Application and start syncing:

```bash
# Watch ArgoCD sync the application
argocd app get springboot-app

# Or via kubectl
kubectl get application springboot-app -n argocd
```

Watch the pods come up:

```bash
kubectl get pods -l app=springboot-app -w
```

After a minute or so, your application should be running — deployed entirely through Git.

### Verifying the GitOps Workflow

Let's prove that the system works end-to-end.

**Check the sync status:**

```bash
argocd app get springboot-app
```

You should see:

```
Name:               argocd/springboot-app
Project:            default
Server:             https://kubernetes.default.svc
Namespace:          default
URL:                https://localhost:8443/applications/springboot-app
Repo:               https://gitlab.com/ams0/e2e-springboot-kubernetes-gitops.git
Target:             main
Path:               k8s
SyncWindow:         Sync Allowed
Sync Policy:        Automated (Prune)
Sync Status:        Synced to main (a1b2c3d)
Health Status:      Healthy
```

The two key fields: **Sync Status: Synced** and **Health Status: Healthy**.

**Test drift detection (self-heal):**

Let's simulate someone making an unauthorized change:

```bash
# Scale the deployment manually
kubectl scale deployment springboot-app --replicas=5

# Check — you should see 5 pods briefly
kubectl get pods -l app=springboot-app

# Wait 30-60 seconds, then check again
sleep 60
kubectl get pods -l app=springboot-app
```

ArgoCD detects the drift and scales back to 2 replicas (as defined in Git). No human intervention needed.

**Test prune (resource removal):**

If you were to remove `service.yaml` from the Git repo and push, ArgoCD would delete the Service from the cluster. That's what `prune: true` does.

### The Complete GitOps Flow

Here's the full workflow in production:

```
Developer pushes code
       │
       ▼
GitLab CI builds & tests
       │
       ▼
Docker image pushed to registry
  (tagged with commit SHA)
       │
       ▼
Developer updates k8s/deployment.yaml
  (new image tag)
       │
       ▼
Push manifest change to Git
       │
       ▼
ArgoCD detects change (~3 min)
       │
       ▼
ArgoCD syncs cluster to match Git
       │
       ▼
Application updated ✓
```

::hint-box
**Pro tip:** In a mature setup, the CI pipeline itself updates the Kubernetes manifests with the new image tag and pushes the commit. This closes the loop completely — a code push triggers a build, which triggers a manifest update, which triggers a deployment. Zero human steps after `git push`.
::

### Automating Image Updates in CI

To fully close the GitOps loop, add a stage to your `.gitlab-ci.yml` that updates the deployment manifest:

```yaml title=".gitlab-ci.yml (additional stage)"
update-manifests:
  stage: deploy
  image: alpine/git
  script:
    - git clone https://${DEPLOY_TOKEN}@gitlab.com/ams0/e2e-springboot-kubernetes-gitops.git deploy-repo
    - cd deploy-repo
    - "sed -i \"s|image: .*|image: ${IMAGE_TAG}|\" k8s/deployment.yaml"
    - git config user.email "ci@gitlab.com"
    - git config user.name "GitLab CI"
    - git add k8s/deployment.yaml
    - "git commit -m \"chore: update image to ${CI_COMMIT_SHORT_SHA}\""
    - git push
  only:
    - main
```

This pattern — **separate app code from deployment manifests** — is a GitOps best practice. Some teams even use separate repositories for application code and Kubernetes manifests, giving them independent change histories and access controls.

### Monitoring and Troubleshooting

ArgoCD provides several ways to diagnose issues:

```bash
# Detailed sync status with resource-level info
argocd app get springboot-app --show-operation

# View sync history
argocd app history springboot-app

# Check ArgoCD logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller

# Force a manual sync (if needed)
argocd app sync springboot-app

# Diff what ArgoCD sees vs what's in the cluster
argocd app diff springboot-app
```

::details-box{title="Common issues and fixes"}

**App stuck in "Progressing":**
Usually means pods aren't becoming Ready. Check pod events:
```bash
kubectl describe pod -l app=springboot-app
```

**"ComparisonError" on sync:**
Often a malformed manifest. Check the repo server logs:
```bash
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-repo-server
```

**App shows "OutOfSync" constantly:**
Some resources have fields that are set by controllers (like `status`, `metadata.generation`). ArgoCD might see these as drift. Add to your Application spec:
```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas  # If using HPA
```

**Image pull errors:**
If using a private registry, create an image pull secret:
```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.gitlab.com \
  --docker-username=<user> \
  --docker-password=<token>
```
Then reference it in your Deployment spec.
::

---

## Step 6: Helm Chart & Environment Promotion

So far we've deployed raw manifests via `kubectl apply` and ArgoCD. That works for a single environment — but in the real world, you deploy to **multiple environments** (dev, staging, production) with different configurations. This is where **Helm** comes in.

A Helm chart turns your Kubernetes manifests into a reusable, parameterized package. Instead of maintaining separate YAML files per environment, you maintain **one chart** with **different values files** for each target.

### 6.1 Creating the Helm Chart

Our chart lives in the same repository under `helm/springboot-app/`. Let's look at the structure:

```
helm/springboot-app/
├── Chart.yaml              # Chart metadata (name, version)
├── values.yaml             # Default values
├── values-dev.yaml         # Dev environment overrides
├── values-prod.yaml        # Production environment overrides
└── templates/
    ├── _helpers.tpl        # Reusable template functions
    ├── deployment.yaml     # Templated Deployment
    └── service.yaml        # Templated Service
```

The key file is `Chart.yaml`:

```yaml title="helm/springboot-app/Chart.yaml"
apiVersion: v2
name: springboot-app
description: A Helm chart for the Spring Boot demo application
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### 6.2 Parameterized Templates

Instead of hardcoding values like replica count, image tag, and resource limits, we use Go template syntax:

```yaml title="helm/springboot-app/templates/deployment.yaml" (excerpt)
spec:
  replicas: {{ .Values.replicaCount }}
  ...
  containers:
    - name: {{ .Chart.Name }}
      image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
      resources:
        {{- toYaml .Values.resources | nindent 12 }}
```

The default `values.yaml` provides sensible defaults:

```yaml title="helm/springboot-app/values.yaml"
replicaCount: 2

image:
  repository: registry.gitlab.com/ams0/e2e-springboot-kubernetes-gitops
  tag: latest
  pullPolicy: IfNotPresent

resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 6.3 Environment-Specific Values

This is where promotion gets interesting. Each environment has its own values file:

**Dev** (`values-dev.yaml`) — small, aggressive updates:
```yaml
replicaCount: 1
image:
  tag: latest          # Always latest in dev
  pullPolicy: Always
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
```

**Production** (`values-prod.yaml`) — beefy, pinned versions:
```yaml
replicaCount: 3
image:
  tag: latest          # Overridden by CI with exact SHA
  pullPolicy: IfNotPresent
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
```

The `image.tag` in the values files is a fallback — in the pipeline, we override it with `--set image.tag=$CI_COMMIT_SHORT_SHA` to pin the exact commit.

### 6.4 The Promotion Pipeline

Our updated `.gitlab-ci.yml` now has two Helm deploy stages:

```yaml title=".gitlab-ci.yml" (deploy stages)
stages:
  - build
  - test
  - containerize
  - deploy-dev
  - deploy-prod

deploy-dev:
  stage: deploy-dev
  image: alpine/k8s:1.32.4
  script:
    - kubectl create namespace springboot-dev --dry-run=client -o yaml | kubectl apply -f -
    - helm upgrade --install springboot-app-dev ./helm/springboot-app
      --namespace springboot-dev
      --values ./helm/springboot-app/values-dev.yaml
      --set image.tag=$CI_COMMIT_SHORT_SHA
      --wait --timeout 120s
  only:
    - main

deploy-prod:
  stage: deploy-prod
  image: alpine/k8s:1.32.4
  script:
    - kubectl create namespace springboot-prod --dry-run=client -o yaml | kubectl apply -f -
    - helm upgrade --install springboot-app-prod ./helm/springboot-app
      --namespace springboot-prod
      --values ./helm/springboot-app/values-prod.yaml
      --set image.tag=$CI_COMMIT_SHORT_SHA
      --wait --timeout 120s
  when: manual       # <-- requires human click to promote
  only:
    - main
```

### 6.5 How Promotion Works

The flow demonstrates a real-world promotion pattern:

```
Git push to main
       │
       ▼
build → test → containerize (image: abc123)
       │
       ▼ (automatic)
deploy-dev: helm install with image.tag=abc123
  → deploys to springboot-dev namespace
  → 1 replica, minimal resources
       │
       ▼ (manual trigger — human validates in dev first)
deploy-prod: helm install with image.tag=abc123
  → deploys to springboot-prod namespace
  → 3 replicas, production resources
```

**Key points:**
- Dev deploys **automatically** on every push — fast feedback
- Prod deploys **manually** — human gate after validating in dev
- Both use the **same image** (same `$CI_COMMIT_SHORT_SHA`) — what you tested is what you ship
- The only difference is the **values file** — different resource allocation, replica count, etc.

### 6.6 Testing Locally

You can render the chart without deploying to verify your templates:

```bash
cd e2e-springboot-kubernetes-gitops

# Render with dev values
helm template springboot-app-dev ./helm/springboot-app \
  --values ./helm/springboot-app/values-dev.yaml \
  --set image.tag=abc123

# Render with prod values
helm template springboot-app-prod ./helm/springboot-app \
  --values ./helm/springboot-app/values-prod.yaml \
  --set image.tag=abc123
```

Compare the outputs — you'll see different replica counts, resource allocations, and the same image tag. That's the power of Helm: one chart, many configurations.

### 6.7 Verifying Promotion in the Cluster

After the pipeline runs, you can verify both deployments:

```bash
# Check dev deployment
kubectl get pods -n springboot-dev
helm list -n springboot-dev
helm get values springboot-app-dev -n springboot-dev

# Check prod (after manual trigger)
kubectl get pods -n springboot-prod
helm list -n springboot-prod
helm get values springboot-app-prod -n springboot-prod
```

Notice both namespaces run the **exact same image tag** but with different configurations. This is the promotion guarantee: if it works in dev with commit `abc123`, it'll work in prod with commit `abc123` — the code is identical, only the operational parameters change.

::remark-box{type="info"}
**Why manual promotion for prod?** In a mature pipeline, you might replace the manual gate with automated checks — integration tests, canary analysis, or approval from a change management system. The key principle remains: promote the same artifact (image), never rebuild for production.
::

::details-box{title="Alternative: GitOps promotion with ArgoCD"}
Instead of CI pushing directly to the cluster, a more GitOps-native approach is:

1. CI builds the image and updates `values-dev.yaml` with the new tag → ArgoCD syncs dev
2. After validation, a PR updates `values-prod.yaml` with the same tag → ArgoCD syncs prod

This keeps all state in Git and uses ArgoCD for the actual deployment. The trade-off is more Git commits and slightly more complex automation, but you get a full audit trail in Git history.
::

---

## Step 7: Observability with Prometheus and Grafana

Your app is deployed, synced via GitOps, and self-healing. But here's the uncomfortable question: **how do you know it's actually working?** A pod showing `Running` doesn't mean your users are happy. You need visibility into what's happening inside.

### 6.1 Why Observability Matters

Observability in Kubernetes rests on three pillars:

- **Metrics** — Numerical measurements over time (CPU usage, request latency, error rates)
- **Logs** — Discrete events (stack traces, audit entries, application output)
- **Traces** — Request flows across services (which service called which, and how long each hop took)

In this step, we're focusing on **metrics** — the most immediately actionable pillar. Our Spring Boot app already exposes a Prometheus-compatible metrics endpoint via Micrometer (`/actuator/prometheus`). We just need something to scrape it and something to visualize it.

That something is the **kube-prometheus-stack**: Prometheus for collection, Grafana for dashboards, plus batteries included (node-exporter, kube-state-metrics, and a set of pre-built alerts).

### 6.2 Installing the Prometheus Stack

The `kube-prometheus-stack` Helm chart is the de facto standard for monitoring Kubernetes clusters. It bundles:

| Component | Purpose |
|-----------|----------|
| **Prometheus** | Scrapes and stores time-series metrics |
| **Grafana** | Visualization and dashboarding |
| **Alertmanager** | Routes and deduplicates alerts |
| **node-exporter** | Exposes host-level metrics (CPU, memory, disk, network) |
| **kube-state-metrics** | Exposes Kubernetes object state (deployments, pods, nodes) |

Install it with Helm:

```bash
# Add the Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install the full monitoring stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

That last flag is important — by default, the Helm-installed Prometheus only discovers ServiceMonitors that have a specific Helm label. Setting it to `false` tells Prometheus to discover **all** ServiceMonitors in the cluster, including the one we'll create for our app.

Wait for everything to come up:

```bash
kubectl wait --for=condition=Ready pods --all -n monitoring --timeout=300s
kubectl get pods -n monitoring
```

You should see pods for Prometheus, Grafana, Alertmanager, node-exporter (one per node), and kube-state-metrics.

::remark-box{type="info"}
**Resource note:** The full monitoring stack is resource-hungry. In the playground (k3s), it might take a couple of minutes for all pods to schedule. If pods stay `Pending`, check node resources with `kubectl describe node`.
::

### 6.3 Creating a ServiceMonitor

Prometheus doesn't magically know about your application. You need to tell it what to scrape using a **ServiceMonitor** — a custom resource defined by the Prometheus Operator.

The ServiceMonitor selects Kubernetes Services by label and defines which endpoint to scrape:

```yaml title="k8s/service-monitor.yaml"
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: springboot-app
  labels:
    app: springboot-app
spec:
  selector:
    matchLabels:
      app: springboot-app
  endpoints:
    - port: http
      path: /actuator/prometheus
      interval: 15s
```

Let's break this down:

- **`selector.matchLabels`** — Finds Services with `app: springboot-app`. This matches the Service we created in Step 3.
- **`endpoints[].port: http`** — The named port on the Service to scrape. Make sure your Service defines a port named `http` (or update this to match your port name).
- **`endpoints[].path`** — The metrics endpoint path. Spring Boot with `micrometer-registry-prometheus` exposes metrics at `/actuator/prometheus`.
- **`endpoints[].interval: 15s`** — How often Prometheus scrapes. 15 seconds is a reasonable default.

::hint-box
If your Service uses a numeric `targetPort` without a name, you can use `targetPort: 8080` instead of `port: http` in the ServiceMonitor. Named ports are preferred because they're self-documenting.
::

Apply the ServiceMonitor:

```bash
kubectl apply -f k8s/service-monitor.yaml
```

Since we have ArgoCD managing the `k8s/` directory, you could also commit this file to Git and let ArgoCD sync it. GitOps all the way down.

Verify that Prometheus discovered the target:

```bash
# Port-forward to Prometheus
kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090 &

# Check targets (look for serviceMonitor/default/springboot-app)
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep springboot
```

You should see your Spring Boot app listed as an active target with `"health": "up"`.

### 6.4 Exploring Metrics

With Prometheus scraping your app, let's run some queries. Prometheus uses **PromQL** — a powerful query language for time-series data.

First, generate some traffic so we have data to look at:

```bash
# Hit the app 100 times to generate metrics
for i in $(seq 1 100); do curl -s http://localhost:30080/hello/world > /dev/null; done
```

Now explore with PromQL (via the Prometheus UI at `http://localhost:9090` or via curl):

**JVM Memory Usage:**

```promql
jvm_memory_used_bytes{area="heap"}
```

Shows how much heap memory your JVM is consuming. Compare with `jvm_memory_max_bytes` to see how close you are to the limit.

**HTTP Request Count:**

```promql
http_server_requests_seconds_count
```

Total number of HTTP requests, broken down by method, URI, and status code. Use `rate()` to see requests per second:

```promql
rate(http_server_requests_seconds_count[5m])
```

**Average Request Latency:**

```promql
rate(http_server_requests_seconds_sum[5m]) / rate(http_server_requests_seconds_count[5m])
```

This gives you the average latency over a 5-minute window. For production, you'd want percentiles (p50, p95, p99), which require histogram metrics.

**CPU Usage:**

```promql
process_cpu_usage
```

CPU usage of the JVM process (0.0 to 1.0, where 1.0 = one full core). Compare with:

```promql
system_cpu_usage
```

Which shows the CPU usage of the entire system — useful for spotting noisy neighbours.

::details-box{title="PromQL cheat sheet for Spring Boot"}
Here are more useful queries for Spring Boot applications:

```promql
# Active HTTP connections
tomcat_connections_current_connections

# Thread pool usage
jvm_threads_live_threads

# Garbage collection pause time
rate(jvm_gc_pause_seconds_sum[5m]) / rate(jvm_gc_pause_seconds_count[5m])

# Uptime in hours
process_uptime_seconds / 3600

# Error rate (5xx responses)
rate(http_server_requests_seconds_count{status=~"5.."}[5m])

# Request duration 95th percentile (if histogram)
histogram_quantile(0.95, rate(http_server_requests_seconds_bucket[5m]))
```
::

### 6.5 Grafana Dashboards

PromQL is powerful, but staring at raw metrics isn't how you monitor in practice. **Grafana** gives you dashboards — visual, shareable, and alertable.

Access Grafana:

```bash
# Port-forward to Grafana
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80 &
```

Open `http://localhost:3000` in your browser and log in:
- **Username:** `admin`
- **Password:** `admin` (as set during Helm install)

#### Importing a Pre-Built Dashboard

The community maintains excellent pre-built dashboards for Spring Boot. Let's import one:

1. In Grafana, go to **Dashboards → Import**
2. Enter dashboard ID **`19004`** (Spring Boot Observability) or **`12900`** (Spring Boot Statistics)
3. Click **Load**
4. Select your Prometheus data source
5. Click **Import**

You'll immediately see panels for JVM memory, CPU, HTTP request rates, response times, and garbage collection — all populated from the metrics your app is already exposing.

::hint-box
Grafana.com hosts thousands of community dashboards at `https://grafana.com/grafana/dashboards/`. Search for "spring boot" or "jvm" to find dashboards tailored to your stack. Dashboard ID `4701` (JVM Micrometer) is another popular choice.
::

#### Creating a Custom Dashboard

Pre-built dashboards are a great starting point, but you'll eventually want panels tailored to your application:

1. Click **Dashboards → New → New Dashboard**
2. Add a panel, select **Prometheus** as the data source
3. Enter a PromQL query, e.g., `rate(http_server_requests_seconds_count{uri="/hello/world"}[5m])`
4. Set the visualization type (time series, gauge, stat, etc.)
5. Save the dashboard

For production, consider creating dashboards that answer these questions:
- **Is the app responding?** (request rate, error rate)
- **How fast is it?** (latency percentiles)
- **Is it healthy?** (JVM memory, GC pauses, thread count)
- **Does it have enough resources?** (CPU/memory vs requests/limits)

### 6.6 Setting Up Alerts (Bonus)

Dashboards are great for humans watching screens. Alerts are for when no one's watching.

The Prometheus Operator uses **PrometheusRule** CRDs to define alerting rules. Here's an example that fires when error rates spike or latency climbs:

```yaml title="k8s/prometheus-rules.yaml"
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: springboot-app-alerts
  labels:
    release: monitoring
spec:
  groups:
    - name: springboot-app
      rules:
        - alert: HighErrorRate
          expr: |
            rate(http_server_requests_seconds_count{status=~"5..",job="springboot-app"}[5m])
            / rate(http_server_requests_seconds_count{job="springboot-app"}[5m])
            > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate on Spring Boot app"
            description: "More than 5% of requests are returning 5xx errors for the last 5 minutes."

        - alert: HighLatency
          expr: |
            rate(http_server_requests_seconds_sum{job="springboot-app"}[5m])
            / rate(http_server_requests_seconds_count{job="springboot-app"}[5m])
            > 1.0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High latency on Spring Boot app"
            description: "Average request latency exceeds 1 second for the last 5 minutes."
```

Apply it:

```bash
kubectl apply -f k8s/prometheus-rules.yaml
```

How the alert pipeline works:

```
Prometheus evaluates rules
       │
       ▼ (condition true for `for` duration)
Alert fires → sent to Alertmanager
       │
       ▼
Alertmanager deduplicates, groups, and routes
       │
       ▼
Notification sent (Slack, email, PagerDuty, webhook...)
```

Alertmanager configuration (receivers, routes, silences) is managed through the Helm chart values or its own ConfigMap. For a production setup, you'd configure at least one notification channel.

::remark-box{type="warning"}
**Alert fatigue is real.** Start with a few high-signal alerts (error rate, latency, pod restarts) rather than alerting on everything. A dashboard you look at is better than an alert you ignore.
::

::details-box{title="What about logs and traces?"}
We focused on metrics because they're the quickest win. For the full observability picture:

- **Logs:** Deploy the **Loki** stack (Loki + Promtail) for log aggregation. It integrates natively with Grafana and uses a PromQL-like query language (LogQL).
- **Traces:** Add **OpenTelemetry** instrumentation to your Spring Boot app and ship traces to **Tempo** or **Jaeger**. Spring Boot 3 has built-in support for Micrometer Tracing with OpenTelemetry exporters.

Both Loki and Tempo are part of the Grafana ecosystem, so you get logs, metrics, and traces in a single UI — with correlation between them.
::

---

## Wrapping Up

You've completed the full journey:

1. **Containerized** a Spring Boot app with a production-grade multi-stage Dockerfile
2. **Automated** builds and tests with GitLab CI
3. **Deployed** to Kubernetes manually (and understood why that's not great)
4. **Installed** ArgoCD as a GitOps controller
5. **Created** an automated GitOps pipeline where Git is the single source of truth
6. **Packaged** the app as a Helm chart and built a promotion pipeline (dev → prod)
7. **Added observability** with Prometheus and Grafana for metrics, dashboards, and alerts

The key insight: **the cluster should converge to Git, not the other way around.** Manual changes get reverted. Desired state is versioned. Deployments are auditable. Rollbacks are `git revert`.

### What's Next?

To take this further in a production environment:

- **Sealed Secrets or External Secrets** — Manage secrets in Git without exposing them
- **ArgoCD ApplicationSets** — Deploy to multiple clusters from a single template
- **Progressive Delivery** — Use Argo Rollouts for canary/blue-green deployments
- **OPA/Gatekeeper** — Policy enforcement to prevent misconfigurations before they reach the cluster
- **Notifications** — Configure ArgoCD to send Slack/email alerts on sync failures

The combination of GitLab CI + ArgoCD is battle-tested and runs in production at thousands of organizations. You now have the foundation to build on.

Happy deploying. 🚀
