#!/usr/bin/env bun
import { app, cliVersion } from "./cli-app";
import { writeJsonError } from "./cli-support";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    console.log(cliVersion);
  } else {
    await app.execute();
  }
} catch (error) {
  writeJsonError(error);
  process.exitCode = 1;
}
