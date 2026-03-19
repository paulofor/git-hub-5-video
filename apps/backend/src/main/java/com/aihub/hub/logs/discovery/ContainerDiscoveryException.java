package com.aihub.hub.logs.discovery;

public class ContainerDiscoveryException extends RuntimeException {
    public ContainerDiscoveryException(String message) {
        super(message);
    }

    public ContainerDiscoveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
