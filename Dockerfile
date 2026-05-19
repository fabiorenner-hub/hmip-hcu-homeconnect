# Multi-arch build:
#   docker buildx build --platform linux/arm64,linux/amd64 -t hmip-plugin-homeconnect .
#
# The HCU itself is ARM64; for local development on x86_64 you can build
# without --platform and run the container natively.
ARG BASE_IMAGE=ghcr.io/homematicip/alpine-node-simple:0.0.1
FROM ${BASE_IMAGE}

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PLUGIN_STATE_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8123

ENTRYPOINT ["node", "src/index.js", "de.kiro.plugin.homeconnect", "host.containers.internal", "/TOKEN"]

LABEL de.eq3.hmip.plugin.metadata="{\"pluginId\":\"de.kiro.plugin.homeconnect\",\"issuer\":\"Fabio Renner\",\"version\":\"0.5.0\",\"hcuMinVersion\":\"1.4.7\",\"scope\":\"LOCAL\",\"friendlyName\":{\"en\":\"Home Connect\",\"de\":\"Home Connect\"},\"description\":{\"en\":\"Integrates BSH Home Connect appliances (Bosch, Siemens, Gaggenau, NEFF) into Homematic IP. Provides a configuration page, program control and an optional HTML debug dashboard. GitHub: https://github.com/fabiorenner-hub/hmip-hcu-homeconnect - Donate via PayPal: https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C\",\"de\":\"Bindet BSH Home Connect Geraete (Bosch, Siemens, Gaggenau, NEFF) in Homematic IP ein. Mit umfangreicher Konfigurationsseite, Programmsteuerung und optionalem HTML Debug Dashboard. GitHub: https://github.com/fabiorenner-hub/hmip-hcu-homeconnect - Spenden via PayPal: https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C\"},\"settings\":[],\"changelog\":\"0.5.0 - Plugin icon, GitHub link and PayPal donation hint added to plugin metadata, README and HCU description.\\n0.4.0 - Initial public release.\",\"logsEnabled\":true}"
