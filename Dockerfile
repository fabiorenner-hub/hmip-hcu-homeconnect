# Multi-arch build:
#   docker buildx build --platform linux/arm64,linux/amd64 -t hmip-plugin-homeconnect .
#
# The HCU itself is ARM64; for local development on x86_64 you can build
# without --platform and run the container natively.
ARG BASE_IMAGE=ghcr.io/homematicip/alpine-node-simple:0.0.1
FROM ${BASE_IMAGE}

# Set the working directory inside the container
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install runtime dependencies
RUN npm install --omit=dev

# Copy the application sources
COPY src ./src

# Persistent state (token + appliances cache) lives here
ENV PLUGIN_STATE_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]

# Expose the optional debug dashboard port (default 8123).
EXPOSE 8123

# Plugin entrypoint: pluginId, HCU host, auth token path
ENTRYPOINT ["node", "src/index.js", "de.kiro.plugin.homeconnect", "host.containers.internal", "/TOKEN"]

# Plugin metadata read by the HCU on container install
LABEL de.eq3.hmip.plugin.metadata=\
'{\
    "pluginId": "de.kiro.plugin.homeconnect",\
    "issuer": "Kiro Community",\
    "version": "0.4.0",\
    "hcuMinVersion": "1.4.7",\
    "scope": "LOCAL",\
    "friendlyName": {\
        "en": "Home Connect",\
        "de": "Home Connect"\
    },\
    "description": {\
        "en": "Integrates BSH Home Connect appliances (Bosch, Siemens, Gaggenau, NEFF) into Homematic IP. Provides a configuration page, program control and an optional HTML debug dashboard.",\
        "de": "Bindet BSH Home Connect Geräte (Bosch, Siemens, Gaggenau, NEFF) in Homematic IP ein. Mit umfangreicher Konfigurationsseite, Programmsteuerung und optionalem HTML Debug Dashboard."\
    },\
    "logsEnabled": true\
}'
