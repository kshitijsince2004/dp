// SuperTokens frontend init (replaces the manual localStorage token + axios refresh logic).
// Header transfer mode keeps a bearer token in the browser exactly like the old JWT, but the
// SDK now stores it, attaches it, and refreshes it automatically via the axios interceptors
// added in utils/api.js.
import SuperTokens from 'supertokens-web-js';
import Session from 'supertokens-web-js/recipe/session';

// VITE_API_URL is expected to be the API base (for example http://localhost:5000/api or
// http://localhost:5000/api/v1). SuperTokens needs the ORIGIN plus the auth base path, so we
// strip a trailing /api or /api/v1 to get the domain and pin apiBasePath to match the backend.
const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const apiDomain = rawBase.replace(/\/api(\/v1)?\/?$/, '') || window.location.origin;

export const initSuperTokensWeb = () => {
  SuperTokens.init({
    appInfo: {
      appName: 'PHAROS',
      apiDomain,
      apiBasePath: '/api/v1/auth',
    },
    recipeList: [
      Session.init({
        tokenTransferMethod: 'header',
      }),
    ],
  });
};

export default initSuperTokensWeb;
