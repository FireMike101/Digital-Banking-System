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

On 7 September 2026, live authentication succeeded. One fictional Integration Test BVN was created and verified. Provider account creation with uppercase `kycType: "BVN"` returned HTTP 500; a read-only account-list check returned zero accounts. The coordinator subsequently clarified that account creation requires lowercase `"bvn"`. The adapter now converts the stored identity type to lowercase (`bvn` or `nin`) before sending it. Our earlier attribution of the failure to the provider was premature. This probe is separate from application customer records.

The user then confirmed successful account creation directly in provider Swagger with lowercase `bvn`, an `account` response envelope, and a ₦15,000 balance. On 8 September 2026, a second fictional customer completed registration, NIN onboarding, verification, and provider account creation entirely through this application. The provider returned the required ₦15,000 opening balance.

## Link an account created directly in provider Swagger

An operator can run `npm run account:link` and enter the existing **app customer email** and provider account number. This command verifies that the account is returned by the configured bank, validates its identity, and reads its balance. It links the account, onboarding record and customer verification status in one database transaction. It does not create a new provider account or credit funds.

This operator command can replace a local simulation or reconcile a pending account. It refuses to replace a different active provider account or take an account/identity already linked to another customer. It is deliberately not exposed as a public Swagger endpoint: knowing someone's account number must not let another customer claim their account.

After linking, log in normally and use `/api/auth/me`, `/api/onboarding`, `/api/accounts/me` and `/api/accounts/balance` in our Swagger. No customer password is changed by linking.

Source: [NibssByPhoenix Swagger](https://nibssbyphoenix.onrender.com/api/docs/).
