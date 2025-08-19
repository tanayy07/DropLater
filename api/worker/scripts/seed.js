require('dotenv').config();
const mongoose = require('mongoose');
const Note = require('../models/note');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/droplater';
  await mongoose.connect(uri);
  await Note.create({
    title: 'Seeded',
    body: 'Hello from seed',
    releaseAt: new Date(Date.now() - 1000),
    webhookUrl: 'http://sink:4000/sink'
  });
  console.log('Seeded one past-due note');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});


