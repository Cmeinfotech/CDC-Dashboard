#!/usr/bin/env node
// The production build carries its own runtime under dist/standalone, so the
// cPanel application can start without installing development dependencies.
import "./dist/standalone/server.js";
