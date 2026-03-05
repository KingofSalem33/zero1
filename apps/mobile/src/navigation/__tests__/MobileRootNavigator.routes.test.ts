import { APP_DETAIL_ROUTES, resolveRootFlow } from "../MobileRootNavigator";

describe("MobileRootNavigator route config", () => {
  it("routes unauthenticated state to Auth flow", () => {
    expect(resolveRootFlow(false)).toBe("Auth");
  });

  it("routes authenticated state to App flow", () => {
    expect(resolveRootFlow(true)).toBe("App");
  });

  it("registers all expected app detail routes", () => {
    expect(APP_DETAIL_ROUTES).toEqual([
      "MapViewer",
      "LibraryMapCreate",
      "BookmarkCreate",
      "BookmarkDetail",
      "HighlightCreate",
      "HighlightDetail",
    ]);
  });
});
