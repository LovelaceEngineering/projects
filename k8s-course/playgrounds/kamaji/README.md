# Kamaji Playground

Playground spec + base-image build for the **Kamaji — Hosted Control Planes** lesson (`courses/kubernets-for-engineers-italian-c57839fc/module-5/1.kamaji-hosted-control-planes`).

## Files

```
kamaji-lab.yaml                      # iximiuz playground spec (3 VMs)
images/
  k3s-kamaji/
    Dockerfile                       # prebaked rootfs for the mgmt-cp VM
    install-kamaji.sh                # first-boot bootstrap (cert-manager + Kamaji)
    kamaji-bootstrap.service         # systemd oneshot that runs the script
```

## Two ways to ship the playground

### 1. Install-at-boot (what `kamaji-lab.yaml` ships today)

All three VMs use `ghcr.io/iximiuz/labenv-base:0.7.0`. The `initTasks:` block installs k3s, Helm, cert-manager, Kamaji and all worker prerequisites at first boot.

- **Pros:** no image to build or publish. Easy to iterate.
- **Cons:** ~3–5 min cold-start per session. The `helm install cert-manager --wait` and `helm install kamaji --wait` are the long poles.

### 2. Prebaked OCI rootfs (recommended once the lesson stabilises)

Replace `source:` on the `mgmt-cp` machine with an image built from `images/k3s-kamaji/` that ships k3s + Helm + cert-manager chart + Kamaji chart already on disk, and runs a systemd oneshot on first boot that brings them up.

The workers can stay on `labenv-base` because installing `kubeadm` + `kubelet` + `containerd` at boot is fast (~20 s).

## Building the base image

iximiuz playground drives are **plain OCI images**. There is no custom format, no Packer, no qcow2 — the platform mounts the image as a ZFS-backed rootfs and injects the kernel separately.

### Prerequisites

- Docker / `buildx` on your workstation
- A writable OCI registry you own (prefer `ghcr.io`; Docker Hub is rate-limited and not supported)

### Build & push

```sh
# Pick a registry path you control.
export REG=ghcr.io/ams0/iximiuz-kamaji
export TAG=v1

cd playgrounds/kamaji/images/k3s-kamaji

docker build \
  --platform=linux/amd64 \
  --build-arg ROOTFS_TAG=ubuntu-24-04 \
  --build-arg K3S_VERSION=v1.31.0+k3s1 \
  --build-arg KAMAJI_CHART_VERSION=1.0.0 \
  -t $REG/k3s-kamaji:$TAG \
  .

# Push. The package needs to be **public** on ghcr.io or the playground VM
# won't be able to pull it — flip visibility in the GitHub Packages UI.
docker push $REG/k3s-kamaji:$TAG

# Capture the immutable digest for the playground YAML.
docker buildx imagetools inspect $REG/k3s-kamaji:$TAG \
  --format '{{json .Manifest.Digest}}'
```

### Wire it into `kamaji-lab.yaml`

Replace the `mgmt-cp` drive source:

```yaml
- name: mgmt-cp
  drives:
    - source: oci://ghcr.io/ams0/iximiuz-kamaji/k3s-kamaji:v1@sha256:<digest>
      mount: /
      size: 30GiB
```

And remove the `init_install_k3s`, `init_install_helm`, `init_install_cert_manager`, `init_install_kamaji` tasks from `initTasks:` — the baked-in systemd units handle them.

## Optimization: start from a k3s-preinstalled base

iximiuz publishes a `ubuntu-k3s-server` variant of the rootfs with k3s already installed. To skip the `curl get.k3s.io` step in our Dockerfile, build with:

```sh
docker build --build-arg ROOTFS_TAG=ubuntu-k3s-server ...
```

and delete the `curl … get.k3s.io` RUN block. Same trick for workers with `ubuntu-k3s-agent`.

## References

- iximiuz custom playground docs: <https://labs.iximiuz.com/docs/playgrounds/custom-playgrounds>
- Canonical examples (Dockerfiles for every official playground): <https://github.com/iximiuz/labs/tree/main/playgrounds>
- Playgrounds 2.0 architecture write-up: <https://iximiuz.com/en/posts/iximiuz-labs-playgrounds-2.0/>

## Hard requirements the base image must meet

Inherited from `ghcr.io/iximiuz/labs/rootfs:ubuntu-24-04-*`:

- `sshd` listening on `0.0.0.0:22`
- Root user present
- systemd as PID 1

Do not put anything under `/tmp` that needs to survive mount — it is cleared during boot.
