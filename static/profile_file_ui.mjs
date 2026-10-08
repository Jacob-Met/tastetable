import { MAX_PROFILE_BYTES, makeProfileFile, normalizeProfile, readProfileFile } from "./profile_file.mjs";

/** Local file preview. Only the explicit Replace action may change planner inputs.
 * readInputState can snapshot a draft even when readInputs cannot yet parse it.
 */
export function mountProfileFiles(root, { readInputs, readInputState = readInputs, replaceInputs }) {
  const find = (selector) => root.querySelector(selector);
  const status = find("#profileStatus");
  const preview = find("#profilePreview");
  const details = find("#profilePreviewDetails");
  const replace = find("#replaceProfile");
  const fileInput = find("#profileFile");
  let generation = 0;
  let pending = null;
  let reading = false;

  function retire(message = "The planning-input preview was canceled. Open the file again to replace inputs.") {
    const active = reading || pending;
    generation += 1;
    pending = null;
    reading = false;
    preview.hidden = true;
    replace.disabled = true;
    details.replaceChildren();
    if (active) status.textContent = message;
  }

  function show(profile, filename) {
    const name = document.createElement("p");
    name.textContent = "File: " + filename;
    const list = document.createElement("dl");
    const labels = {
      cuisines: "Favourite cuisines",
      music: "Music",
      films: "Films",
      city: "City",
      constraints: "Constraints",
    };
    const constraintLabels = { soft_foods: "Soft foods", low_sodium: "Low sodium", wheelchair: "Wheelchair access" };
    for (const [field, label] of Object.entries(labels)) {
      const title = document.createElement("dt");
      title.textContent = label;
      const value = document.createElement("dd");
      value.textContent = field === "constraints"
        ? profile.constraints.map((item) => constraintLabels[item]).join(", ") || "None"
        : Array.isArray(profile[field]) ? profile[field].join(", ") || "None" : profile[field] || "Not specified";
      list.append(title, value);
    }
    details.replaceChildren(name, list);
    preview.hidden = false;
    replace.disabled = false;
  }

  find("#openProfile").addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    retire();
    const ticket = generation;
    reading = true;
    status.textContent = "Reading planning inputs for review…";
    try {
      if (file.size > MAX_PROFILE_BYTES) throw new Error("Planning-input files must be at most 64 KiB.");
      const bytes = await file.arrayBuffer();
      if (ticket !== generation) return;
      const profile = readProfileFile(bytes);
      pending = { profile, filename: file.name, baseline: JSON.stringify(readInputState()) };
      reading = false;
      show(profile, file.name);
      status.textContent = "Planning inputs are ready for review. Your current inputs and week are unchanged.";
      replace.focus();
    } catch (error) {
      if (ticket !== generation) return;
      reading = false;
      pending = null;
      preview.hidden = true;
      replace.disabled = true;
      details.replaceChildren();
      status.textContent = "The planning-input file could not be opened: " + error.message;
    }
  });

  replace.addEventListener("click", () => {
    if (!pending) return;
    try {
      if (pending.baseline !== JSON.stringify(readInputState())) {
        retire("Your inputs changed after this preview. Open the file again before replacing them.");
        return;
      }
      const profile = normalizeProfile(pending.profile);
      replaceInputs(profile);
      retire();
      status.textContent = "Planning inputs replaced. Review them, then choose Plan my week for fresh suggestions.";
    } catch (error) {
      status.textContent = "The planning inputs could not be replaced: " + error.message;
    }
  });

  find("#cancelProfile").addEventListener("click", () => {
    retire("Planning-input replacement canceled. Your current inputs and week are unchanged.");
    find("#openProfile").focus();
  });

  find("#saveProfile").addEventListener("click", () => {
    let url;
    let link;
    try {
      const output = makeProfileFile(readInputs());
      url = URL.createObjectURL(new Blob([output.text], { type: "application/json;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url;
      link.download = output.filename;
      document.body.append(link);
      link.click();
      status.textContent = "Planning-input file prepared. Keep it to reopen these tastes and constraints, or use it with the native planner.";
    } catch (error) {
      status.textContent = "The planning-input file could not be prepared: " + error.message;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  return { retire };
}
