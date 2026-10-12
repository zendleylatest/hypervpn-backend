import PDFDocument from 'pdfkit';
import User from '../models/User.js';
import MealPlan from '../models/MealPlan.js';
import Reminder from '../models/Reminder.js';
import FoodLog from '../models/FoodLog.js';
import ActivityLog from '../models/ActivityLog.js';
import ProgressLog from '../models/ProgressLog.js';
import SymptomLog from '../models/SymptomLog.js';

/**
 * Export all user data as PDF
 */
export const exportUserData = async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch all user data
    const [user, mealPlans, reminders, foodLogs, activityLogs, progressLogs, symptomLogs] = await Promise.all([
      User.findById(userId).select('-password'),
      MealPlan.find({ userId }).sort({ startDate: -1 }).limit(10),
      Reminder.find({ userId }).sort({ time: 1 }),
      FoodLog.find({ userId }).sort({ date: -1 }).limit(100),
      ActivityLog.find({ userId }).sort({ date: -1 }).limit(100),
      ProgressLog.find({ userId }).sort({ date: -1 }).limit(100),
      SymptomLog.find({ userId }).sort({ date: -1 }).limit(100),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="diabetic-coach-data-${user.email}-${Date.now()}.pdf"`);
      res.send(pdfData);
    });

    doc.fontSize(24).text('Diabetic Diet AI Coach – Data Export', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // User Profile Section
    doc.fontSize(18).text('1. USER PROFILE', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    
    const profileData = [
      ['Name', `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not provided'],
      ['Email', user.email || 'Not provided'],
      ['Date of Birth', user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString() : 'Not provided'],
      ['Biological Sex', user.biologicalSex || 'Not provided'],
      ['Height', user.height?.cm ? `${user.height.cm} cm` : user.height?.feet ? `${user.height.feet}'${user.height.inches}"` : 'Not provided'],
      ['Weight', user.weight ? `${user.weight} kg` : 'Not provided'],
      ['Activity Level', user.activityLevel || 'Not provided'],
      ['Subscription Plan', user.subscriptionPlan || 'Free'],
    ];

    profileData.forEach(([label, value]) => {
      doc.text(`${label}:`, { continued: true }).font('Helvetica-Bold');
      doc.text(` ${value}`, { continued: false });
    });

    doc.moveDown(1);
    doc.fontSize(14).text('Diabetes Profile', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    const diabetesData = [
      ['Diabetes Type', user.diabetesType || 'Not provided'],
      ['Fasting Sugar (mg/dL)', user.fastingSugar != null ? `${user.fastingSugar}` : 'Not provided'],
      ['HbA1c (%)', user.hba1c != null ? `${user.hba1c}` : 'Not provided'],
      ['Budget', user.budget || 'Not provided'],
      ['Cooking Time', user.cookingTime || 'Not provided'],
    ];
    diabetesData.forEach(([label, value]) => {
      doc.text(`${label}:`, { continued: true }).font('Helvetica-Bold');
      doc.text(` ${value}`, { continued: false });
    });

    if (user.localFoodPreferences && user.localFoodPreferences.length > 0) {
      doc.moveDown(0.3);
      doc.text('Local foods:', { continued: true }).font('Helvetica-Bold');
      doc.text(` ${user.localFoodPreferences.join(', ')}`);
    }
    if (user.foodLikes && user.foodLikes.length > 0) {
      doc.text('Food likes:', { continued: true }).font('Helvetica-Bold');
      doc.text(` ${user.foodLikes.join(', ')}`);
    }
    if (user.foodDislikes && user.foodDislikes.length > 0) {
      doc.text('Food dislikes:', { continued: true }).font('Helvetica-Bold');
      doc.text(` ${user.foodDislikes.join(', ')}`);
    }

    if (user.healthConditions && user.healthConditions.length > 0) {
      doc.moveDown(0.5);
      doc.text('Other Health Conditions:', { continued: true }).font('Helvetica-Bold');
      doc.text(` ${user.healthConditions.join(', ')}`);
    }

    if (user.medications && user.medications.length > 0) {
      doc.moveDown(0.5);
      doc.text('Medications:', { continued: true }).font('Helvetica-Bold');
      doc.text(` ${user.medications.map(m => `${m.name}${m.dosage ? ' ' + m.dosage : ''}${m.timing ? ' @ ' + m.timing : ''}`).join(', ')}`);
    }

    doc.moveDown(2);

    // Meal Plans Section
    doc.addPage();
    doc.fontSize(18).text('2. MEAL PLANS', { underline: true });
    doc.moveDown(0.5);
    
    if (mealPlans.length === 0) {
      doc.fontSize(11).text('No meal plans found.', { italic: true });
    } else {
      mealPlans.forEach((plan, index) => {
        doc.fontSize(12).text(`Plan ${index + 1}: ${plan.planName || '7-Day Plan'}`, { bold: true });
        doc.fontSize(10);
        doc.text(`Period: ${new Date(plan.startDate).toLocaleDateString()} - ${new Date(plan.endDate).toLocaleDateString()}`);
        doc.text(`Daily Calorie Target: ${plan.dailyCalorieTarget} kcal`);
        doc.text(`Macros: C ${plan.dailyMacroTargets?.carbs || 0}g | P ${plan.dailyMacroTargets?.protein || 0}g | F ${plan.dailyMacroTargets?.fat || 0}g`);
        
        if (plan.days && plan.days.length > 0) {
          doc.moveDown(0.3);
          plan.days.forEach((day, dayIndex) => {
            doc.fontSize(10).text(`Day ${day.dayNumber} (${new Date(day.date).toLocaleDateString()}):`, { bold: true });
            if (day.meals && day.meals.length > 0) {
              day.meals.forEach(meal => {
                doc.text(`  • ${meal.mealType}: ${meal.name} - ${meal.calories} kcal`, { indent: 10 });
              });
            }
            doc.moveDown(0.2);
          });
        }
        doc.moveDown(1);
      });
    }

    doc.moveDown(2);

    // Reminders Section
    doc.addPage();
    doc.fontSize(18).text('3. REMINDERS', { underline: true });
    doc.moveDown(0.5);
    
    if (reminders.length === 0) {
      doc.fontSize(11).text('No reminders found.', { italic: true });
    } else {
      const reminderTable = {
        headers: ['Title', 'Type', 'Time', 'Frequency', 'Status'],
        rows: reminders.map(r => [
          r.title,
          r.type,
          r.time,
          r.frequency || 'daily',
          r.enabled ? 'Active' : 'Inactive'
        ])
      };

      // Simple table rendering
      doc.fontSize(9);
      doc.text(reminderTable.headers.join(' | '), { bold: true });
      doc.moveDown(0.3);
      reminderTable.rows.forEach(row => {
        doc.text(row.join(' | '));
        doc.moveDown(0.2);
      });
    }

    doc.moveDown(2);

    // Food Logs Section
    doc.addPage();
    doc.fontSize(18).text('4. FOOD LOGS', { underline: true });
    doc.moveDown(0.5);
    
    if (foodLogs.length === 0) {
      doc.fontSize(11).text('No food logs found.', { italic: true });
    } else {
      doc.fontSize(9);
      doc.text('Date | Food | Portion | Calories | Meal Type', { bold: true });
      doc.moveDown(0.3);
      
      foodLogs.forEach(log => {
        const date = new Date(log.date).toLocaleDateString();
        const portion = `${log.portionSize?.amount || 0} ${log.portionSize?.unit || ''}`;
        doc.text(`${date} | ${log.foodName} | ${portion} | ${log.calories} kcal | ${log.mealType || 'Snack'}`);
        doc.moveDown(0.2);
      });
    }

    doc.moveDown(2);

    // Activity Logs Section
    doc.addPage();
    doc.fontSize(18).text('5. ACTIVITY LOGS', { underline: true });
    doc.moveDown(0.5);
    
    if (activityLogs.length === 0) {
      doc.fontSize(11).text('No activity logs found.', { italic: true });
    } else {
      doc.fontSize(9);
      doc.text('Date | Activity | Duration | Calories Burned', { bold: true });
      doc.moveDown(0.3);
      
      activityLogs.forEach(log => {
        const date = new Date(log.date).toLocaleDateString();
        doc.text(`${date} | ${log.activityType} | ${log.duration} min | ${log.caloriesBurned} kcal`);
        doc.moveDown(0.2);
      });
    }

    doc.moveDown(2);

    // Progress Logs Section
    doc.addPage();
    doc.fontSize(18).text('6. PROGRESS LOGS', { underline: true });
    doc.moveDown(0.5);
    
    if (progressLogs.length === 0) {
      doc.fontSize(11).text('No progress logs found.', { italic: true });
    } else {
      doc.fontSize(9);
      doc.text('Date | Weight (kg) | Notes', { bold: true });
      doc.moveDown(0.3);
      
      progressLogs.forEach(log => {
        const date = new Date(log.date).toLocaleDateString();
        doc.text(`${date} | ${log.weight} kg | ${log.notes || '-'}`);
        doc.moveDown(0.2);
      });
    }

    doc.moveDown(2);

    // Symptom Logs Section
    doc.addPage();
    doc.fontSize(18).text('7. SYMPTOM LOGS', { underline: true });
    doc.moveDown(0.5);
    
    if (symptomLogs.length === 0) {
      doc.fontSize(11).text('No symptom logs found.', { italic: true });
    } else {
      doc.fontSize(9);
      doc.text('Date | Symptom | Severity | Notes', { bold: true });
      doc.moveDown(0.3);
      
      symptomLogs.forEach(log => {
        const date = new Date(log.date).toLocaleDateString();
        doc.text(`${date} | ${log.symptomType} | ${log.severity}/5 | ${log.notes || '-'}`);
        doc.moveDown(0.2);
      });
    }

    // Footer
    doc.addPage();
    doc.fontSize(10).text('--- End of Report ---', { align: 'center' });
    doc.moveDown();
    doc.fontSize(8).text('This report contains your personal health data. Please keep it secure.', { align: 'center', italic: true });

    doc.end();
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export user data',
      error: error.message
    });
  }
};
