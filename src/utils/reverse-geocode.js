'use strict';

// Address resolution for WEB attendance only. Never treat reverse-geocoded
// addresses as proof of location; coordinates are provided by the browser.
// Uses the public OSM Nominatim endpoint only when a contact email is set.
const cache = new Map();
let nextRequestAt = 0;
let queue = Promise.resolve();

function addressFromResponse(data) {
  if (!data || typeof data !== 'object') return null;
  const a = data.address || {};
  const placeName = a.amenity || a.building || a.neighbourhood || a.suburb || a.village || a.town || a.city || a.county || a.state || null;
  return {
    placeName,
    city: a.city || a.town || a.village || a.municipality || null,
    state: a.state || null,
    country: a.country || null,
    countryCode: a.country_code || null,
    postcode: a.postcode || null,
    formattedAddress: data.display_name || null,
    provider: 'openstreetmap-nominatim'
  };
}

async function reverseGeocode(location) {
  if (!location) return null;
  const email = (process.env.GEOCODING_CONTACT_EMAIL || '').trim();
  if (!email || process.env.GEOCODING_ENABLED === 'false') return null;
  const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  // Serialize all requests to meet public Nominatim's <=1 request/sec limit.
  const operation = async () => {
    const latest = cache.get(key);
    if (latest && latest.expires > Date.now()) return latest.value;
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1100;
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(location.latitude));
    url.searchParams.set('lon', String(location.longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': `TevahAttendance/1.0 (${email})`, 'Accept-Language': 'en' }
      });
      if (!response.ok) return null;
      const value = addressFromResponse(await response.json());
      // Cache at most 1000 rounded coordinates for up to 24h.
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: Date.now() + 86400000 });
      return value;
    } catch (error) {
      console.warn('[geocoding] Address lookup unavailable:', error.message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
  const result = queue.then(operation, operation);
  queue = result.then(() => {}, () => {});
  return result;
}

async function enrichWebLocation(location) {
  if (!location) return null;
  const address = await reverseGeocode(location);
  return {
    ...location,
    mapsUrl: `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
    placeName: address?.placeName || null,
    city: address?.city || null,
    state: address?.state || null,
    country: address?.country || null,
    countryCode: address?.countryCode || null,
    postcode: address?.postcode || null,
    formattedAddress: address?.formattedAddress || null,
    geocodingProvider: address?.provider || null,
    addressResolved: Boolean(address?.formattedAddress)
  };
}

module.exports = { enrichWebLocation, reverseGeocode, addressFromResponse };
