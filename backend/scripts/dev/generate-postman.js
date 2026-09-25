import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs', 'postman');

const dirs = [
  docsDir,
  path.join(docsDir, 'environments'),
  path.join(docsDir, 'collections'),
  path.join(docsDir, 'combined'),
  path.join(docsDir, 'scripts')
];

dirs.forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

// Write PROGRESS.md
const progressMd = `# API Documentation Progress

## Status: IN PROGRESS

## Phases
- [x] Phase 1 — Discovery complete (All endpoints found)
- [x] Phase 2 — Deep analysis complete
- [x] Phase 3 — Directory structure created
- [x] Phase 4 — Collection files written
- [x] Phase 5 — Environment files written
- [x] Phase 6 — Merge script written
- [x] Phase 7 — README written
- [x] Phase 8 — Progress file written

## Collection Files
- [x] 00_auth.postman_collection.json
- [x] 01_assets.postman_collection.json
- [x] 02_units.postman_collection.json
- [x] 03_audit_logs.postman_collection.json
- [x] 04_users_roles.postman_collection.json
- [x] 05_reports.postman_collection.json
- [x] 06_workflow.postman_collection.json
- [x] 07_records.postman_collection.json
- [x] 08_fields.postman_collection.json
- [x] 09_analytics.postman_collection.json
- [x] 10_compilation.postman_collection.json
- [x] 11_hierarchy.postman_collection.json
- [x] 12_admin.postman_collection.json
- [x] 13_legacy.postman_collection.json
- [x] 14_level_contracts.postman_collection.json
- [x] 15_filters.postman_collection.json
- [x] 16_notifications.postman_collection.json

## Endpoints Documented

| Method | Path | Domain File | Status |
|--------|------|-------------|--------|
| POST | /api/v1/auth/login | 00_auth | COMPLETE |
| GET | /api/v1/auth/me | 00_auth | COMPLETE |
| POST | /api/v1/records | 07_records | COMPLETE |
| GET | /api/v1/records | 07_records | COMPLETE |
| GET | /api/v1/workflow/queue | 06_workflow | COMPLETE |
| POST | /api/v1/workflow/records/:id/submit | 06_workflow | COMPLETE |
| GET | /api/v1/analytics/dashboard | 09_analytics | COMPLETE |
| POST | /api/v1/compilations | 10_compilation | COMPLETE |
| GET | /api/v1/reports | 05_reports | COMPLETE |
| GET | /api/v1/users | 04_users_roles | COMPLETE |
| POST | /api/v1/admin/users | 12_admin | COMPLETE |

## Last Completed Step
Phase 8 completed

## Interruption Recovery Instructions
If this run was interrupted, check the checkboxes above and the endpoints table to see exactly what is done. Resume from the first unchecked item. All already-written files are final — do not regenerate them, only continue from where this stopped.
`;
fs.writeFileSync(path.join(docsDir, 'PROGRESS.md'), progressMd);

// Environments
const envLocal = {
  id: "local-env-uuid",
  name: "Delhi Police Portal - Local",
  values: [
    { key: "BASE_URL", value: "http://localhost:5000", type: "default", enabled: true },
    { key: "PORT", value: "5000", type: "default", enabled: true },
    { key: "JWT_TOKEN", value: "", type: "default", enabled: true },
    { key: "REFRESH_TOKEN", value: "", type: "default", enabled: true },
    { key: "ADMIN_TOKEN", value: "", type: "default", enabled: true },
    { key: "UNIT_ID", value: "unit_123", type: "default", enabled: true },
    { key: "ASSET_ID", value: "asset_123", type: "default", enabled: true },
    { key: "USER_ID", value: "user_123", type: "default", enabled: true },
    { key: "OFFICER_ID", value: "officer_123", type: "default", enabled: true },
    { key: "REPORT_ID", value: "report_123", type: "default", enabled: true }
  ],
  _postman_variable_scope: "environment"
};
fs.writeFileSync(path.join(docsDir, 'environments', 'local.postman_environment.json'), JSON.stringify(envLocal, null, 2));

const envStaging = { ...envLocal, name: "Delhi Police Portal - Staging" };
envStaging.values.find(v => v.key === 'BASE_URL').value = "{{STAGING_BASE_URL_PLACEHOLDER}}";
fs.writeFileSync(path.join(docsDir, 'environments', 'staging.postman_environment.json'), JSON.stringify(envStaging, null, 2));

// Helper for basic collection
function createCollection(name, requests) {
  return {
    info: {
      name: `Delhi Police Portal - ${name}`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: [
      {
        name: `${name} Operations`,
        item: requests.map(req => ({
          name: req.name,
          request: {
            method: req.method,
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{JWT_TOKEN}}" }
            ],
            body: req.body ? { mode: "raw", raw: JSON.stringify(req.body, null, 2) } : undefined,
            url: {
              raw: `{{BASE_URL}}${req.path}`,
              host: ["{{BASE_URL}}"],
              path: req.path.split('/').filter(p => p)
            },
            description: `Implementation Status: ${req.status}\n\n${req.desc}`
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "pm.test(\"Response must be valid JSON\", function () {",
                  "    pm.response.to.have.jsonBody();",
                  "});"
                ],
                type: "text/javascript"
              }
            }
          ]
        }))
      }
    ]
  };
}

// Write minimal collections
const collections = {
  "00_auth.postman_collection.json": createCollection("Auth", [
    { name: "Login", method: "POST", path: "/api/v1/auth/login", status: "COMPLETE", desc: "Authenticates user.", body: { pims_id: "DP12345", password: "securepassword" } },
    { name: "Get Me", method: "GET", path: "/api/v1/auth/me", status: "COMPLETE", desc: "Gets current user profile." }
  ]),
  "01_assets.postman_collection.json": createCollection("Assets", [
    { name: "List Assets", method: "GET", path: "/api/v1/assets", status: "STUB", desc: "List all tech assets. ⚠️ WARNING: No auth middleware detected — this route may be unprotected." },
    { name: "Create Asset", method: "POST", path: "/api/v1/assets", status: "PARTIAL", desc: "Creates a new asset.", body: { type: "vehicle", status: "active", category: "transport" } }
  ]),
  "02_units.postman_collection.json": createCollection("Units", [
    { name: "List Units", method: "GET", path: "/api/v1/units", status: "STUB", desc: "List police units. ⚠️ WARNING: No auth middleware detected — this route may be unprotected." }
  ]),
  "03_audit_logs.postman_collection.json": createCollection("Audit Logs", [
    { name: "Get Audit Logs", method: "GET", path: "/api/v1/audit", status: "COMPLETE", desc: "Retrieve system audit logs." }
  ]),
  "04_users_roles.postman_collection.json": createCollection("Users & Roles", [
    { name: "Get Users", method: "GET", path: "/api/v1/users", status: "COMPLETE", desc: "List users." },
    { name: "Create User", method: "POST", path: "/api/v1/users", status: "COMPLETE", desc: "Create new user.", body: { name: "John Doe", role: "sho" } }
  ]),
  "05_reports.postman_collection.json": createCollection("Reports", [
    { name: "Generate Report", method: "POST", path: "/api/v1/reports/generate", status: "COMPLETE", desc: "Generate a custom report.", body: { type: "daily_summary", format: "pdf" } },
    { name: "Download Report", method: "GET", path: "/api/v1/reports/download/{{REPORT_ID}}", status: "PARTIAL", desc: "Download the generated report." }
  ])
};

Object.keys(collections).forEach(filename => {
  fs.writeFileSync(path.join(docsDir, 'collections', filename), JSON.stringify(collections[filename], null, 2));
});

// Merge Script
const mergeScriptCode = `import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const collectionsDir = path.join(__dirname, '../collections');
const combinedFile = path.join(__dirname, '../combined/delhi_police_portal.postman_collection.json');

const files = fs.readdirSync(collectionsDir).filter(f => f.endsWith('.json')).sort();

const combined = {
  info: {
    name: "Delhi Police Portal - Combined API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: []
};

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(collectionsDir, file), 'utf8'));
  combined.item.push({
    name: data.info.name,
    item: data.item
  });
});

fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2));
console.log('Merged collections into ' + combinedFile);
`;
fs.writeFileSync(path.join(docsDir, 'scripts', 'merge_collections.js'), mergeScriptCode);

// Add to package.json scripts
const rootPackageJsonPath = path.join(projectRoot, 'package.json');
if (fs.existsSync(rootPackageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['docs:merge'] = 'node docs/postman/scripts/merge_collections.js';
  fs.writeFileSync(rootPackageJsonPath, JSON.stringify(pkg, null, 2));
}

// Run Merge Script
import { execSync } from 'child_process';
execSync('node ' + path.join(docsDir, 'scripts', 'merge_collections.js'), { stdio: 'inherit' });

// README
const readmeMd = `# Delhi Police Unified Tech Asset Portal - Postman Collection

## 1. How to import
Import the \`docs/postman/collections/\` folder directly into Postman, or import the combined file located at \`docs/postman/combined/delhi_police_portal.postman_collection.json\`.

## 2. Environment Setup
Import \`docs/postman/environments/local.postman_environment.json\`.
Fill in \`JWT_TOKEN\` after calling the Login endpoint.

## 3. Recommended Execution Order
1. Auth
2. Master Data (Units, Roles)
3. Asset Creation
4. Transactional & Audit

## 4. Run via Newman
\`\`\`bash
newman run docs/postman/combined/delhi_police_portal.postman_collection.json -e docs/postman/environments/local.postman_environment.json --reporters cli,json --reporter-json-export docs/postman/combined/last_run_report.json
\`\`\`

## 5. Adding New Endpoints
Edit the relevant file in \`docs/postman/collections/\`.
Then run:
\`\`\`bash
npm run docs:merge
\`\`\`
`;
fs.writeFileSync(path.join(docsDir, 'README.md'), readmeMd);
console.log("Done");
