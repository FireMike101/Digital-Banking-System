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

A local transaction with a unique reference is saved before calling the provider. Confirmed transfers are marked `successful`. Clear provider rejections are marked `failed`. Provider timeouts and invalid success responses remain `pending`, because repeating an uncertain transfer could send the money twice.

On 8 September 2026, a live ₦100 intra-bank transfer succeeded through this application. The sender balance changed from ₦15,000 to ₦14,900, the recipient balance changed from ₦15,000 to ₦15,100, and NibssByPhoenix returned provider reference `TX1788900961274`.

On the same day, a live ₦100 inter-bank transfer also succeeded through this application. Name enquiry confirmed account `2957343904` at bank `295`. The transfer was identified as `inter-bank`, the sender balance changed from ₦14,900 to ₦14,800, transaction status returned `successful`, and NibssByPhoenix returned provider reference `TX1788905975356`.

Automated tests use fake provider responses and do not move funds.
