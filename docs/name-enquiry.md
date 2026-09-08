# Name enquiry

Name enquiry confirms who owns a recipient account before a transfer.

1. Start the app and open http://localhost:3000/api/docs/.
2. Log in through `/api/auth/login` and authorize with the returned customer token.
3. Call `GET /api/accounts/name-enquiry/{accountNumber}` using the recipient's 10-digit account number.
4. Confirm the returned name and bank code before transferring money.

The customer never supplies or sees the bank API key, secret, or provider token. The backend gets its own provider token and performs the enquiry. Invalid account numbers are rejected before calling the provider. A provider 404 becomes an account-not-found response, while malformed provider responses are rejected.

Live verification on 8 September 2026 succeeded for the existing test account and returned account name, account number and bank code. The test suite uses fake provider responses and does not make live enquiries.
