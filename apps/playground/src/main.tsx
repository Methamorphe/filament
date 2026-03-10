import { render } from "@filament/core";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");

if (root === null) {
  throw new Error("Missing #app container.");
}

render(() => <App />, root);

