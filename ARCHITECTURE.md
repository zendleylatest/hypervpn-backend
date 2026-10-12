# Backend Architecture

## MVC Pattern Implementation

The backend follows the **Model-View-Controller (MVC)** pattern for better code organization and maintainability.

### Project Structure

```
backend/
├── controllers/          # Business logic (Controller layer)
│   ├── authController.js
│   ├── userController.js
│   ├── mealPlanController.js
│   ├── chatController.js
│   ├── symptomController.js
│   ├── reminderController.js
│   ├── doctorController.js
│   └── notificationController.js
├── routes/               # Route definitions (View layer)
│   ├── auth.js
│   ├── users.js
│   ├── mealPlans.js
│   ├── chat.js
│   ├── symptoms.js
│   ├── reminders.js
│   ├── doctors.js
│   └── notifications.js
├── models/               # Database schemas (Model layer)
│   ├── User.js
│   ├── MealPlan.js
│   ├── SymptomLog.js
│   ├── Reminder.js
│   ├── Doctor.js
│   └── ChatMessage.js
├── services/             # External service integrations
│   └── openaiService.js
├── middleware/           # Middleware functions
│   └── auth.js
└── server.js            # Application entry point
```

## Layer Responsibilities

### Controllers (`/controllers`)
- Handle business logic
- Process requests and responses
- Call services and models
- Return formatted responses
- Handle errors

### Routes (`/routes`)
- Define API endpoints
- Apply validation middleware
- Apply authentication middleware
- Route requests to controllers
- Minimal logic (thin layer)

### Models (`/models`)
- Define database schemas
- Handle data validation
- Define relationships
- Provide database operations

### Services (`/services`)
- External API integrations
- Reusable business logic
- Third-party service wrappers
- Complex calculations

### Middleware (`/middleware`)
- Authentication/Authorization
- Request validation
- Error handling
- Logging

## Flow Example

### Request Flow:
```
Client Request
    ↓
Route (defines endpoint, applies middleware)
    ↓
Controller (processes request, calls services/models)
    ↓
Service/Model (business logic/data access)
    ↓
Controller (formats response)
    ↓
Route (sends response)
    ↓
Client Response
```

### Example: Generate Meal Plan

1. **Route** (`routes/mealPlans.js`):
   - Defines `POST /api/meal-plans/generate`
   - Applies `authenticate` middleware
   - Routes to `mealPlanController.generateMealPlan`

2. **Controller** (`controllers/mealPlanController.js`):
   - Gets user from database
   - Calculates calorie targets
   - Calls OpenAI service for meal generation
   - Creates meal plan document
   - Returns formatted response

3. **Service** (`services/openaiService.js`):
   - Formats prompt for OpenAI
   - Calls OpenAI API
   - Parses response
   - Returns structured meal data

4. **Model** (`models/MealPlan.js`):
   - Defines schema
   - Validates data
   - Saves to database

## Benefits of MVC Pattern

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Maintainability**: Easy to find and modify code
3. **Testability**: Controllers and services can be tested independently
4. **Scalability**: Easy to add new features without affecting existing code
5. **Reusability**: Services and models can be reused across controllers

## OpenAI Integration

### Meal Plan Generation
- Uses GPT-4o-mini model
- Generates personalized meals based on user profile
- Includes calories, macros, tags, and ingredients
- Falls back to default meals if API fails

### AI Chat
- Uses GPT-4o-mini model
- Context-aware responses based on user health profile
- Maintains conversation history
- Falls back to rule-based responses if API fails

## Environment Variables

Required:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `OPENAI_API_KEY` - OpenAI API key

Optional:
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `FIREBASE_SERVICE_ACCOUNT` - Firebase Admin SDK credentials

## Error Handling

- Controllers catch errors and return consistent error responses
- Services throw errors that controllers handle
- Middleware handles authentication and validation errors
- Global error handler in `server.js` catches unhandled errors

## Best Practices

1. **Controllers**: Keep business logic, avoid direct database queries
2. **Routes**: Keep thin, only routing and middleware
3. **Services**: Reusable logic, external integrations
4. **Models**: Data structure and validation only
5. **Error Handling**: Consistent error response format
6. **Validation**: Use express-validator in routes
7. **Authentication**: Use middleware for protected routes
