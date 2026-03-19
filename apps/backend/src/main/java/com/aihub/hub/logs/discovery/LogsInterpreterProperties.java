package com.aihub.hub.logs.discovery;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hub.logs.interpreter")
public class LogsInterpreterProperties {

    private Discovery discovery = new Discovery();

    public Discovery getDiscovery() {
        return discovery;
    }

    public void setDiscovery(Discovery discovery) {
        this.discovery = discovery;
    }

    public static class Discovery {
        private DiscoveryMode mode = DiscoveryMode.MOCK;
        private Docker docker = new Docker();

        public DiscoveryMode getMode() {
            return mode;
        }

        public void setMode(DiscoveryMode mode) {
            this.mode = mode;
        }

        public Docker getDocker() {
            return docker;
        }

        public void setDocker(Docker docker) {
            this.docker = docker;
        }
    }

    public static class Docker {
        private String host = "unix:///var/run/docker.sock";
        private boolean tlsVerify;
        private String certPath;
        private String environmentLabel = "aihub.environment";

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public boolean isTlsVerify() {
            return tlsVerify;
        }

        public void setTlsVerify(boolean tlsVerify) {
            this.tlsVerify = tlsVerify;
        }

        public String getCertPath() {
            return certPath;
        }

        public void setCertPath(String certPath) {
            this.certPath = certPath;
        }

        public String getEnvironmentLabel() {
            return environmentLabel;
        }

        public void setEnvironmentLabel(String environmentLabel) {
            this.environmentLabel = environmentLabel;
        }
    }
}
