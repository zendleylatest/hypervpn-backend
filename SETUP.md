# Quick Setup Guide

## Step 1: Install Dependencies
```bash
cd backend
npm install
```

## Step 2: Configure Environment
Create a `.env` file in the backend directory with the following content:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/nutriguide

# JWT Secret (Change this!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OpenAI API Key (Required for meal plans and AI chat)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### Getting OpenAI API Key
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new secret key
5. Copy and paste it into your `.env` file

## Step 3: Start MongoDB
Make sure MongoDB is running on your system:
- **Local MongoDB**: Start the MongoDB service
- **MongoDB Atlas**: Use your cloud connection string in `MONGODB_URI`

## Step 4: Run the Server
```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

## Step 5: Test the API
Open your browser or use Postman:
```
GET http://localhost:5000/api/health
```

You should see:
```json
{
  "status": "OK",
  "message": "Diabetic Diet AI Coach API is running",
  "timestamp": "..."
}
```

## Seed Sample Data (Optional)
To populate the database with sample doctors:
```bash
POST http://localhost:5000/api/doctors/seed
```

## Connect Flutter App
Update your Flutter app's `constants.dart`:
```dart
static const String apiBaseUrl = 'http://localhost:5000';
// Or use your server's IP address:
// static const String apiBaseUrl = 'http://192.168.1.100:5000';
```

## Troubleshooting

### MongoDB Connection Error
- Make sure MongoDB is running
- Check your `MONGODB_URI` in `.env`
- For MongoDB Atlas, ensure your IP is whitelisted

### Port Already in Use
- Change `PORT` in `.env` to a different port
- Or stop the process using port 5000

### Module Not Found
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`, then run `npm install`

## Next Steps
1. Test authentication endpoints
2. Create a user account
3. Generate a meal plan
4. Test other endpoints

For detailed API documentation, see `README.md`.
