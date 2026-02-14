# Infrastructure Configuration & Error Recovery

**Updated**: 2026-02-14  
**Focus**: Fixing development environment issues observed in startup logs

## Issue 1: Redis Authentication Error

### Symptom

```text
ioredis Unhandled error event: ReplyError: WRONGPASS invalid username-password pair or user is disabled.
```

### Root Cause

Redis is running without password authentication, but the NestJS client is attempting to connect with credentials. This is a mismatch in `.env` configuration.

### Solution

**Option A: Disable Redis Auth (Development)**

1. Edit `.env`:

   ```bash
   REDIS_PASSWORD=        # Leave empty
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_ENABLE_AUTH=false
   ```

2. Verify `docker-compose.yml` has no `requirepass`:

   ```yaml
   redis:
     image: redis:7-alpine
     command: redis-server --appendonly yes  # No --requirepass
     ports:
       - "127.0.0.1:6379:6379"
   ```

3. Restart Redis:

   ```bash
   docker-compose restart redis
   ```

4. Test connection:

   ```bash
   redis-cli ping
   # Output: PONG
   ```

**Option B: Enable Redis Auth (Recommended for Production)**

1. Update `docker-compose.yml`:

   ```yaml
   redis:
     image: redis:7-alpine
     command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
     environment:
       REDIS_PASSWORD: ${REDIS_PASSWORD}
     ports:
       - "127.0.0.1:6379:6379"
   ```

2. Set strong password in `.env`:

   ```bash
   REDIS_PASSWORD=SuperSecureRedisPassword1234!
   ```

3. Restart:

   ```bash
   docker-compose down redis && docker-compose up -d redis
   ```

4. Test with password:

   ```bash
   redis-cli -p 6379 -a SuperSecureRedisPassword1234! ping
   # Output: PONG
   ```

### Verification

The error message should no longer appear in logs. Redis operations may still be disabled depending on your config, which is **fine for development**.

---

## Issue 2: RabbitMQ Management API HTTP 404

### Symptom

```text
DEBUG [MessagingMonitorService] RabbitMQ monitor failed: HTTP 404
```

### Root Cause

During initial startup, the monitoring service attempts to query the RabbitMQ Management API before it's fully initialized. This is transient and auto-recovers.

### Verification

1. Confirm RabbitMQ is healthy:

   ```bash
   curl http://localhost:15672/api/connections -u guest:guest
   # Should return JSON array of connections
   ```

2. Check logs for recovery:

   ```bash
   docker-compose logs rabbitmq | grep "succeeded\|ready\|ready"
   ```

3. Verify queue exists:

   ```bash
   curl http://localhost:15672/api/queues/%2F/element_telemetry_queue -u guest:guest | jq '.'
   ```

### No Action Required

This error is **expected and auto-recovers**. Monitoring retries every 2 seconds and succeeds once the broker initializes (~5-10 seconds after startup).

---

## Issue 3: Kafka Metadata Error at Startup

### Symptom

```text
[Connection] Response Metadata(key: 3, version: 6)
broker: localhost:9092
error: "This server does not host this topic-partition"
```

### Root Cause

Kafka Admin client queries topics before they're fully created. Transient during cluster stabilization.

### Verification

1. Confirm topics exist:

   ```bash
   docker-compose exec kafka kafka-topics.sh \
     --bootstrap-server localhost:9092 \
     --list
   # Output should include: element.raw_data
   ```

2. Check topic details:

   ```bash
   docker-compose exec kafka kafka-topics.sh \
     --bootstrap-server localhost:9092 \
     --describe --topic element.raw_data
   ```

3. Monitor partition leaders:

   ```bash
   docker-compose exec kafka kafka-metadata.sh \
     --bootstrap-server localhost:9092
   ```

### No Action Required

This error **resolves automatically** as topics are created and metadata stabilizes (~10-15 seconds after startup).

---

## Issue 4: Missing Kafka Topic at Start

### Symptom

```log
Topic 'element.raw_data' does not exist
```

### Root Cause

Topic auto-creation is enabled in `docker-compose.yml`, but may not complete before producer connects.

### Solution

Manually ensure topic creation:

```bash
docker-compose exec kafka kafka-topics.sh \
  --create \
  --bootstrap-server localhost:9092 \
  --topic element.raw_data \
  --partitions 1 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --config compression.type=snappy \
  --if-not-exists
```

Verify:

```bash
docker-compose exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe --topic element.raw_data
```

Expected output:

```text
Topic: element.raw_data
 PartitionCount: 1
 Replication Factor: 1
 Configs: compression.type=snappy,retention.ms=604800000
 Topic: element.raw_data Partition: 0 Leader: 1 ...
```

---

## Complete Docker Compose Fix

Apply these corrections to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: cosmic-horizons-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
      RABBITMQ_ERLANG_COOKIE: cosmic-horizons-secret
    ports:
      - "127.0.0.1:5672:5672"
      - "127.0.0.1:15672:15672"
    volumes:
      - cosmic-horizons-rabbitmq-data:/var/lib/rabbitmq
    networks:
      - cosmic-horizons-network
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    container_name: cosmic-horizons-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_SYNC_LIMIT: 2
      ZOOKEEPER_INIT_LIMIT: 5
    ports:
      - "127.0.0.1:2181:2181"
    volumes:
      - cosmic-horizons-zookeeper-data:/var/lib/zookeeper/data
      - cosmic-horizons-zookeeper-logs:/var/lib/zookeeper/log
    networks:
      - cosmic-horizons-network
    restart: unless-stopped

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: cosmic-horizons-kafka
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_LOG_RETENTION_BYTES: 107374182400  # 100 GB
      KAFKA_COMPRESSION_TYPE: snappy
      KAFKA_NUM_NETWORK_THREADS: 8
      KAFKA_NUM_IO_THREADS: 8
    ports:
      - "127.0.0.1:9092:9092"
    volumes:
      - cosmic-horizons-kafka-data:/var/lib/kafka/data
    networks:
      - cosmic-horizons-network
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions.sh", "--bootstrap-server", "localhost:9092"]
      interval: 5s
      timeout: 10s
      retries: 5
      start_period: 15s
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: cosmic-horizons-postgres
    environment:
      POSTGRES_USER: cosmic_horizons_user
      POSTGRES_PASSWORD: cosmic_horizons_password_dev
      POSTGRES_DB: cosmic_horizons
    ports:
      - "127.0.0.1:15432:5432"
    volumes:
      - cosmic-horizons-postgres-data:/var/lib/postgresql/data
      - ./docs/database/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - cosmic-horizons-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cosmic_horizons_user"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: cosmic-horizons-redis
    # NOTE: No requirepass — auth disabled for development
    command: >
      redis-server
      --appendonly yes
      --loglevel warning
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - cosmic-horizons-redis-data:/data
    networks:
      - cosmic-horizons-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  cosmic-horizons-rabbitmq-data:
    driver: local
  cosmic-horizons-zookeeper-data:
    driver: local
  cosmic-horizons-zookeeper-logs:
    driver: local
  cosmic-horizons-kafka-data:
    driver: local
  cosmic-horizons-postgres-data:
    driver: local
  cosmic-horizons-redis-data:
    driver: local

networks:
  cosmic-horizons-network:
    driver: bridge
```

---

## Environment Variables Reference

Create/update `.env` at repository root:

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=15432
DB_USER=cosmic_horizons_user
DB_PASSWORD=cosmic_horizons_password_dev
DB_NAME=cosmic_horizons
DB_SYNCHRONIZE=false
DB_LOGGING=false

# Authentication
JWT_SECRET=your-secret-key-dev-only
JWT_EXPIRATION=604800

# OAuth (GitHub)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# RabbitMQ (Management Plane)
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest

# Kafka (Data Plane)
KAFKA_HOST=localhost
KAFKA_PORT=9092

# Redis (Cache, no auth in dev)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_ENABLED=false

# Monitoring
LOG_LEVEL=debug
ENABLE_METRICS=false

# NRAO Integration (optional)
NRAO_API_URL=
NRAO_API_KEY=
NRAO_FEED_ENABLED=false
```

---

## Startup Sequence Verification

After fixing, verify in order:

1. **Check all services started**:

   ```bash
   docker-compose up -d
   docker-compose ps
   # All should show "Up" or "healthy"
   ```

2. **Verify RabbitMQ**:

   ```bash
   curl -u guest:guest http://localhost:15672/api/overview | jq '.rabbitmq_version'
   ```

3. **Verify Kafka**:

   ```bash
   docker-compose exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092
   ```

4. **Verify PostgreSQL**:

   ```bash
   psql -h localhost -p 15432 -U cosmic_horizons_user -d cosmic_horizons -c "SELECT version();"
   ```

5. **Verify Redis** (optional):

   ```bash
   redis-cli ping
   ```

6. **Start API**:

   ```bash
   pnpm nx serve cosmic-horizons-api
   ```

7. **Check logs for errors**:

   ```bash
   tail -f docker-compose.log | grep -i "error\|warning"
   ```

---

## Expected Log Output (Clean Startup)

```text
[Nest] 70324  - 02/13/2026, 8:30:52 PM     LOG [InstanceLoader] MessagingModule dependencies initialized +1ms
[Nest] 70324  - 02/13/2026, 8:30:52 PM     LOG [MessagingGateway] Messaging WebSocket Gateway Initialized
[Nest] 70324  - 02/13/2026, 8:30:52 PM     LOG [ClientProxy] Successfully connected to RMQ broker
[Nest] 70324  - 02/13/2026, 8:30:52 PM     LOG [MessagingIntegrationService] Connected to RabbitMQ
[Nest] 70324  - 02/13/2026, 8:30:53 PM     LOG [MessagingIntegrationService] Kafka topics ensured (element.raw_data)
[Nest] 70324  - 02/13/2026, 8:30:52 PM     LOG 🚀 Application is running on: http://localhost:3000/api
```

---

## Testing the Fix

```bash
# 1. Verify infrastructure
docker-compose ps

# 2. Register test user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","username":"testuser"}'

# 3. Get stats (should show healthy infrastructure)
TOKEN="<from-response>"
curl http://localhost:3000/api/messaging/stats -H "Authorization: Bearer $TOKEN" | jq '.infra'

# Expected: all connected: true
```

---

## References

- [LIVE-STATISTICS-FEB-2026.md](./LIVE-STATISTICS-FEB-2026.md) — Actual system measurements
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Detailed diagnostics
- [KAFKA-SETUP.md](./KAFKA-SETUP.md) — Kafka configuration
- [RABBITMQ-SETUP.md](./RABBITMQ-SETUP.md) — RabbitMQ configuration
