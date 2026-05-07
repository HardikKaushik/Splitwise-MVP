import * as yup from "yup";
import User from "../models/User";
import { BadRequestError, NotFoundError, UnauthorizedError, ValidationError } from "../utils/ApiError";

const registerSchema = yup.object().shape({
  name: yup.string().required("Name is required"),
  email: yup.string().email("Invalid email").required("Email is required"),
  password: yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
  default_currency: yup.string().max(10),
});

const updateSchema = yup.object().shape({
  email: yup.string().email("Invalid email"),
  default_currency: yup.string().max(10),
});

const userController = {
  register: async (req, res, next) => {
    try {
      await registerSchema.validate(req.body, { abortEarly: false });
      const { name, email, password, default_currency } = req.body;

      const existing = await User.findOne({ where: { email } });
      if (existing) throw new BadRequestError("Email already in use");

      const user = await User.create({ name, email, password, default_currency });

      return res.status(201).json({
        id: user.id,
        name: user.name,
        email: user.email,
        default_currency: user.default_currency,
        createdAt: user.createdAt,
      });
    } catch (err) {
      if (err.name === "ValidationError" && err.inner) {
        return next(new ValidationError(err.inner.map((e) => e.message).join(", ")));
      }
      next(err);
    }
  },

  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) throw new BadRequestError("Email and password are required");

      const user = await User.findOne({ where: { email } });
      if (!user) throw new UnauthorizedError("Invalid credentials");

      const valid = await user.checkPassword(password);
      if (!valid) throw new UnauthorizedError("Invalid credentials");

      return res.json({
        message: "Login successful",
        user_id: user.id,
        name: user.name,
        email: user.email,
        default_currency: user.default_currency,
      });
    } catch (err) {
      next(err);
    }
  },

  getProfile: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const user = await User.findByPk(userId, {
        attributes: ["id", "name", "email", "default_currency", "createdAt", "updatedAt"],
      });
      if (!user) throw new NotFoundError("User not found");

      return res.json(user);
    } catch (err) {
      next(err);
    }
  },

  updateProfile: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      await updateSchema.validate(req.body, { abortEarly: false });

      const user = await User.findByPk(userId);
      if (!user) throw new NotFoundError("User not found");

      const { email, default_currency } = req.body;

      if (email && email !== user.email) {
        const existing = await User.findOne({ where: { email } });
        if (existing) throw new BadRequestError("Email already in use");
      }

      await user.update({
        ...(email && { email }),
        ...(default_currency && { default_currency }),
      });

      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        default_currency: user.default_currency,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      if (err.name === "ValidationError" && err.inner) {
        return next(new ValidationError(err.inner.map((e) => e.message).join(", ")));
      }
      next(err);
    }
  },

  deleteAccount: async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) throw new BadRequestError("x-user-id header is required");

      const user = await User.findByPk(userId);
      if (!user) throw new NotFoundError("User not found");

      await user.destroy();

      return res.json({ message: "Account deleted successfully" });
    } catch (err) {
      next(err);
    }
  },
};

export default userController;
