import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { BenefitsService } from "./benefits.service.js";
import type { WalletBalanceResponse, DebitWalletInput, CreditWalletInput, RefundWalletInput } from "./benefits.service.js";
import crypto from "crypto";

// In-memory store for pending topups (in production, use Redis or database)
// Map: orderId -> { walletId, category, expectedAmount, employeeId }
const pendingTopups = new Map<string, { walletId: string; category: string; expectedAmount: number; employeeId: string }>();

const walletBalanceResponseSchema = z.object({
  walletId: z.string().uuid(),
  employeeId: z.string().uuid(),
  policyYearStart: z.string().date(),
  policyYearEnd: z.string().date(),
  categories: z.array(z.object({
    category: z.enum(["consultation", "medicine", "lab_test"]),
    annualLimit: z.number().int().nonnegative(),
    spent: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
  })).length(3),
  totalAnnualLimit: z.number().int().nonnegative(),
  totalSpent: z.number().int().nonnegative(),
  totalAvailable: z.number().int().nonnegative(),
});

const transactionHistoryQuerySchema = z.object({
  category: z.enum(["consultation", "medicine", "lab_test"]).optional(),
  type: z.enum(["debit", "credit", "refund", "expiry_snapshot", "adjustment"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
});

const initiateTopupSchema = z.object({
  category: z.enum(["consultation", "medicine", "lab_test"]),
  amount: z.number().int().positive(),
});

const bulkAssignPolicySchema = z.object({
  policyId: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).min(1).max(500),
  effectiveFrom: z.string().date().optional(),
});

const transactionHistoryResponseSchema = z.object({
  transactions: z.array(z.object({
    id: z.string().uuid(),
    category: z.enum(["consultation", "medicine", "lab_test"]),
    type: z.enum(["debit", "credit", "refund", "expiry_snapshot", "adjustment"]),
    amount: z.number().int(),
    balanceAfter: z.number().int(),
    categoryLimitAtTxn: z.number().int().nonnegative(),
    sourceType: z.string(),
    sourceId: z.string().uuid().nullable(),
    description: z.string().nullable(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
  })),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
  }),
});

export class BenefitsController {
  constructor(private readonly service: BenefitsService) {}

  // ==================== EMPLOYEE WALLET ENDPOINTS ====================

  async getMyWalletBalance(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      const user = (req as any).user;
      const employeeId = user.uid;

      const balance = await this.service.getWalletBalance(employeeId);
      return reply.send(balance);
    } catch (error) {
      logger.error({ err: error, employeeId: (req as any).user?.uid }, "Get wallet balance error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async getMyTransactionHistory(
    req: FastifyRequest<{ Querystring: z.infer<typeof transactionHistoryQuerySchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = transactionHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters", details: parsed.error.issues });
    }

    try {
      const user = (req as any).user;
      const employeeId = user.uid;

      const wallet = await this.service.getWalletByEmployee(employeeId);
      if (!wallet) {
        return reply.code(404).send({ error: "No active wallet found" });
      }

      const transactions = await this.service.getWalletTransactions(wallet.id, parsed.data);
      const total = await this.service.getTransactionCount(wallet.id, parsed.data);

      return reply.send({
        transactions,
        pagination: {
          limit: parsed.data.limit,
          offset: parsed.data.offset,
          total,
        },
      });
    } catch (error) {
      logger.error({ err: error, employeeId: (req as any).user?.uid }, "Get transaction history error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async initiateTopup(
    req: FastifyRequest<{ Body: z.infer<typeof initiateTopupSchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = initiateTopupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.issues });
    }

    try {
      const user = (req as any).user;
      const employeeId = user.uid;

      const wallet = await this.service.getWalletByEmployee(employeeId);
      if (!wallet) {
        return reply.code(404).send({ error: "No active wallet found" });
      }

      const category = await this.service.getWalletCategory(wallet.id, parsed.data.category);
      if (!category) {
        return reply.code(404).send({ error: "Category not found" });
      }

      // Check if top-up would exceed limit
      const spent = await this.service.getCategorySpent(wallet.id, parsed.data.category);
      if (category.annualLimit - spent + parsed.data.amount > category.annualLimit) {
        return reply.code(400).send({ error: "Top-up would exceed annual limit" });
      }

      // Create Razorpay order (placeholder - integrate with Razorpay SDK)
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store pending topup with idempotency key
      // In production, create a pending_topups table with TTL
      pendingTopups.set(orderId, {
        walletId: wallet.id,
        category: parsed.data.category,
        expectedAmount: parsed.data.amount,
        employeeId,
      });

      return reply.send({
        orderId,
        amount: parsed.data.amount,
        currency: "INR",
        category: parsed.data.category,
        walletId: wallet.id,
      });
    } catch (error) {
      logger.error({ err: error, employeeId: (req as any).user?.uid }, "Initiate topup error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  // ==================== RAZORPAY WEBHOOK ====================

  async handleTopupCallback(
    req: FastifyRequest<{ Body: any }>,
    reply: FastifyReply,
  ) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("RAZORPAY_WEBHOOK_SECRET not configured");
      return reply.code(500).send({ error: "Webhook secret not configured" });
    }

    // Verify webhook signature
    const signature = req.headers["x-razorpay-signature"] as string;
    if (!signature) {
      logger.warn("Missing Razorpay webhook signature");
      return reply.code(400).send({ error: "Missing signature" });
    }

    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      logger.warn({ signature, expectedSignature }, "Invalid Razorpay webhook signature");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    const payload = req.body;
    const event = payload.event;

    // Only process payment.captured events
    if (event !== "payment.captured") {
      logger.info({ event }, "Ignoring non-payment.captured webhook event");
      return reply.send({ status: "ignored" });
    }

    const payment = payload.payload.payment.entity;
    const paymentId = payment.id;
    const orderId = payment.order_id;
    const employeeId = payment.notes?.employee_id;
    const category = payment.notes?.category;
    const walletId = payment.notes?.wallet_id;
    const amount = payment.amount; // amount in paise

    if (!paymentId || !orderId || !employeeId || !category || !walletId) {
      logger.warn({ paymentId, orderId, employeeId, category, walletId }, "Missing required metadata in webhook");
      return reply.code(400).send({ error: "Missing required metadata" });
    }

    // Convert amount from paise to rupees (integer rupees)
    const amountInRupees = Math.floor(amount / 100);

    try {
      // Look up pending topup to verify amount matches
      const pendingTopup = pendingTopups.get(orderId);
      if (!pendingTopup) {
        logger.warn({ orderId, paymentId }, "No pending topup found for order");
        return reply.code(400).send({ error: "Invalid or expired order" });
      }

      // Validate amount matches expected amount
      if (pendingTopup.expectedAmount !== amountInRupees) {
        logger.warn({ orderId, paymentId, expected: pendingTopup.expectedAmount, actual: amountInRupees }, "Amount mismatch in webhook");
        return reply.code(400).send({ error: "Amount mismatch" });
      }

      // Validate walletId and category match
      if (pendingTopup.walletId !== walletId) {
        logger.warn({ orderId, paymentId, expectedWallet: pendingTopup.walletId, actualWallet: walletId }, "Wallet mismatch in webhook");
        return reply.code(400).send({ error: "Wallet mismatch" });
      }
      if (pendingTopup.category !== category) {
        logger.warn({ orderId, paymentId, expectedCategory: pendingTopup.category, actualCategory: category }, "Category mismatch in webhook");
        return reply.code(400).send({ error: "Category mismatch" });
      }

      // Idempotency check: check if transaction with this payment_id already exists
      const existingTxn = await this.service.getTransactionByPaymentId(paymentId);
      if (existingTxn) {
        logger.info({ paymentId }, "Payment already processed, skipping");
        // Clean up pending topup
        pendingTopups.delete(orderId);
        return reply.send({ status: "already_processed" });
      }

      // Credit the wallet
      await this.service.creditWallet({
        walletId,
        category,
        amount: amountInRupees,
        sourceType: "topup",
        sourceId: paymentId,
        description: `Razorpay top-up via order ${orderId}`,
        createdBy: employeeId,
      });

      // Clean up pending topup
      pendingTopups.delete(orderId);

      logger.info({ paymentId, orderId, employeeId, walletId, amount: amountInRupees }, "Wallet credited via Razorpay webhook");
      return reply.send({ status: "success" });
    } catch (error) {
      logger.error({ err: error, paymentId, orderId }, "Wallet credit failed");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  // ==================== COMPANY ADMIN ENDPOINTS ====================

  async getCompanyPolicies(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "company_admin") {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    try {
      const policies = await this.service.getCompanyPolicies(req.params.companyId);
      return reply.send({ policies });
    } catch (error) {
      logger.error({ err: error }, "Get company policies error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async createCompanyPolicy(
    req: FastifyRequest<{ Params: { companyId: string }; Body: any }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "company_admin") {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    // Verify company ownership
    if (user.claims?.companyId !== req.params.companyId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    try {
      const policy = await this.service.createPolicyForCompany(req.params.companyId, req.body);
      return reply.code(201).send({ policy });
    } catch (error) {
      logger.error({ err: error }, "Create company policy error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async bulkAssignPolicy(
    req: FastifyRequest<{ Params: { companyId: string }; Body: z.infer<typeof bulkAssignPolicySchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = bulkAssignPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.issues });
    }

    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "company_admin") {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    if (user.claims?.companyId !== req.params.companyId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    try {
      const result = await this.service.bulkAssignPolicy(
        req.params.companyId,
        parsed.data.policyId,
        parsed.data.employeeIds,
        parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : undefined,
      );
      return reply.send(result);
    } catch (error) {
      logger.error({ err: error }, "Bulk assign policy error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async getCompanyWallets(
    req: FastifyRequest<{ Params: { companyId: string }; Querystring: { limit?: string; offset?: string } }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "company_admin") {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    if (user.claims?.companyId !== req.params.companyId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit ?? "20"), 100);
      const offset = parseInt(req.query.offset ?? "0");
      const result = await this.service.getCompanyWallets(req.params.companyId, limit, offset);
      return reply.send(result);
    } catch (error) {
      logger.error({ err: error }, "Get company wallets error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async getCompanyWalletDetail(
    req: FastifyRequest<{ Params: { companyId: string; walletId: string } }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "company_admin") {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    if (user.claims?.companyId !== req.params.companyId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    try {
      const wallet = await this.service.getWalletById(req.params.walletId);
      if (!wallet) {
        return reply.code(404).send({ error: "Wallet not found" });
      }

      // Verify wallet belongs to this company
      const employee = await this.service.getEmployeeById(wallet.employeeId);
      if (!employee || employee.companyId !== req.params.companyId) {
        return reply.code(403).send({ error: "Access denied" });
      }

      const balance = await this.service.getWalletBalance(employee.id);
      const transactions = await this.service.getWalletTransactions(wallet.id, { limit: 50 });

      return reply.send({ wallet: balance, transactions });
    } catch (error) {
      logger.error({ err: error }, "Get company wallet detail error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  // ==================== PLATFORM ADMIN ENDPOINTS ====================

  async runPolicyYearEndSnapshot(
    req: FastifyRequest<{ Body: { policyYearEnd: string } }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "platform_admin") {
      return reply.code(403).send({ error: "Platform admin access required" });
    }

    try {
      const policyYearEnd = new Date(req.body.policyYearEnd);
      const results = await this.service.runPolicyYearEndSnapshot(policyYearEnd);
      return reply.send({ results });
    } catch (error) {
      logger.error({ err: error }, "Run policy year-end snapshot error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }

  async getExpirySnapshots(
    req: FastifyRequest<{ Querystring: { policyYearEnd?: string; employeeId?: string } }>,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (user.claims?.["https://pulsenode.ai/user_type"] !== "admin" || user.claims?.role !== "platform_admin") {
      return reply.code(403).send({ error: "Platform admin access required" });
    }

    try {
      if (req.query.policyYearEnd) {
        const snapshots = await this.service.getExpirySnapshotsByPolicyYear(new Date(req.query.policyYearEnd));
        return reply.send({ snapshots });
      }
      if (req.query.employeeId) {
        const snapshots = await this.service.getExpirySnapshotsByEmployee(req.query.employeeId);
        return reply.send({ snapshots });
      }
      return reply.code(400).send({ error: "policyYearEnd or employeeId query parameter required" });
    } catch (error) {
      logger.error({ err: error }, "Get expiry snapshots error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  }
}