/**
 * One-off script to create the first admin user (there's no other way in — the
 * users API requires an admin to already be logged in). Run once after migrating:
 *   npm run seed:admin --workspace=backend -- admin@example.com "somePassword123"
 */
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail } from "./queries/users.queries.js";
import { pool } from "./pool.js";

async function run() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run seed:admin --workspace=backend -- <email> "<password>"');
    process.exit(1);
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    console.error(`Ya existe un usuario con el correo ${email}`);
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser({ email, passwordHash, role: "admin" });
  console.log(`Admin creado: ${user.email} (id ${user.id})`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
