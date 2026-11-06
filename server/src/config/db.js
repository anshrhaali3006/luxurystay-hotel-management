import mongoose from 'mongoose';

let connectionPromise = null;

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is missing from environment variables');
  }

  // Reuse an existing connection.
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Reuse an in-progress connection.
  if (!connectionPromise) {
    mongoose.set('strictQuery', true);

    connectionPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
      })
      .then(() => {
        console.log(
          `MongoDB connected successfully: ${mongoose.connection.name}`
        );

        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        console.error('MongoDB connection failed:', error.message);
        throw error;
      });
  }

  return connectionPromise;
}