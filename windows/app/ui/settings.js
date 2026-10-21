const { invoke } = window.__TAURI__.core;
const $ = id => document.getElementById(id);
const notice = message => { $("status").textContent = String(message); };
let availableUpdate = null;
const fields = ["replaceDashes", "replaceQuotes", "showFeedback", "autoUpdates"];
async function load() {
  const state = await invoke("get_settings");
  for (const name of fields) $(name).checked = state.settings[name];
  for (const name of ["pasteShortcut", "repairShortcut", "fontSize"]) $(name).value = state.settings[name];
  $("openAtLogin").checked = state.openAtLogin;
  $("version").textContent = state.version;
  $("about").hidden = !state.showAbout;
  if (state.showAbout) $("about").scrollIntoView();
  $("autoUpdates").disabled = !state.updatesConfigured;
  if (state.startupError) notice(state.startupError);
  if (state.updatesConfigured) $("updateNote").textContent = "Updates install only after you review the changelog and click Install Update.";
  if (state.settings.autoUpdates && state.updatesConfigured) await checkUpdate(false);
}
for (const id of ["pasteShortcut", "repairShortcut"]) {
  $(id).addEventListener("keydown", event => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (["Delete", "Backspace"].includes(event.key)) { $(id).value = ""; return; }
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey) { notice("Include Ctrl or Alt in a global shortcut."); return; }
    const key = event.code.startsWith("Key") ? event.code.slice(3) : event.code.startsWith("Digit") ? event.code.slice(5) : event.code;
    $(id).value = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super", key].filter(Boolean).join("+");
  });
}
$("settings").addEventListener("submit", async event => {
  event.preventDefault();
  const settings = Object.fromEntries(fields.map(name => [name, $(name).checked]));
  Object.assign(settings, { pasteShortcut: $("pasteShortcut").value, repairShortcut: $("repairShortcut").value, fontSize: Number($("fontSize").value) });
  try { await invoke("save_settings", { settings, openAtLogin: $("openAtLogin").checked }); notice("Settings saved."); }
  catch (error) { notice(error); }
});
$("installCli").onclick = async () => {
  try { notice(await invoke("install_cli")); } catch (error) { notice(error); }
};
async function checkUpdate(manual = true) {
  try {
    availableUpdate = await invoke("check_update");
    $("update").hidden = !availableUpdate;
    if (availableUpdate) {
      $("updateVersion").textContent = `Cleanpasta ${availableUpdate.version}`;
      $("changelog").textContent = availableUpdate.body || "No release notes supplied.";
      if (!manual) notice(`Cleanpasta ${availableUpdate.version} is available. Open Updates to review it.`);
    } else if (manual) notice("You are up to date.");
  } catch (error) { if (manual) notice(error); }
}
$("checkUpdate").onclick = () => checkUpdate();
$("installUpdate").onclick = async () => {
  if (!availableUpdate) return;
  $("installUpdate").disabled = true;
  try { notice("Downloading and verifying update..."); await invoke("install_update", { version: availableUpdate.version }); }
  catch (error) { notice(error); $("installUpdate").disabled = false; }
};
window.__TAURI__.event.listen("show-about", event => {
  $("about").hidden = !event.payload;
  if (event.payload) $("about").scrollIntoView();
});
// The hidden settings webview stays alive while Cleanpasta lives in the tray.
setInterval(async () => {
  try { const state = await invoke("get_settings"); if (state.settings.autoUpdates && state.updatesConfigured) await checkUpdate(false); }
  catch (error) { notice(error); }
}, 86400000);
load().catch(notice);

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("theme").setAttribute("aria-pressed", String(dark));
  $("theme").textContent = dark ? "Light mode" : "Dark mode";
  $("wordmark").src = dark ? "wordmark-light.svg" : "wordmark.svg";
  localStorage.setItem("theme", dark ? "dark" : "light");
}
$("theme").onclick = () => setTheme(document.documentElement.dataset.theme !== "dark");
setTheme(localStorage.getItem("theme") === "dark");
