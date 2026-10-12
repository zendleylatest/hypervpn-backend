import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  specialty: {
    type: String,
    required: true,
    enum: ['Endocrinologist', 'Cardiologist', 'Nutritionist', 'Gastroenterologist', 'General Practitioner']
  },
  location: {
    address: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  distance: {
    type: Number, // in km
    default: 0
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  reviews: {
    type: Number,
    default: 0
  },
  available: {
    type: Boolean,
    default: true
  },
  phone: String,
  email: String,
  website: String,
  bio: String,
  image: String, // URL or emoji
  languages: [String],
  insuranceAccepted: [String],
  officeHours: {
    monday: { open: String, close: String, closed: Boolean },
    tuesday: { open: String, close: String, closed: Boolean },
    wednesday: { open: String, close: String, closed: Boolean },
    thursday: { open: String, close: String, closed: Boolean },
    friday: { open: String, close: String, closed: Boolean },
    saturday: { open: String, close: String, closed: Boolean },
    sunday: { open: String, close: String, closed: Boolean }
  }
}, {
  timestamps: true
});

// Index for search
doctorSchema.index({ specialty: 1, 'location.city': 1 });
doctorSchema.index({ name: 'text', specialty: 'text', bio: 'text' });

export default mongoose.model('Doctor', doctorSchema);
