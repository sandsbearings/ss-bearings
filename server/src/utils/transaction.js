import mongoose from "mongoose";

// Every database call made inside withTransaction() automatically joins the transaction (Mongoose
// passes the session along by itself), so the code inside doesn't need to change.
mongoose.set("transactionAsyncLocalStorage", true);

let supported = false;

// Transactions need a replica set (MongoDB Atlas always is one). A plain local mongod isn't, so
// there we fall back to running without them. Call once after connecting.
export async function detectTransactionSupport() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supported = Boolean(hello.setName) || hello.msg === "isdbgrid";
  if (!supported) {
    console.warn(
      "MongoDB is not a replica set: running WITHOUT transactions. Fine for local testing, " +
        "but two people saving money changes at the same moment could clash."
    );
  }
}

// Runs `fn` as one all-or-nothing package: if anything inside throws, every write it made is
// undone. If two requests change the same record at the same moment (e.g. two receipts for one
// customer, or two bills selling the last bearing), MongoDB lets one through and `fn` is re-run
// from the start for the other, so it works on the fresh numbers.
//
// Because `fn` can run more than once, it must load everything it needs itself and must not send
// the response — return what's needed and respond after this resolves.
export async function withTransaction(fn) {
  if (!supported) return fn();

  let result;
  await mongoose.connection.transaction(
    async () => {
      result = await fn();
    },
    { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }
  );
  return result;
}
