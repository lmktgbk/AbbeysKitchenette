import { authService } from "./auth.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { env } from "../../config/env.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 8 * 60 * 60 * 1000, //8hrs
  path: "/",
};

export const authController = {
  /**
   * POST /login
   * Email + password login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const clientIP = req.ip;
      const { token, user } = await authService.login(
        email,
        password,
        clientIP,
      );

      res.cookie("token", token, COOKIE_OPTIONS);
      return successResponse(res, 200, "Login successful", { user, token });
    } catch (error) {
      return errorResponse(
        res,
        error.statusCode || 500,
        error.code || "LOGIN_ERROR",
        error.message,
      );
    }
  },

  /**
   * POST /login-pin
   * PIN-based login (store IP required)
   */
  async loginPin(req, res) {
    try {
      const { userId, pin } = req.body;
      const { token, user } = await authService.loginPin(userId, pin);

      res.cookie("token", token, COOKIE_OPTIONS);
      return successResponse(res, 200, "Login successful", { user, token });
    } catch (error) {
      return errorResponse(
        res,
        error.statusCode || 500,
        error.code || "PIN_LOGIN_ERROR",
        error.message,
      );
    }
  },

  /**
   * POST /logout
   * Clear authentication cookie
   */
  async logout(req, res) {
    res.clearCookie("token", { path: "/" });
    return successResponse(res, 200, "Logged out successfully");
  },

  /**
   * GET /me
   * Return current authenticated user
   */
  async getMe(req, res) {
    return successResponse(res, 200, "User retrieved", { user: req.user });
  },

  /**
   * GET /staff-list
   * Return active staff for PIN login grid (store IP required)
   */
  async getStaffList(req, res) {
    try {
      const staff = await authService.getStaffList();
      return successResponse(res, 200, "Staff list retrieved", { staff });
    } catch (error) {
      return errorResponse(
        res,
        error.statusCode || 500,
        error.code || "STAFF_LIST_ERROR",
        error.message,
      );
    }
  },
};
