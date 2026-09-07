# NibssByPhoenix accounts

The server uses `NIBSS_API_KEY` and `NIBSS_API_SECRET` from your environment to request a bank token. This token is used only between our server and NibssByPhoenix. Swagger's Authorize button still takes your customer login token.

## Use in Swagger

1. Restart with `npm run dev` after changing environment variables.
2. Open http://localhost:3000/api/docs/ and authorize with your customer login token.
3. Complete test BVN/NIN verification for that customer.
4. Call `POST /api/accounts/provider` with no body to create a provider account.
5. If the customer already has a local test account, explicitly replace it by sending `{ "replaceLocalTestAccount": true }`. Its simulated balance does not transfer to NibssByPhoenix.
6. Use `GET /api/accounts/me` and `GET /api/accounts/balance` to read the provider balance. No stale local balance is returned when the provider fails.

The old `POST /api/accounts` remains a local simulation and is labelled that way in Swagger. One customer can have only one account record across both modes.

Provider creation reserves that customer's account before sending the request. Failed or uncertain responses leave it pending and block another creation request. `/api/accounts/me` shows this status. Provider support or reconciliation is required to resolve a pending attempt; there is no automatic reset endpoint.

We do not add ₦15,000 locally to provider accounts. `openingFundingMatchesRequirement` indicates whether the actual opening balance returned by the provider equals ₦15,000. A different amount needs investigation with the provider.

## Validation and current limitation

On 7 September 2026, live authentication succeeded. One fictional Integration Test BVN was created and verified. Provider account creation then returned HTTP 500; a read-only account-list check returned zero accounts. The failed creation was not retried. This probe is separate from application customer records.

Therefore provider account creation, balance response shapes and opening funding are **not yet confirmed live**. The provider's Swagger omits response-body schemas. The adapter currently accepts account fields `accountNumber`, `accountName`, and numeric `balance`, directly or inside an `account`/`data` envelope. Missing or invalid fields cause a safe error and keep creation pending. Mock tests validate these expected shapes, not a successful live provider response.

Source: [NibssByPhoenix Swagger](https://nibssbyphoenix.onrender.com/api/docs/).
