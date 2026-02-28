import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import * as Sentry from "@sentry/react-native";

import App from "./App";
import { initMobileMonitoring } from "./src/lib/monitoring";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
initMobileMonitoring();

registerRootComponent(Sentry.wrap(App));
