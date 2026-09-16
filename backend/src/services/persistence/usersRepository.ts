import { pool } from "../../config/db";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
}

export async function createUser(email: string, passwordHash: string): Promise<number> {
  const [result] = await pool.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
    email,
    passwordHash,
  ]);
  return (result as { insertId: number }).insertId;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [rows] = await pool.execute("SELECT id, email, password_hash FROM users WHERE email = ?", [
    email,
  ]);
  return (rows as UserRow[])[0] ?? null;
}
