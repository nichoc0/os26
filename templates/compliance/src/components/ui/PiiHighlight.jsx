export function PiiHighlight({ text, detections }) {
  if (!detections || detections.length === 0) {
    return <span>{text}</span>;
  }

  // Collect PII values that appear in the text
  const piiValues = detections
    .map((d) => d.value)
    .filter((v) => v && text.includes(v));

  if (piiValues.length === 0) {
    return <span>{text}</span>;
  }

  // Build segments by splitting on PII values
  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliest = -1;
    let earliestVal = null;

    for (const val of piiValues) {
      const idx = remaining.indexOf(val);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestVal = val;
      }
    }

    if (earliest === -1) {
      parts.push({ text: remaining, isPii: false });
      break;
    }

    if (earliest > 0) {
      parts.push({ text: remaining.slice(0, earliest), isPii: false });
    }
    parts.push({ text: earliestVal, isPii: true });
    remaining = remaining.slice(earliest + earliestVal.length);
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.isPii ? (
          <mark
            key={i}
            className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 underline decoration-blue-500 decoration-2 underline-offset-2 px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
