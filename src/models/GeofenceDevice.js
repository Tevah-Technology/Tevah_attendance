const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  accountId:{type:mongoose.Schema.Types.ObjectId,ref:'AdminUser',required:true,index:true},
  employeeId:{type:String,required:true,index:true},
  deviceId:{type:String,required:true,trim:true,maxlength:128},
  platform:{type:String,enum:['android','ios'],required:true},
  consent:{type:Boolean,required:true,default:false},
  active:{type:Boolean,default:true},
  registeredAt:{type:Date,default:Date.now},
  revokedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({accountId:1,deviceId:1},{unique:true});
module.exports=mongoose.model('GeofenceDevice',schema);
