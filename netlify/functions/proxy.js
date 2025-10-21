// /netlify/functions/proxy.js
// A single "do-it-all" function: tutor, quiz, lesson guide, save/export/import/reset.
// Returns tiny HTML snippets for iframes. Minimal, blunt, and gets the job done. 😅

export async function handler(event) {
  const allow = (process.env.ALLOW_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = event.headers.origin || "";
  const cors = allow.includes(origin) ? origin : "";
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    ...(cors ? { "Access-Control-Allow-Origin": cors } : {}),
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const url = new URL(event.rawUrl || `https://x${event.path}`);
  const action = url.searchParams.get("action") || "tutor";

  // ---- helpers ----
  function escapeHTML(s = "") {
    return s.replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  }
  const shell = (inner) => `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bitcount+Grid+Single:wght@400;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#fff;color:#0b1220}
  h2,h3{font-family:"Bitcount Grid Single",system-ui;margin:0 0 8px}
  .mono{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace}
  .card{border:1px solid #e7edf7;border-radius:12px;padding:12px;margin:8px}
  .ok{color:#19a974;font-weight:700}.err{color:#e04f54;font-weight:700}
  pre{white-space:pre-wrap;border:1px solid #e7edf7;border-radius:10px;padding:10px}
  small{color:#52607a}
</style></head><body>${inner}</body></html>`;

  async function getFormData() {
    const ct = (event.headers["content-type"] || "").toLowerCase();

    // x-www-form-urlencoded
    if (ct.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(event.body || "");
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      return obj;
    }

    // JSON (not really used by our forms, but shrug)
    if (ct.includes("application/json")) {
      try { return JSON.parse(event.body || "{}"); } catch { return {}; }
    }

    // Very naive multipart parser: just surfaces body length / basic echo.
    // (We don't persist files server-side in this stupid demo.)
    if (ct.includes("multipart/form-data")) {
      return { _raw: true, bytes: Buffer.from(event.body || "", "base64").length, note: "multipart received (demo only)" };
    }

    // default
    return {};
  }

  // Curriculum quickies (short guide HTML)
  const CURRICULUM = {
    1:{title:"Print & Variables", guide:`<h2>Lesson 1: print() and Variables</h2>
<p><strong>print()</strong> sends text/values to output. <strong>Variable</strong> = named box storing a value.</p>
<pre class="mono">name="Ada"; age=20
print("Hello", name, "you are", age)</pre>`},
    2:{title:"Data Types", guide:`<h2>Lesson 2: Data Types</h2><p>int, float, str, bool · convert with int()/float()/str() · check with type(x).</p>`},
    3:{title:"Operators", guide:`<h2>Lesson 3: Operators</h2><p>+ - * / // % ** · == != &lt; &gt; &lt;= &gt;=</p>`},
    4:{title:"If / Else", guide:`<h2>Lesson 4: If / Else</h2><p>if / elif / else · truthiness.</p>`},
    5:{title:"Loops", guide:`<h2>Lesson 5: Loops</h2><p>for / while · break / continue.</p>`},
    6:{title:"Functions", guide:`<h2>Lesson 6: Functions</h2><p>def, params, return. Small & testable.</p>`},
    7:{title:"Lists & Tuples", guide:`<h2>Lesson 7: Lists & Tuples</h2><p>Lists mutable; tuples immutable.</p>`},
    8:{title:"Dictionaries & Sets", guide:`<h2>Lesson 8: Dictionaries & Sets</h2><p>Key→value; sets store uniques.</p>`},
    9:{title:"File Handling", guide:`<h2>Lesson 9: File Handling</h2><p>open + context manager (with).</p>`},
    10:{title:"Classes & OOP", guide:`<h2>Lesson 10: Classes & OOP</h2><p>Class blueprint; objects instances.</p>`},
    11:{title:"Modules & Packages", guide:`<h2>Lesson 11: Modules & Packages</h2><p>import / from x import y.</p>`},
    12:{title:"Error Handling", guide:`<h2>Lesson 12: Error Handling</h2><p>try / except / else / finally.</p>`},
    13:{title:"Final Project", guide:`<h2>Lesson 13: Final Project</h2><p>Plan → build → iterate.</p>`},
  };

  // OpenAI call (for tutor & quiz)
  async function openaiChat(system, user) {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.45,
        max_tokens: 700,
        messages: [{ role: "system", content: system }, { role: "user", content: user }]
      })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`OpenAI error: ${t}`);
    }
    const data = await r.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  try {
    const form = await getFormData();

    // === LESSON GUIDE ===
    if (action === "lesson") {
      const id = String(form.lesson_id || "1");
      const L = CURRICULUM[id] || CURRICULUM[1];
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>${id}. ${L.title}</h2>
           ${L.guide}
           <small class="mono">Tip: Use “Quiz me” in the Tutor.</small>
         </div>`
      )};
    }

    // === TUTOR ===
    if (action === "tutor") {
      const id = String(form.lesson_id || "1");
      const text = (form.user_text || "").slice(0, 4000);
      const L = CURRICULUM[id] || CURRICULUM[1];

      const system = `You are PyTutor, a concise Python teacher. NO markdown code fences; if you give code, prefix with "Code:" on a new line and keep it very short.`;
      const user = `Lesson ${id}: ${L.title}
Guide: ${L.guide.replace(/<[^>]+>/g," ").slice(0,400)}
Student asks: ${text}
Keep it short, clear, and actionable.`;

      const msg = await openaiChat(system, user);
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Tutor</h2>
           <div class="mono">${escapeHTML(msg)}</div>
         </div>`
      )};
    }

    // === QUIZ ===
    if (action === "quiz") {
      const id = String(form.lesson_id || "1");
      const L = CURRICULUM[id] || CURRICULUM[1];
      const system = `You are PyTutor. Produce ONE MCQ (A–D) about "${L.title}". Keep it short. End with "Answer: X".`;
      const out = await openaiChat(system, `Create one MCQ about "${L.title}" with options A–D and final line "Answer: X".`);
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Quiz</h2>
           <pre class="mono">${escapeHTML(out)}</pre>
         </div>`
      )};
    }

    // === SAVE PROFILE ===
    if (action === "save-profile") {
      const { name = "", level = "", goal = "", pace = "", focus = "", consent = "" } = form;
      const profile = { name, level, goal, pace, focus, consent, updated_at: new Date().toISOString() };
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Profile Saved</h2>
           <pre class="mono">${escapeHTML(JSON.stringify(profile, null, 2))}</pre>
           <small class="mono">Copy this JSON if you want to keep a local record.</small>
         </div>`
      )};
    }

    // === SAVE SNIPPET ===
    if (action === "save-snippet") {
      const code = (form.code || "").slice(0, 10000);
      const payload = { code, saved_at: new Date().toISOString() };
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Snippet Saved</h2>
           <pre class="mono">${escapeHTML(JSON.stringify(payload, null, 2))}</pre>
         </div>`
      )};
    }

    // === EXPORT PROGRESS (demo) ===
    if (action === "export-progress") {
      const fake = {
        current: 1,
        completed: [1, 2],
        exported_at: new Date().toISOString()
      };
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Export</h2>
           <pre class="mono">${escapeHTML(JSON.stringify(fake, null, 2))}</pre>
           <small class="mono">This demo does not persist server-side.</small>
         </div>`
      )};
    }

    // === IMPORT PROGRESS (demo) ===
    if (action === "import-progress") {
      // We don't parse the uploaded JSON server-side in this demo; just acknowledge.
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Import</h2>
           <p class="mono">Import received (demo only; not persisted).</p>
         </div>`
      )};
    }

    // === RESET PROGRESS (demo) ===
    if (action === "reset-progress") {
      return { statusCode: 200, headers, body: shell(
        `<div class="card">
           <h2>Progress Reset</h2>
           <p class="mono">Progress cleared (demo).</p>
         </div>`
      )};
    }

    // Fallback
    return { statusCode: 200, headers, body: shell(`<div class="card"><h2>OK</h2><p class="mono">No-op.</p></div>`) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: shell(`<div class="card"><h2>Error</h2><p class="mono err">${escapeHTML(err.message || String(err))}</p></div>`)
    };
  }
}
