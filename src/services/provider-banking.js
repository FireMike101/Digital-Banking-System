const baseUrl = 'https://nibssbyphoenix.onrender.com';

function providerError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function request(path, method, body, token) {
  let response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw providerError(504, 'NibssByPhoenix could not be reached. Do not repeat an uncertain account creation.');
  }
  if (!response.ok) {
    // Keep provider messages private: they can include internal information.
    throw providerError(502, `NibssByPhoenix returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw providerError(502, 'NibssByPhoenix returned an unreadable response.');
  }
}

export async function getProviderToken() {
  const apiKey = process.env.NIBSS_API_KEY;
  const apiSecret = process.env.NIBSS_API_SECRET;
  if (!apiKey || !apiSecret) throw providerError(503, 'Bank API credentials have not been configured.');
  const result = await request('/api/auth/token', 'POST', { apiKey, apiSecret });
  if (typeof result?.token !== 'string' || !result.token) {
    throw providerError(502, 'NibssByPhoenix did not return a valid authentication token.');
  }
  // This is the bank's token, not a customer login token. Never return it to customers.
  return result.token;
}

export function toKobo(balance) {
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0 ||
      !Number.isSafeInteger(Math.round(balance * 100)) || Math.abs(balance * 100 - Math.round(balance * 100)) > 0.000001) {
    throw providerError(502, 'NibssByPhoenix returned an invalid balance.');
  }
  return Math.round(balance * 100);
}

export async function createProviderAccount(onboarding, token) {
  const result = await request('/api/account/create', 'POST', {
    // The provider requires lowercase values even though we store BVN/NIN internally.
    kycType: onboarding.type.toLowerCase(), kycID: onboarding.testId, dob: onboarding.dob,
  }, token);
  // Swagger omits response schemas. Accept these common envelopes but validate their contents.
  const account = result?.account ?? result?.data?.account ?? result?.data ?? result;
  if (!account || typeof account.accountNumber !== 'string' || !/^\d{10}$/.test(account.accountNumber) ||
      typeof account.accountName !== 'string' || !account.accountName.trim()) {
    throw providerError(502, 'Provider account response is incomplete. Check the provider before retrying.');
  }
  const balanceKobo = toKobo(account.balance);
  return { accountNumber: account.accountNumber, accountName: account.accountName, balanceKobo };
}

export async function getProviderBalance(accountNumber) {
  const token = await getProviderToken();
  const result = await request(`/api/account/balance/${encodeURIComponent(accountNumber)}`, 'GET', undefined, token);
  const data = result?.data ?? result;
  return toKobo(data?.balance);
}

export async function findProviderAccount(accountNumber) {
  const token = await getProviderToken();
  const result = await request('/api/accounts', 'GET', undefined, token);
  if (!Array.isArray(result?.accounts)) throw providerError(502, 'Provider account list is invalid.');
  // Only consider accounts returned for this bank's authenticated token.
  const account = result.accounts.find((item) => item.accountNumber === accountNumber);
  if (!account) throw providerError(404, 'This account was not found in the configured bank.');
  return account;
}

export async function getProviderIdentity(type, testId) {
  if (!['bvn', 'nin'].includes(type)) throw providerError(502, 'Provider identity type is invalid.');
  const result = await request(type === 'bvn' ? '/api/validateBvn' : '/api/validateNin', 'POST', { [type]: testId });
  const identity = result?.data;
  if (result?.success !== true || identity?.[type] !== testId ||
      typeof identity.firstName !== 'string' || typeof identity.lastName !== 'string' ||
      typeof identity.dob !== 'string' || Number.isNaN(Date.parse(identity.dob))) {
    throw providerError(502, 'Provider did not confirm the saved identity.');
  }
  return identity;
}
