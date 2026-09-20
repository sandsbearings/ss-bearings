import api from "../api/client";

// The PDF endpoint requires auth, so a plain <a href> won't work (no Authorization header
// on a browser navigation). Fetch it as a blob instead and open that.
export async function openInvoicePdf(invoiceId) {
  const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank");
}
