import * as Location from "expo-location";

export interface GeoResult {
  countryName: string;
  countryCode: string;
  city: string;
  region: string;
}

let cached: GeoResult | null = null;

export async function detectGeo(): Promise<GeoResult | null> {
  if (cached) return cached;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo?.isoCountryCode) {
        cached = {
          countryName: geo.country ?? geo.isoCountryCode,
          countryCode: geo.isoCountryCode,
          city: geo.city ?? geo.subregion ?? "",
          region: geo.region ?? "",
        };
        return cached;
      }
    }
  } catch {}

  try {
    const res = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("geo fetch failed");
    const d = await res.json();
    if (!d.country_name) throw new Error("no country");
    cached = {
      countryName: d.country_name as string,
      countryCode: (d.country_code as string) ?? "",
      city: (d.city as string) ?? "",
      region: (d.region as string) ?? "",
    };
    return cached;
  } catch {
    return null;
  }
}
