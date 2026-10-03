import { useEffect, useState } from "react";

// A number box that can be cleared while typing. A plain <input type="number"> wired to
// Number(e.target.value) turns an empty box into 0 straight away, so the 0 sticks and the next
// digit lands after it ("05"). This keeps what's typed as text, passes onChange(number) only for a
// real number, and when the box is left empty, invalid, or below `min`, puts `emptyValue` back on blur.
export default function NumberInput({ value, onChange, emptyValue = 0, onFocus, onBlur, ...props }) {
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);

  // Follow changes made from outside (e.g. the cart re-pricing a line), but never while typing.
  useEffect(() => {
    if (!focused) setText(toText(value));
  }, [value, focused]);

  function handleChange(e) {
    const raw = e.target.value;
    setText(raw);
    if (raw.trim() !== "" && Number.isFinite(Number(raw))) onChange(Number(raw));
  }

  function handleBlur(e) {
    setFocused(false);
    const n = Number(text);
    const belowMin = props.min !== undefined && n < Number(props.min);
    if (text.trim() === "" || !Number.isFinite(n) || belowMin) {
      setText(toText(emptyValue));
      onChange(emptyValue);
    } else {
      setText(String(n)); // tidy "05" -> "5"
    }
    onBlur?.(e);
  }

  return (
    <input
      type="number"
      {...props}
      value={text}
      onChange={handleChange}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={handleBlur}
    />
  );
}

function toText(value) {
  return value === undefined || value === null ? "" : String(value);
}
