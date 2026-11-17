require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const PISTON_API_URL = (process.env.PISTON_API_URL || "https://api.onlinecompiler.io/api/v2/piston/execute").replace(/\/$/, "");
const ONLINECOMPILER_API_KEY = process.env.ONLINECOMPILER_API_KEY || "";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "https://aizen-1862.github.io,http://localhost:5500,http://127.0.0.1:5500")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("This website is not allowed to access the Nova.C API."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "100kb" }));

const languageNames = {
  c: "C",
  cpp: "C++",
  python: "Python",
  javascript: "JavaScript"
};

const pistonLanguages = {
  c: "c",
  cpp: "cpp",
  python: "python",
  javascript: "javascript"
};

function requireText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(name + " is required.");
    error.status = 400;
    throw error;
  }
  if (value.length > maxLength) {
    const error = new Error(name + " is too long (maximum " + maxLength + " characters).");
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function requireLanguage(value) {
  if (!languageNames[value]) {
    const error = new Error("Unsupported language. Choose C, C++, Python, or JavaScript.");
    error.status = 400;
    throw error;
  }
  return value;
}

async function askAI(system, user) {
  if (!GROQ_API_KEY) {
    const error = new Error("AI is not configured yet. Add GROQ_API_KEY in the Render service environment variables.");
    error.status = 503;
    throw error;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + GROQ_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    signal: AbortSignal.timeout(45000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "The AI provider request failed.";
    const error = new Error(message);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  return data.choices?.[0]?.message?.content?.trim() || "";
}

function stripCodeFences(value) {
  return value
    .replace(/^\s*```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Nova.C API", version: "1.0.0" });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Nova.C API",
    aiConfigured: Boolean(GROQ_API_KEY),
    codeRunner: "OnlineCompiler.io",
    codeRunnerConfigured: Boolean(ONLINECOMPILER_API_KEY)
  });
});

app.post("/api/generate", async (req, res, next) => {
  try {
    const prompt = requireText(req.body.prompt, "Prompt", 5000);
    const language = requireLanguage(req.body.language);
    const answer = await askAI(
      "You are Nova.C, a careful programming tutor. Write a complete, beginner-friendly, correct " +
      languageNames[language] + " program for the user's request. Return ONLY source code, with no Markdown fences or explanation. " +
      "Use standard language features and include helpful comments when appropriate. Apply these default UX rules to every generated program: keep interaction and output simple, clear, and beginner-friendly; show only essential results with short labels such as Result, Sum, Average, or Grade; avoid decorative banners, repeated headings, success/status messages, debug text, and unnecessary explanations in program output; keep prompts short and ask only for inputs the program actually needs; put separate prompts on separate lines when multiple prompts are necessary; for every basic arithmetic calculator, MUST accept the entire calculation as ONE input line (for example, the user types 8+14 or 8 + 14 after the single prompt "Enter calculation: "); never ask separately for the first number, operator, or second number; parse the number-operator-number expression in one read; in C, a suitable input pattern is scanf("%lf %c %lf", &a, &op, &b); display only a concise result such as "Result: 22", using clean numeric formatting that removes unnecessary decimal zeroes (for example, %.10g in C); apply the same one-line expression experience in other languages; format numbers cleanly without unnecessary trailing zeroes; preserve all requested functionality, validation, and useful error messages. Do not remove necessary input prompts or error handling just to shorten output. Never claim code was tested unless it was.",
      prompt
    );
    res.json({ ok: true, code: stripCodeFences(answer) });
  } catch (error) { next(error); }
});

app.post("/api/explain", async (req, res, next) => {
  try {
    const language = requireLanguage(req.body.language);
    const code = requireText(req.body.code, "Code", 20000);
    const explanation = await askAI(
      "You are Nova.C, a patient programming tutor. Explain the supplied " + languageNames[language] +
      " code in clear beginner-friendly language. Cover what it does, the important lines, and the expected input/output. " +
      "Do not invent behavior that is not in the code. Use concise headings and bullets, and keep the explanation focused on what the user needs to understand without filler.",
      code
    );
    res.json({ ok: true, explanation });
  } catch (error) { next(error); }
});

app.post("/api/fix", async (req, res, next) => {
  try {
    const language = requireLanguage(req.body.language);
    const code = requireText(req.body.code, "Code", 20000);
    const errorText = typeof req.body.error === "string" ? req.body.error.slice(0, 5000) : "";
    const answer = await askAI(
      "You are Nova.C, a careful debugging assistant. Fix the supplied " + languageNames[language] +
      " code. Return ONLY valid complete source code, without Markdown fences. Preserve the user's intent. " +
      "Apply the same clean-output defaults: concise user-facing prompts, only essential result text, no unnecessary banners/status/debug messages, readable formatting, and preserve required validation and useful errors. Do not claim the code was executed.",
      "CODE:\n" + code + "\n\nERROR OR OUTPUT:\n" + errorText
    );
    res.json({ ok: true, code: stripCodeFences(answer), explanation: "A corrected version is ready. Run it to verify the result." });
  } catch (error) { next(error); }
});

app.post("/api/run", async (req, res, next) => {
  try {
    const language = requireLanguage(req.body.language);
    const code = requireText(req.body.code, "Code", 20000);
    const stdin = typeof req.body.stdin === "string" ? req.body.stdin.slice(0, 5000) : "";

    if (!ONLINECOMPILER_API_KEY) {
      const error = new Error("Code runner is not configured. Add ONLINECOMPILER_API_KEY in the Render environment variables.");
      error.status = 503;
      throw error;
    }

    // User code is sent to a dedicated remote sandbox; it is never run as a shell process on this server.
    const response = await fetch(PISTON_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": ONLINECOMPILER_API_KEY
      },
      body: JSON.stringify({
        language: pistonLanguages[language],
        version: "*",
        files: [{ name: language === "c" ? "main.c" : language === "cpp" ? "main.cpp" : language === "python" ? "main.py" : "main.js", content: code }],
        stdin,
        args: [],
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1
      }),
      signal: AbortSignal.timeout(20000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "The code execution service is temporarily unavailable.");
      error.status = 502;
      throw error;
    }

    // OnlineCompiler's Piston-compatible endpoint returns stdout/stderr as output/error
    // and the exit code at the top level (rather than inside a Piston "run" object).
    const run = data.run || {};
    const compileOutput = data.compile?.output || "";
    const failedToCompile = Boolean(data.compile && data.compile.code !== 0);
    const stdout = typeof data.output === "string" ? data.output : (run.stdout || "");
    const stderr = typeof data.error === "string" ? data.error : (run.stderr || "");
    const exitCode = typeof data.exit_code === "number"
      ? data.exit_code
      : typeof run.code === "number" ? run.code : null;
    const ok = !failedToCompile && exitCode === 0;
    res.json({
      ok,
      status: failedToCompile ? "Compilation Error" : exitCode === 0 ? "Accepted" : "Execution Error",
      stdout,
      stderr,
      compile_output: compileOutput,
      message: data.message || (exitCode !== null ? "Exit code: " + exitCode : "")
    });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error.message);
  res.status(status).json({
    error: status === 500 ? "Something went wrong on the Nova.C backend." : error.message
  });
});

app.listen(PORT, () => {
  console.log("Nova.C API listening on port " + PORT);
});