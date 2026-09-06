# Local test accounts

While bank credentials are pending, account creation and balance checks run locally in MongoDB. These are simulated accounts. They are not registered with NibssByPhoenix and cannot send money to colleagues' provider accounts. The assignment's provider account integration is still outstanding.

## Try in Swagger

1. Run `npm run dev` and open http://localhost:3000/api/docs/.
2. Log in and paste the login token into **Authorize**.
3. Complete the existing test BVN/NIN creation and verification steps. These identity routes still use the provider's public sandbox endpoints; they do not require the bank credentials. Account creation does not bypass verification.
4. Under **Local test accounts**, run `POST /api/accounts` with no body. Expect 201 and a balance of 15000 naira, with `mode: local-test`.
5. Use `GET /api/accounts/me` for your account details or `GET /api/accounts/balance` for the balance.

A repeated account creation returns 409 and does not add money. An unverified customer gets 403. Account details and balances always belong to the logged-in customer; request parameters cannot select another customer's account.

The schema stores 1500000 kobo (₦15,000) as the initial balance. Money is stored as integers to avoid decimal rounding problems. MongoDB unique indexes enforce one account per customer and unique account numbers. The server waits for those indexes before accepting requests.

`npm test` uses fake storage to check route behavior and validates model defaults without connecting to Atlas. These tests do not verify real database index enforcement.
