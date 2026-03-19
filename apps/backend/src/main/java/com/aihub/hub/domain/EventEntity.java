package com.aihub.hub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "events")
public class EventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String repo;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "delivery_id", nullable = false)
    private String deliveryId;

    @Column(name = "payload", nullable = false, columnDefinition = "LONGTEXT")
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    private String payload;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt = Instant.now();

    public EventEntity() {
    }

    public EventEntity(String repo, String eventType, String deliveryId, String payload) {
        this.repo = repo;
        this.eventType = eventType;
        this.deliveryId = deliveryId;
        this.payload = payload;
    }

    public Long getId() {
        return id;
    }

    public String getRepo() {
        return repo;
    }

    public String getEventType() {
        return eventType;
    }

    public String getDeliveryId() {
        return deliveryId;
    }

    public String getPayload() {
        return payload;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }
}
