import { publicUser, resolveSession } from "../modules/auth/auth.session.js";

/**
 * Authentication Middleware
 *
 * Verifies JWT from cookie or Authorization header.
 * Attaches user to req.user on success.
 * Throws AppError if not authenticated or token is invalid.
 */

const authenticate = async (req, res, next) => {
  try {
    // Cookie sessions and explicit API bearer sessions share one policy.
    const token =
      req.cookies?.token || req.headers?.authorization?.match(/^Bearer (\S+)$/i)?.[1];

    const { user } = await resolveSession(token);
    req.user = publicUser(user);
    req.sessionVersion = user.sessionVersion;

    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;
