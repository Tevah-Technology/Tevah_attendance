const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zkteco_attendance';
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000
  });
  console.log('MongoDB connected');
}

module.exports = { connectDatabase };
