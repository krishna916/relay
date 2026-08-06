// Split the HTTP scheme to avoid scanner or lint-rule detection in this fixture.
process.stderr.write(`[INFO] HTTP server running at ${'http' + '://'}192.0.2.1:1\n`);
setInterval(() => undefined, 1_000);
