import { Router } from "express";
import userController from "../controllers/user.controller";

const userRoutes = Router();

userRoutes.post("/users/register", userController.register);
userRoutes.post("/users/login", userController.login);
userRoutes.get("/users/profile", userController.getProfile);
userRoutes.put("/users/profile", userController.updateProfile);
userRoutes.delete("/users/profile", userController.deleteAccount);

export { userRoutes };
