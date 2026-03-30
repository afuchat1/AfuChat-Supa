import * as Location from "expo-location";

export interface GeoResult {
  countryName: string;
  countryCode: string;
  city: string;
  region: string;
}

let cached: GeoResult | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function tryGps(): Promise<GeoResult | null> {
  const { status } = await withTimeout(Location.requestForegroundPermissionsAsync(), 5000);
  if (status !== "granted") return null;
  const loc = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
    8000,
  );
  const [geo] = await withTimeout(
    Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
    8000,
  );
  if (!geo?.isoCountryCode) return null;
  return {
    countryName: geo.country ?? geo.isoCountryCode,
    countryCode: geo.isoCountryCode,
    city: geo.city ?? geo.subregion ?? "",
    region: geo.region ?? "",
  };
}

async function tryIpApi(): Promise<GeoResult | null> {
  const res = await withTimeout(
    fetch("https://ip-api.com/json/?fields=status,country,countryCode,city,regionName", {
      headers: { Accept: "application/json" },
    }),
    6000,
  );
  if (!res.ok) return null;
  const d = await res.json();
  if (d.status !== "success" || !d.country) return null;
  return {
    countryName: d.country as string,
    countryCode: d.countryCode as string ?? "",
    city: d.city as string ?? "",
    region: d.regionName as string ?? "",
  };
}

async function tryIpApiCo(): Promise<GeoResult | null> {
  const res = await withTimeout(
    fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } }),
    6000,
  );
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.country_name || d.error) return null;
  return {
    countryName: d.country_name as string,
    countryCode: d.country_code as string ?? "",
    city: d.city as string ?? "",
    region: d.region as string ?? "",
  };
}

async function tryIpInfo(): Promise<GeoResult | null> {
  const res = await withTimeout(
    fetch("https://ipinfo.io/json", { headers: { Accept: "application/json" } }),
    6000,
  );
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.country) return null;
  const [city = "", region = ""] = (d.city ? [d.city, d.region ?? ""] : ["", d.region ?? ""]);
  return {
    countryName: d.country as string,
    countryCode: d.country as string,
    city,
    region,
  };
}

async function tryCountryIs(): Promise<GeoResult | null> {
  const res = await withTimeout(
    fetch("https://api.country.is/", { headers: { Accept: "application/json" } }),
    5000,
  );
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.country) return null;
  return {
    countryName: d.country as string,
    countryCode: d.country as string,
    city: "",
    region: "",
  };
}

export async function detectGeo(): Promise<GeoResult | null> {
  if (cached) return cached;

  const attempts = [tryGps, tryIpApi, tryIpApiCo, tryIpInfo, tryCountryIs];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) {
        cached = result;
        return cached;
      }
    } catch {}
  }

  return null;
}

export function clearGeoCache() {
  cached = null;
}
