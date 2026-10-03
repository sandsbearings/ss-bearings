// Saves a customer, handling the server's duplicate warning (PARTY_DUPLICATE, see
// server/src/controllers/partyController.js checkDuplicates): shows which existing customer has the
// same PAN / mobile and, if the user still wants to save, sends the request again with
// allowDuplicates. A duplicate GSTIN is refused by the server outright and comes back as a normal error.
//
// send(extra) must make the request with `extra` merged into the body. Returns the response, or
// null if the user chose not to save.
export async function saveParty(send, confirm) {
  try {
    return await send({});
  } catch (err) {
    const data = err.response?.data;
    if (err.response?.status !== 409 || data?.code !== "PARTY_DUPLICATE") throw err;

    const ok = await confirm({
      title: "Possible duplicate customer",
      message: (
        <>
          {data.matches.length === 1 ? "This customer has" : "These customers have"} the same{" "}
          {matchedOnText(data.matches)}:
          <br />
          {data.matches.map((m) => (
            <span key={m._id}>
              <br />
              <strong>{m.name}</strong>
              {m.phone && ` · ${m.phone}`}
              {m.pan && ` · PAN ${m.pan}`}
              {m.gstin && ` · GSTIN ${m.gstin}`}
            </span>
          ))}
          <br />
          <br />
          If it's the same customer, cancel and use the existing one. Save anyway only if it's a different
          customer.
        </>
      ),
      confirmLabel: "Save Anyway",
      danger: false,
    });
    return ok ? send({ allowDuplicates: true }) : null;
  }
}

function matchedOnText(matches) {
  const on = new Set(matches.flatMap((m) => m.matchedOn));
  return [...on].map((x) => (x === "mobile" ? "mobile number" : x)).join(" and ");
}
