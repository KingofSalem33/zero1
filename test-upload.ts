/**
 * Test TypeScript file for artifact upload testing
 * This file should trigger multiple substep detections
 */

// This is a TypeScript file (.ts extension)
export interface TestInterface {
  id: string;
  name: string;
  completed: boolean;
}

export class TestClass {
  private items: TestInterface[] = [];

  constructor() {
    console.log("Test class initialized");
  }

  addItem(item: TestInterface): void {
    this.items.push(item);
  }

  getItems(): TestInterface[] {
    return this.items;
  }
}

// Export for testing
export default TestClass;
