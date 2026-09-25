// SuperTokens initialisation (replaces the custom JWT auth in utils/generateToken.js).
//
// Recipes:
//   - Session:   session management (access + refresh), header transfer method so the
//                browser keeps a bearer token exactly like the previous JWT model.
//   - UserRoles: roles + permissions ARE the RBAC source of truth. Roles and the
//                permission catalog are seeded into the SuperTokens Core at startup
//                (see modules/auth/rbac.seed.js + rbac.catalog.js). When UserRoles is
//                initialised, every new session automatically carries the st-role and
//                st-perm claims, which the middleware reads.
//
// Jurisdiction scope (ps_id / district_id / sub_div_id) is NOT a SuperTokens concept and
// stays application-managed: it is written into the session access-token payload at login
// (see modules/auth/auth.controller.js) and read back by enforceScope / verifyRecordAccess,
// so those middlewares keep working unchanged.
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import UserRoles from 'supertokens-node/recipe/userroles';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let initialised = false;

export const initSuperTokens = () => {
  if (initialised) return;
  supertokens.init({
    framework: 'express',
    supertokens: {
      connectionURI: env.SUPERTOKENS_CONNECTION_URI,
      // apiKey is required only when the Core is configured with API_KEYS (production).
      apiKey: env.SUPERTOKENS_API_KEY || undefined,
    },
    appInfo: {
      appName: 'PHAROS',
      apiDomain: env.API_DOMAIN,
      websiteDomain: env.WEBSITE_DOMAIN,
      // Keep SuperTokens' own routes (/session/refresh, /signout) under the same prefix
      // the app already serves auth under, so the frontend hits one base path.
      apiBasePath: '/api/v1/auth',
      websiteBasePath: '/login',
    },
    recipeList: [
      Session.init({
        // Bearer/header tokens (no cookies): the closest 1:1 replacement for the old
        // localStorage JWT. The frontend SDK stores and refreshes them automatically.
        getTokenTransferMethod: () => 'header',
      }),
      UserRoles.init(),
    ],
  });
  initialised = true;
  logger.info('[SuperTokens] initialised', { connectionURI: env.SUPERTOKENS_CONNECTION_URI });
};

export default initSuperTokens;
