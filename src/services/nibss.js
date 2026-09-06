// These public sandbox identity endpoints are documented without authentication.
// Bank credentials will be needed later for account creation and transfers.
const baseUrl = 'https://nibssbyphoenix.onrender.com';

export async function postToNibss(path, body, expectedStatus) {
  let response;
  try {
    response = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    // Do not retry automatically: a timeout does not prove the provider rejected the request.
    const error = new Error('The identity provider could not be reached. Check your onboarding status before retrying.');
    error.status = 504;
    throw error;
  }

  if (response.status !== expectedStatus) {
    const error = new Error('The identity provider did not confirm this operation.');
    error.status = 502;
    // These responses clearly reject the input. A fresh creation attempt can then be allowed.
    error.rejected = [400, 401, 403, 404, 409, 422].includes(response.status);
    throw error;
  }
  // The provider's Swagger documents success through HTTP status codes, with no response schema.
}
