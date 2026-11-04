const mongoose = require('mongoose');
const schema = new mongoose.Schema({
 accountId:{type:mongoose.Schema.Types.ObjectId,ref:'AdminUser',required:true,index:true},
 employeeId:{type:String,required:true,index:true},
 deviceId:{type:String,required:true},
 eventId:{type:String,required:true},
 transition:{type:String,enum:['ENTER','EXIT'],required:true},
 status:{type:String,enum:['PENDING','PROCESSING','RECORDED','REJECTED','DUPLICATE'],required:true,default:'PENDING'},
 reason:{type:String,default:''},
 firstObservedAt:{type:Date,required:true},
 distanceMeters:{type:Number},
 attendanceId:{type:mongoose.Schema.Types.ObjectId,ref:'Attendance',default:null},
 completedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({accountId:1,deviceId:1,eventId:1},{unique:true});
schema.index({employeeId:1,createdAt:-1});
module.exports=mongoose.model('GeofenceEvent',schema);
