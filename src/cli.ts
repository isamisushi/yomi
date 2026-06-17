#!/usr/bin/env bun
import { app } from "./cli-app";
import { writeJsonError } from "./cli-support";

try {
  await app.execute();
} catch (error) {
  writeJsonError(error);
  process.exitCode = 1;
}
