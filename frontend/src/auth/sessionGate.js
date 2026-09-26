import Session from 'supertokens-web-js/recipe/session';

export const SESSION_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
};

let inFlight = null;

function isUnreachable(err) {
  if (!err) return false;
  if (err.response) return false;
  const message = String(err.message || '');
  return (
    err.code === 'ERR_NETWORK'
    || err.code === 'ECONNREFUSED'
    || message.includes('Network Error')
    || message.includes('Failed to fetch')
    || message.includes('ERR_CONNECTION_REFUSED')
    || message.includes('ECONNREFUSED')
  );
}

/**
 * One in-flight session probe for the whole app.
 * SuperTokens refreshes the access token inside doesSessionExist when it is
 * expired. Sharing the promise stops every route and hook from starting its
 * own POST /session/refresh.
 */
export function probeSession() {
  if (!inFlight) {
    inFlight = Session.doesSessionExist()
      .then((exists) => (
        exists ? SESSION_STATUS.AUTHENTICATED : SESSION_STATUS.UNAUTHENTICATED
      ))
      .catch((err) => (
        isUnreachable(err) ? SESSION_STATUS.UNAVAILABLE : SESSION_STATUS.UNAUTHENTICATED
      ))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
