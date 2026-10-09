(async function receiverBootstrap() {
  const { createHash } = await import("node:crypto");
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  const emit = (value) => process.stdout.write("TTRECEIVER:" + JSON.stringify(value) + "\n");
  let phase = "input", buffer = "", chunks = [], chunkIndex = 0, resultHash = "", finalExit = 1;
  function close(code) {
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
    process.stdin.pause(); process.stdin.unref?.(); process.exitCode = code;
  }
  function fatal(error) {
    phase = "failed";
    emit({ type: "fatal", pid: process.pid, phase, error: { name: error.name, message: error.message, stack: error.stack } });
    close(1);
  }
  async function line(text) {
    if (phase === "input") {
      phase = "running";
      const packet = JSON.parse(text);
      const receiver = (0, eval)("(" + packet.receiverSource + ")");
      const started = performance.now();
      let receipt, error = null;
      try { receipt = await receiver(packet); }
      catch (caught) { error = { name: caught.name, message: caught.message, stack: caught.stack }; }
      const envelope = { schema: "tastetable.d98-vm-native-output-envelope.v1", pid: process.pid, runtime: process.version, attempt: packet.attempt, elapsedMs: performance.now() - started, receipt: receipt || null, fatal: error };
      const output = JSON.stringify(envelope);
      resultHash = digest(output);
      for (let start = 0; start < output.length; start += 5000) chunks.push(output.slice(start, start + 5000));
      finalExit = error || receipt?.status !== "passed" ? 1 : 0;
      phase = "output";
      emit({ type: "result-ready", pid: process.pid, chunks: chunks.length, chars: output.length, sha256: resultHash, exit: finalExit, summary: receipt ? { status: receipt.status, passedGroups: receipt.passedGroups, failedGroups: receipt.failedGroups, reached: receipt.assertionsReached, passedAssertions: receipt.passedAssertions, failedAssertions: receipt.failedAssertions, groups: receipt.groups.map((g) => ({ id: g.id, status: g.status, reached: g.checks.length, error: g.error?.message })) } : { fatal: error } });
      return;
    }
    if (phase === "output" && text === "NEXT") {
      if (chunkIndex >= chunks.length) throw new Error("All output chunks have already been emitted");
      emit({ type: "chunk", index: chunkIndex, total: chunks.length, text: chunks[chunkIndex++] }); return;
    }
    if (phase === "output" && text === "ACK " + resultHash && chunkIndex === chunks.length) {
      phase = "closed";
      emit({ type: "closed", pid: process.pid, sha256: resultHash, chunksEmitted: chunkIndex, exit: finalExit, terminalRawModeRestored: true });
      close(finalExit); return;
    }
    throw new Error("Unexpected protocol input in phase " + phase);
  }
  process.stdin.setEncoding("utf8");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", (data) => {
    buffer += data;
    if (buffer.length > 1024 * 1024) { fatal(new Error("Input frame exceeds 1 MiB")); return; }
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const frame = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1);
      void line(frame).catch(fatal);
    }
  });
  process.stdin.resume();
  emit({ type: "input-ready", pid: process.pid, runtime: process.version, tty: Boolean(process.stdin.isTTY) });
})();
