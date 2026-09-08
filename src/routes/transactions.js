import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { Account } from '../models/account.js';
import { Transaction } from '../models/transaction.js';
import { getProviderAccountName, getProviderBalance, sendProviderTransfer } from '../services/provider-banking.js';

export const transactionRouter = Router();
transactionRouter.use(authenticate);
transactionRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

transactionRouter.post('/transfer', async (req, res) => {
  const { recipientAccount, amount, narration = '' } = req.body ?? {};
  const allowedFields = ['recipientAccount', 'amount', 'narration'];

  if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some((key) => !allowedFields.includes(key))) {
    return res.status(400).json({ success: false, message: 'Send only recipientAccount, amount, and optional narration.' });
  }
  if (typeof recipientAccount !== 'string' || !/^\d{10}$/.test(recipientAccount)) {
    return res.status(400).json({ success: false, message: 'Recipient account must contain exactly 10 digits.' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000 ||
      !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    return res.status(400).json({ success: false, message: 'Amount must be positive and have no more than two decimal places.' });
  }
  if (typeof narration !== 'string' || narration.length > 100) {
    return res.status(400).json({ success: false, message: 'Narration must be text with at most 100 characters.' });
  }

  const sender = await Account.findOne({ customerId: req.customer._id });
  if (!sender || sender.mode !== 'nibss' || sender.status !== 'active') {
    return res.status(403).json({ success: false, message: 'An active provider account is required to transfer money.' });
  }
  if (sender.accountNumber === recipientAccount) {
    return res.status(400).json({ success: false, message: 'You cannot transfer money to the same account.' });
  }
  if (!/^\d{3}$/.test(process.env.NIBSS_BANK_CODE ?? '')) {
    return res.status(503).json({ success: false, message: 'The bank code has not been configured.' });
  }

  let recipient;
  let balanceKobo;
  try {
    // Confirm the recipient again inside the transfer route instead of trusting a name sent by the customer.
    recipient = await getProviderAccountName(recipientAccount);
    balanceKobo = await getProviderBalance(sender.accountNumber);
  } catch (error) {
    return res.status(error.status ?? 502).json({ success: false, message: error.message });
  }
  const amountKobo = Math.round(amount * 100);
  if (balanceKobo < amountKobo) {
    return res.status(400).json({ success: false, message: 'Insufficient funds.' });
  }

  const transaction = await Transaction.create({
    customerId: req.customer._id,
    reference: randomUUID(),
    sourceAccount: sender.accountNumber,
    recipientAccount,
    recipientName: recipient.accountName,
    recipientBankCode: recipient.bankCode,
    transferType: recipient.bankCode === process.env.NIBSS_BANK_CODE ? 'intra-bank' : 'inter-bank',
    amountKobo,
    narration: narration.trim(),
  });

  try {
    transaction.providerReference = await sendProviderTransfer(sender.accountNumber, recipientAccount, amount);
    transaction.status = 'successful';
    await transaction.save();
  } catch (error) {
    // A timeout is uncertain: the provider may still have completed the transfer.
    transaction.status = error.status === 504 || error.status === 502 ? 'pending' : 'failed';
    await transaction.save();
    return res.status(error.status ?? 502).json({
      success: false,
      message: transaction.status === 'pending'
        ? 'Transfer result is uncertain. Check the transaction status before trying again.'
        : error.message,
      reference: transaction.reference,
      status: transaction.status,
    });
  }

  res.status(201).json({
    success: true,
    transaction: {
      reference: transaction.reference,
      providerReference: transaction.providerReference,
      recipientAccount: transaction.recipientAccount,
      recipientName: transaction.recipientName,
      recipientBankCode: transaction.recipientBankCode,
      transferType: transaction.transferType,
      amount: transaction.amountKobo / 100,
      narration: transaction.narration,
      status: transaction.status,
    },
  });
});
