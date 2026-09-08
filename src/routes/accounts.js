import { Router } from "express";
import { randomUUID } from "node:crypto";
import { authenticate } from "../middleware/authenticate.js";
import { Account } from "../models/account.js";
import { Onboarding } from "../models/onboarding.js";
import {
  createProviderAccount,
  getProviderToken,
  getProviderBalance,
  getProviderAccountName,
} from "../services/provider-banking.js";

export const accountRouter = Router();
accountRouter.use(authenticate);
accountRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function accountDetails(account) {
  if (account.status === "pending")
    return { mode: account.mode, status: "pending" };
  return {
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    balance: account.balanceKobo / 100,
    currency: account.currency,
    mode: account.mode,
    status: account.status ?? "active",
    openingBalance:
      account.openingBalanceKobo === undefined
        ? undefined
        : account.openingBalanceKobo / 100,
  };
}

accountRouter.post("/", async (req, res) => {
  if (
    req.body !== undefined &&
    (typeof req.body !== "object" ||
      req.body === null ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length > 0)
  ) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Send an empty JSON object when creating an account.",
      });
  }
  const onboarding = await Onboarding.findOne({ customerId: req.customer._id });
  if (
    req.customer.onboardingStatus !== "verified" ||
    onboarding?.status !== "verified"
  ) {
    return res
      .status(403)
      .json({
        success: false,
        message: "Complete BVN or NIN verification first.",
      });
  }
  const existing = await Account.findOne({ customerId: req.customer._id });
  if (existing) {
    return res
      .status(409)
      .json({
        success: false,
        message: "You already have an account or an account request is pending.",
      });
  }
  let token;
  try {
    // Authenticate before reserving the account so bad credentials do not leave a pending record.
    token = await getProviderToken();
  } catch (error) {
    return res
      .status(error.status ?? 502)
      .json({ success: false, message: error.message });
  }

  let account;
  const pending = {
    mode: "nibss",
    status: "pending",
    balanceKobo: 0,
    accountNumber: `pending-${randomUUID()}`,
    accountName: `${onboarding.firstName} ${onboarding.lastName}`,
  };
  try {
    // Reserve the same customer's account before the external call to prevent duplicate creation.
    account = await Account.create({ customerId: req.customer._id, ...pending });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({
          success: false,
          message: "An account request already exists.",
        });
    throw error;
  }
  try {
    const created = await createProviderAccount(onboarding, token);
    account.accountNumber = created.accountNumber;
    account.accountName = created.accountName;
    account.balanceKobo = created.balanceKobo;
    account.openingBalanceKobo = created.balanceKobo;
    account.status = "active";
    await account.save();
  } catch (error) {
    // Even HTTP 500 can happen after creation. Keep the reservation; never silently retry or fund locally.
    return res
      .status(error.status ?? 502)
      .json({
        success: false,
        message:
          "Provider account creation could not be confirmed. Check with the provider before retrying.",
        status: "pending",
      });
  }
  res
    .status(201)
    .json({
      success: true,
      account: accountDetails(account),
      openingFundingMatchesRequirement: account.openingBalanceKobo === 1500000,
    });
});

accountRouter.get("/me", async (req, res) => {
  // Always look up the owner from the login token, never from request parameters.
  const account = await Account.findOne({ customerId: req.customer._id });
  if (!account)
    return res
      .status(404)
      .json({
        success: false,
        message: "You have not created an account yet.",
      });
  if (account.mode === "nibss" && account.status === "active") {
    try {
      account.balanceKobo = await getProviderBalance(account.accountNumber);
    } catch (error) {
      return res
        .status(error.status ?? 502)
        .json({ success: false, message: error.message });
    }
  }
  res.json({ success: true, account: accountDetails(account) });
});

accountRouter.get("/balance", async (req, res) => {
  const account = await Account.findOne({ customerId: req.customer._id });
  if (!account)
    return res
      .status(404)
      .json({
        success: false,
        message: "You have not created an account yet.",
      });
  if (account.status === "pending")
    return res
      .status(409)
      .json({
        success: false,
        message: "Provider account creation is still unconfirmed.",
      });
  if (account.mode === "nibss") {
    try {
      account.balanceKobo = await getProviderBalance(account.accountNumber);
    } catch (error) {
      return res
        .status(error.status ?? 502)
        .json({ success: false, message: error.message });
    }
  }
  res.json({
    success: true,
    balance: account.balanceKobo / 100,
    currency: account.currency,
    mode: account.mode,
  });
});

accountRouter.get("/name-enquiry/:accountNumber", async (req, res) => {
  const { accountNumber } = req.params;
  if (!/^\d{10}$/.test(accountNumber)) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Account number must contain exactly 10 digits.",
      });
  }
  try {
    const account = await getProviderAccountName(accountNumber);
    res.json({ success: true, account });
  } catch (error) {
    res
      .status(error.status ?? 502)
      .json({ success: false, message: error.message });
  }
});
