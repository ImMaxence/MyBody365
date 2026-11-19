# ── build ─────────────────────────────────────────────────────────────────────
# Exact versions (1.14): a security update is a visible change, a cached base image never keeps an old one
FROM eclipse-temurin:25.0.5_8-jdk-alpine AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B package -DskipTests

# ── runtime ───────────────────────────────────────────────────────────────────
FROM eclipse-temurin:25.0.5_8-jre-alpine
ENV PORT=8080 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"
# cwebp: photos and pictures are stored as WebP (the app falls back to JPEG without it)
RUN apk add --no-cache libwebp-tools && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/actuator/health | grep -q '"UP"' || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
