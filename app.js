/*
 * Roast & Wander — Agentic Organisation
 * Five agents hand work down a pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.
 * Each agent's SYSTEM PROMPT lives here as a plain string (this is also what you paste into
 * your submission document's "Agent Designs" section).
 *
 * LIVE DATA REQUIREMENT: the Researcher agent calls the Frankfurter exchange-rate API
 * (https://api.frankfurter.dev) at the moment the pipeline runs. No API key needed, nothing
 * cached or hardcoded — open your browser's Network tab while running this to see the live call.
 *
 * NO SECRETS COMMITTED: the Gemini API key is typed into the page by whoever runs it and lives
 * only in a page-local JS variable. It is never written to this file or any file in the repo.
 */

const AGENTS = {
  researcher: {
    name: "Researcher",
    system: `You are the Researcher agent for Roast & Wander, a small Irish craft coffee
subscription business. Your personality: analytical, skeptical of assumptions, allergic to
vague claims, always asks "compared to what?". Your superpower is pattern recognition in
market data. Given live EUR/GBP/USD exchange rate data, produce a short, sharp research brief
(120-180 words) identifying the concrete pricing and positioning problem Roast & Wander faces
when selling the same subscription to customers in Ireland, the UK, and the US. Be specific
about numbers. End with one clear "opportunity statement" the Designer should solve for.`
  },
  designer: {
    name: "Designer",
    system: `You are the Designer agent for Roast & Wander. Your personality: imaginative but
disciplined, you push back on the Researcher if their brief is too vague, and you think in
terms of customer experience, not features. Your superpower is creative problem-solving. Given
the Researcher's brief, produce a solution concept (120-180 words) for how the subscription
site should present pricing and messaging differently to Irish/EU, UK, and US customers. Be
concrete about what the customer actually sees on screen. End with a one-line design principle.`
  },
  maker: {
    name: "Maker",
    system: `You are the Maker agent for Roast & Wander. Your personality: pragmatic, terse,
impatient with anything that can't actually ship. Your superpower is turning a concept into a
working artefact fast. Given the Designer's concept, the live exchange rate figures, and live
product data from a Google Sheet, write a short technical note (80-120 words) describing
exactly what you built (a live currency-aware pricing table, populated from a Google Sheet you
control and converted using live exchange rates fetched at the same moment) and any technical
trade-offs or limitations of the current version.`
  },
  communicator: {
    name: "Communicator",
    system: `You are the Communicator agent for Roast & Wander. Your personality: warm,
persuasive, allergic to jargon, thinks in customer benefit not company achievement. Your
superpower is storytelling. Given what the Maker built, write short go-to-market copy: a
one-line headline, a 2-sentence subheadline, and 3 punchy bullet benefits, aimed at UK and US
customers discovering Roast & Wander for the first time. Keep the whole thing under 100 words.`
  },
  manager: {
    name: "Manager",
    system: `You are the Manager agent for Roast & Wander. Your personality: calm, decisive,
allergic to happy-talk, always weighs cost against benefit. Your superpower is orchestration
and judgement. Given the Researcher's brief, the Designer's concept, the Maker's build note,
and the Communicator's copy, write a short executive summary (120-180 words): does this
collectively solve the original problem, what is the single biggest remaining risk, and what
is the next concrete step. Be honest if something in the chain is weak.`
  }
};

const el = (id) => document.getElementById(id);

function setStatus(agentKey, text, done = false) {
  el(`status-${agentKey}`).textContent = text;
  if (done) el(`card-${agentKey}`).classList.add("done");
}

// --- LIVE DATA CALL #1: exchange rates (no key, no auth, queried fresh every run) ---
async function fetchLiveRates() {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,USD");
  if (!res.ok) throw new Error(`Frankfurter API error: ${res.status}`);
  const data = await res.json();
  return data; // { amount, base, date, rates: { GBP, USD } }
}

// --- LIVE DATA CALL #2: business/product data, published Google Sheet as CSV ---
// This URL is a PUBLIC read-only address, not a credential, so it is safe to keep in the code.
// Replace it with your own sheet's "Publish to web -> CSV" link (see README for exact steps).
// Expected columns: product,base_price_eur,description
const PRODUCT_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSaCbNo2bo9QvI3Ly3S1oANiDOVPpy3IhUaIMlwN2dJclh_HObFfSrRYEL7-j6bm2h3WPEoeAunziWY/pub?gid=112272401&single=true&output=csv";

function parseCsv(text) {
  const [headerLine, ...rows] = text.trim().split("\n");
  const headers = headerLine.split(",").map(h => h.trim());
  return rows.map(row => {
    const cells = row.split(",").map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i]));
    return obj;
  });
}

async function fetchLiveProducts() {
  if (!PRODUCT_SHEET_CSV_URL || PRODUCT_SHEET_CSV_URL.startsWith("PASTE_")) {
    throw new Error(
      "No Google Sheet CSV URL configured yet. See README.md \u2014 publish your sheet to the " +
      "web as CSV and paste the link into PRODUCT_SHEET_CSV_URL in app.js."
    );
  }
  const res = await fetch(PRODUCT_SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Google Sheet fetch error: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Google Sheet returned no product rows.");
  return rows; // [{ product, base_price_eur, description }, ...]
}

// --- LLM CALL via Gemini free tier (key supplied by the person running the page) ---
async function callGemini(apiKey, systemPrompt, userPrompt) {
 const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }]
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "(no output returned)";
}

function renderPricingTable(rates, products) {
  const rows = products.map(p => {
    const eur = parseFloat(p.base_price_eur);
    const gbp = (eur * rates.rates.GBP).toFixed(2);
    const usd = (eur * rates.rates.USD).toFixed(2);
    return `<tr>
      <td>${p.product}</td>
      <td>€${eur.toFixed(2)}</td>
      <td>£${gbp}</td>
      <td>$${usd}</td>
      <td>${p.description || ""}</td>
    </tr>`;
  }).join("");
  el("pricingWidget").innerHTML = `
    <p class="hint">Product data fetched live from Google Sheets. Rates fetched live from Frankfurter (${rates.date}).</p>
    <table>
      <tr><th>Product</th><th>Ireland/EU</th><th>UK</th><th>US</th><th>Description</th></tr>
      ${rows}
    </table>`;
}

async function runPipeline() {
  const apiKey = el("apiKey").value.trim();
  if (!apiKey) {
    alert("Paste a free Gemini API key first — see the link above the button.");
    return;
  }
  el("runBtn").disabled = true;

  try {
    // 1. Researcher — pulls BOTH live sources, then reasons over them
    setStatus("researcher", "Fetching live exchange rates…");
    const rates = await fetchLiveRates();
    setStatus("researcher", "Fetching live product data from Google Sheets…");
    const products = await fetchLiveProducts();
    setStatus("researcher", "Thinking…");
    const productSummary = products.map(p => `${p.product}: EUR ${p.base_price_eur} (${p.description || "no description"})`).join("; ");
    const researcherPrompt = `Live exchange rate data just fetched: 1 EUR = ${rates.rates.GBP} GBP and 1 EUR = ${rates.rates.USD} USD, as of ${rates.date}. Live product/pricing data just fetched from our Google Sheet: ${productSummary}. All prices are currently shown as flat EUR numbers with no currency logic for UK/US customers.`;
    const researcherOut = await callGemini(apiKey, AGENTS.researcher.system, researcherPrompt);
    el("output-researcher").textContent = researcherOut;
    setStatus("researcher", "Done", true);

    // 2. Designer — takes Researcher's output as input
    setStatus("designer", "Thinking…");
    const designerOut = await callGemini(apiKey, AGENTS.designer.system, `Researcher's brief:\n\n${researcherOut}`);
    el("output-designer").textContent = designerOut;
    setStatus("designer", "Done", true);

    // 3. Maker — takes Designer's output, also renders the live pricing widget
    setStatus("maker", "Building…");
    renderPricingTable(rates, products);
    const makerOut = await callGemini(apiKey, AGENTS.maker.system, `Designer's concept:\n\n${designerOut}\n\nLive rates used: 1 EUR = ${rates.rates.GBP} GBP, 1 EUR = ${rates.rates.USD} USD (${rates.date}). Live product data used: ${productSummary}.`);
    el("output-maker").textContent = makerOut;
    setStatus("maker", "Done", true);

    // 4. Communicator — takes Maker's output
    setStatus("communicator", "Writing…");
    const communicatorOut = await callGemini(apiKey, AGENTS.communicator.system, `Maker's build note:\n\n${makerOut}`);
    el("output-communicator").textContent = communicatorOut;
    setStatus("communicator", "Done", true);

    // 5. Manager — takes everything
    setStatus("manager", "Reviewing…");
    const managerPrompt = `Researcher brief:\n${researcherOut}\n\nDesigner concept:\n${designerOut}\n\nMaker note:\n${makerOut}\n\nCommunicator copy:\n${communicatorOut}`;
    const managerOut = await callGemini(apiKey, AGENTS.manager.system, managerPrompt);
    el("output-manager").textContent = managerOut;
    setStatus("manager", "Done", true);

  } catch (err) {
    alert("Something went wrong: " + err.message);
    console.error(err);
  } finally {
    el("runBtn").disabled = false;
  }
}

el("runBtn").addEventListener("click", runPipeline);
