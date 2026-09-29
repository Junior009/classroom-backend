
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8000;
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Classroom API!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
/*import { eq } from 'drizzle-orm';
import { db } from './db';
import { demoUsers } from './db/schema/index';

async function main() {
  try {
    console.log('Performing CRUD operations...');

    const [newUser] = await db
      .insert(demoUsers)
      .values({ name: 'Admin User', email: 'admin@example.com' })
      .returning();

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    console.log('✅ CREATE: New user created:', newUser);

    const foundUser = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, newUser.id));
    console.log('✅ READ: Found user:', foundUser[0]);

    const [updatedUser] = await db
      .update(demoUsers)
      .set({ name: 'Super Admin' })
      .where(eq(demoUsers.id, newUser.id))
      .returning();

    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    console.log('✅ UPDATE: User updated:', updatedUser);

    await db.delete(demoUsers).where(eq(demoUsers.id, newUser.id));
    console.log('✅ DELETE: User deleted.');

    console.log('\nCRUD operations completed successfully.');
  } catch (error) {
    console.error('❌ Error performing CRUD operations:', error);
    process.exit(1);
  }
}

main(); */

