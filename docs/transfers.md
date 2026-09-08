# Funds transfer

Use `POST /api/transactions/transfer` after logging in and authorizing in Swagger.

```json
{
  "recipientAccount": "8700000000",
  "amount": 1000,
  "narration": "Test transfer"
}
```

The backend gets the sender account from the customer login. It performs name enquiry again, reads the live sender balance, and sends only `from`, `to`, and `amount` to NibssByPhoenix. Customers cannot choose another sender account.

The recipient bank code determines the type:

- The same bank code as `NIBSS_BANK_CODE` is an `intra-bank` transfer.
- A different bank code is an `inter-bank` transfer.

The amount must be positive, no greater than ₦1 billion, and have at most two decimal places. Self-transfers, unsupported fields, insufficient funds, inactive accounts, and invalid recipients are rejected.

A local transaction with a unique reference is saved before calling the provider. Confirmed transfers are marked `successful`. Clear provider rejections are marked `failed`. Provider timeouts and invalid success responses remain `pending`, because repeating an uncertain transfer could send the money twice. Transaction status checking will be added next.

The automated tests use fake provider responses and do not move funds. A live transfer still requires a second test account and an amount chosen for testing.
