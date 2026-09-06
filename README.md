# Digital Banking System

Completed: Express setup, MongoDB connection, customer authentication, Swagger documentation and test BVN/NIN onboarding. Bank account creation comes next.

## Requirements

- Node.js 22 or newer
- A running MongoDB Community Server or a MongoDB Atlas database
- MongoDB Compass (optional GUI for viewing the database)

Compass is a database client; installing Compass alone does not start a MongoDB server.

## Run locally

1. Run `npm install`.
2. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell).
3. Set `MONGODB_URI` in `.env` to your database connection URI. The default assumes a local MongoDB server on port 27017.
4. Run `npm run dev`.
5. Open http://localhost:3000/api/health. A connected database returns HTTP 200 with `success: true`.

Connect Compass using the same MongoDB URI. The `digital_banking` database may not appear until we store the first document.

## Files

- `src/app.js`: Express middleware, health endpoint, and JSON error responses.
- `src/server.js`: database connection, HTTP startup, and graceful shutdown.
- `src/config/env.js`: environment variable validation.
- `.env.example`: example configuration; actual credentials belong only in ignored `.env`.

## Current error handling

Unknown routes return 404, malformed JSON returns 400, and JSON bodies larger than 16 KB return 413. Unexpected errors return a generic 500 response. The server refuses to start if its database connection fails, and health checks return 503 if the connection is lost later.

This is an initial foundation, not a finished banking service. Use only synthetic BVN/NIN data throughout the assignment. Never commit credentials or real identity data.

## Step 2: Registration and login

### Swagger documentation

With the server running, open http://localhost:3000/api/docs/ for interactive API documentation. The OpenAPI JSON is at `/api/docs.json`.

Use **Try it out** to register and log in. Copy the login token, click **Authorize**, and paste only the token. You can then test protected routes such as `/api/auth/me`. Reloading the page clears Swagger's saved authorization.

A customer login is different from a bank account. Registering here does not verify a BVN/NIN or create a funded bank account.

The main files are:

- `src/models/customer.js`: describes the customer data stored in MongoDB.
- `src/models/session.js`: stores logins and their expiry times.
- `src/routes/auth.js`: registration, login, profile and logout routes.
- `src/middleware/authenticate.js`: checks a login token before allowing access.

### Try it in Postman

Start the server with `npm run dev`. Choose Body → raw → JSON for POST requests.

1. Send `POST http://localhost:3000/api/auth/register` with:

```json
{
  "fullName": "Test Customer",
  "email": "customer@example.com",
  "password": "testing-password-123"
}
```

Expect status 201. The password is hashed before saving; the response excludes the hash. Emails are trimmed and lowercased. A repeated email returns 409.

2. Send `POST http://localhost:3000/api/auth/login` with:

```json
{
  "email": "customer@example.com",
  "password": "testing-password-123"
}
```

Copy the returned `token`. It is valid for one hour.

3. Send `GET http://localhost:3000/api/auth/me`. In Postman's Authorization tab, choose Bearer Token and paste the token. This returns only the customer associated with that login.
4. Send `POST http://localhost:3000/api/auth/logout` using the same Authorization setting. That token can no longer access the profile.

Invalid input returns 400. Invalid login credentials, missing tokens and expired sessions return 401. Registration and login share a limit of 20 requests per IP address every 15 minutes (429 when exceeded).

The rate limit is stored in this server's memory and resets on restart. Multiple server instances would need shared rate-limit storage. Use HTTPS when deploying so passwords and tokens are encrypted in transit.

### Tests

Run `npm test`. These HTTP tests replace database calls with temporary test data; they do not read `.env` or connect to Atlas. They cover validation, password hashing, duplicate-email handling, login, profile ownership, expiry, logout and rate limiting. They do not verify real MongoDB connectivity or index enforcement; use the Postman steps with your development database for that check.

Password hashing uses [bcryptjs](https://github.com/dcodeIO/bcrypt.js). Express 5 forwards errors thrown by async routes to our shared [error handler](https://expressjs.com/en/guide/error-handling/). MongoDB enforces unique emails through an index, not a Mongoose validation check; see [Mongoose's explanation](https://mongoosejs.com/docs/validation.html#the-unique-option-is-not-a-validator).

## Step 3: Test identity onboarding

Log in and authorize in Swagger first. Send `POST /api/onboarding` with fictional details:

```json
{
  "type": "BVN",
  "firstName": "Test",
  "lastName": "Customer",
  "dob": "1995-06-15",
  "phone": "08000000000"
}
```

For NIN, set `type` to `NIN`; phone is not required. Our server generates an 11-digit test number. Do not enter any real BVN/NIN; fields for supplying identity numbers are rejected.

After a 201 response, send `POST /api/onboarding/verify` with the same login token and no body. Only successful provider verification changes the customer's status to `verified`. This still does not create a bank account or fund it.

`GET /api/onboarding` returns only your onboarding type and status:

- `null`: no onboarding record exists yet.
- `pending`: creation has started, but success has not been saved. If a request timed out, the provider outcome must be reconciled before continuing. There is no automatic reset or retry of uncertain creation in this version.
- `created`: the provider confirmed creation; verification can run.
- `verified`: verification succeeded.

Duplicate creation requests return 409. A definite provider rejection removes the local pending record so corrected details can be submitted. Network failures and uncertain provider responses keep the pending record to avoid creating duplicate identities. Verification failures leave the customer unverified and can be retried after the problem is resolved.

The integration follows [NibssByPhoenix Swagger](https://nibssbyphoenix.onrender.com/api/docs/): `/api/insertBvn` returns 201, `/api/insertNin` returns 200, and `/api/validateBvn` and `/api/validateNin` return 200 on success. Its schema does not define response bodies, so this version uses those documented status codes. These identity routes are documented without authentication. Bank onboarding and credentials are a separate step before account creation.

Onboarding tests mock the provider and MongoDB. They never submit identities to the shared provider, read environment files or access Atlas. A live provider integration check remains to be done with your fictional test customer.
