/* Gatekeeper - offscreen document
 * Service workers cannot create blob URLs, so file downloads are
 * assembled here and handed back to the worker.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  if (msg.type === "MAKE_BLOB_URL") {
    const blob = new Blob([msg.text], { type: msg.mime || "text/plain" });
    sendResponse(URL.createObjectURL(blob));
    return true;
  }
  if (msg.type === "REVOKE_BLOB_URL") {
    try { URL.revokeObjectURL(msg.url); } catch {}
    sendResponse(true);
    return true;
  }
  return false;
});
