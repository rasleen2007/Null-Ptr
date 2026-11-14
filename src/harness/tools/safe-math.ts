export class SafeMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeMathError";
  }
}

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const MAX_LENGTH = 600;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ("+-*/%^".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }
    const numberMatch = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }
    const identMatch = input.slice(index).match(/^[a-zA-Z][a-zA-Z0-9_]*/);
    if (identMatch) {
      tokens.push({ type: "ident", value: identMatch[0].toLowerCase() });
      index += identMatch[0].length;
      continue;
    }
    throw new SafeMathError(`Unexpected character "${char}" at position ${index}.`);
  }
  return tokens;
}

export function evaluateExpression(input: string): number {
  if (!input || !input.trim()) throw new SafeMathError("Expression is empty.");
  if (input.length > MAX_LENGTH) throw new SafeMathError("Expression is too long.");
  if (/[^\d\s.+\-*/%^(),a-zA-Z]/.test(input)) {
    throw new SafeMathError("Expression contains unsupported characters.");
  }

  const tokens = tokenize(input);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const consume = (): Token => {
    const token = tokens[position];
    position += 1;
    return token;
  };

  function parseExpression(): number {
    let value = parseTerm();
    while (peek()?.type === "op" && ["+", "-"].includes((peek() as { value: string }).value)) {
      const operator = (consume() as { value: string }).value;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (peek()?.type === "op" && ["*", "/", "%"].includes((peek() as { value: string }).value)) {
      const operator = (consume() as { value: string }).value;
      const right = parseUnary();
      if (operator === "*") value *= right;
      else if (operator === "/") {
        if (right === 0) throw new SafeMathError("Division by zero.");
        value /= right;
      } else {
        if (right === 0) throw new SafeMathError("Modulo by zero.");
        value %= right;
      }
    }
    return value;
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.type === "op" && (token.value === "+" || token.value === "-")) {
      consume();
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (peek()?.type === "op" && (peek() as { value: string }).value === "^") {
      consume();
      const exponent = parseUnary();
      const result = Math.pow(base, exponent);
      if (!Number.isFinite(result)) throw new SafeMathError("Exponentiation overflowed.");
      return result;
    }
    return base;
  }

  function parsePrimary(): number {
    const token = consume();
    if (!token) throw new SafeMathError("Unexpected end of expression.");
    if (token.type === "number") return token.value;
    if (token.type === "lparen") {
      const value = parseExpression();
      if (consume()?.type !== "rparen") throw new SafeMathError("Missing closing parenthesis.");
      return value;
    }
    if (token.type === "ident") {
      if (peek()?.type === "lparen") {
        consume();
        const args: number[] = [];
        if (peek()?.type !== "rparen") {
          args.push(parseExpression());
          while (peek()?.type === "comma") {
            consume();
            args.push(parseExpression());
          }
        }
        if (consume()?.type !== "rparen") throw new SafeMathError("Missing closing parenthesis.");
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new SafeMathError(`Unknown function "${token.value}".`);
        if (args.some((arg) => !Number.isFinite(arg))) {
          throw new SafeMathError("Function argument is not a finite number.");
        }
        return fn(...args);
      }
      if (token.value in CONSTANTS) return CONSTANTS[token.value];
      throw new SafeMathError(`Unknown identifier "${token.value}".`);
    }
    throw new SafeMathError("Unexpected token in expression.");
  }

  const result = parseExpression();
  if (position < tokens.length) throw new SafeMathError("Unexpected trailing tokens.");
  if (!Number.isFinite(result)) throw new SafeMathError("Result is not a finite number.");
  return result;
}
