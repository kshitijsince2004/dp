// SuperTokens frontend init (replaces the manual localStorage token + axios refresh logic).
// Header transfer mode keeps a bearer token in the browser exactly like the old JWT, but the
// SDK now stores it, attaches it, and refreshes it automatically via the axios interceptors
// added in utils/api.js.
import SuperTokens from 'supertokens-web-js';
import Session from 'supertokens-web-js/recipe/session';

import { getApiOrigin } from './apiBase.js';

const apiDomain = getApiOrigin();

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
