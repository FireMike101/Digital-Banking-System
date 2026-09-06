# Digital Banking System

Step 1: Express server and MongoDB connection. Customer and banking endpoints will be added in subsequent steps.

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
