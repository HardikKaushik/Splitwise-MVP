import { Router } from "express";
import expenseController from "../controllers/expense.controller";

const expenseRoutes = Router();

expenseRoutes.post("/expenses", expenseController.addExpense);
expenseRoutes.get("/expenses/activity", expenseController.getActivityLog);
expenseRoutes.get("/expenses/:id", expenseController.getExpense);
expenseRoutes.put("/expenses/:id", expenseController.updateExpense);
expenseRoutes.delete("/expenses/:id", expenseController.deleteExpense);

export { expenseRoutes };
