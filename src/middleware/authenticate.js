import { createHash } from "node:crypto";
import { Session } from "../models/session.js";
import { Customer } from "../models/customer.js";

export function hashToken(token) {
  // Save a hash in MongoDB so the database does not contain usable login tokens.
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticate(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) {
    return res
      .status(401)
      .json({
        success: false,
        message: "Please provide a valid Bearer token.",
      });
  }

  const token = authorization.split(" ")[1];
  const tokenHash = hashToken(token);
  const session = await Session.findOne({ tokenHash });
  if (!session || session.expiresAt <= new Date()) {
    return res
      .status(401)
      .json({
        success: false,
        message: "Session expired or invalid. Please log in.",
      });
  }

  // Use the customer ID from the saved session, not an ID supplied in the request.
  const customer = await Customer.findById(session.customerId);
  if (!customer) {
    return res
      .status(401)
      .json({ success: false, message: "Please log in again." });
  }
  req.customer = customer;
  req.tokenHash = tokenHash;
  next();
}
