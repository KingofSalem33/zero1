import type { CalculatorParams } from "../schemas";

export interface CalculationResult {
  expression: string;
  result: number | string;
  isValid: boolean;
}

export async function calculator(
  params: CalculatorParams,
): Promise<CalculationResult> {
  const { expression } = params;

  try {
    // Sanitize expression to prevent code injection
    const sanitizedExpression = expression
      .replace(/[^0-9+\-*/.() ]/g, "") // Only allow safe mathematical characters
      .replace(/\s+/g, ""); // Remove spaces

    if (!sanitizedExpression || sanitizedExpression.length === 0) {
      throw new Error("Invalid or empty expression");
    }

    // Basic validation - ensure expression only contains safe characters
    if (!/^[0-9+\-*/.() ]+$/.test(sanitizedExpression)) {
      throw new Error("Expression contains unsafe characters");
    }

    // Check for balanced parentheses
    let openParens = 0;
    for (const char of sanitizedExpression) {
      if (char === "(") openParens++;
      if (char === ")") openParens--;
      if (openParens < 0) throw new Error("Unbalanced parentheses");
    }
    if (openParens !== 0) throw new Error("Unbalanced parentheses");

    // Safe evaluation using Function constructor (more secure than eval)
    const result = new Function(
      `"use strict"; return (${sanitizedExpression})`,
    )();

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("Result is not a valid number");
    }

    return {
      expression: sanitizedExpression,
      result: Number.isInteger(result) ? result : Number(result.toFixed(10)),
      isValid: true,
    };
  } catch (error) {
    console.error("Calculator error:", error);

    return {
      expression,
      result: `Error: ${error instanceof Error ? error.message : "Invalid calculation"}`,
      isValid: false,
    };
  }
}
