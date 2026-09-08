# Transaction history and status

Both endpoints require the customer login token.

## History

`GET /api/transactions/history` returns up to 100 transactions, newest first. It includes transfers sent by the logged-in customer and successful transfers received by that customer's account. Each item has an `incoming` or `outgoing` direction.

The database search gets the customer and account from the login token. Supplying another customer ID or account number in the URL does not change whose records are returned.

The response does not include the MongoDB customer ID or internal document ID. It includes the local reference, recipient details, amount, transfer type, narration, status, and creation date.

## Status

`GET /api/transactions/status/{reference}` accepts the local UUID returned by the transfer endpoint. It first searches for both that reference and the logged-in customer ID. A reference belonging to someone else therefore returns 404.

When a provider reference exists, the backend asks NibssByPhoenix for the current status and saves it as `pending`, `successful`, or `failed`. When a timed-out transfer has no provider reference, the endpoint returns the saved pending status and explains that manual review is required. The transfer must not be repeated automatically.

On 8 September 2026, the status endpoint refreshed a live transfer from NibssByPhoenix and returned `successful`. The same transaction appeared in the sender's private history.

Incoming history covers transfers recorded by this application. A transfer sent from a separate application cannot appear locally unless NibssByPhoenix later provides a transaction-list endpoint or webhook.
