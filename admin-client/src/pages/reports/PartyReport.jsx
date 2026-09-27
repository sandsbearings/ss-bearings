import { useSearchParams } from "react-router-dom";
import CustomerSalesReport from "./CustomerSalesReport";
import InactiveCustomersReport from "./InactiveCustomersReport";

const VIEWS = [
  { key: "sales", label: "Customer-wise Sales", Component: CustomerSalesReport },
  { key: "inactive", label: "Inactive Customers", Component: InactiveCustomersReport },
];

// Reports → Parties: two views, kept in the URL (?tab=parties&view=inactive) like the tabs.
export default function PartyReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = VIEWS.find((v) => v.key === searchParams.get("view")) || VIEWS[0];
  const { Component } = active;

  return (
    <>
      <div className="mode-chips" style={{ marginTop: "1rem" }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`mode-chip${v.key === active.key ? " active" : ""}`}
            onClick={() => setSearchParams({ tab: "parties", view: v.key }, { replace: true })}
          >
            {v.label}
          </button>
        ))}
      </div>
      <Component key={active.key} />
    </>
  );
}
