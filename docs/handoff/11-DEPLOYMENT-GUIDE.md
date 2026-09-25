# PHAROS — Production Deployment Guide
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** DevOps, System Administrators, Security Engineers  
**Status:** Prototype Production Hardening Guide

---

## 1. Pre-Production Hardening Checklist

Before deploying PHAROS into any operational Delhi Police environment, complete the following steps:

- [ ] **Cryptographic Secrets:**
  - Generate a secure `JWT_SECRET` (minimum 64 characters random alphanumeric).
  - Generate a distinct `JWT_REFRESH_SECRET` (minimum 64 characters).
- [ ] **Network & Domain Configuration:**
  - Set `FRONTEND_URL` to the exact production FQDN (e.g., `https://pharos.delhipolice.gov.in`).
  - Configure `ipAllowlistMiddleware` in `backend/src/middleware/ipAllowlist.middleware.js` with authorized Delhi Police internal CIDR blocks.
- [ ] **Database & Connection Pooling:**
  - Use a dedicated managed PostgreSQL 16 instance.
  - Configure connection pooling (Knex pool min: 5, max: 30 depending on concurrency).
  - Set up automated daily WAL / pg_dump backup routines.
- [ ] **Storage for Generated Reports:**
  - Mount a shared persistent volume or object storage (MinIO / S3) for `REPORTS_DIR` to support multi-instance API deployments.
- [ ] **Docker Image Tagging:**
  - Pin all image tags in `docker-compose.yml` (replace `:latest` or `:alpine` with specific version tags like `postgres:16.3-alpine3.20`).
- [ ] **Log Management & Rotation:**
  - Enable Winston log rotation (max files: 14 days, max size: 50MB) to prevent disk exhaustion.
  - Ship logs via Syslog / FluentBit to central SIEM.
- [ ] **Authentication & SSO:**
  - If integrating with Police Keycloak/SSO, configure `KEYCLOAK_URL`, `KEYCLOAK_REALM`, and `KEYCLOAK_CLIENT_ID`.
  - Otherwise, confirm JWT-only mode with active rate limiting and refresh token rotation.
- [ ] **Artifact Cleanup:**
  - Remove any legacy SQLite development files (`database.sqlite`).
  - Clear `backend/logs/*.log` files before packaging.

---

## 2. Production Environment Variables

### Backend (`/etc/pharos/backend.env`)
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://pharos.delhipolice.gov.in

DATABASE_URL=postgresql://pharos_user:STRONG_PASSWORD_HERE@pg-cluster.internal:5432/pharos_prod_db
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=30

RABBITMQ_URL=amqp://pharos_app:STRONG_MQ_PASS@rabbitmq.internal:5672
REDIS_URL=redis://:STRONG_REDIS_PASS@redis.internal:6379

JWT_SECRET=GENERATED_64_CHAR_ACCESS_SECRET
JWT_REFRESH_SECRET=GENERATED_64_CHAR_REFRESH_SECRET
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

REPORTS_DIR=/var/lib/pharos/reports
LOG_LEVEL=info
```

### Frontend (`/etc/pharos/frontend.env`)
```env
VITE_API_URL=https://pharos.delhipolice.gov.in/api
```

---

## 3. Reverse Proxy & Nginx Configuration

A standard production topology uses Nginx as a reverse proxy, SSL terminator, and static asset server:

```nginx
# /etc/nginx/conf.d/pharos.conf

upstream pharos_api {
    server 127.0.0.1:5000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name pharos.delhipolice.gov.in;

    ssl_certificate /etc/ssl/certs/pharos.crt;
    ssl_certificate_key /etc/ssl/private/pharos.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend Static Assets
    location / {
        root /var/www/pharos-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://pharos_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        client_max_body_size 50M;
    }

    # SSE Notifications Stream
    location /api/v1/notifications/stream {
        proxy_pass http://pharos_api;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 4. Process Management

### Using PM2 for Node.js API (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: 'pharos-api',
      script: './index.js',
      cwd: '/opt/pharos/backend',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=2048'
    },
    {
      name: 'pharos-worker',
      script: 'python3',
      args: 'main.py',
      cwd: '/opt/pharos/python_worker',
      instances: 2,
      exec_mode: 'fork',
      restart_delay: 5000
    }
  ]
};
```

---

## 5. Migration Execution Strategy

Always run migrations **before** traffic is routed to newly deployed container images:

```bash
# In deployment pipeline:
cd /opt/pharos/backend
npm run db:migrate
npm run sync-config
# Only reload PM2 after migrations complete successfully
pm2 reload ecosystem.config.cjs
```

---

## 6. Health & Monitoring

| Component | Endpoint / Metric | Healthy Criteria |
|---|---|---|
| API Health | `GET /api/health` | HTTP 200 `{ "success": true }` |
| Database | PostgreSQL connection pool | Active connections < 80% pool max |
| Message Broker | RabbitMQ `aliveness-test` | Queue latency < 500ms |
| Audit Chain | `GET /api/v1/audit/chain-verify` | All stations return `valid: true` |
| System Logs | `/var/log/pharos/` | Zero unhandled exception stacktraces |
