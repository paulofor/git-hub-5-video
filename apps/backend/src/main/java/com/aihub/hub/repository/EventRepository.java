package com.aihub.hub.repository;

import com.aihub.hub.domain.EventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EventRepository extends JpaRepository<EventEntity, Long> {
    Optional<EventEntity> findByDeliveryId(String deliveryId);
}
