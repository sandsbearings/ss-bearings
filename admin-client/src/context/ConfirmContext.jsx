import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, cancelLabel, danger }
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        title: opts.title || "Are you sure?",
        message: opts.message || "",
        confirmLabel: opts.confirmLabel || "Delete",
        cancelLabel: opts.cancelLabel || "Cancel",
        danger: opts.danger !== false,
      });
    });
  }, []);

  function handleClose(result) {
    setState(null);
    resolver.current?.(result);
    resolver.current = null;
  }

  useEffect(() => {
    if (!state) return;
    function handleKey(e) {
      if (e.key === "Escape") handleClose(false);
      if (e.key === "Enter") handleClose(true);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay" onMouseDown={() => handleClose(false)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3>{state.title}</h3>
            <p>{state.message}</p>
            <div className="actions" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button className="secondary" onClick={() => handleClose(false)}>
                {state.cancelLabel}
              </button>
              <button className={state.danger ? "danger-solid" : ""} onClick={() => handleClose(true)} autoFocus>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
