import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { Admin } from '../models/Admin.js';
import { config } from '../config.js';

export const defaultAdmin = {
  name: 'Yogesh Pal',
  email: 'yogeshpal1309@gmail.com',
  password: 'admin@123',
};

export async function seedAdmin() {
  const existing = await Admin.findOne({ email: defaultAdmin.email });
  if (existing) {
    return { message: 'Admin already exists', admin: existing };
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(defaultAdmin.password, salt);

  const newAdmin = await Admin.create({
    name: defaultAdmin.name,
    email: defaultAdmin.email,
    password: hashedPassword
  });

  return { message: 'Admin seeded successfully', admin: newAdmin };
}

// Allow running directly from terminal: `node src/seeders/adminSeeder.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Connecting to database...');
  mongoose.connect(config.mongodbUri)
    .then(() => seedAdmin())
    .then(res => {
      console.log(res);
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
