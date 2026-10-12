# Environment Setup Guide

## Quick Setup

1. **Create `.env` file** in the `backend` directory (already created)

2. **Add your OpenAI API Key**:
   - Get your API key from: https://platform.openai.com/api-keys
   - Open `.env` file
   - Replace `your-openai-api-key-here` with your actual API key:
     ```
     OPENAI_API_KEY=sk-your-actual-api-key-here
     ```

3. **Configure MongoDB** (if not using default):
   - For local MongoDB: `MONGODB_URI=mongodb://localhost:27017/nutriguide`
   - For MongoDB Atlas: `MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nutriguide`

4. **Set JWT Secret** (change from default):
   ```
   JWT_SECRET=your-random-secret-key-here
   ```

## Required Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | **Yes** (for AI features) | OpenAI API key for meal plans and chat | None |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb://localhost:27017/nutriguide` |
| `JWT_SECRET` | Yes | Secret key for JWT tokens | `your-super-secret-jwt-key-change-this-in-production` |
| `PORT` | No | Server port | `5000` |
| `NODE_ENV` | No | Environment (development/production) | `development` |

## Optional Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | No | Firebase Admin SDK credentials (JSON string) for push notifications |

## Notes

- **Without OpenAI API Key**: The server will start but AI features (meal plan generation and chat) will use fallback responses
- **JWT Secret**: Use a long, random string in production. You can generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **MongoDB**: Make sure MongoDB is running before starting the server

## Testing the Setup

After configuring `.env`, start the server:
```bash
npm start
```

You should see:
- ✅ Connected to MongoDB
- 🚀 Server running on port 5000
- ⚠️  OPENAI_API_KEY not set (if not configured)
