import { Op } from "sequelize";
import moment from "moment";
import Expense from "../models/Expense";
import ExpenseParticipant from "../models/ExpenseParticipant";
import User from "../models/User";
import emailService from "../services/email.service";
import { BadRequestError, NotFoundError } from "../utils/ApiError";

/**
 * Compute net balances for `userId` against all other users.
 *
 * For each expense:
 *  - If userId is the payer: every participant owes userId their share_amount
 *  - If userId is a participant: userId owes the payer their own share_amount
 *
 * Returns a map: { otherUserId -> { net, currency, otherUser } }
 *   net > 0  → other user owes the requesting user
 *   net < 0  → requesting user owes the other user
 */
async function computeBalances(userId) {
  // All expenses paid by userId
  const expensesPaid = await Expense.findAll({
    where: { paid_by: userId },
    include: [{ model: ExpenseParticipant, as: "participants" }],
  });

  // All expense participations of userId (where they are NOT the payer)
  const participations = await ExpenseParticipant.findAll({
    where: { user_id: userId },
    include: [{ model: Expense, as: "expense" }],
  });

  const balanceMap = {};

  const ensure = (id, currency) => {
    if (!balanceMap[id]) balanceMap[id] = { net: 0, currency };
  };

  for (const expense of expensesPaid) {
    for (const participant of expense.participants) {
      // Skip self-participation
      if (String(participant.user_id) === String(userId)) continue;
      const pid = String(participant.user_id);
      ensure(pid, expense.currency);
      balanceMap[pid].net += Number(participant.share_amount);
    }
  }

  for (const participation of participations) {
    const expense = participation.expense;
    // Skip if userId is also the payer (avoid double counting)
    if (String(expense.paid_by) === String(userId)) continue;
    const pid = String(expense.paid_by);
    ensure(pid, expense.currency);
    balanceMap[pid].net -= Number(participation.share_amount);
  }

  return balanceMap;
}

const balanceController = {
  getBalances: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const user = await User.findByPk(userId);
      if (!user) throw new NotFoundError("User not found");

      const balanceMap = await computeBalances(userId);

      // Enrich with user details
      const otherUserIds = Object.keys(balanceMap);
      if (otherUserIds.length === 0) return res.json({ balances: [] });

      const otherUsers = await User.findAll({
        where: { id: { [Op.in]: otherUserIds } },
        attributes: ["id", "name", "email"],
      });

      const userById = {};
      for (const u of otherUsers) userById[String(u.id)] = u;

      const balances = otherUserIds.map((id) => ({
        user: userById[id] || { id },
        net: Number(balanceMap[id].net.toFixed(2)),
        currency: balanceMap[id].currency,
        summary:
          balanceMap[id].net > 0
            ? `${(userById[id] || { name: id }).name} owes you`
            : balanceMap[id].net < 0
            ? `You owe ${(userById[id] || { name: id }).name}`
            : "Settled up",
      }));

      return res.json({ balances });
    } catch (err) {
      next(err);
    }
  },

  sendMonthlyReport: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const user = await User.findByPk(userId, {
        attributes: ["id", "name", "email", "default_currency"],
      });
      if (!user) throw new NotFoundError("User not found");

      const balanceMap = await computeBalances(userId);

      const otherUserIds = Object.keys(balanceMap);
      const otherUsers =
        otherUserIds.length > 0
          ? await User.findAll({
              where: { id: { [Op.in]: otherUserIds } },
              attributes: ["id", "name", "email"],
            })
          : [];

      const userById = {};
      for (const u of otherUsers) userById[String(u.id)] = u;

      const balances = otherUserIds.map((id) => ({
        otherUser: (userById[id] || { name: `User #${id}` }).name,
        net: Number(balanceMap[id].net.toFixed(2)),
        currency: balanceMap[id].currency || user.default_currency,
      }));

      const month = moment().format("MMMM YYYY");

      const result = await emailService.sendMonthlyBalanceReport({
        to: user.email,
        name: user.name,
        balances,
        month,
      });

      return res.json({
        message: `Monthly balance report sent to ${user.email}`,
        messageId: result.messageId,
        // Only present when using Ethereal test account
        ...(result.previewUrl && { previewUrl: result.previewUrl }),
      });
    } catch (err) {
      next(err);
    }
  },
};

export default balanceController;
