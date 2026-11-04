// Native OS-managed geofence transport. Not a background GPS polling service.
// All incoming events are untrusted; server validates fresh location and attendance state.
const {GeofenceDevice,GeofenceEvent} = require('../models');
const {hasPermission}=require('../services/permission.service');
const attendance = require('../services/attendance.service');
const {validateWebLocation}=require('../utils/web-location');
const {evaluate,distanceMeters}=require('../utils/geofence');

const DEVICE_RE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const EVENT_RE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const publicDevice=d=>({deviceId:d.deviceId,platform:d.platform,active:d.active,registeredAt:d.registeredAt});
const emp=req=>String(req.user?.employeeId||'').trim();
const err=(res,status,message)=>res.status(status).json({success:false,message});
const eventResult=e=>({eventId:e.eventId,transition:e.transition,status:e.status,reason:e.reason,firstObservedAt:e.firstObservedAt,attendanceId:e.attendanceId});

async function register(req,res){
 try{
  const employeeId=emp(req);if(!employeeId)return err(res,403,'Account must be linked to an employee');
  const {deviceId,platform,consent}=req.body||{};
  if(typeof deviceId!=='string'||!DEVICE_RE.test(deviceId)||!['android','ios'].includes(platform)||consent!==true)return err(res,400,'Valid deviceId, platform and explicit consent required');
  const rule=await attendance.getRule();if(!rule.geofenceEnabled||!rule.autoGeofenceEnabled)return err(res,409,'Automatic geofencing is disabled by the administrator');
  const d=await GeofenceDevice.findOneAndUpdate({accountId:req.user._id,deviceId},{$set:{employeeId,platform,consent:true,active:true,revokedAt:null,registeredAt:new Date()}},{upsert:true,new:true,runValidators:true});
  return res.status(201).json({success:true,device:publicDevice(d),settings:settings(rule)});
 }catch(e){if(e.code===11000)return err(res,409,'Device registration conflict');return err(res,500,'Device registration failed');}
}
async function disable(req,res){
 const {deviceId}=req.body||{};if(typeof deviceId!=='string')return err(res,400,'deviceId is required');
 await GeofenceDevice.updateOne({accountId:req.user._id,deviceId},{$set:{active:false,consent:false,revokedAt:new Date()}});
 return res.json({success:true});
}
function settings(r){return {enabled:r.geofenceEnabled===true&&r.autoGeofenceEnabled===true,checkIn:r.autoGeofenceCheckIn!==false,checkOut:r.autoGeofenceCheckOut!==false,latitude:r.geofenceLatitude,longitude:r.geofenceLongitude,radiusMeters:r.geofenceRadiusMeters,maxAccuracyMeters:r.geofenceMaxAccuracyMeters,exitDelaySeconds:r.autoGeofenceExitDelaySeconds||90};}
async function status(req,res){
 const rule=await attendance.getRule();const devices=await GeofenceDevice.find({accountId:req.user._id,active:true}).lean();
 res.json({success:true,settings:settings(rule),devices:devices.map(publicDevice)});
}
function validateRequest(req){
 const {deviceId,eventId,transition}=req.body||{};
 if(typeof deviceId!=='string'||!DEVICE_RE.test(deviceId)||typeof eventId!=='string'||!EVENT_RE.test(eventId)||!['ENTER','EXIT'].includes(transition)){
  const e=new Error('Valid deviceId, unique eventId and ENTER/EXIT transition required');e.status=400;throw e;
 }
 return {deviceId,eventId,transition,location:validateWebLocation(req.body,true)};
}
function confirmBoundary(rule,location,transition){
 const r=evaluate(rule,location);
 // For EXIT, being outside requires the entire GPS uncertainty circle to be outside.
 const outside=r.accuracyMeters<=rule.geofenceMaxAccuracyMeters &&
   r.distanceMeters-r.accuracyMeters>rule.geofenceRadiusMeters;
 return {...r,allowed:transition==='ENTER'?r.allowed:outside,
  reason:transition==='ENTER'?r.reason:(outside?'Outside office geofence':'Outside boundary not confirmed with sufficient accuracy')};
}
async function event(req,res){
 try{
  const employeeId=emp(req);if(!employeeId)return err(res,403,'Account must be linked to an employee');
  const {deviceId,eventId,transition,location}=validateRequest(req);
  const requiredPermission=transition==='ENTER'?'self.attendance.checkin':'self.attendance.checkout';
  if(!hasPermission(req.access, requiredPermission))return err(res,403,'Missing permission: '+requiredPermission);
  const d=await GeofenceDevice.findOne({accountId:req.user._id,employeeId,deviceId,active:true,consent:true}).lean();
  if(!d)return err(res,403,'Device not registered or location monitoring disabled');
  const rule=await attendance.getRule();
  if(!rule.geofenceEnabled||!rule.autoGeofenceEnabled)return err(res,409,'Automatic geofencing is disabled');
  if((transition==='ENTER'&&rule.autoGeofenceCheckIn===false)||(transition==='EXIT'&&rule.autoGeofenceCheckOut===false))return err(res,409,'This automatic transition is disabled');
  const key={accountId:req.user._id,deviceId,eventId};
  let e=await GeofenceEvent.findOne(key);
  if(e) return res.json({success:true,idempotent:true,event:eventResult(e)});
  const result=confirmBoundary(rule,location,transition);
  try{
   e=await GeofenceEvent.create({...key,employeeId,transition,status:result.allowed?'PENDING':'REJECTED',reason:result.reason,firstObservedAt:new Date(),distanceMeters:result.distanceMeters});
  }catch(error){if(error.code===11000){e=await GeofenceEvent.findOne(key);return res.json({success:true,idempotent:true,event:eventResult(e)});}throw error;}
  if(!result.allowed)return res.status(422).json({success:false,event:eventResult(e),message:result.reason});
  // Exits are intentionally two-stage: a single unreliable GPS transition never punches OUT.
  if(transition==='EXIT')return res.status(202).json({success:true,event:eventResult(e),confirmAfterSeconds:rule.autoGeofenceExitDelaySeconds||90});
  return recordEvent(req,res,e,location);
 }catch(e){return err(res,e.status||500,e.status?e.message:'Automatic geofence event failed');}
}
async function confirm(req,res){
 try{
  const {deviceId,eventId,location:ignored}=req.body||{};
  if(typeof deviceId!=='string'||!DEVICE_RE.test(deviceId)||typeof eventId!=='string'||!EVENT_RE.test(eventId))return err(res,400,'deviceId and eventId required');
  const employeeId=emp(req);if(!employeeId)return err(res,403,'Employee profile required');
  const d=await GeofenceDevice.findOne({accountId:req.user._id,employeeId,deviceId,active:true,consent:true}).lean();if(!d)return err(res,403,'Monitoring is not active on this device');
  const rule=await attendance.getRule();if(!rule.geofenceEnabled||!rule.autoGeofenceEnabled||rule.autoGeofenceCheckOut===false)return err(res,409,'Automatic checkout is disabled');
  const e=await GeofenceEvent.findOne({accountId:req.user._id,deviceId,eventId,employeeId});
  if(!e)return err(res,404,'Pending exit event not found');
  if(e.status!=='PENDING')return res.json({success:true,idempotent:true,event:eventResult(e)});
  if(e.transition!=='EXIT')return err(res,400,'Only EXIT events need confirmation');
  const delay=(rule.autoGeofenceExitDelaySeconds||90)*1000;
  if(Date.now()-e.firstObservedAt.getTime()<delay)return res.status(409).json({success:false,message:'Exit confirmation delay has not elapsed',retryAfterSeconds:Math.ceil((delay-(Date.now()-e.firstObservedAt.getTime()))/1000)});
  const location=validateWebLocation(req.body,true);const result=confirmBoundary(rule,location,'EXIT');
  if(!result.allowed){await GeofenceEvent.updateOne({_id:e._id,status:'PENDING'},{$set:{status:'REJECTED',reason:result.reason,completedAt:new Date()}});return res.status(422).json({success:false,message:result.reason});}
  return recordEvent(req,res,e,location);
 }catch(e){return err(res,e.status||500,e.status?e.message:'Exit confirmation failed');}
}
async function recordEvent(req,res,e,location){
 // Atomic claim prevents repeated simultaneous submissions for the same event.
 const claimed=await GeofenceEvent.findOneAndUpdate({_id:e._id,status:'PENDING'},{$set:{status:'PROCESSING'}},{new:true});
 if(!claimed){const existing=await GeofenceEvent.findById(e._id);return res.json({success:true,idempotent:true,event:eventResult(existing)});}
 try{
  // Final re-evaluation uses the current admin policy; settings may have changed.
  const rule=await attendance.getRule();
  if(!rule.geofenceEnabled||!rule.autoGeofenceEnabled||
    (e.transition==='ENTER'&&rule.autoGeofenceCheckIn===false)||
    (e.transition==='EXIT'&&rule.autoGeofenceCheckOut===false))throw new Error('Automatic attendance was disabled');
  const evaluation=confirmBoundary(rule,location,e.transition);
  if(!evaluation.allowed)throw new Error(evaluation.reason);
  const metadata={location,geofence:{verified:true,...evaluation,verifiedAt:new Date().toISOString()},
    autoGeofence:true,geofenceEventId:e.eventId,deviceId:e.deviceId,accountId:String(req.user._id)};
  const result=e.transition==='ENTER'?
    await attendance.webCheckIn(e.employeeId,metadata):await attendance.webCheckOut(e.employeeId,metadata);
  const duplicate=result.alreadyCheckedIn||result.notCheckedIn||result.duplicate;
  const final=await GeofenceEvent.findByIdAndUpdate(e._id,{$set:{status:duplicate?'DUPLICATE':'RECORDED',reason:duplicate?'Existing attendance state prevents duplicate punch':'Attendance recorded',attendanceId:result.record?._id||null,completedAt:new Date()}},{new:true});
  return res.status(duplicate?200:201).json({success:true,event:eventResult(final)});
 }catch(error){const final=await GeofenceEvent.findByIdAndUpdate(e._id,{$set:{status:'REJECTED',reason:error.message,completedAt:new Date()}},{new:true});return res.status(422).json({success:false,event:eventResult(final),message:error.message});}
}
async function history(req,res){
 const employeeId=emp(req);if(!employeeId)return err(res,403,'Employee profile required');
 const events=await GeofenceEvent.find({accountId:req.user._id,employeeId}).sort({createdAt:-1}).limit(100).lean();
 res.json({success:true,events:events.map(eventResult)});
}
module.exports={register,disable,status,event,confirm,history};
