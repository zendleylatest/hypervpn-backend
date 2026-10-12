# Diabetic Diet AI Coach – Backend API

Backend server for the Diabetic Diet AI Coach Flutter application built with Node.js, Express, and MongoDB.

The API powers a diabetes-focused nutrition coach for people with Type 1 / Type 2 diabetes, pre-diabetes, insulin resistance, obesity and family history of diabetes — generating low-GI meal plans, sugar-safe food swaps, a "Can I eat this?" food checker, weekly grocery lists and reminders.

## Features

- ✅ User Authentication (JWT-based)
- ✅ User Profile Management
- ✅ Meal Plan Generation & Management
- ✅ Symptom Tracking & Analytics
- ✅ Reminders Management
- ✅ Doctor Search & Discovery
- ✅ AI Chat Companion
- ✅ Push Notifications (Firebase Cloud Messaging)

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   - `MONGODB_URI` - Your MongoDB connection string
   - `JWT_SECRET` - A secret key for JWT tokens
   - `PORT` - Server port (default: 5000)
   - `FIREBASE_SERVICE_ACCOUNT` - (Optional) Firebase Admin SDK credentials for push notifications

3. **Start MongoDB:**
   - If using local MongoDB, make sure it's running
   - If using MongoDB Atlas, use the connection string in `.env`

4. **Run the server:**
   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/guest` - Create guest session
- `GET /api/auth/verify` - Verify JWT token

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile/personal` - Update personal info
- `PUT /api/users/profile/body` - Update body info
- `PUT /api/users/profile/health` - Update health conditions
- `PUT /api/users/profile/diet` - Update diet preferences
- `PUT /api/users/settings` - Update settings
- `PUT /api/users/onboarding/complete` - Mark onboarding complete
- `DELETE /api/users/account` - Delete account

### Meal Plans
- `POST /api/meal-plans/generate` - Generate 7-day meal plan
- `GET /api/meal-plans/current` - Get current active meal plan
- `GET /api/meal-plans/:id` - Get meal plan by ID
- `GET /api/meal-plans` - Get all meal plans
- `PUT /api/meal-plans/:id/days/:dayNumber` - Update meal plan day

### Symptoms
- `POST /api/symptoms/log` - Log symptom entry
- `GET /api/symptoms/logs` - Get symptom logs
- `GET /api/symptoms/trends` - Get symptom trends (for charts)
- `GET /api/symptoms/recent` - Get recent symptom logs
- `DELETE /api/symptoms/:id` - Delete symptom log

### Reminders
- `POST /api/reminders` - Create reminder
- `GET /api/reminders` - Get all reminders
- `GET /api/reminders/:id` - Get reminder by ID
- `PUT /api/reminders/:id` - Update reminder
- `PATCH /api/reminders/:id/toggle` - Toggle reminder enabled/disabled
- `DELETE /api/reminders/:id` - Delete reminder

### Doctors
- `GET /api/doctors` - Get all doctors (with filters)
- `GET /api/doctors/:id` - Get doctor by ID
- `GET /api/doctors/search/:query` - Search doctors
- `POST /api/doctors/seed` - Seed sample doctors (development)

### Chat
- `POST /api/chat/message` - Send message and get AI response
- `GET /api/chat/history` - Get chat history
- `DELETE /api/chat/history` - Clear chat history

### Notifications
- `POST /api/notifications/register-token` - Register device token
- `POST /api/notifications/send` - Send push notification
- `GET /api/notifications/tokens` - Get user's device tokens
- `DELETE /api/notifications/tokens/:token` - Remove device token

### Health Check
- `GET /api/health` - Server health check

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Database Models

### User
- Personal information
- Body metrics
- Health conditions
- Medications
- Diet preferences
- Settings
- Device tokens

### MealPlan
- 7-day meal plans
- Daily calorie and macro targets
- Meal details with nutrition info

### SymptomLog
- Symptom type and rating
- Date and notes
- User association

### Reminder
- Medication, check, or meal reminders
- Time and schedule
- Enabled/disabled status

### Doctor
- Doctor information
- Specialty and location
- Ratings and availability

### ChatMessage
- User and AI messages
- Confidence scores
- Response types

## Development

### Project Structure
```
backend/
├── models/          # MongoDB models
├── routes/          # API route handlers
├── middleware/      # Authentication and other middleware
├── server.js        # Main server file
├── package.json     # Dependencies
└── .env            # Environment variables (not in git)
```

### Adding New Features

1. Create model in `models/`
2. Create routes in `routes/`
3. Add route to `server.js`
4. Test with Postman or similar tool

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use a strong `JWT_SECRET`
3. Use MongoDB Atlas or secure MongoDB instance
4. Configure CORS for your Flutter app domain
5. Set up Firebase Admin SDK for push notifications
6. Use a process manager like PM2
7. Set up reverse proxy (nginx) if needed

## Environment Variables

See `.env.example` for all available environment variables.

## License

ISC

## Support

For issues or questions, please contact the development team.
