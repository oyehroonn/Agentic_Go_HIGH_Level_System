/**
 * Importing this module runs the register() side-effects in every tool file,
 * populating the registry. Import it once at startup (the CLI / scheduler do).
 * Adding a capability = add a file here. Nothing else changes. See §8.
 */
import "./contacts.js";
import "./opportunities.js";
import "./conversations.js";
import "./calendar.js";
import "./tasks-notes.js";
