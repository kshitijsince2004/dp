# Delhi Police Unified Tech Asset Portal - Postman Collection

## 1. How to import
Import the `docs/postman/collections/` folder directly into Postman, or import the combined file located at `docs/postman/combined/delhi_police_portal.postman_collection.json`.

## 2. Environment Setup
Import `docs/postman/environments/local.postman_environment.json`.
Fill in `JWT_TOKEN` after calling the Login endpoint.

## 3. Recommended Execution Order
1. Auth
2. Master Data (Units, Roles)
3. Asset Creation
4. Transactional & Audit

## 4. Run via Newman
```bash
newman run docs/postman/combined/delhi_police_portal.postman_collection.json -e docs/postman/environments/local.postman_environment.json --reporters cli,json --reporter-json-export docs/postman/combined/last_run_report.json
```

## 5. Adding New Endpoints
Edit the relevant file in `docs/postman/collections/`.
Then run:
```bash
npm run docs:merge
```
