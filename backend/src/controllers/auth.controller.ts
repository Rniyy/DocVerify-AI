import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import { hashPassword, verifyPassword } from "../services/auth/passwordService";
import { signToken } from "../services/auth/tokenService";
import { createUser, findUserByEmail } from "../services/persistence/usersRepository";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400);
  }
  const { email, password } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError("An account with this email already exists.", 409);
  }

  const passwordHash = await hashPassword(password);
  const userId = await createUser(email, passwordHash);
  const token = signToken({ sub: userId, email });

  res.status(201).json({ token, user: { id: userId, email } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400);
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError("Invalid email or password.", 401);
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    throw new AppError("Invalid email or password.", 401);
  }

  const token = signToken({ sub: user.id, email: user.email });
  res.status(200).json({ token, user: { id: user.id, email: user.email } });
}
