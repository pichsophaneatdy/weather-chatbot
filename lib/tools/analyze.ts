import { tool } from "ai";
import { z } from "zod";
import { spawnSync } from "child_process";

const PYTHON_EXEC_TIMEOUT_MS = 10_000; // 10 seconds
const PYTHON_MAX_BUFFER = 1024 * 1024; // 1MB

export const analyzeTool = tool({
  description:
    "Execute Python code for data analysis, calculations, or processing. The LLM writes Python code, and this tool runs it and returns the output.",

  parameters: z.object({
    code: z
      .string()
      .min(1)
      .max(10_000)
      .describe("Python code to execute"),
  }),

  execute: async ({ code }) => {
    try {
      // Run via stdin (`python3 -`) instead of `-c` to avoid OS arg-length limits.
      // `-u` + env vars keep output unbuffered and consistently UTF-8 encoded.
      const result = spawnSync("python3", ["-u", "-"], {
        input: code,
        encoding: "utf-8",
        timeout: PYTHON_EXEC_TIMEOUT_MS,
        maxBuffer: PYTHON_MAX_BUFFER,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
      });

      // Handle execution errors (timeout, interpreter missing, spawn failure, etc.)
      if (result.error) {
        const err = result.error as NodeJS.ErrnoException;

        // Use common CLI exit codes where possible:
        // - 124: timeout, 126: not executable, 127: command not found
        if (err.code === "ETIMEDOUT") {
          return {
            stdout: "",
            stderr: "Python execution timed out",
            exitCode: 124,
          };
        }

        if (err.code === "ENOENT") {
          return {
            stdout: "",
            stderr:
              "Python interpreter not found (python3). Install Python 3 and ensure `python3` is on your PATH.",
            exitCode: 127,
          };
        }

        if (err.code === "EACCES") {
          return {
            stdout: "",
            stderr:
              "Permission denied when trying to run python3. Check file permissions or your environment setup.",
            exitCode: 126,
          };
        }

        if (
          err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
          err.message.toLowerCase().includes("maxbuffer")
        ) {
          return {
            stdout: result.stdout ?? "",
            stderr: `Python output exceeded maxBuffer (${PYTHON_MAX_BUFFER} bytes)`,
            exitCode: 1,
          };
        }

        return {
          stdout: "",
          stderr: err.code ? `${err.code}: ${err.message}` : err.message,
          exitCode: 1,
        };
      }

      // If the process was terminated by a signal, `status` is null.
      if (result.status === null) {
        return {
          stdout: result.stdout ?? "",
          stderr:
            result.stderr?.trim() ||
            `Python process terminated by signal ${result.signal ?? "unknown"}`,
          exitCode: 128,
        };
      }

      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status,
      };
    } catch (err: unknown) {
      // Absolute last-resort safety net
      return {
        stdout: "",
        stderr:
          err instanceof Error
            ? `Unexpected error: ${err.message}`
            : "Unknown error occurred while executing Python code",
        exitCode: 1,
      };
    }
  },
});
