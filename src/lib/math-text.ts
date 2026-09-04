/**
 * AI output (tutor replies and extracted past-paper questions) sometimes carries
 * markdown and LaTeX ("$^{235}_{92}\text{U}$", "$$x = \frac{y-b}{m}$$",
 * "**bold**"). Students should never see raw markup, so it is converted into
 * clean readable text with proper science symbols.
 */

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\neq\b/g, "≠"],
  [/\\leq\b/g, "≤"],
  [/\\geq\b/g, "≥"],
  [/\\approx\b/g, "≈"],
  [/\\times\b/g, "×"],
  [/\\cdot\b/g, "·"],
  [/\\div\b/g, "÷"],
  [/\\pm\b/g, "±"],
  [/\\rightarrow\b|\\to\b|\\Rightarrow\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\infty\b/g, "∞"],
  [/\\degree\b|\\circ\b/g, "°"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"],
  [/\\Delta\b/g, "Δ"],
  [/\\theta\b/g, "θ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "µ"],
  [/\\pi\b/g, "π"],
  [/\\rho\b/g, "ρ"],
  [/\\sigma\b/g, "σ"],
  [/\\omega\b/g, "ω"],
  [/\\Omega\b/g, "Ω"],
  [/\\text\s*\{([^{}]*)\}/g, "$1"],
  [/\\mathrm\s*\{([^{}]*)\}/g, "$1"],
  [/\\left|\\right/g, ""],
  [/\\,|\\;|\\!|\\quad|\\qquad/g, " "],
];

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
};

function mapScript(text: string, table: Record<string, string>) {
  const mapped = [...text].map((char) => table[char]);
  return mapped.every(Boolean) ? mapped.join("") : null;
}

/** Turns a LaTeX fragment into readable inline maths. */
function mathToText(input: string): string {
  let out = input;

  // Fractions, including nested ones, innermost first.
  for (let i = 0; i < 4; i += 1) {
    out = out.replace(
      /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_all, top: string, bottom: string) => {
        // A single symbol or number needs no brackets: (y - b)/m, not (y - b)/(m).
        const wrap = (part: string) =>
          /^[\w.°µ]+$/.test(part.trim()) ? part.trim() : `(${part.trim()})`;
        return `${wrap(top)}/${wrap(bottom)}`;
      },
    );
  }
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  // "25^\\circ C" / "25^{\\circ}C" is a degree sign, not a superscript.
  out = out.replace(/\^\s*\{?\s*\\(?:circ|degree)\s*\}?/g, "°");

  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);

  // Powers and indices become real characters where possible.
  out = out.replace(/\^\s*\{([^{}]+)\}|\^(\w)/g, (all, braced: string | undefined, single: string | undefined) => {
    const body = (braced ?? single ?? "").trim();
    return mapScript(body, SUPERSCRIPT) ?? `^${body}`;
  });
  out = out.replace(/_\s*\{([^{}]+)\}|_(\w)/g, (all, braced: string | undefined, single: string | undefined) => {
    const body = (braced ?? single ?? "").trim();
    return mapScript(body, SUBSCRIPT) ?? `_${body}`;
  });

  // Any leftover commands lose the backslash rather than showing it.
  out = out.replace(/\\([A-Za-z]+)/g, "$1").replace(/[{}]/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Cleans a tutor reply: maths is unwrapped from $ / $$ / \( \) / \[ \] and
 * markdown headings, bullets and code fences are simplified.
 */
export function cleanTutorText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n");

  // Display and inline maths.
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_all, body: string) => mathToText(body));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_all, body: string) => mathToText(body));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_all, body: string) => mathToText(body));
  text = text.replace(/\$([^$\n]+)\$/g, (_all, body: string) => mathToText(body));

  // Anything left that still looks like LaTeX.
  if (/\\[A-Za-z]+/.test(text)) {
    text = text.replace(/\\(?:d|t)?frac\s*\{[^{}]*\}\s*\{[^{}]*\}/g, (m) => mathToText(m));
    for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);
    text = text.replace(/\\([A-Za-z]+)/g, "$1");
  }

  text = text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*+-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}


/**
 * Same cleaning, with markdown emphasis markers removed too — for text shown
 * as plain strings (extracted question wording, mark schemes) rather than
 * rendered by TutorText.
 */
export function cleanMathText(raw: string): string {
  return cleanTutorText(raw)
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*/g, "$1");
}
