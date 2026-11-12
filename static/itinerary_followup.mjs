import { CONTACT_STATES } from "./venue_followup.mjs";

/** A view of the current human-entered note; never changes a note or source check. */
export function mountItineraryFollowup(root, notesRoot, current) {
  const find = (parent, selector, key, date) => [...parent.querySelectorAll(selector)]
    .find(node => (node.dataset.itineraryKey ?? node.dataset.contactKey) === key && (node.dataset.itineraryDate ?? node.dataset.contactDate) === date);
  const text = (tag, className, value) => {
    const node = root.ownerDocument.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
  };
  function refresh() {
    let entries = [];
    try {
      const { state, model } = current();
      entries = model.entries(state);
    } catch { /* Retired plans and invalid draft dates have no current note view. */ }
    for (const slot of root.querySelectorAll("[data-itinerary-contact]")) {
      const entry = entries.find(item => item.key === slot.dataset.itineraryKey && item.date === slot.dataset.itineraryDate);
      const wasOpen = Boolean(slot.querySelector("details")?.open);
      const hadFocus = slot.contains(root.ownerDocument.activeElement);
      slot.replaceChildren();
      slot.hidden = !entry;
      if (!entry) continue;
      const { note } = entry;
      slot.dataset.contactState = note.status;
      const heading = text("div", "itinerary-contact-heading", "");
      heading.append(text("span", "itinerary-contact-status", "Your venue note · " + CONTACT_STATES[note.status]));
      const edit = text("button", "itinerary-contact-edit", note.status === "not_contacted" && !note.reply && !note.nextStep ? "Add note" : "Edit note");
      edit.type = "button";
      edit.dataset.editContact = "";
      edit.setAttribute("aria-label", "Edit venue note for " + entry.pick.name + " on " + entry.date);
      heading.append(edit);
      slot.append(heading);
      const reply = note.reply.trim();
      if (note.nextStep.trim()) slot.append(text("p", "itinerary-contact-next", "Next: " + note.nextStep));
      if (entry.questionsChangedAfterReply) {
        slot.append(text("p", "itinerary-contact-caution", "Questions changed after this reply. Follow up on the revised questions."));
      }
      if (reply) {
        if (note.nextStep.trim() || Array.from(reply).length > 180) {
          if (!note.nextStep.trim()) slot.append(text("p", "itinerary-contact-excerpt", "Note: " + Array.from(reply).slice(0, 180).join("") + "…"));
          const details = root.ownerDocument.createElement("details");
          details.open = wasOpen;
          details.append(text("summary", "", entry.questionsChangedAfterReply ? "Read earlier venue note" : "Read full venue note"));
          details.append(text("p", "itinerary-contact-reply", note.reply));
          slot.append(details);
        } else slot.append(text("p", "itinerary-contact-reply", "Note: " + note.reply));
      }
      const form = find(notesRoot, "[data-contact-key]", entry.key, entry.date);
      if (form && !form.querySelector("[data-return-to-visit]")) {
        const back = text("button", "contact-return", "Back to this scheduled visit");
        back.type = "button";
        back.dataset.returnToVisit = "";
        form.append(back);
      }
      if (hadFocus) edit.focus({ preventScroll: true });
    }
  }
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-edit-contact]");
    if (!button || !root.contains(button)) return;
    const slot = button.closest("[data-itinerary-contact]");
    const form = find(notesRoot, "[data-contact-key]", slot.dataset.itineraryKey, slot.dataset.itineraryDate);
    if (!form) return;
    // The working week stays compact until its own visit asks to edit a note.
    // Reveal the existing editor before focusing the exact dated occurrence.
    notesRoot.open = true;
    const control = form.querySelector('[data-contact-field="status"]');
    control.focus({ preventScroll: true });
    control.scrollIntoView({ block: "center" });
  });
  notesRoot.addEventListener("click", event => {
    const button = event.target.closest("[data-return-to-visit]");
    if (!button || !notesRoot.contains(button)) return;
    const form = button.closest("[data-contact-key]");
    const slot = find(root, "[data-itinerary-contact]", form.dataset.contactKey, form.dataset.contactDate);
    if (!slot) return;
    slot.closest(".scheduled-pick").scrollIntoView({ block: "start" });
    slot.querySelector("[data-edit-contact]").focus({ preventScroll: true });
  });
  return Object.freeze({ refresh });
}
