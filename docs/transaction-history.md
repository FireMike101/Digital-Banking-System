# Transaction history and status

Both endpoints require the customer login token.

## History

`GET /api/transactions/history` returns up to 100 transactions, newest first. The database search always uses the customer ID from the login token. Supplying another customer ID in the URL does not change whose records are returned.

The response does not include the MongoDB customer ID or internal document ID. It includes the local reference, recipient details, amount, transfer type, narration, status, and creation date.

## Status

`GET /api/transactions/status/{reference}` accepts the local UUID returned by the transfer endpoint. It first searches for both that reference and the logged-in customer ID. A reference belonging to someone else therefore returns 404.

When a provider reference exists, the backend asks NibssByPhoenix for the current status and saves it as `pending`, `successful`, or `failed`. When a timed-out transfer has no provider reference, the endpoint returns the saved pending status and explains that manual review is required. The transfer must not be repeated automatically.

The provider status response for a successful transfer has not yet been confirmed live because no live transfer has been made. Tests cover `success`, `successful`, `completed`, `pending`, `processing`, `failed`, `failure`, and `reversed` provider values using fake responses.
