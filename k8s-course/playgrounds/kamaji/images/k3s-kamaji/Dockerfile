# syntax=docker/dockerfile:1
#
# Prebaked rootfs for the `mgmt-cp` machine of the Kamaji playground:
# k3s server + Helm + cert-manager + Kamaji pre-installed.
#
# Start FROM the official iximiuz Labs rootfs. The kernel is injected by the
# platform at boot — this image ships only userspace + systemd services.

# The iximiuz Labs base rootfs. Tag variants published at
# https://github.com/iximiuz/labs/pkgs/container/labs%2Frootfs — use the
# floating `ubuntu-24-04` for iterating, pin to `ubuntu-24-04-<sha>` for
# reproducible builds.
ARG ROOTFS_TAG=ubuntu-24-04
FROM ghcr.io/iximiuz/labs/rootfs:${ROOTFS_TAG}

ARG K3S_VERSION=v1.31.0+k3s1
ARG HELM_VERSION=v3.16.2
ARG CERT_MANAGER_VERSION=v1.16.1
ARG KAMAJI_CHART_VERSION=1.0.0
ARG LAB_USER=laborant

USER root

# ----- k3s (server, single-node, no traefik, kubeconfig world-readable) -----
# SKIP_ENABLE/SKIP_START because systemd isn't running inside `docker build`;
# we manually symlink the unit into multi-user.target.wants so k3s starts on boot.
RUN curl -sfL https://get.k3s.io | \
      INSTALL_K3S_VERSION=${K3S_VERSION} \
      INSTALL_K3S_EXEC="--disable=traefik --write-kubeconfig-mode=644 --tls-san=172.16.0.2" \
      INSTALL_K3S_SKIP_ENABLE=true \
      INSTALL_K3S_SKIP_START=true \
      sh - && \
    ln -sf /etc/systemd/system/k3s.service \
      /etc/systemd/system/multi-user.target.wants/k3s.service

# ----- Helm + kubeadm + kubectl on the mgmt node -----
RUN set -eux; \
    curl -fsSL https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz \
      | tar -xz -C /tmp && \
    install -m 0755 /tmp/linux-amd64/helm /usr/local/bin/helm && \
    rm -rf /tmp/linux-amd64; \
    install -d /etc/apt/keyrings; \
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key \
      | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg; \
    echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' \
      > /etc/apt/sources.list.d/kubernetes.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends kubeadm kubectl; \
    rm -rf /var/lib/apt/lists/*

# ----- Stage the Helm charts so they can be installed offline on first boot.
# We do NOT run `helm install` here because k3s is not running during build.
RUN set -eux; \
    helm repo add jetstack https://charts.jetstack.io; \
    helm repo add clastix  https://clastix.github.io/charts; \
    helm repo update; \
    mkdir -p /opt/kamaji/charts; \
    helm pull jetstack/cert-manager --version ${CERT_MANAGER_VERSION} -d /opt/kamaji/charts; \
    helm pull clastix/kamaji        --version ${KAMAJI_CHART_VERSION} -d /opt/kamaji/charts

# ----- First-boot installer: brings up k3s, then applies cert-manager + Kamaji
COPY install-kamaji.sh /usr/local/bin/install-kamaji.sh
COPY kamaji-bootstrap.service /etc/systemd/system/kamaji-bootstrap.service
RUN chmod 0755 /usr/local/bin/install-kamaji.sh && \
    ln -sf /etc/systemd/system/kamaji-bootstrap.service \
      /etc/systemd/system/multi-user.target.wants/kamaji-bootstrap.service

# ----- laborant user kubeconfig (populated by install-kamaji.sh on first boot) -----
RUN install -d -o ${LAB_USER} -g ${LAB_USER} /home/${LAB_USER}/.kube

USER ${LAB_USER}
