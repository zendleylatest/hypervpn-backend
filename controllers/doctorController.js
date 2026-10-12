import Doctor from '../models/Doctor.js';

/**
 * Get all doctors
 */
export const getAllDoctors = async (req, res) => {
  try {
    const { specialty, location, search, available, limit = 50 } = req.query;
    
    const query = {};
    
    if (specialty && specialty !== 'All') {
      query.specialty = specialty;
    }
    
    if (available !== undefined) {
      query.available = available === 'true';
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    let doctors = await Doctor.find(query)
      .limit(parseInt(limit))
      .sort({ rating: -1, reviews: -1 });

    res.json({
      success: true,
      count: doctors.length,
      doctors
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get doctors',
      error: error.message
    });
  }
};

/**
 * Get doctor by ID
 */
export const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    res.json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get doctor',
      error: error.message
    });
  }
};

/**
 * Search doctors
 */
export const searchDoctors = async (req, res) => {
  try {
    const { query } = req.params;
    const { specialty, limit = 20 } = req.query;

    const searchQuery = {
      $text: { $search: query }
    };

    if (specialty && specialty !== 'All') {
      searchQuery.specialty = specialty;
    }

    const doctors = await Doctor.find(searchQuery)
      .limit(parseInt(limit))
      .sort({ rating: -1 });

    res.json({
      success: true,
      count: doctors.length,
      doctors
    });
  } catch (error) {
    console.error('Search doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search doctors',
      error: error.message
    });
  }
};

/**
 * Create doctor (admin)
 */
export const createDoctor = async (req, res) => {
  try {
    const doctor = new Doctor(req.body);
    await doctor.save();

    res.status(201).json({
      success: true,
      message: 'Doctor created successfully',
      doctor
    });
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create doctor',
      error: error.message
    });
  }
};

/**
 * Seed sample doctors
 */
export const seedDoctors = async (req, res) => {
  try {
    const sampleDoctors = [
      {
        name: 'Dr. Maria Santos',
        specialty: 'Endocrinologist',
        location: {
          address: '123 Health St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          country: 'USA',
          coordinates: { latitude: 37.7749, longitude: -122.4194 }
        },
        distance: 2.3,
        rating: 4.8,
        reviews: 124,
        available: true,
        image: '👩‍⚕️',
        phone: '+1-555-0101',
        bio: 'Specialized in diabetes management and endocrinology.'
      },
      {
        name: 'Dr. James Chen',
        specialty: 'Cardiologist',
        location: {
          address: '456 Medical Ave',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94103',
          country: 'USA',
          coordinates: { latitude: 37.7849, longitude: -122.4094 }
        },
        distance: 1.8,
        rating: 4.9,
        reviews: 89,
        available: true,
        image: '👨‍⚕️',
        phone: '+1-555-0102',
        bio: 'Expert in cardiovascular health and hypertension management.'
      },
      {
        name: 'Dr. Sarah Johnson',
        specialty: 'Nutritionist',
        location: {
          address: '789 Wellness Blvd',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94104',
          country: 'USA',
          coordinates: { latitude: 37.7949, longitude: -122.3994 }
        },
        distance: 3.5,
        rating: 4.7,
        reviews: 156,
        available: false,
        image: '👩‍⚕️',
        phone: '+1-555-0103',
        bio: 'Registered dietitian specializing in clinical nutrition.'
      },
      {
        name: 'Dr. Robert Kim',
        specialty: 'Gastroenterologist',
        location: {
          address: '321 Digestive Way',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'USA',
          coordinates: { latitude: 37.8049, longitude: -122.3894 }
        },
        distance: 4.2,
        rating: 4.6,
        reviews: 67,
        available: true,
        image: '👨‍⚕️',
        phone: '+1-555-0104',
        bio: 'Specialized in digestive health and IBS management.'
      }
    ];

    const doctors = await Doctor.insertMany(sampleDoctors);

    res.status(201).json({
      success: true,
      message: 'Sample doctors seeded successfully',
      count: doctors.length,
      doctors
    });
  } catch (error) {
    console.error('Seed doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed doctors',
      error: error.message
    });
  }
};
