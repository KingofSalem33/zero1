import { evaluate } from "mathjs";
import type { CalculatorParams } from "../schemas";

export interface CalculationResult {
  expression: string;
  result: number | string;
}

export async function calculator(
  params: CalculatorParams,
): Promise<CalculationResult> {
  const { expression } = params;

  try {
    // Use mathjs to safely evaluate the mathematical expression
    const result = evaluate(expression);

    // Format the result for display
    let formattedResult: number | string;
    if (typeof result === "number") {
      formattedResult = Number.isInteger(result)
        ? result
        : Number(result.toFixed(10));
    } else {
      // Handle complex numbers, matrices, etc.
      formattedResult = String(result);
    }

    return {
      expression,
      result: formattedResult,
    };
  } catch (error) {
    console.error("Calculator error:", error);

    return {
      expression,
      result: `Error: ${error instanceof Error ? error.message : "Invalid calculation"}`,
    };
  }
}
