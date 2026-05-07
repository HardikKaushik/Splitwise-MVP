import { Op } from "sequelize";
import moment from "moment";
import * as yup from "yup";
import Expense from "../models/Expense";
import ExpenseParticipant from "../models/ExpenseParticipant";
import User from "../models/User";
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from "../utils/ApiError";

const expenseSchema = yup.object().shape({
  name: yup.string().required("Name is required"),
  value: yup.number().positive("Value must be positive").required("Value is required"),
  currency: yup.string().max(10).required("Currency is required"),
  date: yup.string().required("Date is required"),
  members: yup
    .array()
    .of(
      yup.object().shape({
        user_id: yup.number().required("member user_id is required"),
        share_amount: yup.number().positive("share_amount must be positive").required("share_amount is required"),
      })
    )
    .min(1, "At least one member is required")
    .required("Members are required"),
  description: yup.string(),
});

const expenseController = {
  addExpense: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      await expenseSchema.validate(req.body, { abortEarly: false });

      const { name, value, currency, date, members, description } = req.body;

      // Validate total share equals expense value
      const totalShare = members.reduce((sum, m) => sum + Number(m.share_amount), 0);
      if (Math.abs(totalShare - Number(value)) > 0.01) {
        throw new BadRequestError(
          `Sum of member share amounts (${totalShare}) must equal expense value (${value})`
        );
      }

      // Validate all member user IDs exist
      const memberIds = members.map((m) => m.user_id);
      const users = await User.findAll({ where: { id: memberIds } });
      if (users.length !== memberIds.length) {
        throw new BadRequestError("One or more member user IDs do not exist");
      }

      const expense = await Expense.create({
        name,
        value,
        currency,
        date,
        paid_by: userId,
        description,
      });

      const participants = await ExpenseParticipant.bulkCreate(
        members.map((m) => ({
          expense_id: expense.id,
          user_id: m.user_id,
          share_amount: m.share_amount,
        }))
      );

      return res.status(201).json({
        ...expense.toJSON(),
        participants,
      });
    } catch (err) {
      if (err.name === "ValidationError" && err.inner) {
        return next(new ValidationError(err.inner.map((e) => e.message).join(", ")));
      }
      next(err);
    }
  },

  getExpense: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const { id } = req.params;

      const expense = await Expense.findByPk(id, {
        include: [
          { model: User, as: "paidByUser", attributes: ["id", "name", "email"] },
          {
            model: ExpenseParticipant,
            as: "participants",
            include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
          },
        ],
      });

      if (!expense) throw new NotFoundError("Expense not found");

      // Only participants or the payer can view the expense
      const isParticipant = expense.participants.some((p) => String(p.user_id) === String(userId));
      const isPayer = String(expense.paid_by) === String(userId);
      if (!isParticipant && !isPayer) throw new ForbiddenError("Access denied");

      return res.json(expense);
    } catch (err) {
      next(err);
    }
  },

  updateExpense: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const { id } = req.params;
      const expense = await Expense.findByPk(id, {
        include: [{ model: ExpenseParticipant, as: "participants" }],
      });

      if (!expense) throw new NotFoundError("Expense not found");
      if (String(expense.paid_by) !== String(userId)) {
        throw new ForbiddenError("Only the payer can update this expense");
      }

      const { name, value, currency, date, description, members } = req.body;

      if (members) {
        if (value !== undefined) {
          const totalShare = members.reduce((sum, m) => sum + Number(m.share_amount), 0);
          if (Math.abs(totalShare - Number(value)) > 0.01) {
            throw new BadRequestError(
              `Sum of member share amounts (${totalShare}) must equal expense value (${value})`
            );
          }
        }

        const memberIds = members.map((m) => m.user_id);
        const users = await User.findAll({ where: { id: memberIds } });
        if (users.length !== memberIds.length) {
          throw new BadRequestError("One or more member user IDs do not exist");
        }

        await ExpenseParticipant.destroy({ where: { expense_id: id } });
        await ExpenseParticipant.bulkCreate(
          members.map((m) => ({
            expense_id: expense.id,
            user_id: m.user_id,
            share_amount: m.share_amount,
          }))
        );
      }

      await expense.update({
        ...(name && { name }),
        ...(value !== undefined && { value }),
        ...(currency && { currency }),
        ...(date && { date }),
        ...(description !== undefined && { description }),
      });

      const updated = await Expense.findByPk(id, {
        include: [
          { model: User, as: "paidByUser", attributes: ["id", "name", "email"] },
          {
            model: ExpenseParticipant,
            as: "participants",
            include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
          },
        ],
      });

      return res.json(updated);
    } catch (err) {
      if (err.name === "ValidationError" && err.inner) {
        return next(new ValidationError(err.inner.map((e) => e.message).join(", ")));
      }
      next(err);
    }
  },

  deleteExpense: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const { id } = req.params;
      const expense = await Expense.findByPk(id);

      if (!expense) throw new NotFoundError("Expense not found");
      if (String(expense.paid_by) !== String(userId)) {
        throw new ForbiddenError("Only the payer can delete this expense");
      }

      await ExpenseParticipant.destroy({ where: { expense_id: id } });
      await expense.destroy();

      return res.json({ message: "Expense deleted successfully" });
    } catch (err) {
      next(err);
    }
  },

  getActivityLog: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const { period, start_date, end_date } = req.query;

      let dateFilter = {};

      if (period === "current_month") {
        dateFilter = {
          date: {
            [Op.gte]: moment().startOf("month").format("YYYY-MM-DD"),
            [Op.lte]: moment().endOf("month").format("YYYY-MM-DD"),
          },
        };
      } else if (period === "last_month") {
        dateFilter = {
          date: {
            [Op.gte]: moment().subtract(1, "month").startOf("month").format("YYYY-MM-DD"),
            [Op.lte]: moment().subtract(1, "month").endOf("month").format("YYYY-MM-DD"),
          },
        };
      } else if (period === "custom") {
        if (!start_date || !end_date) {
          throw new BadRequestError("start_date and end_date are required for custom period");
        }
        dateFilter = {
          date: {
            [Op.gte]: start_date,
            [Op.lte]: end_date,
          },
        };
      }

      // Find all expenses where user is the payer or a participant
      const participantExpenseIds = await ExpenseParticipant.findAll({
        where: { user_id: userId },
        attributes: ["expense_id"],
      }).then((rows) => rows.map((r) => r.expense_id));

      const expenses = await Expense.findAll({
        where: {
          [Op.or]: [{ paid_by: userId }, { id: { [Op.in]: participantExpenseIds } }],
          ...dateFilter,
        },
        include: [
          { model: User, as: "paidByUser", attributes: ["id", "name", "email"] },
          {
            model: ExpenseParticipant,
            as: "participants",
            include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
          },
        ],
        order: [["date", "DESC"]],
      });

      // Group by period label
      const grouped = {
        current_month: [],
        last_month: [],
        older: [],
      };

      const currentMonthStart = moment().startOf("month");
      const lastMonthStart = moment().subtract(1, "month").startOf("month");
      const lastMonthEnd = moment().subtract(1, "month").endOf("month");

      for (const expense of expenses) {
        const expDate = moment(expense.date);
        if (expDate.isSameOrAfter(currentMonthStart)) {
          grouped.current_month.push(expense);
        } else if (expDate.isBetween(lastMonthStart, lastMonthEnd, undefined, "[]")) {
          grouped.last_month.push(expense);
        } else {
          grouped.older.push(expense);
        }
      }

      return res.json(grouped);
    } catch (err) {
      next(err);
    }
  },
};

export default expenseController;
