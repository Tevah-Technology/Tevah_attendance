const {validateWebLocation}=require('./web-location');
function distanceMeters(a,b,c,d) {
 const toRad=x=>x*Math.PI/180;
 const h=Math.sin(toRad(c-a)/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(toRad(d-b)/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function evaluate(rule,loc) {
 if (!Number.isFinite(rule.geofenceLatitude)||!Number.isFinite(rule.geofenceLongitude)) throw new Error('Office coordinates are missing');
 const distance=distanceMeters(loc.latitude,loc.longitude,rule.geofenceLatitude,rule.geofenceLongitude);
 const accuracy=loc.accuracyMeters, radius=rule.geofenceRadiusMeters;
 const accurate=accuracy<=rule.geofenceMaxAccuracyMeters;
 const allowed=accurate && distance+accuracy<=radius;
 const reason=!accurate?'Location accuracy is too low':allowed?'Inside permitted geofence':distance-accuracy>radius?'Outside office geofence':'GPS uncertainty overlaps office boundary';
 return {allowed,reason,distanceMeters:Math.round(distance),accuracyMeters:accuracy,radiusMeters:radius};
}
function validateForAttendance(body,rule,action) {
 const enforce=rule.geofenceEnabled===true && (action==='in'?rule.geofenceCheckIn!==false:rule.geofenceCheckOut!==false);
 const location=validateWebLocation(body,enforce||rule.webLocationRequired===true);
 if(!enforce)return {location,geofence:null};
 const result=evaluate(rule,location);
 if(!result.allowed){const e=new Error(`${result.reason}. Distance ${result.distanceMeters} m; radius ${result.radiusMeters} m`);e.status=422;throw e;}
 return {location,geofence:{verified:true,...result,verifiedAt:new Date().toISOString()}};
}
module.exports={distanceMeters,evaluate,validateForAttendance};
