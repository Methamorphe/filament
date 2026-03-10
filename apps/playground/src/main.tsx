import { render, type Child } from "@filament/core";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");

if (root === null) {
  throw new Error("Missing #app container.");
}

render(() => <App /> as unknown as Child, root);
