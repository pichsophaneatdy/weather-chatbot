import { tool } from "ai";
import { z } from "zod";

const WEATHER_API_TIMEOUT_MS = 8000; // 8 seconds

export const weatherTool = tool({
  description:
    "Get weather forecast data for a location. Use this when the user asks about weather, temperature, rain, wind, or forecasts for any location.",
  parameters: z.object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe("Latitude of the location"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the location"),
    forecastDays: z
      .coerce.number()
      .int()
      .min(1)
      .max(7)
      .default(3)
      .describe("Number of forecast days (1-7, default: 3)"),
  }),
  execute: async ({ latitude, longitude, forecastDays }) => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");

      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));
      url.searchParams.set(
        "daily",
        [
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_sum",
          "windspeed_10m_max",
          "weathercode",
        ].join(",")
      );
      url.searchParams.set("forecast_days", String(forecastDays));
      url.searchParams.set("timezone", "auto");

      // `no-store` avoids Next.js caching; timeout prevents tool calls from hanging.
      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(WEATHER_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Open-Meteo often returns helpful error details in the response body.
        // Use `clone()` so we can try JSON first and fall back to text safely.
        const contentType = response.headers.get("content-type") ?? "";
        let errorBody: unknown = undefined;

        if (contentType.includes("json")) {
          try {
            errorBody = await response.clone().json();
          } catch {
            // Fall back to text below.
          }
        }

        if (errorBody === undefined) {
          try {
            const text = await response.text();
            errorBody = text ? text.slice(0, 1000) : undefined;
          } catch {
            // Ignore body parsing errors.
          }
        }

        return {
          error: `Weather API request failed: ${response.status}${
            response.statusText ? ` ${response.statusText}` : ""
          }`,
          status: response.status,
          statusText: response.statusText,
          details: errorBody,
        };
      }

      const data = await response.json();

      const daily = data?.daily as Record<string, unknown> | undefined;
      const time = daily?.time;

      // Lightweight shape checks to ensure arrays are aligned by index.
      if (
        !Array.isArray(time) ||
        !time.every((value) => typeof value === "string")
      ) {
        return {
          error: "Invalid response format from Open-Meteo API",
        };
      }

      const temperatureMax = daily?.temperature_2m_max;
      const temperatureMin = daily?.temperature_2m_min;
      const precipitation = daily?.precipitation_sum;
      const windspeedMax = daily?.windspeed_10m_max;
      const weathercode = daily?.weathercode;

      const requiredArrays = {
        "daily.temperature_2m_max": temperatureMax,
        "daily.temperature_2m_min": temperatureMin,
        "daily.precipitation_sum": precipitation,
        "daily.windspeed_10m_max": windspeedMax,
        "daily.weathercode": weathercode,
      } as const;

      for (const [label, values] of Object.entries(requiredArrays)) {
        if (!Array.isArray(values) || values.length !== time.length) {
          return {
            error: `Invalid response format from Open-Meteo API (${label} missing or misaligned)`,
          };
        }
      }

      const forecast = time.map((date, i) => ({
        date,
        temperature_max: (temperatureMax as unknown[])[i],
        temperature_min: (temperatureMin as unknown[])[i],
        precipitation: (precipitation as unknown[])[i],
        windspeed_max: (windspeedMax as unknown[])[i],
        weathercode: (weathercode as unknown[])[i],
      }));

      return {
        latitude,
        longitude,
        forecast_days: forecastDays,
        forecast,
      };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: unknown }).name === "AbortError"
      ) {
        return {
          error: `Weather data request timed out. Please try again in a moment.`,
        };
      }

      return {
        error:
          err instanceof Error
            ? `Network or runtime error: ${err.message}`
            : "Unknown error occurred while fetching weather data",
      };
    }
  },
});
