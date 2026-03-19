package com.aihub.hub.logs.discovery;

import com.aihub.hub.domain.EnvironmentRecord;

public interface ContainerDiscoveryService {

    ContainerDiscoveryResult discover(EnvironmentRecord environment);
}
