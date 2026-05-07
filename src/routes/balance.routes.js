import { Router } from "express";
import balanceController from "../controllers/balance.controller";

const balanceRoutes = Router();

balanceRoutes.get("/balances", balanceController.getBalances);
balanceRoutes.post("/balances/report", balanceController.sendMonthlyReport);

export { balanceRoutes };
