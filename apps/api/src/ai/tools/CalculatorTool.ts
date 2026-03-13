import { BaseTool } from "./factory";
import { calculator, CalculationResult } from "./calculator";
import { calculatorSchema, CalculatorParams } from "../schemas";

/**
 * Calculator tool implementation using Factory pattern
 */
export class CalculatorTool extends BaseTool<
  CalculatorParams,
  CalculationResult
> {
  readonly name = "calculator";
  readonly description =
    "Perform mathematical calculations with support for basic arithmetic operations";

  readonly parameters = {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description:
          'Mathematical expression to evaluate (e.g., "2 + 2", "10 * 3 / 2")',
      },
    },
    required: ["expression"],
  };

  protected validate(params: unknown): CalculatorParams {
    return calculatorSchema.parse(params);
  }

  protected async run(params: CalculatorParams): Promise<CalculationResult> {
    return await calculator(params);
  }
}
