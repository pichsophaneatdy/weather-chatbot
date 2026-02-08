import { tool } from "ai";
import { z } from "zod";

const WEATHER_API_TIMEOUT_MS = 8000; // 8 seconds

const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "windspeed_10m_max",
  "weathercode",
] as const;

type DailyVariable = (typeof DAILY_VARIABLES)[number];

const DAILY_VARIABLE_TO_FORECAST_KEY: Record<DailyVariable, string> = {
  temperature_2m_max: "temperature_max",
  temperature_2m_min: "temperature_min",
  precipitation_sum: "precipitation",
  windspeed_10m_max: "windspeed_max",
  weathercode: "weathercode",
};

export const weatherTool = tool({
  description:
    "Get weather forecast data for a location. Use this when the user asks about weather, temperature, rain, wind, or forecasts for any location.",
  parameters: z.object({
    latitude: z
      .coerce.number()
      .finite()
      .min(-90)
      .max(90)
      .describe("Latitude of the location"),
    longitude: z
      .coerce.number()
      .finite()
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
    daily: z
      .array(z.enum(DAILY_VARIABLES))
      .min(1)
      .optional()
      .describe(
        "Daily variables to include (default: temperature, precipitation, wind, weathercode)"
      ),
  }),
  execute: async ({ latitude, longitude, forecastDays, daily }) => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");

      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));

      const dailyVariables = daily?.length ? daily : DAILY_VARIABLES;
      url.searchParams.set(
        "daily",
        dailyVariables.join(",")
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

      const dailyData = data?.daily as Record<string, unknown> | undefined;
      const time = dailyData?.time;

      // Lightweight shape checks to ensure arrays are aligned by index.
      if (
        !Array.isArray(time) ||
        !time.every((value) => typeof value === "string")
      ) {
        return {
          error: "Invalid response format from Open-Meteo API",
        };
      }

      for (const variable of dailyVariables) {
        const values = dailyData?.[variable];
        if (!Array.isArray(values) || values.length !== time.length) {
          return {
            error: `Invalid response format from Open-Meteo API (daily.${variable} missing or misaligned)`,
          };
        }
      }

      const forecast = time.map((date, i) => {
        const row: Record<string, unknown> = { date };

        for (const variable of dailyVariables) {
          row[DAILY_VARIABLE_TO_FORECAST_KEY[variable]] = (
            dailyData?.[variable] as unknown[]
          )[i];
        }

        return row;
      });

      return {
        latitude,
        longitude,
        forecast_days: forecastDays,
        daily: dailyVariables,
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
