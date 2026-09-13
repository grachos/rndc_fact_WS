import type { Role, User } from "@fe-tool/shared";
import { pool } from "../pool.js";

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserByEmail(
  email: string
): Promise<(User & { passwordHash: string }) | null> {
  const { rows } = await pool.query<UserRow>("select * from users where email = $1", [email]);
  const row = rows[0];
  if (!row) return null;
  return { ...toUser(row), passwordHash: row.password_hash };
}

export async function findUserById(id: number): Promise<User | null> {
  const { rows } = await pool.query<UserRow>("select * from users where id = $1", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>("select * from users order by created_at asc");
  return rows.map(toUser);
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  role: Role;
}): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    `insert into users (email, password_hash, role) values ($1, $2, $3) returning *`,
    [input.email, input.passwordHash, input.role]
  );
  return toUser(rows[0]!);
}

export async function updateUser(
  id: number,
  input: { role?: Role; passwordHash?: string }
): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `update users set
       role = coalesce($2, role),
       password_hash = coalesce($3, password_hash)
     where id = $1
     returning *`,
    [id, input.role ?? null, input.passwordHash ?? null]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteUser(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("delete from users where id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

export async function countUsers(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>("select count(*)::text as count from users");
  return Number(rows[0]!.count);
}
