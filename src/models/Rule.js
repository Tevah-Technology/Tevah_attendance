const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  name: { type: String, unique: true, default: 'Default Rules' },
  defaultShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  autoAlternatePunches: { type: Boolean, default: true },
  allowMultipleBreaks: { type: Boolean, default: true },
  overtimeEnabled: { type: Boolean, default: true },
  overtimeAfterMinutes: { type: Number, default: 480, min: 0 },
  minimumOvertimeMinutes: { type: Number, default: 0, min: 0 },

  // Frontend-configurable split-day attendance rules.
  halfDayEnabled: { type: Boolean, default: true },
  halfDayMinutes: { type: Number, default: 240, min: 0 },
  fullDayMinutes: { type: Number, default: 480, min: 1 },
  twoHalfDaysEqualOneDay: { type: Boolean, default: true },
  // Legacy-compatible API name. This is now stored in Rules; no .env lookup is performed.
  // false = use employee/shift required minutes for overtime; true = use fullDayMinutes.
  attendanceUseEnvHours: { type: Boolean, default: false },
  morningStartTime: { type: String, default: '09:00' },
  lateAfterTime: { type: String, default: '09:30' },
  consecutiveLateThreshold: { type: Number, default: 4, min: 1, max: 31 },
  consecutiveLatePenaltyUnits: { type: Number, default: 0.5, min: 0, max: 1 },
  middayAutoCheckoutTime: { type: String, default: '13:00' },
  afternoonStartTime: { type: String, default: '13:30' },
  dayEndAutoCheckoutTime: { type: String, default: '17:30' },
  autoCheckoutEnabled: { type: Boolean, default: true },
  // Independent of half-day classification; existing installations retain noon behavior.
  noonAutoCheckoutEnabled: { type: Boolean, default: true },
  webLocationRequired: { type: Boolean, default: false },
  geofenceEnabled: {type:Boolean,default:false},
  geofenceCheckIn: {type:Boolean,default:true},
  geofenceCheckOut: {type:Boolean,default:true},
  geofenceLatitude: {type:Number,default:null,min:-90,max:90},
  geofenceLongitude: {type:Number,default:null,min:-180,max:180},
  geofenceRadiusMeters: {type:Number,default:150,min:25,max:5000},
  geofenceMaxAccuracyMeters: {type:Number,default:75,min:5,max:500},
  // Native OS-managed geofence events; disabled until a mobile app is installed.
  autoGeofenceEnabled: {type:Boolean,default:false},
  autoGeofenceCheckIn: {type:Boolean,default:true},
  autoGeofenceCheckOut: {type:Boolean,default:true},
  autoGeofenceExitDelaySeconds: {type:Number,default:90,min:30,max:600}
}, { timestamps: true });

module.exports = mongoose.model('Rule', ruleSchema);
