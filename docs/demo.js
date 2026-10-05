"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const splitTerms = (value) => value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 5);
  const DAYS = ["Monday", "Wednesday", "Friday", "Saturday", "Sunday"];
  const MEAL_DAYS = ["Monday", "Wednesday", "Friday", "Sunday"];
  const FALLBACK_CUISINES = ["Diner", "Italian", "Japanese"];
  const CONSTRAINT_LABELS = {
    soft_foods: "Soft foods",
    low_sodium: "Lower sodium",
    wheelchair: "Wheelchair entrance"
  };
  const HARD_TEXTURE = ["sandwich", "pressed bread", "crusty bread", "ribs", "brisket", "burger", "fried", "jerky", "nuts", "cured"];
  const SOFT_TEXTURE = ["soup", "caldo", "mashed", "grits", "polenta", "risotto", "tofu", "steamed", "flan", "chawanmushi", "gnocchi", "made to order", "refried beans", "pozole"];
  const HIGH_SODIUM = ["cured", "pickle", "pickled", "bbq", "rich broth", "olives", "cuban sandwich", "ramen"];
  const LOW_SODIUM = ["low sodium", "heart-healthy", "steamed", "made to order"];
  const PERSONAS = {
    rosa: { label: "Rosa · salsa & Cuban home cooking", cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"], constraints: ["soft_foods", "low_sodium", "wheelchair"], city: "Pasadena" },
    harold: { label: "Harold · crooners & supper clubs", cuisines: ["Southern", "Diner"], music: ["Nat King Cole", "Frank Sinatra"], films: ["Casablanca"], constraints: ["low_sodium", "wheelchair"], city: "Pasadena" },
    mei: { label: "Mei · Beatles, classic films & tofu", cuisines: ["Japanese", "Italian"], music: ["The Beatles"], films: ["Roman Holiday", "Singin' in the Rain"], constraints: ["soft_foods"], city: "Pasadena" }
  };

  let fixtures = null;
  let runNumber = 0;

  function showError(message) {
    const error = $("#formError");
    error.textContent = message;
    error.hidden = false;
  }

  function hideError() {
    $("#formError").hidden = true;
  }

  function readProfile() {
    const checked = [...document.querySelectorAll("input[name='constraints']:checked")].map((input) => input.value);
    return {
      cuisines: splitTerms($("#cuisines").value),
      music: splitTerms($("#music").value),
      films: splitTerms($("#films").value),
      city: $("#city").value.trim().slice(0, 60),
      constraints: checked
    };
  }

  function fillProfile(profile, personaKey) {
    $("#cuisines").value = profile.cuisines.join(", ");
    $("#music").value = profile.music.join(", ");
    $("#films").value = profile.films.join(", ");
    $("#city").value = profile.city;
    document.querySelectorAll("input[name='constraints']").forEach((input) => {
      input.checked = profile.constraints.includes(input.value);
    });
    if (personaKey) $("#persona").value = personaKey;
    $("#presetNotice").textContent = `${personaKey ? profile.label : "Custom sample"} is loaded. This is not a real person.`;
  }

  function resolveEntities(terms, type, trace) {
    const matches = [];
    for (const term of terms) {
      const needle = term.toLocaleLowerCase();
      const found = fixtures.search_entities.find((entity) =>
        entity.name.toLocaleLowerCase().includes(needle) && entity.types.includes(type));
      if (found && !matches.some((entity) => entity.entity_id === found.entity_id)) matches.push(found);
    }
    trace.push({ title: `Resolve ${type.includes("artist") ? "music" : "film"} signals`, detail: `${matches.length} synthetic match${matches.length === 1 ? "" : "es"} · ${terms.length} input${terms.length === 1 ? "" : "s"}` });
    return matches;
  }

  function resolveCuisineTags(terms, trace) {
    const tags = [];
    for (const term of terms) {
      const needle = term.toLocaleLowerCase();
      const found = fixtures.tags.find((tag) => {
        if (!tag.type?.includes("restaurant")) return false;
        return [tag.name, ...(tag.aka || [])].some((label) => {
          const normalized = String(label).toLocaleLowerCase();
          return normalized.includes(needle) || needle.includes(normalized);
        });
      });
      if (found && !tags.some((tag) => tag.id === found.id)) tags.push(found);
    }
    trace.push({ title: "Resolve cuisine tags", detail: `${tags.map((tag) => tag.name).join(", ") || "No exact synthetic match"} · ${terms.length} cuisine input${terms.length === 1 ? "" : "s"}` });
    return tags;
  }

  function placeKind(place) {
    const tags = place.tags || [];
    if (tags.some((tag) => tag.type?.includes("restaurant") || tag.tag_id?.includes("genre:restaurant"))) return "restaurant";
    return "outing";
  }

  function candidateAffinity(place, signalIds) {
    const signals = place._signals || {};
    const values = signalIds.map((signalId) => signals[signalId]).filter((value) => Number.isFinite(value));
    if (values.length) return Math.max(...values);
    return Math.round(0.35 * Number(place.popularity || 0.5) * 1000) / 1000;
  }

  function recommend(kind, tagIds, hadCuisineTerms, signalIds, city) {
    const normalizedCity = city.toLocaleLowerCase();
    return fixtures.places.filter((place) => {
      if (placeKind(place) !== kind) return false;
      const placeCity = String(place.properties?.geocode?.city || "").toLocaleLowerCase();
      if (normalizedCity && !placeCity.includes(normalizedCity)) return false;
      const placeTagIds = new Set((place.tags || []).map((tag) => tag.tag_id));
      if (tagIds.length) return tagIds.some((tagId) => placeTagIds.has(tagId));
      return !hadCuisineTerms;
    }).map((place) => ({ place, affinity: candidateAffinity(place, signalIds) }))
      .sort((left, right) => right.affinity - left.affinity || left.place.name.localeCompare(right.place.name));
  }

  function keywordMatches(keywords, vocabulary) {
    return [...new Set(keywords.flatMap((keyword) => vocabulary.filter((word) => keyword.includes(word))))].sort();
  }

  function checkPlace(place, constraints, kind) {
    const keywords = (place.properties?.keywords || []).map((item) =>
      String(typeof item === "object" ? item.name : item || "").toLocaleLowerCase());
    const tags = place.tags || [];
    const tagNames = tags.map((tag) => String(tag.name || "").toLocaleLowerCase());
    const tagIds = tags.map((tag) => String(tag.tag_id || "").toLocaleLowerCase());
    const checks = [];
    for (const constraint of constraints) {
      if (kind === "outing" && ["soft_foods", "low_sodium"].includes(constraint)) continue;
      if (constraint === "soft_foods") {
        const soft = keywordMatches(keywords, SOFT_TEXTURE);
        const hard = keywordMatches(keywords, HARD_TEXTURE);
        if (soft.length) checks.push({ constraint, status: "pass", reason: `soft signals: ${soft.slice(0, 3).join(", ")}` });
        else if (hard.length) checks.push({ constraint, status: "fail", reason: `firm-food signals: ${hard.slice(0, 3).join(", ")}` });
        else checks.push({ constraint, status: "unknown", reason: "no texture signal in fixture" });
      } else if (constraint === "low_sodium") {
        const low = keywordMatches(keywords, LOW_SODIUM);
        const high = keywordMatches(keywords, HIGH_SODIUM);
        if (high.length && !low.length) checks.push({ constraint, status: "fail", reason: `higher-sodium signals: ${high.slice(0, 3).join(", ")}` });
        else if (low.length) checks.push({ constraint, status: "pass", reason: `lower-sodium signals: ${low.slice(0, 3).join(", ")}` });
        else checks.push({ constraint, status: "unknown", reason: "no sodium signal in fixture" });
      } else if (constraint === "wheelchair") {
        if (tagIds.some((id) => id.includes("steps_at_entrance")) || tagNames.some((name) => name.includes("steps at entrance"))) {
          checks.push({ constraint, status: "fail", reason: "fixture tags steps at entrance" });
        } else if (tagIds.some((id) => id.includes("wheelchair")) || tagNames.some((name) => name.includes("wheelchair"))) {
          checks.push({ constraint, status: "pass", reason: "fixture tags an accessible entrance" });
        } else {
          checks.push({ constraint, status: "unknown", reason: "no access tag in fixture" });
        }
      }
    }
    const ok = checks.every((check) => check.status !== "fail" && !(check.status === "unknown" && check.constraint === "wheelchair"));
    return { ok, checks };
  }

  function rated(candidates, constraints, kind, fallback) {
    return candidates.map((candidate) => {
      const verdict = checkPlace(candidate.place, constraints, kind);
      return { ...candidate, ...verdict, fallback };
    });
  }

  function runDemo() {
    if (!fixtures) return;
    hideError();
    const profile = readProfile();
    if (!profile.cuisines.length && !profile.music.length && !profile.films.length) {
      showError("Add at least one cuisine, artist or film to make a sample week.");
      return;
    }
    if (!profile.city) {
      showError("Enter the fixture city (Pasadena) to search this offline sample.");
      return;
    }
    runNumber += 1;
    const trace = [];
    const musicMatches = resolveEntities(profile.music, "urn:entity:artist", trace);
    const filmMatches = resolveEntities(profile.films, "urn:entity:movie", trace);
    const signalEntities = [...musicMatches, ...filmMatches];
    const signalIds = signalEntities.map((entity) => entity.entity_id);
    const cuisineTags = resolveCuisineTags(profile.cuisines, trace);
    const primaryTagIds = cuisineTags.map((tag) => tag.id);

    const primaryCandidates = recommend("restaurant", primaryTagIds, profile.cuisines.length > 0, signalIds, profile.city);
    const primaryRated = rated(primaryCandidates, profile.constraints, "restaurant", false);
    trace.push({ title: "Rank primary restaurant fixtures", detail: `${primaryRated.length} synthetic candidate${primaryRated.length === 1 ? "" : "s"} · ${primaryRated.filter((item) => item.ok).length} pass the selected rules` });

    let widenedRated = [];
    let fallbackTags = [];
    const passingPrimary = primaryRated.filter((item) => item.ok);
    if (passingPrimary.length < MEAL_DAYS.length) {
      fallbackTags = fixtures.tags.filter((tag) =>
        tag.type?.includes("restaurant") && FALLBACK_CUISINES.includes(tag.name) && !primaryTagIds.includes(tag.id));
      if (fallbackTags.length) {
        const widened = recommend("restaurant", fallbackTags.map((tag) => tag.id), true, signalIds, profile.city);
        widenedRated = rated(widened, profile.constraints, "restaurant", true);
      }
      trace.push({ title: "Widen the cuisine search", detail: `${fallbackTags.map((tag) => tag.name).join(", ") || "No fallback tags"} · ${widenedRated.filter((item) => item.ok).length} additional pass${widenedRated.filter((item) => item.ok).length === 1 ? "es" : ""}` });
    } else {
      trace.push({ title: "Keep the cuisine search focused", detail: "Enough primary fixtures passed; no widening needed" });
    }
    trace.push({ title: "Check restaurant constraints", detail: `${primaryRated.length + widenedRated.length} fixture records checked locally · ${profile.constraints.includes("wheelchair") ? "unknown access is excluded" : "access filter not selected"}` });

    const allCandidates = [...primaryRated, ...widenedRated];
    const uniqueById = new Map();
    for (const candidate of allCandidates) {
      const id = candidate.place.entity_id;
      if (!uniqueById.has(id) || (!candidate.fallback && uniqueById.get(id).fallback)) uniqueById.set(id, candidate);
    }
    const allUnique = [...uniqueById.values()];
    const passingMeals = allUnique.filter((candidate) => candidate.ok)
      .sort((left, right) => Number(left.fallback) - Number(right.fallback) || right.affinity - left.affinity)
      .slice(0, MEAL_DAYS.length)
      .map((candidate, index) => ({ ...candidate, day: MEAL_DAYS[index], kind: "restaurant" }));

    const outingTagIds = fixtures.tags.filter((tag) => tag.type === "urn:tag:category:place").map((tag) => tag.id);
    const outingCandidates = recommend("outing", outingTagIds, false, signalIds, profile.city);
    const outingRated = rated(outingCandidates, profile.constraints, "outing", false);
    trace.push({ title: "Rank and check an outing", detail: `${outingRated.length} synthetic venue fixtures · ${outingRated.filter((item) => item.ok).length} pass the entrance rule` });
    const outing = outingRated.filter((item) => item.ok).sort((left, right) => right.affinity - left.affinity)[0];
    if (outing) passingMeals.push({ ...outing, day: "Saturday", kind: "outing" });

    const rejected = [...allUnique.filter((item) => !item.ok), ...outingRated.filter((item) => !item.ok)];
    const result = { profile, signalEntities, cuisineTags, meals: passingMeals, rejected, primaryRated, widenedRated, outing, trace };
    render(result);
  }

  function renderItem(item, signalEntities, cuisineTags) {
    const place = item.place;
    const signalNames = signalEntities.filter((entity) => Number.isFinite(place._signals?.[entity.entity_id])).map((entity) => entity.name);
    const matchedCuisine = (place.tags || []).filter((tag) => cuisineTags.some((requested) => requested.id === tag.tag_id)).map((tag) => tag.name);
    const isOuting = item.kind === "outing";
    const reason = signalNames.length
      ? `Mock affinity ${item.affinity.toFixed(2)} for audiences linked to ${signalNames.join(", ")}${matchedCuisine.length ? `; fixture tag ${matchedCuisine.join(", ")}` : ""}.`
      : `Popularity fallback score ${item.affinity.toFixed(2)}; no matching taste signal in this fixture.`;
    const badges = [
      `<span class="badge fixture">Synthetic fixture</span>`,
      item.fallback ? `<span class="badge widened">Widened cuisine</span>` : "",
      isOuting ? `<span class="badge">Cultural outing</span>` : `<span class="badge">Restaurant</span>`
    ].filter(Boolean).join("");
    const checks = item.checks.length
      ? item.checks.map((check) => `<span class="check-chip ${escapeHtml(check.status)}" title="${escapeHtml(check.reason)}">${escapeHtml(CONSTRAINT_LABELS[check.constraint] || check.constraint)} · ${escapeHtml(check.status)}</span>`).join("")
      : `<span class="check-chip">No care filters selected</span>`;
    return `<li class="plan-item">
      <div class="day-token"><span>${escapeHtml(item.day)}</span><span>${isOuting ? "culture" : "meal plan"}</span></div>
      <div class="plan-main">
        <div class="plan-topline"><div><h3 class="plan-title">${escapeHtml(place.name)}</h3><p class="plan-subtitle">${escapeHtml(place.properties?.geocode?.city || "Fixture location")} · fictional venue</p></div>
          <div class="affinity"><strong>${item.affinity.toFixed(2)}</strong><small>mock score</small><div class="affinity-track" aria-label="Mock affinity ${item.affinity.toFixed(2)}"><div class="affinity-fill" style="width:${Math.max(0, Math.min(100, item.affinity * 100))}%"></div></div></div>
        </div>
        <div class="plan-badges">${badges}<span class="badge fixture">ID ${escapeHtml(place.entity_id)}</span></div>
        <p class="why-line">${escapeHtml(reason)}</p>
        <div class="check-list" aria-label="Constraint check results">${checks}</div>
      </div>
    </li>`;
  }

  function render(result) {
    const { profile, signalEntities, cuisineTags, meals, rejected, primaryRated, widenedRated, trace } = result;
    const displayTaste = [...profile.cuisines, ...profile.music, ...profile.films].join(" · ") || "Taste profile";
    const mealCount = meals.filter((item) => item.kind === "restaurant").length;
    $("#summaryTaste").textContent = displayTaste;
    $("#summaryCount").textContent = `${meals.length} fixture pick${meals.length === 1 ? "" : "s"}`;
    $("#summaryRejected").textContent = `${rejected.length} candidate${rejected.length === 1 ? "" : "s"}`;
    $("#rejectedCount").textContent = String(rejected.length);

    const notices = [];
    if (mealCount < MEAL_DAYS.length) notices.push(`Only ${mealCount} of ${MEAL_DAYS.length} meal slots had a matching fixture that passed the selected checks; unfilled days are left open.`);
    else notices.push("Four meal ideas and one outing are assembled from the synthetic fixture set.");
    if (widenedRated.length) notices.push("Cuisine search widened after the first pass returned too few candidates.");
    notices.push("Unknown signals are not proof of safety—confirm details directly.");
    $("#planNotice").textContent = notices.join(" ");
    $("#weekPlan").innerHTML = meals.map((item) => renderItem(item, signalEntities, cuisineTags)).join("");

    const grounded = [
      { value: meals.length, label: "planned fixture picks" },
      { value: meals.filter((item) => item.place.entity_id.startsWith("FIX-")).length, label: "with synthetic IDs" },
      { value: primaryRated.length + widenedRated.length + (result.outing ? 1 : 0), label: "candidate checks" }
    ];
    $("#comparison").innerHTML = grounded.map((metric) => `<div class="compare-metric"><strong>${metric.value}</strong><span>${escapeHtml(metric.label)}</span></div>`).join("");
    const firstCuisine = profile.cuisines[0] || "favorite";
    $("#baselineText").textContent = `“A well-reviewed ${firstCuisine} place nearby” — a generic illustrative template with no verified venue, fixture ID or constraint check.`;

    if (rejected.length) {
      $("#rejectedList").innerHTML = rejected.map((candidate) => {
        const reasons = candidate.checks.filter((check) => check.status !== "pass");
        return `<div class="rejected-item"><strong>${escapeHtml(candidate.place.name)}</strong><p>${reasons.map((check) => `${escapeHtml(CONSTRAINT_LABELS[check.constraint] || check.constraint)}: ${escapeHtml(check.status)} — ${escapeHtml(check.reason)}`).join("; ")}</p></div>`;
      }).join("");
    } else {
      $("#rejectedList").innerHTML = `<p>No candidates were screened out with these settings. A pass is only a synthetic keyword/tag match.</p>`;
    }
    $("#traceList").innerHTML = trace.map((item) => `<li><div><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.detail)}</span></div></li>`).join("");
    $("#emptyState").hidden = true;
    $("#resultsContent").hidden = false;
    $("#liveMessage").textContent = `Offline sample updated: ${meals.length} fixture picks, ${rejected.length} screened out.`;
  }

  function loadSelectedPreset() {
    const key = $("#persona").value;
    const selected = PERSONAS[key];
    if (!selected) return;
    fillProfile(selected, key);
    runDemo();
  }

  async function init() {
    $("#emptyState").hidden = false;
    try {
      const response = await fetch("./fixtures.json", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`Fixture file returned ${response.status}`);
      fixtures = await response.json();
      if (!Array.isArray(fixtures.search_entities) || !Array.isArray(fixtures.tags) || !Array.isArray(fixtures.places)) {
        throw new Error("The synthetic fixture file is incomplete.");
      }
      $("#emptyState").hidden = true;
      runDemo();
    } catch (error) {
      $("#emptyState").hidden = false;
      $("#emptyState h3").textContent = "The offline fixture did not load.";
      $("#emptyState p").textContent = "Serve this folder over local HTTP and reload. The demo needs its included synthetic fixture file; it does not use a live service as a fallback.";
      $("#liveMessage").textContent = `Preview could not load: ${error.message}`;
    }
  }

  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    runDemo();
    if (!$("#formError").hidden) $("#cuisines").focus();
  });
  $("#loadPreset").addEventListener("click", loadSelectedPreset);
  $("#resetForm").addEventListener("click", loadSelectedPreset);
  $("#emptyRun").addEventListener("click", runDemo);
  $("#persona").addEventListener("change", () => {
    const selected = PERSONAS[$("#persona").value];
    if (selected) fillProfile(selected, $("#persona").value);
  });

  init();
})();
