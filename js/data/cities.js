/**
 * Static city/landmark database for the location search box. Weighted
 * toward Tornado Alley / the Great Plains / the South (where most chasing
 * happens) plus other major US metros for general navigation. No network
 * request needed — this ships in the app shell.
 */
export const CITIES = [
  { name: 'Oklahoma City, OK', lat: 35.4676, lon: -97.5164 },
  { name: 'Norman, OK', lat: 35.2226, lon: -97.4395 },
  { name: 'Tulsa, OK', lat: 36.1540, lon: -95.9928 },
  { name: 'Dallas, TX', lat: 32.7767, lon: -96.7970 },
  { name: 'Fort Worth, TX', lat: 32.7555, lon: -97.3308 },
  { name: 'Wichita Falls, TX', lat: 33.9137, lon: -98.4934 },
  { name: 'Amarillo, TX', lat: 35.2220, lon: -101.8313 },
  { name: 'Lubbock, TX', lat: 33.5779, lon: -101.8552 },
  { name: 'Abilene, TX', lat: 32.4487, lon: -99.7331 },
  { name: 'Wichita, KS', lat: 37.6872, lon: -97.3301 },
  { name: 'Dodge City, KS', lat: 37.7528, lon: -100.0171 },
  { name: 'Topeka, KS', lat: 39.0473, lon: -95.6752 },
  { name: 'Salina, KS', lat: 38.8403, lon: -97.6114 },
  { name: 'Garden City, KS', lat: 37.9717, lon: -100.8727 },
  { name: 'Omaha, NE', lat: 41.2565, lon: -95.9345 },
  { name: 'Lincoln, NE', lat: 40.8136, lon: -96.7026 },
  { name: 'North Platte, NE', lat: 41.1239, lon: -100.7654 },
  { name: 'Grand Island, NE', lat: 40.9264, lon: -98.3420 },
  { name: 'Sioux Falls, SD', lat: 43.5460, lon: -96.7313 },
  { name: 'Rapid City, SD', lat: 44.0805, lon: -103.2310 },
  { name: 'Fargo, ND', lat: 46.8772, lon: -96.7898 },
  { name: 'Bismarck, ND', lat: 46.8083, lon: -100.7837 },
  { name: 'Kansas City, MO', lat: 39.0997, lon: -94.5786 },
  { name: 'St. Louis, MO', lat: 38.6270, lon: -90.1994 },
  { name: 'Springfield, MO', lat: 37.2090, lon: -93.2923 },
  { name: 'Joplin, MO', lat: 37.0842, lon: -94.5133 },
  { name: 'Little Rock, AR', lat: 34.7465, lon: -92.2896 },
  { name: 'Fayetteville, AR', lat: 36.0626, lon: -94.1574 },
  { name: 'Memphis, TN', lat: 35.1495, lon: -90.0490 },
  { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816 },
  { name: 'Jackson, MS', lat: 32.2988, lon: -90.1848 },
  { name: 'Birmingham, AL', lat: 33.5186, lon: -86.8104 },
  { name: 'Huntsville, AL', lat: 34.7304, lon: -86.5861 },
  { name: 'Montgomery, AL', lat: 32.3792, lon: -86.3077 },
  { name: 'Tuscaloosa, AL', lat: 33.2098, lon: -87.5692 },
  { name: 'New Orleans, LA', lat: 29.9511, lon: -90.0715 },
  { name: 'Baton Rouge, LA', lat: 30.4515, lon: -91.1871 },
  { name: 'Shreveport, LA', lat: 32.5252, lon: -93.7502 },
  { name: 'Atlanta, GA', lat: 33.7490, lon: -84.3880 },
  { name: 'Chattanooga, TN', lat: 35.0456, lon: -85.3097 },
  { name: 'Knoxville, TN', lat: 35.9606, lon: -83.9207 },
  { name: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
  { name: 'Colorado Springs, CO', lat: 38.8339, lon: -104.8214 },
  { name: 'Cheyenne, WY', lat: 41.1400, lon: -104.8202 },
  { name: 'Albuquerque, NM', lat: 35.0844, lon: -106.6504 },
  { name: 'Minneapolis, MN', lat: 44.9778, lon: -93.2650 },
  { name: 'Des Moines, IA', lat: 41.5868, lon: -93.6250 },
  { name: 'Cedar Rapids, IA', lat: 41.9779, lon: -91.6656 },
  { name: 'Madison, WI', lat: 43.0731, lon: -89.4012 },
  { name: 'Milwaukee, WI', lat: 43.0389, lon: -87.9065 },
  { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 },
  { name: 'Springfield, IL', lat: 39.7817, lon: -89.6501 },
  { name: 'Indianapolis, IN', lat: 39.7684, lon: -86.1581 },
  { name: 'Columbus, OH', lat: 39.9612, lon: -82.9988 },
  { name: 'Cincinnati, OH', lat: 39.1031, lon: -84.5120 },
  { name: 'Louisville, KY', lat: 38.2527, lon: -85.7585 },
  { name: 'Houston, TX', lat: 29.7604, lon: -95.3698 },
  { name: 'San Antonio, TX', lat: 29.4241, lon: -98.4936 },
  { name: 'Austin, TX', lat: 30.2672, lon: -97.7431 },
  { name: 'Phoenix, AZ', lat: 33.4484, lon: -112.0740 },
  { name: 'Tucson, AZ', lat: 32.2226, lon: -110.9747 },
  { name: 'Las Vegas, NV', lat: 36.1699, lon: -115.1398 },
  { name: 'Salt Lake City, UT', lat: 40.7608, lon: -111.8910 },
  { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
  { name: 'San Diego, CA', lat: 32.7157, lon: -117.1611 },
  { name: 'San Francisco, CA', lat: 37.7749, lon: -122.4194 },
  { name: 'Sacramento, CA', lat: 38.5816, lon: -121.4944 },
  { name: 'Fresno, CA', lat: 36.7378, lon: -119.7871 },
  { name: 'Seattle, WA', lat: 47.6062, lon: -122.3321 },
  { name: 'Portland, OR', lat: 45.5152, lon: -122.6784 },
  { name: 'Boise, ID', lat: 43.6150, lon: -116.2023 },
  { name: 'Billings, MT', lat: 45.7833, lon: -108.5007 },
  { name: 'New York, NY', lat: 40.7128, lon: -74.0060 },
  { name: 'Philadelphia, PA', lat: 39.9526, lon: -75.1652 },
  { name: 'Pittsburgh, PA', lat: 40.4406, lon: -79.9959 },
  { name: 'Boston, MA', lat: 42.3601, lon: -71.0589 },
  { name: 'Washington, DC', lat: 38.9072, lon: -77.0369 },
  { name: 'Baltimore, MD', lat: 39.2904, lon: -76.6122 },
  { name: 'Richmond, VA', lat: 37.5407, lon: -77.4360 },
  { name: 'Charlotte, NC', lat: 35.2271, lon: -80.8431 },
  { name: 'Raleigh, NC', lat: 35.7796, lon: -78.6382 },
  { name: 'Columbia, SC', lat: 34.0007, lon: -81.0348 },
  { name: 'Jacksonville, FL', lat: 30.3322, lon: -81.6557 },
  { name: 'Orlando, FL', lat: 28.5383, lon: -81.3792 },
  { name: 'Tampa, FL', lat: 27.9506, lon: -82.4572 },
  { name: 'Miami, FL', lat: 25.7617, lon: -80.1918 },
  { name: 'Detroit, MI', lat: 42.3314, lon: -83.0458 },
  { name: 'Grand Rapids, MI', lat: 42.9634, lon: -85.6681 },
  { name: 'Anchorage, AK', lat: 61.2181, lon: -149.9003 },
  { name: 'Honolulu, HI', lat: 21.3069, lon: -157.8583 },
];

/** Case-insensitive substring match on city name, most-relevant first. */
export function searchCities(query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CITIES
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.name.toLowerCase().indexOf(q);
      const bi = b.name.toLowerCase().indexOf(q);
      return ai - bi || a.name.length - b.name.length;
    })
    .slice(0, limit);
}
