# syntax=docker/dockerfile:1

FROM maven:3.9.6-eclipse-temurin-21 AS build

# Force Maven to prefer TLS 1.2 during dependency resolution. Some
# environments (including the build agents running our deployment GitHub
# Action) intermittently terminate TLS 1.3 handshakes with Maven Central,
# causing the build step to fail while downloading the Spring Boot parent
# POM. Restricting the negotiated protocol to TLS 1.2 keeps the connection
# stable without relaxing any certificate validation.
ENV MAVEN_OPTS="-Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2"
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=build /workspace/target/hub-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
