# Digital Banking System

A beginner-friendly banking backend built with Node.js, Express and MongoDB. It integrates with NibssByPhoenix for fictional BVN/NIN onboarding, account creation and core banking operations.

The API supports customer registration, login, identity verification, one funded account per customer, name enquiry, intra-bank and inter-bank transfers, balance checks, transaction status checks and private transaction history.

## Technologies

- Node.js
- Express
- MongoDB Atlas and MongoDB Compass
- Mongoose
- NibssByPhoenix API
- Swagger UI
- Node.js test runner

## Main features

- Customer registration and login
- Password hashing with `bcryptjs`
- Login sessions that expire after one hour
- Fictional BVN or NIN creation and verification
- Provider account creation only after successful verification
- Maximum of one account per customer
- ₦15,000 opening balance supplied by NibssByPhoenix
- Recipient name enquiry before transfers
- Intra-bank and inter-bank transfers
- Live account balance checks
- Transaction status checks
- Private incoming and outgoing transaction history
- Swagger documentation for testing every customer endpoint

## Requirements

- Node.js 22 or newer
- A MongoDB Atlas database
- MongoDB Compass if you want to inspect the database visually
- NibssByPhoenix API key, API secret, bank code and bank name

MongoDB Compass is a visual database client. The application still needs a MongoDB connection URI from Atlas or another running MongoDB server.

## Setup

1. Clone the repository.
2. Open a terminal in the project folder.
3. Install the dependencies:

```bash
npm install
```

4. Create a `.env` file using `.env.example` as a guide:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
NIBSS_API_KEY=your_api_key
NIBSS_API_SECRET=your_api_secret
NIBSS_BANK_CODE=your_three_digit_bank_code
NIBSS_BANK_NAME=your_registered_bank_name
```

Never commit `.env`. It is ignored by Git because it contains private credentials.

5. Start the development server:

```bash
npm run dev
```

The terminal should display:

```text
MongoDB connected successfully.
Server running on http://localhost:3000
Swagger docs: http://localhost:3000/api/docs/
```

## Swagger documentation

Open [http://localhost:3000/api/docs/](http://localhost:3000/api/docs/) while the server is running. The OpenAPI JSON is available at [http://localhost:3000/api/docs.json](http://localhost:3000/api/docs.json).

For protected endpoints:

1. Register a customer.
2. Log in and copy the returned token.
3. Click **Authorize** in Swagger.
4. Paste only the token.
5. Run the remaining endpoints in the order below.

## Recommended API flow

| Step | Method and endpoint | Purpose |
| --- | --- | --- |
| 1 | `POST /api/auth/register` | Register an application customer |
| 2 | `POST /api/auth/login` | Get a customer login token |
| 3 | `POST /api/onboarding` | Create a fictional BVN or NIN |
| 4 | `POST /api/onboarding/verify` | Verify the created identity |
| 5 | `POST /api/accounts` | Create the customer's provider account |
| 6 | `GET /api/accounts/me` | View the logged-in customer's account |
| 7 | `GET /api/accounts/balance` | Get the live provider balance |
| 8 | `GET /api/accounts/name-enquiry/{accountNumber}` | Confirm a recipient's details |
| 9 | `POST /api/transactions/transfer` | Send an intra-bank or inter-bank transfer |
| 10 | `GET /api/transactions/status/{reference}` | Refresh a transfer's status |
| 11 | `GET /api/transactions/history` | View private incoming and outgoing history |

## Example requests

Register a customer:

```json
{
  "fullName": "Ada Test",
  "email": "ada.test@example.com",
  "password": "testing-password-123"
}
```

Create a fictional BVN:

```json
{
  "type": "BVN",
  "firstName": "Ada",
  "lastName": "Test",
  "dob": "1995-06-15",
  "phone": "08000000000"
}
```

The application generates the fictional 11-digit BVN or NIN. It rejects identity numbers supplied by customers so real BVN/NIN data is not submitted accidentally.

Create an account after verification:

```json
{}
```

Transfer funds:

```json
{
  "recipientAccount": "1234567890",
  "amount": 100,
  "narration": "Test transfer"
}
```

## Data privacy

The backend gets the customer ID from the login token. Customers cannot select another customer ID when viewing profiles, onboarding records, accounts, balances or transaction history.

Transaction history includes transfers sent by the customer and successful transfers received by their account. Internal MongoDB IDs and customer IDs are not returned in transaction responses.

Passwords are hashed before storage. Session tokens and provider credentials are not returned by protected banking endpoints.

## Error handling and edge cases

The application handles these cases:

- Invalid registration and login details
- Duplicate customer emails
- Missing, invalid and expired login tokens
- Real or customer-supplied BVN/NIN values
- Invalid dates, phone numbers and onboarding details
- Account creation before identity verification
- More than one account for the same customer
- Duplicate requests arriving at the same time
- Missing provider credentials
- Invalid or incomplete provider responses
- Invalid recipient account numbers
- Self-transfers
- Invalid amounts and more than two decimal places
- Insufficient balance
- Provider timeouts and uncertain transfer results
- Access to another customer's account, status or history
- Invalid JSON, oversized request bodies and unknown routes

An uncertain account creation remains `pending` to prevent accidentally creating a second account. An uncertain transfer also remains `pending` so the customer checks its status instead of sending the money twice.

## Testing

Run the automated tests with:

```bash
npm test
```

The tests mock MongoDB and NibssByPhoenix, so they do not read `.env`, use real credentials or move money.

Live tests with fictional customers have also confirmed:

- BVN and NIN creation and verification
- Account creation with the required ₦15,000 opening balance
- Name enquiry
- Balance checks
- Intra-bank transfer
- Inter-bank transfer
- Transaction status
- Private transaction history

## Project structure

```text
src/
  docs/          Swagger definition
  middleware/    Customer authentication
  models/        MongoDB models
  routes/        Express API routes
  services/      NibssByPhoenix integration
  utils/         Safe database error messages
  app.js         Express application
  server.js      MongoDB connection and server startup
scripts/         One-time bank registration and account-linking tools
test/            Automated tests
docs/            Extra implementation and testing notes
```

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start with automatic restart after file changes |
| `npm start` | Start normally |
| `npm test` | Run the automated tests |
| `npm run bank:register` | Register a bank with NibssByPhoenix |
| `npm run account:link` | Safely link an account created directly in provider Swagger |

## Notes

- Use only fictional BVN/NIN and customer information for this project.
- NibssByPhoenix requires lowercase `bvn` or `nin` during provider account creation. The application converts the customer's saved type automatically.
- The server uses Cloudflare DNS for Atlas SRV lookups because the original development network could not resolve them through its default DNS server.
- Incoming history covers transfers recorded by this application. Transfers sent from a different application require a future provider transaction-list endpoint or webhook to appear locally.

Provider documentation: [NibssByPhoenix Swagger](https://nibssbyphoenix.onrender.com/api/docs/)
